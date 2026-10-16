import { randomInt, randomUUID } from 'node:crypto';
import { RULES } from '../config/rules.js';
import { prisma, withTx } from '../db/client.js';
import { dropInclude, type DropWithRelations } from '../dto/drop.js';
import type { Prisma, User } from '../generated/prisma/client.js';
import { AppError } from '../lib/errors.js';
import { normalizeTitle } from '../lib/title.js';
import { applyCredit } from './creditService.js';

export const OPEN_STATUSES = ['unsolved', 'tense_consensus', 'high_consensus'];

export type CreateDropInput = {
  title: string;
  releaseYear: number;
  mediaType: 'photo' | 'clip';
  validityDurationHours: number;
  bountyPts: number;
  timecode: string;
  source: string;
  aspectRatioLabel: string;
  spectralLabel: string;
  fpsLabel: string;
  audioStemLabel: string;
  targetPropNote?: string;
  tags: string[];
  imageKey: string;
  videoKey?: string;
};

/** "#Neo-Noir" -> "neonoir". Lowercase [a-z0-9_] only, 1-30 chars, unique, capped. */
export function normalizeTags(raw: string[]): string[] {
  const out = new Set<string>();
  for (const t of raw) {
    const clean = t.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
    if (clean) out.add(clean);
    if (out.size >= RULES.MAX_TAGS) break;
  }
  return [...out];
}

async function freeDropNumber(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const dropNumber = `DROP #${randomInt(10_000, 100_000)}`;
    if (!(await prisma.drop.findUnique({ where: { dropNumber }, select: { id: true } }))) return dropNumber;
  }
  throw new Error('Could not allocate a drop number');
}

/**
 * Creates a drop and stakes the bounty in one transaction. Media must be uploads that
 * this user made and that no other drop has claimed; clip length comes from the stored
 * upload (read from the MP4 header), never from the request.
 */
export async function createDrop(user: User, input: CreateDropInput): Promise<{ drop: DropWithRelations; credits: number; activityId: string }> {
  const id = randomUUID();
  const now = new Date(); // one clock for createdAt and expiresAt
  const dropNumber = await freeDropNumber();
  const keys = [input.imageKey, ...(input.videoKey ? [input.videoKey] : [])];

  const { credits, activityId } = await withTx(async (tx) => {
    const uploads = await tx.upload.findMany({ where: { key: { in: keys }, userId: user.id, dropId: null } });
    const image = uploads.find((u) => u.key === input.imageKey);
    const video = input.videoKey ? uploads.find((u) => u.key === input.videoKey) : undefined;

    if (uploads.length !== keys.length || !image) {
      throw AppError.unprocessable('Upload not found, not yours, or already used by another drop');
    }
    if (image.kind !== 'image') throw AppError.unprocessable('imageKey must reference an image upload');
    if (input.mediaType === 'clip') {
      if (!video || video.kind !== 'video') throw AppError.unprocessable('videoKey must reference a video upload');
      if ((video.durationSeconds ?? Infinity) > RULES.MAX_CLIP_SECONDS) throw AppError.unprocessable('Clip is longer than 10 minutes');
    }

    // Stake first: an insufficient balance aborts the whole transaction.
    const { balance } = await applyCredit(tx, {
      userId: user.id,
      delta: -input.bountyPts,
      reason: 'bounty_stake',
      idempotencyKey: `drop:${id}:bounty`,
      ref: { type: 'drop', id },
    });

    await tx.drop.create({
      data: {
        id,
        dropNumber,
        uploaderId: user.id,
        mediaType: input.mediaType,
        clipDurationSeconds: video?.durationSeconds ?? null,
        imageUrl: '', // derived from imageKey when serialized
        imageKey: image.key,
        videoKey: video?.key ?? null,
        releaseYear: input.releaseYear,
        correctTitle: input.title,
        correctTitleKey: normalizeTitle(input.title),
        bounty: input.bountyPts,
        validityHours: input.validityDurationHours,
        createdAt: now,
        expiresAt: new Date(now.getTime() + input.validityDurationHours * 3_600_000),
        timecode: input.timecode,
        source: input.source,
        aspectRatioLabel: input.aspectRatioLabel,
        spectralLabel: input.spectralLabel,
        fpsLabel: input.fpsLabel,
        audioStemLabel: input.audioStemLabel,
        audioDuration: video?.durationSeconds ?? 0,
        targetPropNote: input.targetPropNote ?? null,
      },
    });

    for (const name of normalizeTags(input.tags)) {
      const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
      await tx.dropTag.create({ data: { dropId: id, tagId: tag.id } });
    }

    // Claim the uploads; the dropId IS NULL guard makes a double claim impossible.
    const claimed = await tx.upload.updateMany({ where: { key: { in: keys }, userId: user.id, dropId: null }, data: { dropId: id } });
    if (claimed.count !== keys.length) throw AppError.conflict('An upload was claimed by another drop');

    const activity = await tx.activity.create({
      data: { actorId: user.id, type: 'posted_clip', dropId: id, message: `posted ${dropNumber}`, amount: input.bountyPts },
    });
    return { credits: balance, activityId: activity.id };
  });

  const drop = await prisma.drop.findUniqueOrThrow({ where: { id }, include: dropInclude(user.id) });
  return { drop, credits, activityId };
}

export type ListDropsQuery = {
  viewerId?: string;
  status: 'all' | 'open' | 'solved' | 'expired';
  mine: boolean;
  tag?: string;
  limit: number;
  cursor?: { createdAt: Date; id: string };
};

function statusFilter(status: ListDropsQuery['status'], now: Date): Prisma.DropWhereInput | null {
  switch (status) {
    case 'open':
      return { status: { in: OPEN_STATUSES }, expiresAt: { gt: now } };
    case 'solved':
      return { status: 'solved' };
    case 'expired':
      // Includes open drops past their deadline that the sweeper hasn't closed yet.
      return { OR: [{ status: 'expired' }, { status: { in: OPEN_STATUSES }, expiresAt: { lte: now } }] };
    default:
      return null;
  }
}

export async function listDrops(q: ListDropsQuery, now: Date = new Date()): Promise<{ drops: DropWithRelations[]; nextCursor: string | null }> {
  const and: Prisma.DropWhereInput[] = [];
  const sf = statusFilter(q.status, now);
  if (sf) and.push(sf);
  if (q.mine) and.push({ uploaderId: q.viewerId ?? '__none__' });
  if (q.tag) and.push({ tags: { some: { tag: { name: q.tag } } } });
  if (q.cursor) {
    and.push({ OR: [{ createdAt: { lt: q.cursor.createdAt } }, { createdAt: q.cursor.createdAt, id: { lt: q.cursor.id } }] });
  }

  const rows = await prisma.drop.findMany({
    where: and.length ? { AND: and } : undefined,
    include: dropInclude(q.viewerId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return { drops: page, nextCursor: rows.length > q.limit && last ? encodeCursor(last.createdAt, last.id) : null };
}

export async function getDrop(id: string, viewerId?: string): Promise<DropWithRelations> {
  const drop = await prisma.drop.findUnique({ where: { id }, include: dropInclude(viewerId) });
  if (!drop) throw AppError.notFound('Drop not found');
  return drop;
}

export const encodeCursor = (createdAt: Date, id: string) => `${createdAt.getTime()}_${id}`;

export function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  const m = /^(\d{1,15})_([\w-]{1,64})$/.exec(raw);
  return m ? { createdAt: new Date(Number(m[1])), id: m[2]! } : null;
}
