import type { ScoutActivityNotification } from '../../../shared/types.js';
import { RULES } from '../config/rules.js';
import { prisma, withTx } from '../db/client.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { emitToUser } from '../realtime/io.js';

const activityInclude = {
  actor: { select: { id: true, handle: true, avatarUrl: true } },
  drop: { select: { dropNumber: true } },
} satisfies Prisma.ActivityInclude;
type ActivityRow = Prisma.ActivityGetPayload<{ include: typeof activityInclude }>;

const COPY: Record<string, { title: string; verb: string }> = {
  posted_clip: { title: 'New Mystery Drop', verb: 'just posted' },
  answered_clip: { title: 'Detective Answered', verb: 'locked in a guess on' },
  rewarded_clip: { title: 'Bounty Claimed', verb: 'cracked' },
};

export function toActivityDto(a: ActivityRow): ScoutActivityNotification {
  const copy = COPY[a.type] ?? { title: 'Scout Activity', verb: 'was active on' };
  return {
    id: a.id,
    userId: a.actor.id,
    userHandle: a.actor.handle,
    ...(a.actor.avatarUrl ? { userAvatar: a.actor.avatarUrl } : {}),
    type: a.type as ScoutActivityNotification['type'],
    dropId: a.dropId,
    dropNumber: a.drop.dropNumber,
    title: copy.title,
    message: `${a.actor.handle} ${copy.verb} ${a.drop.dropNumber}${a.type === 'rewarded_clip' && a.amount ? ` and won $${a.amount}` : ''}.`,
    ...(a.amount != null ? { amount: a.amount } : {}),
    ...(a.pointsDelta != null ? { pointsDelta: a.pointsDelta } : {}),
    timestamp: a.createdAt.getTime(),
  };
}

/** Handles may be typed with or without the leading "@", in any case. */
const keyOfHandle = (handle: string) => handle.trim().replace(/^@/, '').toLowerCase();

export async function followUser(followerId: string, handle: string): Promise<void> {
  await withTx(async (tx) => {
    const target = await tx.user.findUnique({ where: { usernameKey: keyOfHandle(handle) }, select: { id: true } });
    if (!target) throw AppError.notFound('No detective found with that handle');
    if (target.id === followerId) throw AppError.badRequest('You cannot scout yourself');

    // Touch the follower's row first: on PostgreSQL this serializes concurrent follows by the same
    // user, so the cap check below cannot be raced past.
    await tx.user.update({ where: { id: followerId }, data: { updatedAt: new Date() } });

    if (await tx.follow.findUnique({ where: { followerId_followingId: { followerId, followingId: target.id } } })) return; // already scouting
    if ((await tx.follow.count({ where: { followerId } })) >= RULES.FOLLOW_CAP) {
      throw AppError.conflict(`You can only scout up to ${RULES.FOLLOW_CAP} detectives at once`);
    }
    await tx.follow.create({ data: { followerId, followingId: target.id } });
  });
}

export async function unfollowUser(followerId: string, handle: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { usernameKey: keyOfHandle(handle) }, select: { id: true } });
  if (target) await prisma.follow.deleteMany({ where: { followerId, followingId: target.id } });
}

/** What the people I scout have been doing, newest first. */
export async function getScoutFeed(user: Pick<User, 'id'>, limit = 50): Promise<ScoutActivityNotification[]> {
  const rows = await prisma.activity.findMany({
    where: { actor: { followers: { some: { followerId: user.id } } } },
    include: activityInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
  });
  return rows.map(toActivityDto);
}

/** Pushes one activity to everyone scouting its actor (private rooms, one per follower). */
export async function notifyScouts(activityId: string): Promise<void> {
  const activity = await prisma.activity.findUnique({ where: { id: activityId }, include: activityInclude });
  if (!activity) return;
  const followers = await prisma.follow.findMany({ where: { followingId: activity.actorId }, select: { followerId: true } });
  if (followers.length === 0) return;

  const dto = toActivityDto(activity);
  for (const { followerId } of followers) emitToUser(followerId, 'scout_activity', dto);
}
