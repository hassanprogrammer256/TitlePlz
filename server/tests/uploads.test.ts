import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { RULES } from '../src/config/rules.js';
import { prisma } from '../src/db/client.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';
import { makeJpeg, makeMp4, makePng, makeWebp, uploadFile } from './media.js';

const app = createApp();
const TMP = path.join(os.tmpdir(), 'titleplz-uploads');

async function signUp() {
  const res = await request(app).post('/api/auth/register').send({ username: uniqueName('up'), password: PASSWORD });
  return { id: res.body.user.id as string, cookie: sessionCookie(res)! };
}
const tmpCount = () => (fs.existsSync(TMP) ? fs.readdirSync(TMP).length : 0);

describe('POST /api/uploads', () => {
  it('requires a session and a valid kind', async () => {
    const u = await signUp();
    expect((await request(app).post('/api/uploads?kind=image').attach('file', makePng(), 'a.png')).status).toBe(401);
    expect((await request(app).post('/api/uploads').set('Cookie', u.cookie).attach('file', makePng(), 'a.png')).status).toBe(400);
    expect((await request(app).post('/api/uploads?kind=audio').set('Cookie', u.cookie).attach('file', makePng(), 'a.png')).status).toBe(400);
  });

  it.each([
    ['png', makePng, 'image/png', 'png'],
    ['jpeg', makeJpeg, 'image/jpeg', 'jpg'],
    ['webp', makeWebp, 'image/webp', 'webp'],
  ])('stores a %s image and serves it back from /media', async (_n, make, type, ext) => {
    const u = await signUp();
    const data = make();
    const res = await uploadFile(app, u.cookie, 'image', data, `whatever.${ext}`);

    expect(res.status).toBe(201);
    const { upload } = res.body;
    expect(upload).toMatchObject({ kind: 'image', contentType: type, sizeBytes: data.length });
    expect(upload.key).toMatch(new RegExp(`^u/${u.id}/[a-f0-9]{24}\\.${ext}$`));
    expect(upload.url).toBe(`/media/${upload.key}`);

    const row = await prisma.upload.findUniqueOrThrow({ where: { key: upload.key } });
    expect(row).toMatchObject({ userId: u.id, dropId: null, durationSeconds: null });

    const served = await request(app).get(upload.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain(type);
    expect(served.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(served.body, data)).toBe(0);
  });

  it('serves video with range support', async () => {
    const u = await signUp();
    const res = await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: 30 }), 'clip.mp4');
    expect(res.status).toBe(201);
    const ranged = await request(app).get(res.body.upload.url).set('Range', 'bytes=0-9');
    expect(ranged.status).toBe(206);
    expect(ranged.headers['content-range']).toMatch(/^bytes 0-9\//);
  });

  it('ignores the declared name and mime: content decides', async () => {
    const u = await signUp();
    const disguised = await request(app)
      .post('/api/uploads?kind=image')
      .set('Cookie', u.cookie)
      .attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
    expect(disguised.status).toBe(415);
    expect(disguised.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    // A real PNG declared as .txt is accepted as PNG with a server-chosen extension.
    const honest = await uploadFile(app, u.cookie, 'image', makePng(), 'notes.txt');
    expect(honest.status).toBe(201);
    expect(honest.body.upload.key.endsWith('.png')).toBe(true);
  });

  it('rejects the wrong kind of file for the slot', async () => {
    const u = await signUp();
    expect((await uploadFile(app, u.cookie, 'image', makeMp4({ seconds: 5 }), 'v.mp4')).status).toBe(415);
    expect((await uploadFile(app, u.cookie, 'video', makePng(), 'p.png')).status).toBe(415);
    expect((await uploadFile(app, u.cookie, 'image', Buffer.from('GIF89a-not-allowed'), 'a.gif')).status).toBe(415);
  });

  it('enforces the clip length from the MP4 header', async () => {
    const u = await signUp();
    const ok = await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: RULES.MAX_CLIP_SECONDS, moovLast: true }), 'edge.mp4');
    expect(ok.status).toBe(201);
    expect(ok.body.upload.durationSeconds).toBe(600);

    const rounding = await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: 12.2 }), 'r.mp4');
    expect(rounding.body.upload.durationSeconds).toBe(13); // rounded up, so the limit can't be gamed

    const tooLong = await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: 601 }), 'long.mp4');
    expect(tooLong.status).toBe(422);
    expect(tooLong.body.error).toMatch(/maximum is 600/);

    const unreadable = await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: 5 }).subarray(0, 30), 'cut.mp4');
    expect(unreadable.status).toBe(422);
    expect(unreadable.body.error).toMatch(/clip length/i);
    expect(await prisma.upload.count({ where: { userId: u.id } })).toBe(2);
  });

  it('accepts real encoder output and explains fragmented MP4s', async () => {
    const u = await signUp();
    const read = (name: string) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', name));

    for (const name of ['clip-faststart.mp4', 'clip-moovlast.mp4']) {
      const res = await uploadFile(app, u.cookie, 'video', read(name), name);
      expect(res.status).toBe(201);
      expect(res.body.upload.durationSeconds).toBe(4); // 3.2 s rounded up
    }

    const fragmented = await uploadFile(app, u.cookie, 'video', read('clip-fragmented.mp4'), 'rec.mp4');
    expect(fragmented.status).toBe(422);
    expect(fragmented.body.error).toMatch(/fragmented MP4.*standard MP4/);
  });

  it('rejects oversized and empty files', async () => {
    const u = await signUp();
    const big = await uploadFile(app, u.cookie, 'image', makePng(RULES.IMAGE_MAX_BYTES), 'big.png');
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect((await uploadFile(app, u.cookie, 'image', Buffer.alloc(0), 'empty.png')).status).toBe(400);
  });

  it('requires the file in the "file" field', async () => {
    const u = await signUp();
    const none = await request(app).post('/api/uploads?kind=image').set('Cookie', u.cookie).field('x', 'y');
    expect(none.status).toBe(400);
    const wrongField = await request(app).post('/api/uploads?kind=image').set('Cookie', u.cookie).attach('upload', makePng(), 'a.png');
    expect(wrongField.status).toBe(400);
  });

  it('never leaves temp files behind, on success or failure', async () => {
    const u = await signUp();
    const before = tmpCount();
    await uploadFile(app, u.cookie, 'image', makePng(), 'ok.png');
    await uploadFile(app, u.cookie, 'image', Buffer.from('nope'), 'bad.png');
    await uploadFile(app, u.cookie, 'image', makePng(RULES.IMAGE_MAX_BYTES), 'big.png');
    await uploadFile(app, u.cookie, 'video', makeMp4({ seconds: 9999 }), 'long.mp4');
    expect(tmpCount()).toBe(before);
  });

  it('caps unused uploads per user per day', async () => {
    const u = await signUp();
    await prisma.upload.createMany({
      data: Array.from({ length: RULES.MAX_UNATTACHED_UPLOADS_PER_DAY }, (_, i) => ({
        key: `u/${u.id}/${String(i).padStart(24, '0')}.png`,
        userId: u.id,
        kind: 'image',
        contentType: 'image/png',
        sizeBytes: 10,
      })),
    });
    const res = await uploadFile(app, u.cookie, 'image', makePng(), 'one-more.png');
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/unused uploads/);

    // Attached uploads don't count against the cap.
    await prisma.upload.updateMany({ where: { userId: u.id }, data: { dropId: 'some-drop' } });
    expect((await uploadFile(app, u.cookie, 'image', makePng(), 'fine.png')).status).toBe(201);
  });

  it('does not expose files outside the media root or with a bad shape', async () => {
    expect((await request(app).get('/media/../../package.json')).status).toBe(404);
    expect((await request(app).get('/media/u/x/not-a-key.png')).status).toBe(404);
  });
});
