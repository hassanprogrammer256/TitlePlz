import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { normalizeTags } from '../src/services/dropService.js';
import { closeRealtime, initRealtime } from '../src/realtime/io.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';
import { makeMp4, makePng, uploadOk } from './media.js';

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

type Account = { id: string; name: string; cookie: string };
async function signUp(prefix = 'dr'): Promise<Account> {
  const name = uniqueName(prefix);
  const res = await request(server).post('/api/auth/register').send({ username: name, password: PASSWORD });
  return { id: res.body.user.id, name, cookie: sessionCookie(res)! };
}
const balanceOf = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).credits;

const baseBody = (over: Record<string, unknown> = {}) => ({
  title: 'Blade Runner 2049',
  releaseYear: 2017,
  mediaType: 'photo',
  validityDurationHours: 72,
  bountyPts: 50,
  tags: ['#NeoNoir', 'Sci-Fi'],
  ...over,
});

async function photoDrop(owner: Account, over: Record<string, unknown> = {}) {
  const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'frame.png');
  const res = await request(server)
    .post('/api/drops')
    .set('Cookie', owner.cookie)
    .send(baseBody({ imageKey: image.key, ...over }));
  return { res, image };
}

describe('normalizeTags', () => {
  it('lowercases, strips symbols, dedupes and caps', () => {
    expect(normalizeTags(['#NeoNoir', 'neonoir', 'Sci-Fi', '  ', '###', 'a'.repeat(40)])).toEqual(['neonoir', 'scifi', 'a'.repeat(30)]);
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(10);
  });
});

