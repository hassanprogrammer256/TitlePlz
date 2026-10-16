import { Router } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { addSseClient, broadcastSse, pingSseClients, sendSse, sseClientCount } from '../realtime/sse.js';
import { getTelemetry, liveSubset } from '../services/telemetryService.js';

const TICK_MS = 5_000;
let ticker: NodeJS.Timeout | null = null;
let ticks = 0;

/** One shared timer for all stream clients: compute once per tick, fan out, stop when nobody listens. */
function ensureTicker() {
  if (ticker) return;
  ticker = setInterval(async () => {
    if (sseClientCount() === 0) {
      if (ticker) clearInterval(ticker);
      ticker = null;
      return;
    }
    try {
      broadcastSse('telemetry', liveSubset(await getTelemetry()));
      if (++ticks % 3 === 0) pingSseClients();
    } catch (err) {
      logger.warn({ err }, 'telemetry tick failed');
    }
  }, TICK_MS);
  ticker.unref();
}

export function stopTelemetryTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

export const analyticsRouter = Router();

analyticsRouter.get('/analytics', async (_req, res) => {
  res.json({ telemetry: await getTelemetry() });
});

/** Public aggregate telemetry as Server-Sent Events: `initial_telemetry`, then `telemetry` every 5 s, plus `season_reset`. */
analyticsRouter.get('/analytics/stream', async (_req, res) => {
  if (!addSseClient(res)) throw new AppError(503, 'Too many live connections', 'SSE_FULL');
  try {
    sendSse(res, 'initial_telemetry', await getTelemetry());
    ensureTicker();
  } catch (err) {
    logger.warn({ err }, 'could not start telemetry stream');
    res.end(); // headers are already sent, so the normal error handler can't answer
  }
});
