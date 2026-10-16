import http from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/client.js';
import { closeAllSseClients, sseClientCount } from '../src/realtime/sse.js';
import { stopTelemetryTicker } from '../src/routes/analytics.js';
import { closeRealtime, initRealtime } from '../src/realtime/io.js';
import { rolloverSeason } from '../src/services/seasonService.js';
import { resetTelemetryCacheForTests } from '../src/services/telemetryService.js';
import { guess, newDrop, signUp } from './factory.js';

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer(createApp());
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  stopTelemetryTicker();
  closeAllSseClients();
  await closeRealtime();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
beforeEach(() => resetTelemetryCacheForTests());

const telemetry = async () => {
  resetTelemetryCacheForTests();
  return (await request(server).get('/api/analytics')).body.telemetry;
};

describe('GET /api/analytics', () => {
  it('is public and has the full client shape', async () => {
    const t = await telemetry();
    expect(t).toMatchObject({
      radarDropsScanning: expect.any(Number),
      recognitionRate: expect.any(Number),
      consensusEngineVersion: 'v1.0',
      activeSolvers: expect.any(Number),
      solverVelocity: expect.any(Number),
      guessesSubmittedToday: expect.any(Number),
    });
    expect(Array.isArray(t.topGenres)).toBe(true);
    expect(t.hourlyActivity).toHaveLength(12);
    expect(t.hourlyActivity.every((h: { hour: string }) => /^\d\d:00$/.test(h.hour))).toBe(true);
  });

  it('counts open drops, today\'s guesses and the recent guess rate from real data', async () => {
    const before = await telemetry();
    const drop = await newDrop(server);
    const players = await Promise.all([signUp(server), signUp(server), signUp(server)]);
    for (const p of players) await guess(server, p, drop.id, 'Wrong');

    const after = await telemetry();
    expect(after.radarDropsScanning).toBe(before.radarDropsScanning + 1);
    expect(after.guessesSubmittedToday).toBe(before.guessesSubmittedToday + 3);
    expect(after.solverVelocity).toBeGreaterThanOrEqual(0.3); // 3+ guesses in the last 10 minutes
  });

  it('computes the recognition rate from solved versus closed drops', async () => {
    const solvedDrop = await newDrop(server);
    await guess(server, await signUp(server), solvedDrop.id, 'Heat');
    const lapsed = await newDrop(server);
    await prisma.drop.update({ where: { id: lapsed.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const t = await telemetry();
    const solved = await prisma.drop.count({ where: { status: 'solved' } });
    const expired = await prisma.drop.count({ where: { OR: [{ status: 'expired' }, { status: { in: ['unsolved', 'tense_consensus', 'high_consensus'] }, expiresAt: { lte: new Date() } }] } });
    expect(t.recognitionRate).toBe(Math.round((solved / (solved + expired)) * 1000) / 10);
  });

  it('ranks the top tags with percentages and capitalised names', async () => {
    const tag = `genre${Math.random().toString(36).slice(2, 6)}`;
    for (let i = 0; i < 3; i++) await newDrop(server, { tags: [tag] });
    const t = await telemetry();
    expect(t.topGenres.length).toBeLessThanOrEqual(4);
    const mine = t.topGenres.find((g: { name: string }) => g.name === tag.charAt(0).toUpperCase() + tag.slice(1));
    expect(mine).toBeDefined();
    expect(mine.percentage).toBeGreaterThan(0);
    expect(t.topGenres.reduce((s: number, g: { percentage: number }) => s + g.percentage, 0)).toBeLessThanOrEqual(104); // rounding slack
  });

  it('puts activity and solves into the current hourly bucket', async () => {
    const before = (await telemetry()).hourlyActivity.at(-1);
    const drop = await newDrop(server);
    await guess(server, await signUp(server), drop.id, 'Heat');
    const after = (await telemetry()).hourlyActivity.at(-1);
    expect(after.hour).toBe(`${String(new Date().getUTCHours()).padStart(2, '0')}:00`);
    expect(after.solved).toBeGreaterThanOrEqual(before.solved + 1);
    expect(after.active).toBeGreaterThanOrEqual(before.active);
  });

  it('serves repeated reads from a short cache', async () => {
    const first = (await request(server).get('/api/analytics')).body.telemetry;
    await newDrop(server); // changes the data, but within the TTL the cached value is returned
    const second = (await request(server).get('/api/analytics')).body.telemetry;
    expect(second.radarDropsScanning).toBe(first.radarDropsScanning);
  });
});

/** Opens the SSE stream and collects parsed events until `done` says stop. */
function openStream(done: (events: { event: string; data: any }[]) => boolean, timeoutMs = 9_000) {
  return new Promise<{ events: { event: string; data: any }[]; close: () => void; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const events: { event: string; data: any }[] = [];
    let buffer = '';
    const req = http.get({ host: '127.0.0.1', port, path: '/api/analytics/stream' }, (res) => {
      const finish = () => {
        clearTimeout(timer);
        resolve({ events, headers: res.headers, close: () => req.destroy() });
      };
      const timer = setTimeout(finish, timeoutMs);
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = /^data: (.+)$/m.exec(block)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
        if (done(events)) finish();
      });
    });
    req.on('error', (e) => (events.length ? undefined : reject(e)));
  });
}
const settle = (ms = 250) => new Promise((r) => setTimeout(r, ms));

describe('GET /api/analytics/stream (SSE)', () => {
  it('sends initial_telemetry with the right headers, then live telemetry ticks', async () => {
    const { events, headers, close } = await openStream((e) => e.some((x) => x.event === 'telemetry'));
    expect(headers['content-type']).toContain('text/event-stream');
    expect(headers['cache-control']).toContain('no-cache');
    expect(events[0]!.event).toBe('initial_telemetry');
    expect(events[0]!.data.hourlyActivity).toHaveLength(12);
    const tick = events.find((e) => e.event === 'telemetry')!;
    expect(Object.keys(tick.data).sort()).toEqual(['activeSolvers', 'guessesSubmittedToday', 'radarDropsScanning', 'recognitionRate', 'solverVelocity']);
    close();
  }, 15_000);

  it('removes the client when it disconnects', async () => {
    const { close } = await openStream((e) => e.length > 0);
    expect(sseClientCount()).toBeGreaterThanOrEqual(1);
    close();
    await settle(400);
    expect(sseClientCount()).toBe(0);
  });

  it('pushes season_reset to stream clients when a new season starts', async () => {
    const stream = openStream((e) => e.some((x) => x.event === 'season_reset'));
    await settle(500);
    await rolloverSeason();
    const { events, close } = await stream;
    const reset = events.find((e) => e.event === 'season_reset')!;
    expect(reset.data.season).toMatchObject({ isActive: true });
    expect(Array.isArray(reset.data.leaders)).toBe(true);
    close();
  }, 15_000);
});
