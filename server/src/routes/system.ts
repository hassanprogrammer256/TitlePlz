import { Router } from 'express';
import type { SystemStatus } from '../../../shared/types.js';
import { config } from '../config/env.js';
import { checkDatabase } from '../db/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { activeSocketCount } from '../realtime/io.js';

const startedAt = Date.now();
const MODELS_LOADED = Object.keys(Prisma.ModelName).length;

export const systemRouter = Router();

systemRouter.get('/system/status', async (_req, res) => {
  const dbUp = await checkDatabase();
  const body: SystemStatus = {
    status: dbUp ? 'operational' : 'degraded',
    sockets: { activeSockets: activeSocketCount(), protocol: 'websocket' },
    database: { provider: config.dbProvider, status: dbUp ? 'connected' : 'disconnected', modelsLoaded: MODELS_LOADED },
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: Date.now(),
  };
  res.status(dbUp ? 200 : 503).json(body);
});

/** Liveness: process is up. Does not touch the database. */
systemRouter.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});
