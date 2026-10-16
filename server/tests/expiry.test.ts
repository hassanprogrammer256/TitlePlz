import http from 'node:http';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { expireOverdueDrops } from '../src/services/expiryService.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';
import { makePng, uploadOk } from './media.js';

const server = http.createServer(createApp());

async function signUp() {
  const res = await request(server).post('/api/auth/register').send({ username: uniqueName('ex'), password: PASSWORD });
  return { id: res.body.user.id as string, cookie: sessionCookie(res)! };
}
const balanceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;

async function makeDrop(owner: { id: string; cookie: string }, bounty = 60) {
  const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'f.png');
  const res = await request(server)
    .post('/api/drops')
    .set('Cookie', owner.cookie)
    .send({ title: 'Heat', releaseYear: 1995, mediaType: 'photo', validityDurationHours: 24, bountyPts: bounty, imageKey: image.key });
  return res.body.drop.id as string;
}
const makeOverdue = (id: string) => prisma.drop.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 60_000) } });

describe('expireOverdueDrops', () => {
  it('closes an overdue drop and refunds the bounty in full, exactly once', async () => {
    const owner = await signUp();
    const id = await makeDrop(owner, 60);
    expect(await balanceOf(owner.id)).toBe(40);
    await makeOverdue(id);

    expect(await expireOverdueDrops()).toBeGreaterThanOrEqual(1);

    const drop = await prisma.drop.findUniqueOrThrow({ where: { id } });
    expect(drop.status).toBe('expired');
    expect(drop.refundedAt).not.toBeNull();
    expect(await balanceOf(owner.id)).toBe(100);
    const refund = await prisma.creditLedger.findMany({ where: { userId: owner.id, reason: 'refund' } });
    expect(refund).toHaveLength(1);
    expect(refund[0]).toMatchObject({ delta: 60, refType: 'drop', refId: id, idempotencyKey: `drop:${id}:refund` });

    await expireOverdueDrops(); // second sweep must not refund again
    expect(await balanceOf(owner.id)).toBe(100);
  });

  it('leaves live, solved and already-expired drops alone', async () => {
    const owner = await signUp();
    const live = await makeDrop(owner, 20);
    const solved = await makeDrop(owner, 20);
    await prisma.drop.update({ where: { id: solved }, data: { status: 'solved', expiresAt: new Date(Date.now() - 60_000) } });

    await expireOverdueDrops();

    expect((await prisma.drop.findUniqueOrThrow({ where: { id: live } })).status).toBe('unsolved');
    expect((await prisma.drop.findUniqueOrThrow({ where: { id: solved } })).status).toBe('solved');
    expect(await prisma.creditLedger.count({ where: { userId: owner.id, reason: 'refund' } })).toBe(0);
    expect(await balanceOf(owner.id)).toBe(60); // two bounties of 20 still staked
  });

  it('concurrent sweeps refund once', async () => {
    const owner = await signUp();
    const id = await makeDrop(owner, 80);
    await makeOverdue(id);

    await Promise.all([expireOverdueDrops(), expireOverdueDrops(), expireOverdueDrops()]);

    expect(await balanceOf(owner.id)).toBe(100);
    expect(await prisma.creditLedger.count({ where: { userId: owner.id, reason: 'refund' } })).toBe(1);
    expect((await prisma.drop.findUniqueOrThrow({ where: { id } })).status).toBe('expired');
  });

  it('works through a backlog in batches', async () => {
    const owner = await signUp();
    const ids = [await makeDrop(owner, 20), await makeDrop(owner, 20), await makeDrop(owner, 20)];
    for (const id of ids) await makeOverdue(id);

    // Other tests' overdue drops may also be swept, so just drain until none of ours remain.
    let rounds = 0;
    while ((await prisma.drop.count({ where: { id: { in: ids }, status: 'unsolved' } })) > 0 && rounds++ < 20) await expireOverdueDrops(new Date(), 1);

    expect(await balanceOf(owner.id)).toBe(100);
    expect(await prisma.creditLedger.count({ where: { userId: owner.id, reason: 'refund' } })).toBe(3);
  });

  it('heals a drop that is already expired but was never refunded, once', async () => {
    // e.g. status edited by hand, or written by an older version of the sweeper.
    const owner = await signUp();
    const id = await makeDrop(owner, 40);
    await prisma.drop.update({ where: { id }, data: { status: 'expired', expiresAt: new Date(Date.now() - 60_000) } });
    expect(await balanceOf(owner.id)).toBe(60);

    await Promise.all([expireOverdueDrops(), expireOverdueDrops()]);
    expect(await balanceOf(owner.id)).toBe(100);
    expect((await prisma.drop.findUniqueOrThrow({ where: { id } })).refundedAt).not.toBeNull();

    await expireOverdueDrops();
    expect(await balanceOf(owner.id)).toBe(100);
    expect(await prisma.creditLedger.count({ where: { userId: owner.id, reason: 'refund' } })).toBe(1);
  });
});
