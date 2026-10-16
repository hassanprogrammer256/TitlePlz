import cookieParser from 'cookie-parser';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { attachUser, requireAdmin, requireAuth, requireRole } from '../src/middleware/auth.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { createAuthRouter } from '../src/routes/auth.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';

const app = createApp();
const JWT_SECRET = process.env.JWT_SECRET!;

async function register(name = uniqueName(), extra: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/auth/register').send({ username: name, password: PASSWORD, ...extra });
  return { res, name, cookie: sessionCookie(res) };
}

describe('POST /api/auth/register', () => {
  it('creates the account, logs in, and grants 100 credits through the ledger', async () => {
    const { res, name, cookie } = await register();
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: name, handle: `@${name}`, role: 'detective', credits: 100 });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tp_session='))!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toBeTruthy();

    const row = await prisma.user.findUniqueOrThrow({ where: { usernameKey: name.toLowerCase() } });
    expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    const ledger = await prisma.creditLedger.findMany({ where: { userId: row.id } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ delta: 100, balanceAfter: 100, reason: 'signup' });
  });

  it('honours a seeker role but refuses to self-assign curator', async () => {
    expect((await register(uniqueName(), { role: 'seeker' })).res.body.user.role).toBe('seeker');
    const curator = await register(uniqueName(), { role: 'curator' });
    expect(curator.res.status).toBe(403);
    expect(await prisma.user.count({ where: { usernameKey: curator.name.toLowerCase() } })).toBe(0);
  });

  it('rejects taken usernames case-insensitively', async () => {
    const { name } = await register();
    const dup = await request(app).post('/api/auth/register').send({ username: name.toUpperCase(), password: PASSWORD });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('That username is already taken');
  });

  it.each([
    [{ username: 'ab', password: PASSWORD }, 'username'],
    [{ username: 'has space', password: PASSWORD }, 'username'],
    [{ username: 'x'.repeat(21), password: PASSWORD }, 'username'],
    [{ username: 'okname', password: 'short' }, 'password'],
    [{ username: 'okname', password: 'x'.repeat(129) }, 'password'],
    [{ username: 'okname', password: PASSWORD, role: 'admin' }, 'role'],
    [{ username: 'okname', password: PASSWORD, isAdmin: true }, 'body'],
  ])('rejects invalid input %j', async (body, field) => {
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain(field);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with the right password', async () => {
    const { name } = await register();
    const res = await request(app).post('/api/auth/login').send({ username: name.toLowerCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(name);
    expect(sessionCookie(res)).toBeTruthy();
  });

  it('gives the same 401 for a wrong password and an unknown user', async () => {
    const { name } = await register();
    const wrong = await request(app).post('/api/auth/login').send({ username: name, password: 'not-the-password' });
    const unknown = await request(app).post('/api/auth/login').send({ username: uniqueName('ghost'), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toBe(unknown.body.error);
    expect(sessionCookie(wrong)).toBeUndefined();
  });
});

describe('session handling', () => {
  it('GET /me returns the logged-in user and 401 without a session', async () => {
    const { cookie, name } = await register();
    const me = await request(app).get('/api/auth/me').set('Cookie', cookie!);
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe(name);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
  });

  it('logout clears the cookie', async () => {
    const { cookie } = await register();
    const res = await request(app).post('/api/auth/logout').set('Cookie', cookie!);
    expect(res.status).toBe(200);
    const cleared = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('tp_session='))!;
    expect(cleared).toMatch(/tp_session=;/);
  });

  it('rejects tampered, wrongly signed, and expired tokens', async () => {
    const { cookie } = await register();
    const token = cookie!.split('=')[1]!;
    const sub = (jwt.decode(token) as { sub: string }).sub;

    const tampered = `tp_session=${token.slice(0, -2)}xx`;
    const wrongKey = `tp_session=${jwt.sign({}, 'another-secret-another-secret-123456', { subject: sub })}`;
    const expired = `tp_session=${jwt.sign({}, JWT_SECRET, { subject: sub, expiresIn: -10 })}`;
    const noneAlg = `tp_session=${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(`{"sub":"${sub}"}`).toString('base64url')}.`;

    for (const bad of [tampered, wrongKey, expired, noneAlg]) {
      expect((await request(app).get('/api/auth/me').set('Cookie', bad)).status).toBe(401);
    }
  });

  it('rejects a valid token whose user no longer exists', async () => {
    const { cookie, name } = await register();
    await prisma.user.delete({ where: { usernameKey: name.toLowerCase() } }).catch(async () => {
      // ledger rows reference the user; remove them first
      const u = await prisma.user.findUniqueOrThrow({ where: { usernameKey: name.toLowerCase() } });
      await prisma.creditLedger.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    });
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie!);
    expect(res.status).toBe(401);
    expect((res.headers['set-cookie'] as unknown as string[] | undefined)?.some((c) => /tp_session=;/.test(c))).toBe(true);
  });
});

