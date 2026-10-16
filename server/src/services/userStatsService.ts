import { prisma } from '../db/client.js';
import type { UserStats } from '../dto/user.js';
import { normalizeTitle } from '../lib/title.js';

const OPEN_STATUSES = ['unsolved', 'tense_consensus', 'high_consensus'];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_THRESHOLD = 25;

/**
 * Competition ranking (ties share a rank): season points when a season is active, lifetime
 * points otherwise. A few users are ranked with two count queries each, so `/me` and login
 * stay cheap however many users exist; large lists fall back to one ordered scan.
 */
async function computeRanks(userIds: string[]): Promise<Map<string, number>> {
  const season = await prisma.season.findFirst({ where: { isActive: true }, select: { id: true } });
  const ranks = new Map<string, number>();

  if (userIds.length <= SCAN_THRESHOLD) {
    for (const userId of userIds) {
      if (season) {
        const mine = await prisma.seasonStanding.findUnique({ where: { seasonId_userId: { seasonId: season.id, userId } }, select: { points: true } });
        if (mine) ranks.set(userId, 1 + (await prisma.seasonStanding.count({ where: { seasonId: season.id, points: { gt: mine.points } } })));
      } else {
        const mine = await prisma.user.findUnique({ where: { id: userId }, select: { points: true } });
        if (mine) ranks.set(userId, 1 + (await prisma.user.count({ where: { points: { gt: mine.points } } })));
      }
    }
    return ranks;
  }

  const rows = season
    ? await prisma.seasonStanding.findMany({ where: { seasonId: season.id }, select: { userId: true, points: true }, orderBy: { points: 'desc' } })
    : (await prisma.user.findMany({ select: { id: true, points: true }, orderBy: { points: 'desc' } })).map((u) => ({ userId: u.id, points: u.points }));
  let rank = 0;
  let prevPoints: number | null = null;
  rows.forEach((row, i) => {
    if (row.points !== prevPoints) rank = i + 1;
    prevPoints = row.points;
    ranks.set(row.userId, rank);
  });
  return ranks;
}

/**
 * Derived per-user counters for the client's `User` shape, computed with a fixed
 * number of grouped queries regardless of how many users are requested.
 *
 * consensusLeadCount: open drops where the user's guess is currently the (co-)leading candidate.
 * tierStanding: the user's tier in the most recently closed season, if they played in it.
 */
export async function getUserStats(userIds: string[], now: number = Date.now()): Promise<Map<string, UserStats>> {
  const out = new Map<string, UserStats>();
  if (userIds.length === 0) return out;

  const inIds = { in: userIds };
  const [allTrials, correctTrials, weeklyCorrect, pending, uploads, uploadedDrops, follows, ranks, openTrials, closedStandings] = await Promise.all([
    prisma.trial.groupBy({ by: ['userId'], where: { userId: inIds }, _count: { _all: true } }),
    prisma.trial.groupBy({ by: ['userId'], where: { userId: inIds, isCorrect: true }, _count: { _all: true }, _sum: { reward: true, stake: true } }),
    prisma.trial.groupBy({ by: ['userId'], where: { userId: inIds, isCorrect: true, createdAt: { gte: new Date(now - WEEK_MS) } }, _count: { _all: true } }),
    prisma.trial.groupBy({
      by: ['userId'],
      where: { userId: inIds, isCorrect: false, drop: { status: { in: OPEN_STATUSES }, expiresAt: { gt: new Date(now) } } },
      _count: { _all: true },
    }),
    prisma.drop.groupBy({ by: ['uploaderId'], where: { uploaderId: inIds }, _count: { _all: true } }),
    prisma.drop.findMany({ where: { uploaderId: inIds }, select: { uploaderId: true, _count: { select: { trials: true } } } }),
    prisma.follow.findMany({ where: { followerId: inIds }, select: { followerId: true, following: { select: { handle: true } } }, orderBy: { createdAt: 'asc' } }),
    computeRanks(userIds),
    prisma.trial.findMany({
      where: { userId: inIds, drop: { status: { in: OPEN_STATUSES }, expiresAt: { gt: new Date(now) } } },
      select: { userId: true, guessedTitle: true, drop: { select: { candidates: { select: { normalizedTitle: true, votes: true } } } } },
    }),
    prisma.seasonStanding.findMany({
      where: { userId: inIds, season: { isActive: false } },
      select: { userId: true, tier: true },
      orderBy: { season: { seasonNumber: 'desc' } },
    }),
  ]);

  const total = new Map(allTrials.map((r) => [r.userId, r._count._all]));
  const correct = new Map(correctTrials.map((r) => [r.userId, r]));
  const weekly = new Map(weeklyCorrect.map((r) => [r.userId, r._count._all]));
  const pend = new Map(pending.map((r) => [r.userId, r._count._all]));
  const uploaded = new Map(uploads.map((r) => [r.uploaderId, r._count._all]));
  const received = new Map<string, number>();
  for (const d of uploadedDrops) received.set(d.uploaderId, (received.get(d.uploaderId) ?? 0) + d._count.trials);
  const following = new Map<string, string[]>();
  for (const f of follows) following.set(f.followerId, [...(following.get(f.followerId) ?? []), f.following.handle]);

  const leading = new Map<string, number>();
  for (const t of openTrials) {
    const top = Math.max(0, ...t.drop.candidates.map((c) => c.votes));
    const mine = t.drop.candidates.find((c) => c.normalizedTitle === normalizeTitle(t.guessedTitle));
    if (top > 0 && mine && mine.votes === top) leading.set(t.userId, (leading.get(t.userId) ?? 0) + 1);
  }
  const lastTier = new Map<string, 'promoted' | 'safe' | 'demoted'>();
  for (const row of closedStandings) if (!lastTier.has(row.userId)) lastTier.set(row.userId, row.tier as 'promoted' | 'safe' | 'demoted');

  for (const id of userIds) {
    const trials = total.get(id) ?? 0;
    const wins = correct.get(id)?._count._all ?? 0;
    const sums = correct.get(id)?._sum;
    out.set(id, {
      rank: ranks.get(id) ?? 0,
      weeklyIdentifications: weekly.get(id) ?? 0,
      accuracyRating: trials > 0 ? Math.round((wins / trials) * 1000) / 10 : 0,
      cineCoinsBounty: (sums?.reward ?? 0) - (sums?.stake ?? 0),
      pendingGuessLocks: pend.get(id) ?? 0,
      consensusLeadCount: leading.get(id) ?? 0,
      ...(lastTier.has(id) ? { tierStanding: lastTier.get(id) } : {}),
      uploadedDropsCount: uploaded.get(id) ?? 0,
      submissionsReceived: received.get(id) ?? 0,
      following: following.get(id) ?? [],
    });
  }
  return out;
}
