import http from 'node:http';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { checkSeason, ensureActiveSeason, rolloverSeason } from '../src/services/seasonService.js';
import { dbUser, guess, makeAdmin, newDrop, signUp } from './factory.js';

const app = http.createServer(createApp());
const DAY = 86_400_000;

/** A brand-new empty active season, started long enough ago to pass the double-click guard. */
async function freshSeason() {
  const season = await rolloverSeason();
  return prisma.season.update({ where: { id: season.id }, data: { startedAt: new Date(Date.now() - 10 * 60_000) } });
}
const standing = (seasonId: string, userId: string, points: number, solvedCount = 0, bountyEarned = 0) =>
  prisma.seasonStanding.create({ data: { seasonId, userId, points, solvedCount, bountyEarned } });

describe('GET /api/leaderboard', () => {
  let seasonId: string;
  beforeEach(async () => {
    seasonId = (await freshSeason()).id;
  });

  it('is empty (but has the season) before anyone has played', async () => {
    const res = await request(app).get('/api/leaderboard');
    expect(res.status).toBe(200);
    expect(res.body.leaderboard).toEqual([]);
    expect(res.body.season).toMatchObject({ isActive: true, durationDays: 31, promotedCount: 10, demotedCount: 10 });
  });

  it('ranks by season points with badges, titles and stats, public to anonymous callers', async () => {
    const [a, b, c] = [await dbUser(), await dbUser(), await dbUser()];
    await standing(seasonId, a.id, 10, 1, 100);
    await standing(seasonId, b.id, 30, 3, 300);
    await standing(seasonId, c.id, 20, 2, 200);

    const res = await request(app).get('/api/leaderboard');
    const board = res.body.leaderboard;
    expect(board.map((l: { handle: string }) => l.handle)).toEqual([b.handle, c.handle, a.handle]);
    expect(board.map((l: { rank: number }) => l.rank)).toEqual([1, 2, 3]);
    expect(board.map((l: { badge: string }) => l.badge)).toEqual(['👑', '🥈', '🥉']);
    expect(board[0]).toMatchObject({ points: 30, solvedCount: 3, bountyEarnedTotal: 300, crownEmoji: '👑', tier: 'promoted', weeklyDelta: '+0 this week', title: 'Rank #1 • Seeker' });
    expect(board.every((l: { isCurrent?: boolean }) => l.isCurrent === undefined)).toBe(true);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|credits/);
  });

  it('flags only the viewer as isCurrent', async () => {
    const viewer = await signUp(app);
    const other = await dbUser();
    await standing(seasonId, viewer.id, 5);
    await standing(seasonId, other.id, 9);

    const res = await request(app).get('/api/leaderboard').set('Cookie', viewer.cookie);
    expect(res.body.leaderboard.map((l: { isCurrent?: boolean }) => !!l.isCurrent)).toEqual([false, true]);
  });

  it('breaks ties by account age and shares the rank', async () => {
    const [older, newer] = [await dbUser(), await dbUser()];
    await prisma.user.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - DAY) } });
    await standing(seasonId, newer.id, 7);
    await standing(seasonId, older.id, 7);
    const board = (await request(app).get('/api/leaderboard')).body.leaderboard;
    expect(board.map((l: { handle: string }) => l.handle)).toEqual([older.handle, newer.handle]);
    expect(board.map((l: { rank: number }) => l.rank)).toEqual([1, 1]);
  });

  it('assigns promoted / safe / demoted tiers across 25 players', async () => {
    const users = await Promise.all(Array.from({ length: 25 }, () => dbUser()));
    await Promise.all(users.map((u, i) => standing(seasonId, u.id, 1000 - i * 10)));
    const board: { rank: number; tier: string }[] = (await request(app).get('/api/leaderboard')).body.leaderboard;
    const countOf = (tier: string) => board.filter((l) => l.tier === tier).length;
    expect([countOf('promoted'), countOf('safe'), countOf('demoted')]).toEqual([10, 5, 10]);
    expect(board.find((l) => l.rank === 10)!.tier).toBe('promoted');
    expect(board.find((l) => l.rank === 11)!.tier).toBe('safe');
    expect(board.find((l) => l.rank === 16)!.tier).toBe('demoted');
  });

  it('reflects real play: a solve moves the guesser to the top with solved count and bounty', async () => {
    const { id } = await newDrop(app, { bounty: 40 });
    const player = await signUp(app);
    await guess(app, player, id, 'Heat');

    const board = (await request(app).get('/api/leaderboard')).body.leaderboard;
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ handle: player.handle, rank: 1, points: 5, solvedCount: 1, bountyEarnedTotal: 40, weeklyDelta: '+5 this week' });
  });

  it('shows the user\'s rank and consensus lead on their own profile', async () => {
    const lead = await newDrop(app);
    const [p1, p2] = [await signUp(app), await signUp(app)];
    await guess(app, p1, lead.id, 'Alpha');
    await guess(app, p2, lead.id, 'Alpha'); // both back the same title, so both lead

    const me = (await request(app).get('/api/auth/me').set('Cookie', p1.cookie)).body.user;
    expect(me.consensusLeadCount).toBe(1);
    expect(me.pendingGuessLocks).toBe(1);
    expect(me.rank).toBeGreaterThan(0);
  });
});

