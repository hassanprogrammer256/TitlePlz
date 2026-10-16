import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/env.js';
import { databaseReady, disconnectDatabase } from './db/client.js';
import { logger } from './lib/logger.js';
import { closeRealtime, initRealtime } from './realtime/io.js';
import { startExpiryJob } from './services/expiryService.js';
import { startSeasonJob } from './services/seasonService.js';
import { closeAllSseClients } from './realtime/sse.js';
import { stopTelemetryTicker } from './routes/analytics.js';

await databaseReady;

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

server.listen(config.PORT, () => {
  logger.info(`listening on http://localhost:${config.PORT} (${config.NODE_ENV}, db=${config.dbProvider})`);
});

const stopExpiryJob = startExpiryJob();
const stopSeasonJob = startSeasonJob();

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    stopExpiryJob();
    stopSeasonJob();
    stopTelemetryTicker();
    closeAllSseClients();
    await closeRealtime();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await disconnectDatabase();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
