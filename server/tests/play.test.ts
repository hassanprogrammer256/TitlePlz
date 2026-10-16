import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { closeRealtime, initRealtime } from '../src/realtime/io.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';
import { makePng, uploadOk } from './media.js';

let server: http.Server;
let url: string;
let seasonId: string;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = http.createServer(createApp());
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const active = await prisma.season.findFirst({ where: { isActive: true } });
  seasonId =
    active?.id ??
    (await prisma.season.create({ data: { seasonNumber: 9000 + Math.floor(Math.random() * 900), name: 'Test Season', startedAt: new Date(), endsAt: new Date(Date.now() + 31 * 86_400_000), isActive: true } })).id;
});
afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await closeRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

type Account = { id: string; name: string; handle: string; cookie: string };
async function signUp(prefix = 'pl'): Promise<Account> {
  const name = uniqueName(prefix);
  const res = await request(server).post('/api/auth/register').send({ username: name, password: PASSWORD });
  return { id: res.body.user.id, name, handle: `@${name}`, cookie: sessionCookie(res)! };
}
const credits = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;
const points = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).points;

/** A fresh open drop (answer "Heat") staked by a fresh uploader. */
async function newDrop(bounty = 50, title = 'Heat') {
  const owner = await signUp('own');
  const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'f.png');
  const res = await request(server)
    .post('/api/drops')
    .set('Cookie', owner.cookie)
    .send({ title, releaseYear: 1995, mediaType: 'photo', validityDurationHours: 24, bountyPts: bounty, imageKey: image.key });
  expect(res.status).toBe(201);
  return { owner, id: res.body.drop.id as string, bounty };
}
const guess = (acc: Account, dropId: string, title: string) => request(server).post(`/api/drops/${dropId}/guess`).set('Cookie', acc.cookie).send({ title });
const vote = (acc: Account, dropId: string, candidateId: string) => request(server).post(`/api/drops/${dropId}/vote`).set('Cookie', acc.cookie).send({ candidateId });
const candidatesOf = (dropId: string) => prisma.candidate.findMany({ where: { dropId }, orderBy: { createdAt: 'asc' } });