describe('POST /api/season/start', () => {
  beforeEach(async () => {
    await freshSeason();
  });

  it('requires an admin', async () => {
    const user = await signUp(app);
    expect((await request(app).post('/api/season/start').send({})).status).toBe(401);
    expect((await request(app).post('/api/season/start').set('Cookie', user.cookie).send({})).status).toBe(403);
  });

  it('closes the season recording tiers, opens the next one and returns an empty board', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const current = (await prisma.season.findFirstOrThrow({ where: { isActive: true } }));
    const [a, b] = [await dbUser(), await dbUser()];
    await standing(current.id, a.id, 20);
    await standing(current.id, b.id, 10);

    const res = await request(app).post('/api/season/start').set('Cookie', admin.cookie).send({ durationDays: 31 });
    expect(res.status).toBe(201);
    expect(res.body.season).toMatchObject({ seasonNumber: current.seasonNumber + 1, isActive: true, durationDays: 31 });
    expect(res.body.leaders).toEqual([]);

    const closed = await prisma.season.findUniqueOrThrow({ where: { id: current.id } });
    expect(closed).toMatchObject({ isActive: false });
    expect(closed.closedAt).not.toBeNull();
    expect((await prisma.seasonStanding.findMany({ where: { seasonId: current.id } })).every((s) => s.tier === 'promoted')).toBe(true);
    expect(await prisma.season.count({ where: { isActive: true } })).toBe(1);

    // the closed tier shows up on the player's profile
    const asA = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(asA.points).toBe(0); // lifetime points are untouched by seasons
  });

  it('honours a custom duration and rejects bad ones', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const post = (body: unknown) => request(app).post('/api/season/start').set('Cookie', admin.cookie).send(body as object);

    for (const bad of [{ durationDays: 0 }, { durationDays: 367 }, { durationDays: 1.5 }, { durationDays: '31' }]) {
      expect((await post(bad)).status).toBe(400);
    }
    const ok = await post({ durationDays: 7 });
    expect(ok.status).toBe(201);
    expect(ok.body.season.durationDays).toBe(7);
  });

  it('refuses to start another season within a minute of the last (double-click guard)', async () => {
    const admin = await signUp(app);
    await makeAdmin(admin);
    const active = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    await prisma.season.update({ where: { id: active.id }, data: { startedAt: new Date() } });

    const res = await request(app).post('/api/season/start').set('Cookie', admin.cookie).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/started moments ago/);
    expect((await prisma.season.findUniqueOrThrow({ where: { id: active.id } })).isActive).toBe(true);
  });

  it('two simultaneous rollovers never leave two active seasons', async () => {
    const results = await Promise.allSettled([rolloverSeason(), rolloverSeason(), rolloverSeason()]);
    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await prisma.season.count({ where: { isActive: true } })).toBe(1);
  });
});

describe('automatic season management', () => {
  it('creates a first season when none is active', async () => {
    await prisma.season.updateMany({ data: { isActive: false } });
    const max = (await prisma.season.aggregate({ _max: { seasonNumber: true } }))._max.seasonNumber ?? 0;
    expect(await checkSeason()).toBe('created');
    const active = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    expect(active.seasonNumber).toBe(max + 1);
    expect(active.endsAt.getTime() - active.startedAt.getTime()).toBe(31 * DAY);
    expect((await ensureActiveSeason()).id).toBe(active.id); // idempotent
  });

  it('leaves a running season alone and rolls over one whose end date passed', async () => {
    const running = await freshSeason();
    expect(await checkSeason()).toBe('none');
    expect((await prisma.season.findUniqueOrThrow({ where: { id: running.id } })).isActive).toBe(true);

    await prisma.season.update({ where: { id: running.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    expect(await checkSeason()).toBe('rolled');
    expect((await prisma.season.findUniqueOrThrow({ where: { id: running.id } })).isActive).toBe(false);
    const next = await prisma.season.findFirstOrThrow({ where: { isActive: true } });
    expect(next.seasonNumber).toBe(running.seasonNumber + 1);
  });

  it('exposes the previous season tier on the user profile', async () => {
    const season = await freshSeason();
    const player = await signUp(app);
    await standing(season.id, player.id, 50, 5, 100);
    await rolloverSeason();
    const me = (await request(app).get('/api/auth/me').set('Cookie', player.cookie)).body.user;
    expect(me.tierStanding).toBe('promoted');
  });
});
