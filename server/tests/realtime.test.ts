import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { closeRealtime, emitToDrop, emitToUser, initRealtime } from '../src/realtime/io.js';
import { PASSWORD, sessionCookie, uniqueName } from './helpers.js';

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

function open(cookie?: string): Promise<Socket> {
  const socket = connect(url, {
    transports: ['websocket'],
    forceNew: true,
    extraHeaders: cookie ? { Cookie: cookie } : {},
  });
  sockets.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

const collect = (socket: Socket, event: string) => {
  const got: unknown[] = [];
  socket.on(event, (p) => got.push(p));
  return got;
};
const settle = () => new Promise((r) => setTimeout(r, 150));

async function signUp() {
  const name = uniqueName('rt');
  const res = await request(server).post('/api/auth/register').send({ username: name, password: PASSWORD });
  return { id: res.body.user.id as string, cookie: sessionCookie(res)! };
}

describe('socket authentication', () => {
  it('joins the private room only for a verified session', async () => {
    const alice = await signUp();
    const bob = await signUp();

    const aliceSocket = await open(alice.cookie);
    const bobSocket = await open(bob.cookie);
    const anon = await open();
    const forged = await open('tp_session=not-a-real-token');

    const inbox = { alice: collect(aliceSocket, 'credit_update'), bob: collect(bobSocket, 'credit_update'), anon: collect(anon, 'credit_update'), forged: collect(forged, 'credit_update') };

    // An anonymous client asking for Alice's room must not get it.
    anon.emit('join_user', alice.id);
    forged.emit('join_user', alice.id);
    await settle();

    emitToUser(alice.id, 'credit_update', { credits: 42 });
    await settle();

    expect(inbox.alice).toEqual([{ credits: 42 }]);
    expect(inbox.bob).toEqual([]);
    expect(inbox.anon).toEqual([]);
    expect(inbox.forged).toEqual([]);
  });

  it('drop rooms are joinable by anyone and validate the id', async () => {
    const anon = await open();
    const other = await open();
    const got = collect(anon, 'guess_result');
    const otherGot = collect(other, 'guess_result');

    anon.emit('join_drop', 'drop-123');
    other.emit('join_drop', { not: 'a string' });
    await settle();
    emitToDrop('drop-123', 'guess_result', { ok: true });
    await settle();

    expect(got).toEqual([{ ok: true }]);
    expect(otherGot).toEqual([]);
  });

  it('reports live connections on the status endpoint', async () => {
    await open();
    const res = await request(server).get('/api/system/status');
    expect(res.body.sockets.activeSockets).toBeGreaterThan(0);
  });

  it('a user deleted after login is treated as anonymous', async () => {
    const ghost = await signUp();
    await prisma.creditLedger.deleteMany({ where: { userId: ghost.id } });
    await prisma.user.delete({ where: { id: ghost.id } });
    const socket = await open(ghost.cookie);
    const got = collect(socket, 'credit_update');
    await settle();
    emitToUser(ghost.id, 'credit_update', { credits: 1 });
    await settle();
    expect(got).toEqual([]);
  });
});
