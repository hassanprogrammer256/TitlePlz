import { RULES } from '../config/rules.js';
import { prisma, withTx } from '../db/client.js';
import { Prisma, type Season } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { assignTiers } from '../lib/tiers.js';
import { announceSeasonReset, getLeaderboard, getActiveSeason } from './leaderboardService.js';

const DAY_MS = 86_400_000;

/** A brand-new database has no season; create Season 1 so standings have somewhere to accumulate. */
export async function ensureActiveSeason(now: Date = new Date()): Promise<Season> {
  const active = await getActiveSeason();
  if (active) return active;

  const last = await prisma.season.findFirst({ orderBy: { seasonNumber: 'desc' }, select: { seasonNumber: true } });
  const seasonNumber = (last?.seasonNumber ?? 0) + 1;
  try {
    return await prisma.season.create({
      data: { seasonNumber, name: `Season ${seasonNumber}`, startedAt: now, endsAt: new Date(now.getTime() + RULES.SEASON_DAYS * DAY_MS), isActive: true },
    });
  } catch (err) {
    // Another process created it first.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await getActiveSeason();
      if (winner) return winner;
    }
    throw err;
  }
}

/**
 * Closes the active season (recording each participant's final rank tier) and opens the next
 * one. Safe against two callers at once: closing is a guarded UPDATE, and `seasonNumber` is
 * unique, so exactly one rollover wins and the other gets a 409.
 */
export async function rolloverSeason(opts: { durationDays?: number; now?: Date; minAgeMs?: number } = {}): Promise<Season> {
  const now = opts.now ?? new Date();
  const days = opts.durationDays ?? RULES.SEASON_DAYS;

  let next: Season;
  try {
    next = await withTx(async (tx) => {
      const current = await tx.season.findFirst({ where: { isActive: true } });
      let nextNumber = 1;

      if (current && opts.minAgeMs && now.getTime() - current.startedAt.getTime() < opts.minAgeMs) {
        // Guards against a double-click wiping a season that just started.
        const wait = Math.ceil((opts.minAgeMs - (now.getTime() - current.startedAt.getTime())) / 1000);
        throw AppError.conflict(`A season started moments ago. Wait ${wait}s before starting another.`);
      }
      if (current) {
        const closed = await tx.season.updateMany({ where: { id: current.id, isActive: true }, data: { isActive: false, closedAt: now } });
        if (closed.count === 0) throw AppError.conflict('The season was already closed by someone else');

        const standings = await tx.seasonStanding.findMany({ where: { seasonId: current.id }, orderBy: { points: 'desc' }, select: { userId: true, points: true } });
        for (const row of assignTiers(standings, RULES.SEASON_PROMOTED, RULES.SEASON_DEMOTED)) {
          await tx.seasonStanding.update({ where: { seasonId_userId: { seasonId: current.id, userId: row.userId } }, data: { tier: row.tier } });
        }
        nextNumber = current.seasonNumber + 1;
      } else {
        const last = await tx.season.findFirst({ orderBy: { seasonNumber: 'desc' }, select: { seasonNumber: true } });
        nextNumber = (last?.seasonNumber ?? 0) + 1;
      }

      return tx.season.create({
        data: { seasonNumber: nextNumber, name: `Season ${nextNumber}`, startedAt: now, endsAt: new Date(now.getTime() + days * DAY_MS), isActive: true },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw AppError.conflict('A new season was already started');
    }
    throw err;
  }

  const { leaders, season } = await getLeaderboard();
  if (season) announceSeasonReset(season, leaders);
  return next;
}

export type SeasonCheck = 'created' | 'rolled' | 'none';

/** One pass of the automatic job: create the first season if missing, roll over an ended one. */
export async function checkSeason(now: Date = new Date()): Promise<SeasonCheck> {
  const active = await getActiveSeason();
  if (!active) {
    await ensureActiveSeason(now);
    return 'created';
  }
  if (active.endsAt.getTime() <= now.getTime()) {
    await rolloverSeason({ now });
    return 'rolled';
  }
  return 'none';
}

/** Runs `checkSeason` on boot and every `intervalMs`. Returns a stop function. */
export function startSeasonJob(intervalMs = 60_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await checkSeason();
      if (result !== 'none') logger.info({ result }, 'season job');
    } catch (err) {
      // 409 just means another instance got there first
      if (!(err instanceof AppError && err.status === 409)) logger.error({ err }, 'season job failed');
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
