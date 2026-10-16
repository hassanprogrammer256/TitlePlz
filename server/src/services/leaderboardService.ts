import type { MovieKingLeader, SeasonInfo } from '../../../shared/types.js';
import { RULES } from '../config/rules.js';
import { prisma } from '../db/client.js';
import { roleTitle } from '../dto/user.js';
import type { Season } from '../generated/prisma/client.js';
import { assignTiers } from '../lib/tiers.js';
import { broadcast } from '../realtime/io.js';
import { broadcastSse } from '../realtime/sse.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const LEADERBOARD_SIZE = 100;
const BADGES = ['👑', '🥈', '🥉'];

export function toSeasonDto(season: Season): SeasonInfo {
  return {
    seasonNumber: season.seasonNumber,
    name: season.name,
    startedAt: season.startedAt.getTime(),
    durationDays: Math.round((season.endsAt.getTime() - season.startedAt.getTime()) / 86_400_000),
    endsAt: season.endsAt.getTime(),
    isActive: season.isActive,
    promotedCount: RULES.SEASON_PROMOTED,
    demotedCount: RULES.SEASON_DEMOTED,
  };
}

export const getActiveSeason = () => prisma.season.findFirst({ where: { isActive: true } });

const signed = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

/**
 * The active season's ranking, best first (top 100). `viewerId` only decides `isCurrent`.
 * Only people who have played this season appear.
 */
export async function getLeaderboard(viewerId?: string, now: number = Date.now()): Promise<{ leaders: MovieKingLeader[]; season: SeasonInfo | null }> {
  const season = await getActiveSeason();
  if (!season) return { leaders: [], season: null };

  const standings = await prisma.seasonStanding.findMany({
    where: { seasonId: season.id },
    include: { user: { select: { id: true, handle: true, role: true, avatarUrl: true, createdAt: true } } },
    orderBy: { points: 'desc' },
  });
  // Stable order for ties so pages don't shuffle between requests.
  standings.sort((a, b) => b.points - a.points || a.user.createdAt.getTime() - b.user.createdAt.getTime());

  const ranked = assignTiers(standings.map((s) => ({ userId: s.userId, points: s.points })), RULES.SEASON_PROMOTED, RULES.SEASON_DEMOTED);

  // Points gained in the last 7 days, for the "+N this week" label.
  const top = standings.slice(0, LEADERBOARD_SIZE);
  const weekly = await prisma.trial.groupBy({
    by: ['userId'],
    where: { userId: { in: top.map((s) => s.userId) }, createdAt: { gte: new Date(now - WEEK_MS) } },
    _sum: { pointsDelta: true },
  });
  const weeklyByUser = new Map(weekly.map((w) => [w.userId, w._sum.pointsDelta ?? 0]));

  const leaders = top.map((s, i): MovieKingLeader => {
    const { rank, tier } = ranked[i]!;
    return {
      rank,
      id: s.user.id,
      handle: s.user.handle,
      title: roleTitle(s.user.role, rank),
      points: s.points,
      solvedCount: s.solvedCount,
      bountyEarnedTotal: s.bountyEarned,
      weeklyDelta: `${signed(weeklyByUser.get(s.userId) ?? 0)} this week`,
      ...(viewerId && s.userId === viewerId ? { isCurrent: true } : {}),
      ...(s.user.avatarUrl ? { avatar: s.user.avatarUrl } : {}),
      badge: rank <= 3 ? BADGES[rank - 1]! : `#${rank}`,
      ...(rank <= 3 ? { crownEmoji: BADGES[rank - 1]! } : {}),
      tier,
    };
  });
  return { leaders, season: toSeasonDto(season) };
}

// Points change on every guess; coalesce the push so a burst of guesses costs one query.
let broadcastTimer: NodeJS.Timeout | null = null;
export function scheduleLeaderboardBroadcast(delayMs = 2_000) {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    void getLeaderboard()
      .then(({ leaders, season }) => broadcast('leaderboard_update', { leaders, season }))
      .catch(() => {});
  }, delayMs);
  broadcastTimer.unref();
}

/** Used after a season change: everyone connected gets the new state on both channels. */
export function announceSeasonReset(season: SeasonInfo, leaders: MovieKingLeader[]) {
  broadcast('leaderboard_update', { leaders, season });
  broadcastSse('season_reset', { season, leaders });
}