describe('POST /api/drops', () => {
  it('requires a session', async () => {
    expect((await request(server).post('/api/drops').send(baseBody({ imageKey: 'x' }))).status).toBe(401);
  });

  it('creates a photo drop: stakes the bounty, claims the upload, normalizes tags', async () => {
    const owner = await signUp();
    const { res, image } = await photoDrop(owner);

    expect(res.status).toBe(201);
    expect(res.body.user.credits).toBe(50);
    expect(await balanceOf(owner.id)).toBe(50);

    const { drop } = res.body;
    expect(drop).toMatchObject({
      mediaType: 'photo',
      bountyPts: 50,
      status: 'unsolved',
      uploaderHandle: `@${owner.name}`,
      validityDurationHours: 72,
      correctTitle: 'Blade Runner 2049', // the uploader may see their own answer
      imageUrl: image.url,
      tags: ['#neonoir', '#scifi'],
      totalGuessesCast: 0,
      candidates: [],
    });
    expect(drop.dropNumber).toMatch(/^DROP #\d{5}$/);
    expect(drop.expiresAt - drop.createdAt).toBe(72 * 3_600_000);

    const stake = await prisma.creditLedger.findFirstOrThrow({ where: { userId: owner.id, reason: 'bounty_stake' } });
    expect(stake).toMatchObject({ delta: -50, refType: 'drop', refId: drop.id, balanceAfter: 50 });
    expect((await prisma.upload.findUniqueOrThrow({ where: { key: image.key } })).dropId).toBe(drop.id);
    expect(await prisma.activity.count({ where: { actorId: owner.id, dropId: drop.id, type: 'posted_clip' } })).toBe(1);
  });

  it('creates a clip drop and takes the length from the file, not the request', async () => {
    const owner = await signUp();
    const poster = await uploadOk(server, owner.cookie, 'image', makePng(), 'poster.png');
    const video = await uploadOk(server, owner.cookie, 'video', makeMp4({ seconds: 95 }), 'clip.mp4');
    const res = await request(server)
      .post('/api/drops')
      .set('Cookie', owner.cookie)
      .send(baseBody({ mediaType: 'clip', imageKey: poster.key, videoKey: video.key, clipDurationSeconds: 5 }));

    expect(res.status).toBe(201);
    expect(res.body.drop).toMatchObject({ mediaType: 'clip', clipDurationSeconds: 95, audioDuration: 95, videoUrl: video.url, imageUrl: poster.url });
  });

  it('aborts cleanly when the balance is too low', async () => {
    const owner = await signUp();
    const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'f.png');
    const res = await request(server).post('/api/drops').set('Cookie', owner.cookie).send(baseBody({ imageKey: image.key, bountyPts: 101 }));

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Insufficient credits/);
    expect(await balanceOf(owner.id)).toBe(100);
    expect(await prisma.drop.count({ where: { uploaderId: owner.id } })).toBe(0);
    expect((await prisma.upload.findUniqueOrThrow({ where: { key: image.key } })).dropId).toBeNull();
  });

  it('only accepts uploads the caller owns, once', async () => {
    const alice = await signUp();
    const mallory = await signUp();
    const image = await uploadOk(server, alice.cookie, 'image', makePng(), 'f.png');

    const stolen = await request(server).post('/api/drops').set('Cookie', mallory.cookie).send(baseBody({ imageKey: image.key }));
    expect(stolen.status).toBe(422);
    expect(await balanceOf(mallory.id)).toBe(100);

    const first = await request(server).post('/api/drops').set('Cookie', alice.cookie).send(baseBody({ imageKey: image.key }));
    expect(first.status).toBe(201);
    const reuse = await request(server).post('/api/drops').set('Cookie', alice.cookie).send(baseBody({ imageKey: image.key }));
    expect(reuse.status).toBe(422);
    expect(await balanceOf(alice.id)).toBe(50); // charged once

    for (const bogus of ['nope', '../../etc/passwd', 'u/x/aaaaaaaaaaaaaaaaaaaaaaaa.png']) {
      expect((await request(server).post('/api/drops').set('Cookie', alice.cookie).send(baseBody({ imageKey: bogus }))).status).toBe(422);
    }
  });

  it('concurrent creates with the same upload yield exactly one drop and one charge', async () => {
    const owner = await signUp();
    const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'f.png');
    const results = await Promise.all(
      Array.from({ length: 4 }, () => request(server).post('/api/drops').set('Cookie', owner.cookie).send(baseBody({ imageKey: image.key, bountyPts: 30 }))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.drop.count({ where: { uploaderId: owner.id } })).toBe(1);
    expect(await balanceOf(owner.id)).toBe(70);
  });

  it('checks media kinds', async () => {
    const owner = await signUp();
    const png = await uploadOk(server, owner.cookie, 'image', makePng(), 'a.png');
    const png2 = await uploadOk(server, owner.cookie, 'image', makePng(), 'b.png');
    const video = await uploadOk(server, owner.cookie, 'video', makeMp4({ seconds: 20 }), 'c.mp4');
    const post = (body: Record<string, unknown>) => request(server).post('/api/drops').set('Cookie', owner.cookie).send(baseBody(body));

    expect((await post({ imageKey: video.key })).status).toBe(422); // video used as the image
    expect((await post({ mediaType: 'clip', imageKey: png.key })).status).toBe(400); // clip without a videoKey
    expect((await post({ mediaType: 'clip', imageKey: png.key, videoKey: png2.key })).status).toBe(422); // image as the video
    expect((await post({ imageKey: png.key, videoKey: video.key })).status).toBe(400); // photo with a videoKey
    expect(await balanceOf(owner.id)).toBe(100);
  });

  it.each([
    ['bounty below minimum', { bountyPts: 19 }],
    ['bounty above maximum', { bountyPts: 10_001 }],
    ['fractional bounty', { bountyPts: 20.5 }],
    ['validity under 24h', { validityDurationHours: 23 }],
    ['validity over a week', { validityDurationHours: 169 }],
    ['blank title', { title: '   ' }],
    ['year in the far future', { releaseYear: 3000 }],
    ['unknown media type', { mediaType: 'gif' }],
    ['string bounty', { bountyPts: '50' }],
  ])('rejects %s', async (_label, over) => {
    const owner = await signUp();
    const image = await uploadOk(server, owner.cookie, 'image', makePng(), 'f.png');
    const res = await request(server).post('/api/drops').set('Cookie', owner.cookie).send(baseBody({ imageKey: image.key, ...over }));
    expect(res.status).toBe(400);
    expect(await balanceOf(owner.id)).toBe(100);
  });

  it('broadcasts new_drop without leaking the answer, and pushes the new balance to the owner', async () => {
    const owner = await signUp();
    const open = (cookie?: string) =>
      new Promise<Socket>((resolve, reject) => {
        const s = connect(url, { transports: ['websocket'], forceNew: true, extraHeaders: cookie ? { Cookie: cookie } : {} });
        sockets.push(s);
        s.on('connect', () => resolve(s));
        s.on('connect_error', reject);
      });
    const watcher = await open();
    const ownerSock = await open(owner.cookie);
    const drops: any[] = [];
    const credits: unknown[] = [];
    watcher.on('new_drop', (d) => drops.push(d));
    ownerSock.on('credit_update', (p) => credits.push(p));

    const { res } = await photoDrop(owner);
    await new Promise((r) => setTimeout(r, 200));

    expect(drops).toHaveLength(1);
    expect(drops[0].id).toBe(res.body.drop.id);
    expect(drops[0].correctTitle).toBe('');
    expect(JSON.stringify(drops[0])).not.toContain('Blade Runner 2049');
    expect(credits).toEqual([{ credits: 50 }]);
  });
});

