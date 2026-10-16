import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { createLimiter } from '../src/middleware/rateLimit.js';
import { requestId } from '../src/middleware/requestId.js';
import { validate } from '../src/middleware/validate.js';

describe('system routes', () => {
  const app = createApp();

  it('GET /api/system/status reports a connected database', async () => {
    const res = await request(app).get('/api/system/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('operational');
    expect(res.body.database).toMatchObject({ provider: 'sqlite', status: 'connected' });
    expect(res.body.database.modelsLoaded).toBeGreaterThanOrEqual(14);
    expect(res.body.sockets).toEqual({ activeSockets: 0, protocol: 'websocket' });
  });

  it('GET /api/healthz is a cheap liveness probe', async () => {
    const res = await request(app).get('/api/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('unknown /api route returns the JSON error shape with a request id', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Not found', code: 'NOT_FOUND' });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('reuses a well-formed incoming X-Request-Id and rejects junk', async () => {
    const ok = await request(app).get('/api/healthz').set('X-Request-Id', 'abc-12345678');
    expect(ok.headers['x-request-id']).toBe('abc-12345678');
    const bad = await request(app).get('/api/healthz').set('X-Request-Id', 'x y\tz');
    expect(bad.headers['x-request-id']).not.toBe('x y\tz');
  });
});

function harness() {
  const app = express();
  app.use(requestId);
  app.use(express.json({ limit: '1kb' }));

  app.post(
    '/echo',
    validate({ body: z.object({ title: z.string().trim().min(1), n: z.coerce.number().int().default(1) }).strict() }),
    (req, res) => res.json(req.body),
  );
  app.get('/q', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }) }), (req, res) =>
    res.json({ limit: (req.query as { limit?: number }).limit }),
  );
  app.get('/p/:id', validate({ params: z.object({ id: z.string().regex(/^\d+$/) }) }), (req, res) => res.json(req.params));
  app.get('/app-error', () => {
    throw AppError.forbidden('nope');
  });
  app.get('/boom', () => {
    throw new Error('kaboom');
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('validation + error handler', () => {
  const app = harness();

  it('parses, coerces and strips valid bodies', async () => {
    const res = await request(app).post('/echo').send({ title: '  Heat  ', n: '3' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ title: 'Heat', n: 3 });
  });

  it('rejects invalid bodies with a readable { error } plus details', async () => {
    const res = await request(app).post('/echo').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Invalid body\.title:/);
    expect(res.body.code).toBe('BAD_REQUEST');
    expect(res.body.details[0]).toMatchObject({ in: 'body', path: 'title' });
  });

  it('rejects unknown keys on strict schemas', async () => {
    const res = await request(app).post('/echo').send({ title: 'x', admin: true });
    expect(res.status).toBe(400);
  });

  it('validates and coerces query strings (Express 5 read-only req.query)', async () => {
    expect((await request(app).get('/q?limit=5')).body).toEqual({ limit: 5 });
    expect((await request(app).get('/q')).body).toEqual({ limit: 10 });
    expect((await request(app).get('/q?limit=999')).status).toBe(400);
  });

  it('validates params', async () => {
    expect((await request(app).get('/p/42')).body).toEqual({ id: '42' });
    expect((await request(app).get('/p/abc')).status).toBe(400);
  });

  it('maps malformed JSON to 400', async () => {
    const res = await request(app).post('/echo').set('Content-Type', 'application/json').send('{"title":');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Malformed JSON body');
  });

  it('maps oversized bodies to 413', async () => {
    const res = await request(app).post('/echo').send({ title: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('serializes AppError with its status and code', async () => {
    const res = await request(app).get('/app-error');
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'nope', code: 'FORBIDDEN' });
  });

  it('turns unexpected errors into a 500 without leaking a stack', async () => {
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.ts/);
  });
});

describe('rate limiter', () => {
  it('returns 429 in the standard error shape once the limit is exceeded', async () => {
    const app = express();
    app.use(requestId);
    app.use(createLimiter({ windowMs: 60_000, limit: 2, enableInTest: true, message: 'slow down' }));
    app.get('/x', (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);

    expect((await request(app).get('/x')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
    const res = await request(app).get('/x');
    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({ error: 'slow down', code: 'RATE_LIMITED' });
  });
});