describe('POST /api/drops/:id/guess', () => {
  it('requires a session', async () => {
    const { id } = await newDrop();
    expect((await request(server).post(`/api/drops/${id}/guess`).send({ title: 'Heat' })).status).toBe(401);
  });

  it('a wrong guess burns the stake, costs 3 points (floored at 0) and records the candidate and trial', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const res = await guess(p, id, 'Casino');

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(false);
    expect(res.body.user.credits).toBe(80);
    expect(await credits(p.id)).toBe(80);
    expect(await points(p.id)).toBe(0);

    const trial = await prisma.trial.findUniqueOrThrow({ where: { dropId_userId: { dropId: id, userId: p.id } } });
    expect(trial).toMatchObject({ guessedTitle: 'Casino', isCorrect: false, stake: 20, reward: 0, pointsDelta: -3 });
    const [cand] = await candidatesOf(id);
    expect(cand).toMatchObject({ title: 'Casino', normalizedTitle: 'casino', votes: 1 });
    expect(await prisma.candidateVote.count({ where: { candidateId: cand!.id, userId: p.id } })).toBe(1);

    const stake = await prisma.creditLedger.findFirstOrThrow({ where: { userId: p.id, reason: 'stake' } });
    expect(stake).toMatchObject({ delta: -20, refId: id });

    const dto = res.body.drop;
    expect(dto.status).toBe('unsolved');
    expect(dto.correctTitle).toBe('');
    expect(dto.userTrials[p.id]).toMatchObject({ guessedTitle: 'Casino', isCorrect: false, stakeDeducted: 20, pointsDelta: -3 });
    expect(await prisma.activity.count({ where: { actorId: p.id, dropId: id, type: 'answered_clip' } })).toBe(1);
  });

  it('a correct guess (any case/punctuation) pays stake + bounty, solves the drop and reveals the answer', async () => {
    const { id, owner, bounty } = await newDrop(50);
    const p = await signUp();
    const res = await guess(p, id, '  HEAT!!! ');

    expect(res.status).toBe(200);
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.user.credits).toBe(100 - 20 + (20 + bounty));
    expect(await points(p.id)).toBe(5);

    expect(res.body.drop).toMatchObject({ status: 'solved', solvedBy: p.handle, correctTitle: 'Heat', rewardClaimed: true });
    expect(res.body.drop.userTrials[p.id]).toMatchObject({ isCorrect: true, rewardAwarded: 70, pointsDelta: 5 });
    const row = await prisma.drop.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'solved', solvedById: p.id, rewardClaimed: true });
    expect(row.solvedAt).not.toBeNull();

    const reasons = (await prisma.creditLedger.findMany({ where: { userId: p.id }, orderBy: { createdAt: 'asc' } })).map((l) => [l.reason, l.delta]);
    expect(reasons).toEqual([['signup', 100], ['stake', -20], ['reward', 70]]);
    expect(await credits(owner.id)).toBe(50); // uploader's bounty stays spent
    expect(await prisma.activity.count({ where: { actorId: p.id, dropId: id, type: 'rewarded_clip' } })).toBe(1);

    // visible to everyone once solved
    expect((await request(server).get(`/api/drops/${id}`)).body.drop.correctTitle).toBe('Heat');
  });

  it('updates the active season standing', async () => {
    const { id, bounty } = await newDrop(40);
    const p = await signUp();
    await guess(p, id, 'Heat');
    const standing = await prisma.seasonStanding.findUniqueOrThrow({ where: { seasonId_userId: { seasonId, userId: p.id } } });
    expect(standing).toMatchObject({ points: 5, solvedCount: 1, bountyEarned: bounty });

    const q = await signUp();
    const other = await newDrop();
    await guess(q, other.id, 'Wrong');
    const qs = await prisma.seasonStanding.findUniqueOrThrow({ where: { seasonId_userId: { seasonId, userId: q.id } } });
    expect(qs).toMatchObject({ points: 0, solvedCount: 0, bountyEarned: 0 }); // -3 floored at 0
  });

  it('allows only one guess per user per drop and charges once', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    expect((await guess(p, id, 'One')).status).toBe(200);
    const again = await guess(p, id, 'Two');
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/already have a guess/);
    expect(await credits(p.id)).toBe(80);
    expect(await prisma.trial.count({ where: { dropId: id, userId: p.id } })).toBe(1);
  });

  it('simultaneous double-submits charge exactly once', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => guess(p, id, `Title ${i}`)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    expect(await credits(p.id)).toBe(80);
    expect(await prisma.trial.count({ where: { dropId: id, userId: p.id } })).toBe(1);
  });

  it('two simultaneous correct answers: one wins, the other keeps their credits', async () => {
    const { id } = await newDrop(50);
    const [a, b] = [await signUp(), await signUp()];
    const [ra, rb] = await Promise.all([guess(a, id, 'Heat'), guess(b, id, 'Heat')]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);

    const [winner, loser] = ra.status === 200 ? [a, b] : [b, a];
    expect(await credits(winner.id)).toBe(150);
    expect(await credits(loser.id)).toBe(100); // never charged
    expect(await prisma.trial.count({ where: { dropId: id, userId: loser.id } })).toBe(0);
    expect((await prisma.drop.findUniqueOrThrow({ where: { id } })).solvedById).toBe(winner.id);
  });

  it('refuses the uploader, solved drops, past-deadline drops, unknown drops', async () => {
    const { id, owner } = await newDrop();
    const p = await signUp();

    const own = await guess(owner, id, 'Heat');
    expect(own.status).toBe(403);
    expect(await credits(owner.id)).toBe(50);

    await guess(p, id, 'Heat'); // solves
    const late = await signUp();
    const solved = await guess(late, id, 'Heat');
    expect(solved.status).toBe(409);
    expect(solved.body.error).toMatch(/no longer accepting/);

    const lapsed = await newDrop();
    await prisma.drop.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } }); // not yet swept
    expect((await guess(late, lapsed.id, 'Heat')).status).toBe(409);

    expect((await guess(late, 'nope', 'Heat')).status).toBe(404);
    expect(await credits(late.id)).toBe(100);
  });

  it('refuses a player who cannot afford the stake, leaving no trace', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    await prisma.user.update({ where: { id: p.id }, data: { credits: 10 } });
    const res = await guess(p, id, 'Heat');
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Insufficient credits/);
    expect(await credits(p.id)).toBe(10);
    expect(await prisma.trial.count({ where: { userId: p.id } })).toBe(0);
    expect(await candidatesOf(id)).toHaveLength(0);
    expect((await prisma.drop.findUniqueOrThrow({ where: { id } })).status).toBe('unsolved');
  });

  it.each([['blank', '   '], ['symbols only', '!!!'], ['too long', 'x'.repeat(201)], ['missing', undefined]])('rejects a %s title', async (_n, title) => {
    const { id } = await newDrop();
    const p = await signUp();
    const res = await request(server).post(`/api/drops/${id}/guess`).set('Cookie', p.cookie).send(title === undefined ? {} : { title });
    expect(res.status).toBe(400);
    expect(await credits(p.id)).toBe(100);
  });

  it('merges equivalent titles into one candidate and keeps votes equal to voters', async () => {
    const { id } = await newDrop();
    const [a, b, c] = [await signUp(), await signUp(), await signUp()];
    await guess(a, id, 'The Matrix');
    await guess(b, id, 'the matrix!');
    await guess(c, id, 'Alien');

    const cands = await candidatesOf(id);
    expect(cands).toHaveLength(2);
    for (const cand of cands) expect(cand.votes).toBe(await prisma.candidateVote.count({ where: { candidateId: cand.id } }));
    expect(cands.find((x) => x.normalizedTitle === 'the matrix')!.votes).toBe(2);
  });

  it('simultaneous guesses of the same new title create a single candidate', async () => {
    const { id } = await newDrop();
    const players = await Promise.all(Array.from({ length: 4 }, () => signUp()));
    const results = await Promise.all(players.map((p) => guess(p, id, 'Brand New Title')));
    expect(results.every((r) => r.status === 200)).toBe(true);
    const cands = await candidatesOf(id);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.votes).toBe(4);
  });

  it('keeps total credits conserved apart from burned wrong-guess stakes', async () => {
    const { id, owner } = await newDrop(50);
    const [loser, winner] = [await signUp(), await signUp()];
    await guess(loser, id, 'Nope');
    await guess(winner, id, 'Heat');

    const total = (await credits(owner.id)) + (await credits(loser.id)) + (await credits(winner.id));
    const burned = (await prisma.trial.aggregate({ where: { dropId: id, isCorrect: false }, _sum: { stake: true } }))._sum.stake ?? 0;
    expect(burned).toBe(20);
    expect(total + burned).toBe(300); // three accounts started with 100 each
    for (const u of [owner, loser, winner]) {
      const sum = (await prisma.creditLedger.aggregate({ where: { userId: u.id }, _sum: { delta: true } }))._sum.delta ?? 0;
      expect(await credits(u.id)).toBe(sum);
    }
  });

  it('moves the drop through unsolved -> tense as the crowd splits', async () => {
    const { id } = await newDrop();
    const ps = await Promise.all(Array.from({ length: 4 }, () => signUp()));
    const statusAfter = async () => (await prisma.drop.findUniqueOrThrow({ where: { id } })).status;

    await guess(ps[0]!, id, 'Alpha');
    await guess(ps[1]!, id, 'Alpha');
    expect(await statusAfter()).toBe('unsolved'); // 2 votes
    await guess(ps[2]!, id, 'Beta');
    expect(await statusAfter()).toBe('unsolved'); // 2-1: gap 33
    await guess(ps[3]!, id, 'Beta');
    expect(await statusAfter()).toBe('tense_consensus'); // 2-2
  });
});

