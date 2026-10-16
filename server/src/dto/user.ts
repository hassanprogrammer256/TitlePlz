import type { User as UserDto, UserRole } from '../../../shared/types.js';
import type { User } from '../generated/prisma/client.js';

/** Counters computed by services from trials/drops/standings (not stored on User). */
export type UserStats = {
  rank: number;
  weeklyIdentifications: number;
  accuracyRating: number;
  cineCoinsBounty: number;
  pendingGuessLocks: number;
  consensusLeadCount: number;
  uploadedDropsCount: number;
  submissionsReceived: number;
  tierStanding?: 'promoted' | 'safe' | 'demoted';
  /** Handles this user scouts (only exposed to the user themself). */
  following?: string[];
};

const EMPTY_STATS: UserStats = {
  rank: 0,
  weeklyIdentifications: 0,
  accuracyRating: 0,
  cineCoinsBounty: 0,
  pendingGuessLocks: 0,
  consensusLeadCount: 0,
  uploadedDropsCount: 0,
  submissionsReceived: 0,
};

/** Served by the client app (client/public). Users without an uploaded avatar get this. */
export const DEFAULT_AVATAR_URL = '/default-avatar.jpg';

export function roleTitle(role: string, rank: number): string {
  const rankLabel = rank > 0 ? `Rank #${rank}` : 'Unranked';
  if (role === 'curator') return `${rankLabel} • MovieKing`;
  if (role === 'detective') return `${rankLabel} • Detective`;
  return `${rankLabel} • Seeker`;
}

export function initialsOf(username: string): string {
  return username.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '??';
}

/**
 * Maps a DB user to the client's `User`. Private fields (credits, refill clock,
 * scouting list) are only populated for the user themself; for everyone else
 * they are zeroed so other people's balances never leak.
 */
export function toUserDto(user: User, opts: { self: boolean; stats?: Partial<UserStats> }): UserDto {
  const stats = { ...EMPTY_STATS, ...opts.stats };
  return {
    id: user.id,
    username: user.username,
    handle: user.handle,
    role: user.role as UserRole,
    ...(opts.self && user.isAdmin ? { isAdmin: true } : {}),
    roleTitle: roleTitle(user.role, stats.rank),
    credits: opts.self ? user.credits : 0,
    lastDailyRefillAt: opts.self ? (user.lastDailyRefillAt?.getTime() ?? 0) : 0,
    following: opts.self ? (stats.following ?? []) : [],
    points: user.points,
    rank: stats.rank,
    avatar: user.avatarUrl ?? DEFAULT_AVATAR_URL,
    weeklyIdentifications: stats.weeklyIdentifications,
    accuracyRating: stats.accuracyRating,
    cineCoinsBounty: stats.cineCoinsBounty,
    pendingGuessLocks: stats.pendingGuessLocks,
    consensusLeadCount: stats.consensusLeadCount,
    uploadedDropsCount: stats.uploadedDropsCount,
    submissionsReceived: stats.submissionsReceived,
    agentHash: user.agentHash,
    ...(stats.tierStanding ? { tierStanding: stats.tierStanding } : {}),
  };
}
