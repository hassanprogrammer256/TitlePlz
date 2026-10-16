import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from '../config/env.js';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

function createClient(): PrismaClient {
  const adapter =
    config.dbProvider === 'sqlite'
      ? new PrismaBetterSqlite3({ url: config.DATABASE_URL })
      : new PrismaPg({ connectionString: config.DATABASE_URL });
  return new PrismaClient({ adapter, log: config.isDev ? ['warn', 'error'] : ['error'] });
}

// One client per process (survives tsx watch reloads in dev).
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma = globalForPrisma.__prisma ?? createClient();
if (!config.isProd) globalForPrisma.__prisma = prisma;

/**
 * SQLite tuning. Default (rollback-journal) mode fsyncs on every commit, which measured ~280 ms
 * per small transaction on Windows versus ~2 ms in WAL mode. WAL also lets readers run while a
 * write is in progress. `synchronous=NORMAL` is the standard pairing for WAL (a power cut can lose
 * the last commits but never corrupts the file). No-op on PostgreSQL.
 */
async function applyDatabaseTuning(): Promise<void> {
  if (config.dbProvider !== 'sqlite') return;
  await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
  await prisma.$executeRawUnsafe('PRAGMA synchronous = NORMAL');
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
}

/** Resolves once the connection is tuned. The server awaits it before listening; it is also started at import time. */
export const databaseReady: Promise<void> = applyDatabaseTuning().catch((err) => {
  console.error('[db] tuning failed (continuing with defaults):', err);
});

/** Run `fn` inside an interactive transaction. Use for anything that touches credits. */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 5_000, timeout: 15_000 });
}

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