describe('GET /api/drops', () => {
  it('is public and hides the answer from everyone but the uploader', async () => {
    const owner = await signUp();
    const stranger = await signUp();
    const { res } = await photoDrop(owner);
    const id = res.body.drop.id;

    const anon = await request(server).get('/api/drops');
    expect(anon.status).toBe(200);
    expect(anon.body.drops.find((d: { id: string }) => d.id === id).correctTitle).toBe('');
    expect(JSON.stringify(anon.body)).not.toMatch(/passwordHash|correctTitleKey/);

    const asStranger = await request(server).get('/api/drops').set('Cookie', stranger.cookie);
    expect(asStranger.body.drops.find((d: { id: string }) => d.id === id).correctTitle).toBe('');
    const asOwner = await request(server).get('/api/drops').set('Cookie', owner.cookie);
    expect(asOwner.body.drops.find((d: { id: string }) => d.id === id).correctTitle).toBe('Blade Runner 2049');
  });

  it('filters by mine, tag and status (including not-yet-swept expiry)', async () => {
    const owner = await signUp();
    const other = await signUp();
    const tag = `tag${Math.random().toString(36).slice(2, 8)}`;
    const open = (await photoDrop(owner, { tags: [tag], bountyPts: 20 })).res.body.drop.id as string;
    const solved = (await photoDrop(owner, { tags: [tag], bountyPts: 20 })).res.body.drop.id as string;
    const lapsed = (await photoDrop(owner, { tags: [tag], bountyPts: 20 })).res.body.drop.id as string;
    const foreign = (await photoDrop(other, { tags: [tag], bountyPts: 20 })).res.body.drop.id as string;

    await prisma.drop.update({ where: { id: solved }, data: { status: 'solved' } });
    await prisma.drop.update({ where: { id: lapsed }, data: { expiresAt: new Date(Date.now() - 1000) } }); // open in DB, past its deadline

    const ids = async (qs: string, cookie?: string) => {
      const r = await request(server).get(`/api/drops?tag=%23${tag}&${qs}`).set('Cookie', cookie ?? '');
      expect(r.status).toBe(200);
      return r.body.drops.map((d: { id: string }) => d.id).sort();
    };

    expect(await ids('')).toEqual([open, solved, lapsed, foreign].sort());
    expect(await ids('status=open')).toEqual([open, foreign].sort());
    expect(await ids('status=solved')).toEqual([solved]);
    expect(await ids('status=expired')).toEqual([lapsed]);
    expect(await ids('mine=true', owner.cookie)).toEqual([open, solved, lapsed].sort());

    const dto = (await request(server).get(`/api/drops/${lapsed}`)).body.drop;
    expect(dto.status).toBe('expired');
    expect(dto.correctTitle).toBe('Blade Runner 2049'); // revealed once expired
    expect((await request(server).get('/api/drops?mine=true')).status).toBe(401);
  });

  it('paginates newest-first without gaps or repeats', async () => {
    const owner = await signUp();
    const tag = `pg${Math.random().toString(36).slice(2, 8)}`;
    const made: string[] = [];
    for (let i = 0; i < 5; i++) made.unshift((await photoDrop(owner, { tags: [tag], bountyPts: 20 })).res.body.drop.id);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page++) {
      const r: request.Response = await request(server).get(`/api/drops?tag=${tag}&limit=2${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...r.body.drops.map((d: { id: string }) => d.id));
      cursor = r.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(made);
    expect((await request(server).get('/api/drops?cursor=garbage')).status).toBe(400);
    expect((await request(server).get('/api/drops?limit=101')).status).toBe(400);
    expect((await request(server).get('/api/drops?status=weird')).status).toBe(400);
  });

  it('includes only the caller\'s own trial', async () => {
    const owner = await signUp();
    const a = await signUp();
    const b = await signUp();
    const id = (await photoDrop(owner)).res.body.drop.id as string;
    for (const [u, correct] of [[a, true], [b, false]] as const) {
      await prisma.trial.create({ data: { dropId: id, userId: u.id, guessedTitle: 'x', isCorrect: correct, stake: 20, reward: correct ? 70 : 0, pointsDelta: correct ? 5 : -3 } });
    }
    const asA = (await request(server).get(`/api/drops/${id}`).set('Cookie', a.cookie)).body.drop;
    expect(Object.keys(asA.userTrials)).toEqual([a.id]);
    expect(asA.userTrials[a.id]).toMatchObject({ isCorrect: true, stakeDeducted: 20, rewardAwarded: 70, pointsDelta: 5 });
    expect((await request(server).get(`/api/drops/${id}`)).body.drop.userTrials).toEqual({});
  });
});

describe('GET /api/drops/:id', () => {
  it('returns 404 for an unknown drop', async () => {
    const res = await request(server).get('/api/drops/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Drop not found');
  });
});