describe('POST /api/drops/:id/vote', () => {
  async function dropWithCandidates() {
    const d = await newDrop();
    const [g1, g2] = [await signUp(), await signUp()];
    await guess(g1, d.id, 'Alien');
    await guess(g2, d.id, 'Brazil');
    const [alien, brazil] = await candidatesOf(d.id);
    return { ...d, g1, g2, alien: alien!, brazil: brazil! };
  }

  it('adds a vote, free of charge, and returns the updated drop', async () => {
    const d = await dropWithCandidates();
    const v = await signUp();
    const res = await vote(v, d.id, d.alien.id);
    expect(res.status).toBe(200);
    expect(await credits(v.id)).toBe(100);

    const alien = res.body.drop.candidates.find((c: { id: string }) => c.id === d.alien.id);
    expect(alien).toMatchObject({ votes: 2, isLeader: true });
    expect(res.body.drop.totalGuessesCast).toBe(3);
  });

  it('is idempotent for the candidate you already back', async () => {
    const d = await dropWithCandidates();
    const v = await signUp();
    await vote(v, d.id, d.alien.id);
    const again = await vote(v, d.id, d.alien.id);
    expect(again.status).toBe(200);
    expect((await candidatesOf(d.id)).find((c) => c.id === d.alien.id)!.votes).toBe(2);
  });

  it('moves your vote when you pick a different candidate (one vote per drop)', async () => {
    const d = await dropWithCandidates();
    const v = await signUp();
    await vote(v, d.id, d.alien.id);
    await vote(v, d.id, d.brazil.id);

    const cands = await candidatesOf(d.id);
    expect(cands.find((c) => c.id === d.alien.id)!.votes).toBe(1);
    expect(cands.find((c) => c.id === d.brazil.id)!.votes).toBe(2);
    expect(await prisma.candidateVote.count({ where: { userId: v.id, candidate: { dropId: d.id } } })).toBe(1);
  });

  it('a guess is a locked vote: it cannot be moved', async () => {
    const d = await dropWithCandidates();
    const res = await vote(d.g1, d.id, d.brazil.id); // g1 guessed Alien
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/locked/);
    expect((await candidatesOf(d.id)).find((c) => c.id === d.alien.id)!.votes).toBe(1);
    expect((await vote(d.g1, d.id, d.alien.id)).status).toBe(200); // re-affirming is fine
  });

  it('a vote made before guessing moves to the guessed title', async () => {
    const d = await dropWithCandidates();
    const v = await signUp();
    await vote(v, d.id, d.alien.id);
    await guess(v, d.id, 'Brazil');
    const cands = await candidatesOf(d.id);
    expect(cands.find((c) => c.id === d.alien.id)!.votes).toBe(1);
    expect(cands.find((c) => c.id === d.brazil.id)!.votes).toBe(2);
  });

  it('refuses the uploader, foreign candidates, solved drops and anonymous callers', async () => {
    const d = await dropWithCandidates();
    const other = await dropWithCandidates();
    const v = await signUp();

    expect((await vote(d.owner, d.id, d.alien.id)).status).toBe(403);
    expect((await vote(v, d.id, other.alien.id)).status).toBe(404);
    expect((await vote(v, d.id, 'nope')).status).toBe(404);
    expect((await request(server).post(`/api/drops/${d.id}/vote`).send({ candidateId: d.alien.id })).status).toBe(401);

    await guess(await signUp(), d.id, 'Heat'); // solves the drop
    expect((await vote(v, d.id, d.alien.id)).status).toBe(409);
  });

  it('keeps votes equal to voters under concurrent voting and moving', async () => {
    const d = await dropWithCandidates();
    const voters = await Promise.all(Array.from({ length: 6 }, () => signUp()));
    await Promise.all(voters.map((v, i) => vote(v, d.id, i % 2 ? d.alien.id : d.brazil.id)));
    await Promise.all(voters.map((v, i) => vote(v, d.id, i % 2 ? d.brazil.id : d.alien.id)));
    for (const cand of await candidatesOf(d.id)) expect(cand.votes).toBe(await prisma.candidateVote.count({ where: { candidateId: cand.id } }));
  });
});