describe('GET /api/users', () => {
  it('requires a session outside development and never leaks other users\' balances or hashes', async () => {
    expect((await request(app).get('/api/users')).status).toBe(401);

    const { cookie, name } = await register();
    const res = await request(app).get('/api/users').set('Cookie', cookie!);
    expect(res.status).toBe(200);
    const self = res.body.users.find((u: { username: string }) => u.username === name);
    expect(self.credits).toBe(100);
    for (const u of res.body.users.filter((x: { username: string }) => x.username !== name)) {
      expect(u.credits).toBe(0);
      expect(u.following).toEqual([]);
    }
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);
  });
});

describe('GET /api/users membership', () => {
  it('always includes the caller and the detectives they scout, even outside the top 200', async () => {
    const me = await register();
    const idol = await register();
    const idolRow = await prisma.user.findUniqueOrThrow({ where: { usernameKey: idol.name.toLowerCase() } });
    await request(app).post('/api/scouts/follow').set('Cookie', me.cookie!).send({ handle: idolRow.handle });

    // Push both far down the ordering: 205 users with more points than either of them.
    await prisma.user.createMany({
      data: Array.from({ length: 205 }, (_, i) => {
        const n = `${uniqueName('top')}${i}`;
        return { username: n, usernameKey: n, handle: `@${n}`, passwordHash: 'x', agentHash: `T-${n}`, points: 1_000_000 + i };
      }),
    });

    const res = await request(app).get('/api/users').set('Cookie', me.cookie!);
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toContain(me.name);
    expect(names).toContain(idol.name);
    expect(res.body.users.find((u: { username: string }) => u.username === me.name).credits).toBe(100);
    expect(res.body.users.length).toBeLessThanOrEqual(202);
  });
});

function authApp(devTools: boolean) {
  const a = express();
  a.use(express.json(), cookieParser(), attachUser);
  a.use('/api', createAuthRouter({ devTools }));
  a.get('/need-auth', requireAuth, (_req, res) => res.json({ ok: true }));
  a.get('/need-detective', requireRole('detective'), (_req, res) => res.json({ ok: true }));
  a.get('/need-admin', requireAdmin, (_req, res) => res.json({ ok: true }));
  a.use(errorHandler);
  return a;
}

describe('switch-user (development only)', () => {
  it('is not mounted unless devTools is on', async () => {
    const { name } = await register();
    const u = await prisma.user.findUniqueOrThrow({ where: { usernameKey: name.toLowerCase() } });
    expect((await request(authApp(false)).post('/api/auth/switch-user').send({ userId: u.id })).status).toBe(404);
    expect((await request(app).post('/api/auth/switch-user').send({ userId: u.id })).status).toBe(404);
  });

  it('switches session when enabled', async () => {
    const { name } = await register();
    const u = await prisma.user.findUniqueOrThrow({ where: { usernameKey: name.toLowerCase() } });
    const dev = authApp(true);
    const res = await request(dev).post('/api/auth/switch-user').send({ userId: u.id });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(name);
    const me = await request(dev).get('/api/auth/me').set('Cookie', sessionCookie(res)!);
    expect(me.body.user.username).toBe(name);
    expect((await request(dev).post('/api/auth/switch-user').send({ userId: 'nope' })).status).toBe(404);
  });
});

describe('role guards', () => {
  const guarded = authApp(false);

  it('requireAuth / requireRole / requireAdmin', async () => {
    const det = await register(uniqueName(), { role: 'detective' });
    const seek = await register(uniqueName(), { role: 'seeker' });

    expect((await request(guarded).get('/need-auth')).status).toBe(401);
    expect((await request(guarded).get('/need-auth').set('Cookie', seek.cookie!)).status).toBe(200);
    expect((await request(guarded).get('/need-detective').set('Cookie', seek.cookie!)).status).toBe(403);
    expect((await request(guarded).get('/need-detective').set('Cookie', det.cookie!)).status).toBe(200);
    expect((await request(guarded).get('/need-admin').set('Cookie', det.cookie!)).status).toBe(403);

    await prisma.user.update({ where: { usernameKey: det.name.toLowerCase() }, data: { isAdmin: true } });
    expect((await request(guarded).get('/need-admin').set('Cookie', det.cookie!)).status).toBe(200);
    // admins pass role checks
    expect((await request(guarded).get('/need-detective').set('Cookie', det.cookie!)).status).toBe(200);
  });
});
