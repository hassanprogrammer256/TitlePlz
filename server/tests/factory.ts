import type { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';
import { prisma } from '../src/db/client.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';
import { makePng, uploadOk } from './media.js';

export type Target = Express | Server;
export type Account = { id: string; name: string; handle: string; cookie: string };

export async function signUp(app: Target, prefix = 'f'): Promise<Account> {
  const name = uniqueName(prefix);
  const res = await request(app).post('/api/auth/register').send({ username: name, password: PASSWORD });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.user.id, name, handle: `@${name}`, cookie: sessionCookie(res)! };
}

/** Promotes an account to admin directly in the DB (there is deliberately no HTTP route for it). */
export const makeAdmin = (acc: Account) => prisma.user.update({ where: { id: acc.id }, data: { isAdmin: true } });

export async function newDrop(app: Target, opts: { bounty?: number; title?: string; owner?: Account; tags?: string[] } = {}) {
  const owner = opts.owner ?? (await signUp(app, 'own'));
  const image = await uploadOk(app, owner.cookie, 'image', makePng(), 'f.png');
  const res = await request(app)
    .post('/api/drops')
    .set('Cookie', owner.cookie)
    .send({
      title: opts.title ?? 'Heat',
      releaseYear: 1995,
      mediaType: 'photo',
      validityDurationHours: 24,
      bountyPts: opts.bounty ?? 20,
      imageKey: image.key,
      tags: opts.tags ?? [],
    });
  if (res.status !== 201) throw new Error(`drop failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { owner, id: res.body.drop.id as string };
}

export const guess = (app: Target, acc: Account, dropId: string, title: string) =>
  request(app).post(`/api/drops/${dropId}/guess`).set('Cookie', acc.cookie).send({ title });

/** Creates a user straight in the DB (fast) for ranking tests that don't need a session. */
export async function dbUser(prefix = 'db') {
  const name = uniqueName(prefix);
  return prisma.user.create({ data: { username: name, usernameKey: name, handle: `@${name}`, passwordHash: 'x', agentHash: `H-${name}` } });
}