describe('comments', () => {
  it('posts a comment with its clip timestamp and returns the client shape', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const res = await request(server).post(`/api/drops/${id}/comment`).set('Cookie', p.cookie).send({ content: '  Check the neon sign  ', timestamp: '01:12' });
    expect(res.status).toBe(201);
    expect(res.body.comment).toMatchObject({ authorHandle: p.handle, content: 'Check the neon sign', timestamp: '01:12', agreedCount: 0, userAgreed: false, timeAgo: 'just now', isDetective: true });

    const listed = (await request(server).get(`/api/drops/${id}`)).body.drop.comments;
    expect(listed.map((c: { content: string }) => c.content)).toEqual(['Check the neon sign']);
  });

  it('defaults the timestamp and rejects bad input', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const post = (body: unknown) => request(server).post(`/api/drops/${id}/comment`).set('Cookie', p.cookie).send(body as object);
    expect((await post({ content: 'hi' })).body.comment.timestamp).toBe('00:00');
    for (const bad of [{ content: '' }, { content: '   ' }, { content: 'x'.repeat(1001) }, { content: 'ok', timestamp: 'soon' }, { content: 'ok', timestamp: '1:2' }, {}]) {
      expect((await post(bad)).status).toBe(400);
    }
    expect((await request(server).post('/api/drops/nope/comment').set('Cookie', p.cookie).send({ content: 'hi' })).status).toBe(404);
    expect((await request(server).post(`/api/drops/${id}/comment`).send({ content: 'hi' })).status).toBe(401);
  });

  it('can comment on solved drops (the archive stays discussable)', async () => {
    const { id } = await newDrop();
    await guess(await signUp(), id, 'Heat');
    const p = await signUp();
    expect((await request(server).post(`/api/drops/${id}/comment`).set('Cookie', p.cookie).send({ content: 'Great find' })).status).toBe(201);
  });

  it('toggles agreement, never on your own comment', async () => {
    const { id } = await newDrop();
    const [author, fan] = [await signUp(), await signUp()];
    const commentId = (await request(server).post(`/api/drops/${id}/comment`).set('Cookie', author.cookie).send({ content: 'Look closer' })).body.comment.id;
    const agree = (acc: Account, drop = id, cid = commentId) => request(server).post(`/api/drops/${drop}/comments/${cid}/agree`).set('Cookie', acc.cookie);

    const on = await agree(fan);
    expect(on.status).toBe(200);
    expect(on.body.comment).toMatchObject({ agreedCount: 1, userAgreed: true });
    const off = await agree(fan);
    expect(off.body.comment).toMatchObject({ agreedCount: 0, userAgreed: false });

    expect((await agree(author)).status).toBe(403);
    expect((await agree(fan, id, 'nope')).status).toBe(404);
    const other = await newDrop();
    expect((await agree(fan, other.id)).status).toBe(404); // comment belongs to a different drop
    expect((await request(server).post(`/api/drops/${id}/comments/${commentId}/agree`)).status).toBe(401);
  });

  it('survives rapid repeated toggling with a consistent end state', async () => {
    const { id } = await newDrop();
    const [author, fan] = [await signUp(), await signUp()];
    const commentId = (await request(server).post(`/api/drops/${id}/comment`).set('Cookie', author.cookie).send({ content: 'x' })).body.comment.id;
    const results = await Promise.all(Array.from({ length: 6 }, () => request(server).post(`/api/drops/${id}/comments/${commentId}/agree`).set('Cookie', fan.cookie)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await prisma.commentAgree.count({ where: { commentId, userId: fan.id } })).toBeLessThanOrEqual(1);
  });
});

