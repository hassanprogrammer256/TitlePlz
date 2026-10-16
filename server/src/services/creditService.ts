import { CREDIT_PACKAGES, RULES, type CreditPackageId } from '../config/rules.js';
import { withTx, type Tx } from '../db/client.js';
import type { User } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { emitToUser } from '../realtime/io.js';

export type CreditReason = 'signup' | 'daily_refill' | 'purchase' | 'stake' | 'bounty_stake' | 'reward' | 'refund';

export type CreditChange = {
  userId: string;
  /** Positive = credit, negative = debit. Never zero. */
  delta: number;
  reason: CreditReason;
  /** Same key + same change = no-op replay. Derive it from the business event (e.g. `trial:<dropId>:<userId>:stake`). */
  idempotencyKey: string;
  ref?: { type: string; id: string };
};

/**
 * The ONLY place credits change. Must run inside a transaction (`withTx`) so the
 * balance update and the immutable ledger row commit together.
 *
 * - Debits are guarded in the UPDATE itself (`credits >= amount`), so two concurrent
 *   spends can never overdraw, on SQLite or Postgres.
 * - Replaying an idempotency key returns the original result instead of applying twice.
 */
export async function applyCredit(tx: Tx, change: CreditChange): Promise<{ balance: number; replayed: boolean }> {
  const { userId, delta, reason, idempotencyKey, ref } = change;
  if (!Number.isInteger(delta) || delta === 0) throw new Error('Credit delta must be a non-zero integer');

  const existing = await tx.creditLedger.findUnique({ where: { idempotencyKey } });
  if (existing) {
    if (existing.userId !== userId || existing.delta !== delta || existing.reason !== reason) {
      throw new Error(`Idempotency key "${idempotencyKey}" was already used for a different change`);
    }
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
    return { balance: current.credits, replayed: true };
  }

  if (delta > 0) {
    await tx.user.update({ where: { id: userId }, data: { credits: { increment: delta } } });
  } else {
    const { count } = await tx.user.updateMany({
      where: { id: userId, credits: { gte: -delta } },
      data: { credits: { decrement: -delta } },
    });
    if (count === 0) {
      const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      throw exists ? AppError.unprocessable(`Insufficient credits (need ${-delta})`) : AppError.notFound('User not found');
    }
  }

  const { credits } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { credits: true } });
  await tx.creditLedger.create({
    data: { userId, delta, balanceAfter: credits, reason, refType: ref?.type, refId: ref?.id, idempotencyKey },
  });
  return { balance: credits, replayed: false };
}

// ---------------------------------------------------------------------------
// User-facing credit actions. Each commits first, then pushes `credit_update`
// so a socket client never sees a balance that later rolls back.
// ---------------------------------------------------------------------------

export function notifyCredits(userId: string, credits: number) {
  emitToUser(userId, 'credit_update', { credits });
}

/**
 * Grants the daily refill if the cooldown has passed. The cooldown check is part of the
 * UPDATE itself, so simultaneous claims (double click, two tabs) yield exactly one grant.
 */
export async function claimDailyRefill(userId: string, now: Date = new Date()): Promise<User> {
  const threshold = new Date(now.getTime() - RULES.DAILY_REFILL_COOLDOWN_MS);

  const user = await withTx(async (tx) => {
    const { count } = await tx.user.updateMany({
      where: { id: userId, OR: [{ lastDailyRefillAt: null }, { lastDailyRefillAt: { lte: threshold } }] },
      data: { lastDailyRefillAt: now },
    });
    if (count === 0) {
      const current = await tx.user.findUnique({ where: { id: userId }, select: { lastDailyRefillAt: true } });
      if (!current) throw AppError.notFound('User not found');
      const nextRefillAt = (current.lastDailyRefillAt?.getTime() ?? 0) + RULES.DAILY_REFILL_COOLDOWN_MS;
      throw new AppError(429, 'Daily refill is not ready yet', 'REFILL_NOT_READY', { nextRefillAt, retryAfterMs: Math.max(0, nextRefillAt - now.getTime()) });
    }
    await applyCredit(tx, {
      userId,
      delta: RULES.DAILY_REFILL,
      reason: 'daily_refill',
      idempotencyKey: `refill:${userId}:${now.getTime()}`,
    });
    return tx.user.findUniqueOrThrow({ where: { id: userId } });
  });

  notifyCredits(userId, user.credits);
  return user;
}

/**
 * STUB: grants the package's credits without taking payment. Callers must check
 * `config.allowFakePurchases` first. Replace the body with a Stripe flow later.
 */
export async function purchaseCredits(userId: string, packageId: CreditPackageId, idempotencyKey: string): Promise<User> {
  const user = await withTx(async (tx) => {
    await applyCredit(tx, {
      userId,
      delta: CREDIT_PACKAGES[packageId],
      reason: 'purchase',
      idempotencyKey: `purchase:${userId}:${idempotencyKey}`,
      ref: { type: 'package', id: packageId },
    });
    return tx.user.findUniqueOrThrow({ where: { id: userId } });
  });
  notifyCredits(userId, user.credits);
  return user;
}
