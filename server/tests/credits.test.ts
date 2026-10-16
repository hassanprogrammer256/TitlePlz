import { describe, expect, it } from 'vitest';
import { prisma, withTx } from '../src/db/client.js';
import { applyCredit } from '../src/services/creditService.js';
import { uniqueName } from './helpers.js';

async function makeUser(credits = 0) {
  const name = uniqueName('cr');
  const user = await prisma.user.create({
    data: { username: name, usernameKey: name, handle: `@${name}`, passwordHash: 'x', agentHash: `H-${name}` },
  });
  if (credits > 0) await withTx((tx) => applyCredit(tx, { userId: user.id, delta: credits, reason: 'purchase', idempotencyKey: `seed:${user.id}` }));
  return user;
}

const balanceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;
const ledgerSum = async (id: string) => (await prisma.creditLedger.aggregate({ where: { userId: id }, _sum: { delta: true } }))._sum.delta ?? 0;

describe('applyCredit', () => {
  it('credits and debits, recording balanceAfter on each ledger row', async () => {
    const u = await makeUser(100);
    await withTx((tx) => applyCredit(tx, { userId: u.id, delta: -30, reason: 'stake', idempotencyKey: `k:${u.id}:1`, ref: { type: 'drop', id: 'd' } }));
    await withTx((tx) => applyCredit(tx, { userId: u.id, delta: 5, reason: 'reward', idempotencyKey: `k:${u.id}:2` }));

    expect(await balanceOf(u.id)).toBe(75);
    const rows = await prisma.creditLedger.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.balanceAfter)).toEqual([100, 70, 75]);
    expect(rows[1]).toMatchObject({ refType: 'drop', refId: 'd' });
  });

  it('refuses to overdraw and leaves no trace', async () => {
    const u = await makeUser(10);
    await expect(withTx((tx) => applyCredit(tx, { userId: u.id, delta: -11, reason: 'stake', idempotencyKey: `k:${u.id}:x` }))).rejects.toMatchObject({
      status: 422,
    });
    expect(await balanceOf(u.id)).toBe(10);
    expect(await prisma.creditLedger.count({ where: { idempotencyKey: `k:${u.id}:x` } })).toBe(0);
  });

  it('replaying an idempotency key is a no-op', async () => {
    const u = await makeUser(50);
    const change = { userId: u.id, delta: -20, reason: 'stake' as const, idempotencyKey: `k:${u.id}:once` };
    const first = await withTx((tx) => applyCredit(tx, change));
    const again = await withTx((tx) => applyCredit(tx, change));
    expect(first).toEqual({ balance: 30, replayed: false });
    expect(again).toEqual({ balance: 30, replayed: true });
    expect(await balanceOf(u.id)).toBe(30);
  });

  it('rejects reusing a key for a different change', async () => {
    const u = await makeUser(50);
    await withTx((tx) => applyCredit(tx, { userId: u.id, delta: -20, reason: 'stake', idempotencyKey: `k:${u.id}:dup` }));
    await expect(withTx((tx) => applyCredit(tx, { userId: u.id, delta: -25, reason: 'stake', idempotencyKey: `k:${u.id}:dup` }))).rejects.toThrow(/already used/);
  });

  it('rejects zero and fractional deltas', async () => {
    const u = await makeUser(10);
    await expect(withTx((tx) => applyCredit(tx, { userId: u.id, delta: 0, reason: 'purchase', idempotencyKey: `z:${u.id}` }))).rejects.toThrow();
    await expect(withTx((tx) => applyCredit(tx, { userId: u.id, delta: 1.5, reason: 'purchase', idempotencyKey: `f:${u.id}` }))).rejects.toThrow();
  });

  it('concurrent spends can never overdraw', async () => {
    const u = await makeUser(100);
    const attempts = Array.from({ length: 8 }, (_, i) =>
      withTx((tx) => applyCredit(tx, { userId: u.id, delta: -30, reason: 'stake', idempotencyKey: `race:${u.id}:${i}` })).then(
        () => 'ok',
        () => 'rejected',
      ),
    );
    const results = await Promise.all(attempts);
    expect(results.filter((r) => r === 'ok')).toHaveLength(3); // 100 / 30
    expect(await balanceOf(u.id)).toBe(10);
  });

  it('keeps User.credits equal to the ledger sum after mixed operations', async () => {
    const u = await makeUser(200);
    const ops = Array.from({ length: 20 }, (_, i) => {
      const delta = (i % 3 === 0 ? 1 : -1) * (5 + i);
      return withTx((tx) => applyCredit(tx, { userId: u.id, delta, reason: delta > 0 ? 'reward' : 'stake', idempotencyKey: `mix:${u.id}:${i}` })).catch(() => null);
    });
    await Promise.all(ops);
    expect(await balanceOf(u.id)).toBe(await ledgerSum(u.id));
    expect(await balanceOf(u.id)).toBeGreaterThanOrEqual(0);
  });
});
