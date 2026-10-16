import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { closeRealtime, initRealtime } from '../src/realtime/io.js';
import { guess, newDrop, signUp, type Account } from './factory.js';

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

const follow = (acc: Account, handle: string) => request(server).post('/api/scouts/follow').set('Cookie', acc.cookie).send({ handle });
const unfollow = (acc: Account, handle: string) => request(server).post('/api/scouts/unfollow').set('Cookie', acc.cookie).send({ handle });
const feed = (acc: Account) => request(server).get('/api/scouts/feed').set('Cookie', acc.cookie);
const followCount = (id: string) => prisma.follow.count({ where: { followerId: id } });

describe('follow / unfollow', () => {
  it('requires a session', async () => {
    expect((await request(server).post('/api/scouts/follow').send({ handle: '@x' })).status).toBe(401);
    expect((await request(server).post('/api/scouts/unfollow').send({ handle: '@x' })).status).toBe(401);
    expect((await request(server).get('/api/scouts/feed')).status).toBe(401);
  });

  it('follows by handle with or without @ and in any case, listing handles on the profile', async () => {
    const [me, a, b] = [await signUp(server), await signUp(server), await signUp(server)];
    const r1 = await follow(me, a.handle);
    expect(r1.status).toBe(200);
    expect(r1.body.user.following).toEqual([a.handle]);

    const r2 = await follow(me, b.name.toUpperCase()); // no "@", different case
    expect(r2.body.user.following).toEqual([a.handle, b.handle]);
  });

  it('is idempotent and unfollow is idempotent too', async () => {
    const [me, a] = [await signUp(server), await signUp(server)];
    await follow(me, a.handle);
    await follow(me, a.handle);
    expect(await followCount(me.id)).toBe(1);

    expect((await unfollow(me, a.handle)).body.user.following).toEqual([]);
    expect((await unfollow(me, a.handle)).status).toBe(200);
    expect((await unfollow(me, '@nobody_here')).status).toBe(200);
  });

  it('rejects yourself, unknown handles and bad input', async () => {
    const me = await signUp(server);
    expect((await follow(me, me.handle)).status).toBe(400);
    expect((await follow(me, '@nobody_here_at_all')).status).toBe(404);
    for (const handle of ['', '   ', 'x'.repeat(65)]) expect((await follow(me, handle)).status).toBe(400);
    expect((await request(server).post('/api/scouts/follow').set('Cookie', me.cookie).send({})).status).toBe(400);
    expect(await followCount(me.id)).toBe(0);
  });

  it('caps scouting at 5 and frees a slot on unfollow', async () => {
    const me = await signUp(server);
    const targets = await Promise.all(Array.from({ length: 6 }, () => signUp(server)));
    for (const t of targets.slice(0, 5)) expect((await follow(me, t.handle)).status).toBe(200);

    const sixth = await follow(me, targets[5]!.handle);
    expect(sixth.status).toBe(409);
    expect(sixth.body.error).toMatch(/up to 5/);
    expect(await followCount(me.id)).toBe(5);

    await unfollow(me, targets[0]!.handle);
    expect((await follow(me, targets[5]!.handle)).status).toBe(200);
    expect(await followCount(me.id)).toBe(5);
  });

  it('simultaneous follows can never exceed the cap', async () => {
    const me = await signUp(server);
    const targets = await Promise.all(Array.from({ length: 8 }, () => signUp(server)));
    const results = await Promise.all(targets.map((t) => follow(me, t.handle)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    expect(await followCount(me.id)).toBe(5);
  });
});

describe('scout feed', () => {
  it('shows only what followed detectives did, newest first, with display copy', async () => {
    const [me, scoutA, stranger, solver] = [await signUp(server), await signUp(server), await signUp(server), await signUp(server)];
    await follow(me, scoutA.handle);

    const posted = await newDrop(server, { owner: scoutA, bounty: 30 });
    await newDrop(server, { owner: stranger }); // someone I don't follow
    const own = await newDrop(server, { bounty: 20 });
    await guess(server, scoutA, own.id, 'Wrong Answer'); // followed detective answers
    await guess(server, solver, own.id, 'Heat'); // not followed

    const res = await feed(me);
    expect(res.status).toBe(200);
    const items = res.body.activities;
    expect(items.map((a: { type: string }) => a.type)).toEqual(['answered_clip', 'posted_clip']);
    expect(items.every((a: { userHandle: string }) => a.userHandle === scoutA.handle)).toBe(true);
    expect(items[1]).toMatchObject({ title: 'New Mystery Drop', dropId: posted.id, amount: 30, message: expect.stringContaining('just posted DROP #') });
    expect(items[0]).toMatchObject({ title: 'Detective Answered', pointsDelta: -3 });
    expect(items[0].timestamp).toBeGreaterThanOrEqual(items[1].timestamp);
  });

  it('is empty when you follow nobody, and stops after unfollowing', async () => {
    const [me, scout] = [await signUp(server), await signUp(server)];
    await newDrop(server, { owner: scout });
    expect((await feed(me)).body.activities).toEqual([]);
    await follow(me, scout.handle);
    expect((await feed(me)).body.activities).toHaveLength(1);
    await unfollow(me, scout.handle);
    expect((await feed(me)).body.activities).toEqual([]);
  });

  it('describes a solve with the bounty won', async () => {
    const [me, ace] = [await signUp(server), await signUp(server)];
    await follow(me, ace.handle);
    const drop = await newDrop(server, { bounty: 60 });
    await guess(server, ace, drop.id, 'Heat');
    const item = (await feed(me)).body.activities[0];
    expect(item).toMatchObject({ type: 'rewarded_clip', title: 'Bounty Claimed', amount: 60, pointsDelta: 5 });
    expect(item.message).toContain('and won $60');
  });
});

describe('scout_activity push', () => {
  const open = (cookie: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: { Cookie: cookie } });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  const settle = () => new Promise((r) => setTimeout(r, 250));

  it('notifies followers privately when a scouted detective posts or answers', async () => {
    const [fan, other, scout] = [await signUp(server), await signUp(server), await signUp(server)];
    await follow(fan, scout.handle);

    const fanSock = await open(fan.cookie);
    const otherSock = await open(other.cookie);
    const fanGot: any[] = [];
    const otherGot: any[] = [];
    fanSock.on('scout_activity', (a) => fanGot.push(a));
    otherSock.on('scout_activity', (a) => otherGot.push(a));

    const posted = await newDrop(server, { owner: scout });
    const target = await newDrop(server);
    await guess(server, scout, target.id, 'Some Title');
    await settle();

    expect(fanGot.map((a) => a.type)).toEqual(['posted_clip', 'answered_clip']);
    expect(fanGot[0]).toMatchObject({ userHandle: scout.handle, dropId: posted.id, title: 'New Mystery Drop' });
    expect(JSON.stringify(fanGot)).not.toContain('Some Title'); // never leaks what was guessed
    expect(otherGot).toEqual([]);
  });
});
