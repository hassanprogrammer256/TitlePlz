import { prisma, withTx } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { applyCredit, notifyCredits } from './creditService.js';
import { OPEN_STATUSES } from './dropService.js';

/**
 * Closes drops whose deadline passed without a correct answer and returns the
 * uploader's bounty in full (roadmap Q1 default).
 *
 * Safe to run repeatedly or concurrently: the status flip is a guarded UPDATE
 * (exactly one runner wins) and the refund has a fixed idempotency key.
 */
export async function expireOverdueDrops(now: Date = new Date(), batchSize = 50): Promise<number> {
  // Overdue open drops, plus any drop already marked expired whose refund never landed (self-healing).
  const pending = await prisma.drop.findMany({
    where: { OR: [{ status: { in: OPEN_STATUSES }, expiresAt: { lte: now } }, { status: 'expired', refundedAt: null }] },
    select: { id: true },
    orderBy: { expiresAt: 'asc' },
    take: batchSize,
  });

  let handled = 0;
  for (const { id } of pending) {
    const result = await withTx(async (tx) => {
      // 1. Close it if it is still open and overdue (no-op if someone else did, or it was solved).
      await tx.drop.updateMany({ where: { id, status: { in: OPEN_STATUSES }, expiresAt: { lte: now } }, data: { status: 'expired' } });

      const drop = await tx.drop.findUniqueOrThrow({ where: { id }, select: { status: true, uploaderId: true, bounty: true } });
      if (drop.status !== 'expired') return null; // solved in the meantime

      // 2. Claim the refund. Only one runner can flip refundedAt from null.
      const claimed = await tx.drop.updateMany({ where: { id, refundedAt: null }, data: { refundedAt: now } });
      if (claimed.count === 0) return null;

      const { balance } = await applyCredit(tx, {
        userId: drop.uploaderId,
        delta: drop.bounty,
        reason: 'refund',
        idempotencyKey: `drop:${id}:refund`,
        ref: { type: 'drop', id },
      });
      return { uploaderId: drop.uploaderId, credits: balance };
    });

    if (result) {
      handled++;
      notifyCredits(result.uploaderId, result.credits);
    }
  }
  return handled;
}

/** Runs the sweep on boot and every `intervalMs`. Returns a stop function. */
export function startExpiryJob(intervalMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const n = await expireOverdueDrops();
      if (n > 0) logger.info({ expired: n }, 'expired overdue drops');
    } catch (err) {
      logger.error({ err }, 'expiry sweep failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