describe('real-time events', () => {
  const open = (cookie?: string) =>
    new Promise<Socket>((resolve, reject) => {
      const s = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: cookie ? { Cookie: cookie } : {} });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  const settle = () => new Promise((r) => setTimeout(r, 200));

  it('guess_result / consensus_update reach drop watchers without the answer; credit_update goes only to the guesser', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const bystander = await signUp();

    const watcher = await open();
    const playerSock = await open(p.cookie);
    const bystanderSock = await open(bystander.cookie);
    for (const s of [watcher, playerSock, bystanderSock]) s.emit('join_drop', id);
    await settle();

    const results: any[] = [];
    const consensus: any[] = [];
    const playerCredits: unknown[] = [];
    const bystanderCredits: unknown[] = [];
    watcher.on('guess_result', (r) => results.push(r));
    watcher.on('consensus_update', (r) => consensus.push(r));
    playerSock.on('credit_update', (r) => playerCredits.push(r));
    bystanderSock.on('credit_update', (r) => bystanderCredits.push(r));

    await guess(p, id, 'Casino');
    await settle();

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ dropId: id, isCorrect: false, userHandle: p.handle, totalGuessesCast: 1, status: 'unsolved' });
    expect(consensus).toHaveLength(1);
    expect(consensus[0].candidates).toHaveLength(1);
    expect(JSON.stringify([results, consensus])).not.toContain('Heat'); // the answer
    expect(playerCredits).toEqual([{ credits: 80 }]);
    expect(bystanderCredits).toEqual([]);

    await guess(bystander, id, 'Heat');
    await settle();
    expect(results.at(-1)).toMatchObject({ isCorrect: true, status: 'solved', userHandle: bystander.handle });
  });

  it('new comments are pushed to the drop room', async () => {
    const { id } = await newDrop();
    const p = await signUp();
    const watcher = await open();
    watcher.emit('join_drop', id);
    await settle();
    const got: any[] = [];
    watcher.on('new_comment', (c) => got.push(c));

    await request(server).post(`/api/drops/${id}/comment`).set('Cookie', p.cookie).send({ content: 'Spotted it' });
    await settle();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ dropId: id, comment: { content: 'Spotted it', authorHandle: p.handle, userAgreed: false } });
  });
});
