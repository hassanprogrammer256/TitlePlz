import type { AnalyticsTelemetry } from '../../../shared/types.js';
import { prisma } from '../db/client.js';
import { activeSocketCount } from '../realtime/io.js';

const HOUR_MS = 3_600_000;
const OPEN_STATUSES = ['unsolved', 'tense_consensus', 'high_consensus'];
export const CONSENSUS_ENGINE_VERSION = 'v1.0';

const prettyTag = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const round1 = (n: number) => Math.round(n * 10) / 10;

async function compute(now: number): Promise<AnalyticsTelemetry> {
  const nowDate = new Date(now);
  const startOfDay = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate()));
  const since12h = new Date(now - 12 * HOUR_MS);

  const [open, solved, expired, guessesToday, recentGuesses, tagCounts, trials12h, comments12h] = await Promise.all([
    prisma.drop.count({ where: { status: { in: OPEN_STATUSES }, expiresAt: { gt: nowDate } } }),
    prisma.drop.count({ where: { status: 'solved' } }),
    prisma.drop.count({ where: { OR: [{ status: 'expired' }, { status: { in: OPEN_STATUSES }, expiresAt: { lte: nowDate } }] } }),
    prisma.trial.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.trial.count({ where: { createdAt: { gte: new Date(now - 10 * 60_000) } } }),
    prisma.dropTag.groupBy({ by: ['tagId'], where: { drop: { createdAt: { gte: new Date(now - 30 * 24 * HOUR_MS) } } }, _count: { _all: true }, orderBy: { _count: { tagId: 'desc' } }, take: 4 }),
    prisma.trial.findMany({ where: { createdAt: { gte: since12h } }, select: { userId: true, isCorrect: true, createdAt: true } }),
    prisma.comment.findMany({ where: { createdAt: { gte: since12h } }, select: { authorId: true, createdAt: true } }),
  ]);

  const closed = solved + expired;

  const tags = tagCounts.length ? await prisma.tag.findMany({ where: { id: { in: tagCounts.map((t) => t.tagId) } } }) : [];
  const tagName = new Map(tags.map((t) => [t.id, t.name]));
  const tagTotal = tagCounts.reduce((sum, t) => sum + t._count._all, 0);
  const topGenres = tagCounts.map((t) => ({ name: prettyTag(tagName.get(t.tagId) ?? 'unknown'), percentage: Math.round((t._count._all / tagTotal) * 100) }));

  // 12 hourly buckets ending with the current hour (UTC): who was active, and how many were solved.
  const currentHour = Math.floor(now / HOUR_MS) * HOUR_MS;
  const buckets = Array.from({ length: 12 }, (_, i) => currentHour - (11 - i) * HOUR_MS);
  const hourlyActivity = buckets.map((start) => {
    const end = start + HOUR_MS;
    const inHour = <T extends { createdAt: Date }>(row: T) => row.createdAt.getTime() >= start && row.createdAt.getTime() < end;
    const active = new Set<string>();
    let solvedCount = 0;
    for (const t of trials12h.filter(inHour)) {
      active.add(t.userId);
      if (t.isCorrect) solvedCount++;
    }
    for (const c of comments12h.filter(inHour)) active.add(c.authorId);
    return { hour: `${String(new Date(start).getUTCHours()).padStart(2, '0')}:00`, active: active.size, solved: solvedCount };
  });

  return {
    radarDropsScanning: open,
    recognitionRate: closed > 0 ? round1((solved / closed) * 100) : 0,
    consensusEngineVersion: CONSENSUS_ENGINE_VERSION,
    activeSolvers: activeSocketCount(),
    solverVelocity: round1(recentGuesses / 10),
    guessesSubmittedToday: guessesToday,
    topGenres,
    hourlyActivity,
  };
}

// The SSE ticker and every page load ask for this; compute at most once per TTL.
const CACHE_TTL_MS = 5_000;
let cached: { at: number; value: AnalyticsTelemetry } | null = null;
let inflight: Promise<AnalyticsTelemetry> | null = null;

export async function getTelemetry(now: number = Date.now()): Promise<AnalyticsTelemetry> {
  if (cached && now - cached.at < CACHE_TTL_MS) return cached.value;
  inflight ??= compute(now)
    .then((value) => {
      cached = { at: now, value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function resetTelemetryCacheForTests() {
  cached = null;
  inflight = null;
}

/** The fast-changing subset pushed on every tick. */
export const liveSubset = (t: AnalyticsTelemetry) => ({
  activeSolvers: t.activeSolvers,
  solverVelocity: t.solverVelocity,
  radarDropsScanning: t.radarDropsScanning,
  recognitionRate: t.recognitionRate,
  guessesSubmittedToday: t.guessesSubmittedToday,
});
