import cookieParser from 'cookie-parser';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RULES } from '../src/config/rules.js';
import { prisma } from '../src/db/client.js';
import { attachUser } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createCreditsRouter } from '../src/routes/credits.js';
import { closeRealtime, initRealtime } from '../src/realtime/io.js';
import { claimDailyRefill } from '../src/services/creditService.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';

const app = createApp();
const HOUR = 3_600_000;

async function signUp() {
  const name = uniqueName('cx');
  const res = await request(app).post('/api/auth/register').send({ username: name, password: PASSWORD });
  return { id: res.body.user.id as string, name, cookie: sessionCookie(res)! };
}

const ledgerSum = async (id: string) => (await prisma.creditLedger.aggregate({ where: { userId: id }, _sum: { delta: true } }))._sum.delta ?? 0;
const balanceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;

describe('POST /api/credits/refill', () => {
  it('requires a session', async () => {
    expect((await request(app).post('/api/credits/refill')).status).toBe(401);
  });

  it('grants +20 on the first claim and returns the updated user', async () => {
    const u = await signUp();
    const res = await request(app).post('/api/credits/refill').set('Cookie', u.cookie);
    expect(res.status).toBe(200);
    expect(res.body.user.credits).toBe(100 + RULES.DAILY_REFILL);
    expect(res.body.user.lastDailyRefillAt).toBeGreaterThan(Date.now() - 5_000);

    const entry = await prisma.creditLedger.findFirstOrThrow({ where: { userId: u.id, reason: 'daily_refill' } });
    expect(entry).toMatchObject({ delta: 20, balanceAfter: 120 });
  });

  it('refuses a second claim inside 24h with 429, retry info and Retry-After', async () => {
    const u = await signUp();
    await request(app).post('/api/credits/refill').set('Cookie', u.cookie);
    const again = await request(app).post('/api/credits/refill').set('Cookie', u.cookie);

    expect(again.status).toBe(429);
    expect(again.body).toMatchObject({ error: 'Daily refill is not ready yet', code: 'REFILL_NOT_READY' });
    expect(again.body.details.retryAfterMs).toBeGreaterThan(23 * HOUR);
    expect(Number(again.headers['retry-after'])).toBeGreaterThan(23 * 3600);
    expect(await balanceOf(u.id)).toBe(120);
  });

  it('allows a claim exactly at 24h and blocks one a minute earlier', async () => {
    const u = await signUp();
    const t0 = new Date('2026-01-01T00:00:00Z');
    await claimDailyRefill(u.id, t0);
    await expect(claimDailyRefill(u.id, new Date(t0.getTime() + 24 * HOUR - 60_000))).rejects.toMatchObject({ status: 429 });
    await claimDailyRefill(u.id, new Date(t0.getTime() + 24 * HOUR));
    expect(await balanceOf(u.id)).toBe(140);
  });

  it('simultaneous claims produce exactly one grant', async () => {
    const u = await signUp();
    const results = await Promise.all(Array.from({ length: 6 }, () => request(app).post('/api/credits/refill').set('Cookie', u.cookie)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(5);
    expect(await balanceOf(u.id)).toBe(120);
    expect(await ledgerSum(u.id)).toBe(120);
  });
});

describe('POST /api/credits/purchase (stub)', () => {
  it('requires a session', async () => {
    expect((await request(app).post('/api/credits/purchase').send({ packageId: 'tier_20' })).status).toBe(401);
  });

  it.each([
    ['tier_20', 20],
    ['tier_50', 50],
    ['tier_100', 100],
  ])('credits the %s package', async (packageId, credits) => {
    const u = await signUp();
    const res = await request(app).post('/api/credits/purchase').set('Cookie', u.cookie).send({ packageId, amount: credits });
    expect(res.status).toBe(200);
    expect(res.body.user.credits).toBe(100 + credits);
    const entry = await prisma.creditLedger.findFirstOrThrow({ where: { userId: u.id, reason: 'purchase' } });
    expect(entry).toMatchObject({ delta: credits, refType: 'package', refId: packageId });
  });

  it('never trusts the client amount', async () => {
    const u = await signUp();
    const mismatch = await request(app).post('/api/credits/purchase').set('Cookie', u.cookie).send({ packageId: 'tier_20', amount: 9999 });
    expect(mismatch.status).toBe(400);
    expect(await balanceOf(u.id)).toBe(100);

    // amount alone, unknown package, negative amount, extra keys
    for (const body of [{ amount: 9999 }, { packageId: 'tier_999' }, { packageId: 'tier_20', amount: -5 }, { packageId: 'tier_20', credits: 1000 }]) {
      expect((await request(app).post('/api/credits/purchase').set('Cookie', u.cookie).send(body)).status).toBe(400);
    }
    expect(await balanceOf(u.id)).toBe(100);
  });

  it('an Idempotency-Key makes a retried purchase apply once', async () => {
    const u = await signUp();
    const send = () => request(app).post('/api/credits/purchase').set('Cookie', u.cookie).set('Idempotency-Key', 'order-abc-12345').send({ packageId: 'tier_50' });
    const [a, b] = [await send(), await send()];
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.user.credits).toBe(150);
    expect(await ledgerSum(u.id)).toBe(150);
  });

  it('answers 503 and credits nothing when fake purchases are disabled', async () => {
    const u = await signUp();
    const prod = express();
    prod.use(express.json(), cookieParser(), attachUser, createCreditsRouter({ allowFakePurchases: false }), errorHandler);
    const res = await request(prod).post('/credits/purchase').set('Cookie', u.cookie).send({ packageId: 'tier_100' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PAYMENTS_DISABLED');
    expect(await balanceOf(u.id)).toBe(100);
  });
});

describe('GET /api/credits/ledger', () => {
  it('returns only the caller\'s entries, newest first, respecting limit', async () => {
    const a = await signUp();
    const b = await signUp();
    await request(app).post('/api/credits/refill').set('Cookie', a.cookie);
    await request(app).post('/api/credits/purchase').set('Cookie', a.cookie).send({ packageId: 'tier_20' });
    await request(app).post('/api/credits/purchase').set('Cookie', b.cookie).send({ packageId: 'tier_100' });

    const res = await request(app).get('/api/credits/ledger').set('Cookie', a.cookie);
    expect(res.status).toBe(200);
    expect(res.body.entries.map((e: { reason: string }) => e.reason)).toEqual(['purchase', 'daily_refill', 'signup']);
    expect(res.body.entries[0].balanceAfter).toBe(140);

    const limited = await request(app).get('/api/credits/ledger?limit=1').set('Cookie', a.cookie);
    expect(limited.body.entries).toHaveLength(1);
    expect((await request(app).get('/api/credits/ledger?limit=0').set('Cookie', a.cookie)).status).toBe(400);
    expect((await request(app).get('/api/credits/ledger')).status).toBe(401);
  });
});

describe('credit_update socket event', () => {
  let server: http.Server;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    server = http.createServer(createApp());
    initRealtime(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const open = (cookie?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: cookie ? { Cookie: cookie } : {} });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  const settle = () => new Promise((r) => setTimeout(r, 150));

  it('pushes the new balance to the owner only, after the transaction commits', async () => {
    const owner = await signUp();
    const other = await signUp();
    const ownerSock = await open(owner.cookie);
    const otherSock = await open(other.cookie);
    const ownerGot: unknown[] = [];
    const otherGot: unknown[] = [];
    ownerSock.on('credit_update', (p) => ownerGot.push(p));
    otherSock.on('credit_update', (p) => otherGot.push(p));

    await request(server).post('/api/credits/refill').set('Cookie', owner.cookie);
    await request(server).post('/api/credits/purchase').set('Cookie', owner.cookie).send({ packageId: 'tier_50' });
    await request(server).post('/api/credits/refill').set('Cookie', owner.cookie); // 429: must not emit
    await settle();

    expect(ownerGot).toEqual([{ credits: 120 }, { credits: 170 }]);
    expect(otherGot).toEqual([]);
  });
});
