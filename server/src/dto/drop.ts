import type {
  CandidateTitle,
  ClueComment,
  MysteryDrop,
  UserGuessTrial,
} from '../../../shared/types.js';
import type { Prisma } from '../generated/prisma/client.js';
import { formatRemaining, timeAgo } from '../lib/time.js';
import { getStorage } from '../storage/index.js';
import { initialsOf } from './user.js';

/** Prisma `include` used by every query that feeds `toDropDto`. Only the viewer's own trial is loaded. */
export function dropInclude(viewerId?: string) {
  return {
    uploader: true,
    solvedBy: true,
    tags: { include: { tag: true } },
    candidates: true,
    comments: { include: { author: true, agrees: true }, orderBy: { createdAt: 'desc' } },
    trials: { where: { userId: viewerId ?? '__anonymous__' }, include: { user: true } },
  } satisfies Prisma.DropInclude;
}

export type DropWithRelations = Prisma.DropGetPayload<{ include: ReturnType<typeof dropInclude> }>;

export type Viewer = { id: string; isAdmin: boolean } | undefined;

const OPEN_STATUSES = new Set(['unsolved', 'tense_consensus', 'high_consensus']);

/** DB status, except open drops past their deadline read as expired even before the expiry job runs. */
export function effectiveStatus(drop: { status: string; expiresAt: Date }, now: number): MysteryDrop['status'] {
  if (OPEN_STATUSES.has(drop.status) && drop.expiresAt.getTime() <= now) return 'expired';
  return drop.status as MysteryDrop['status'];
}

/** Whether `viewer` may see the answer. Everyone else only sees it once the drop is closed. */
export function canSeeAnswer(drop: { uploaderId: string }, status: string, viewer: Viewer): boolean {
  if (status === 'solved' || status === 'expired') return true;
  return Boolean(viewer && (viewer.isAdmin || viewer.id === drop.uploaderId));
}

type CandidateRow = DropWithRelations['candidates'][number];

export function toCandidateDtos(candidates: CandidateRow[]): CandidateTitle[] {
  const total = candidates.reduce((sum, c) => sum + c.votes, 0);
  const sorted = [...candidates].sort((a, b) => b.votes - a.votes || a.createdAt.getTime() - b.createdAt.getTime());
  const leaderId = sorted[0] && sorted[0].votes > 0 ? sorted[0].id : null;
  return sorted.map((c) => ({
    id: c.id,
    title: c.title,
    ...(c.year != null ? { year: c.year } : {}),
    ...(c.director ? { director: c.director } : {}),
    ...(c.cinematographer ? { cinematographer: c.cinematographer } : {}),
    ...(c.imdbId ? { imdbId: c.imdbId } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
    votes: c.votes,
    percentage: total > 0 ? Math.round((c.votes / total) * 100) : 0,
    commentersCount: c.votes,
    isLeader: c.id === leaderId,
  }));
}

export function toCommentDto(comment: DropWithRelations['comments'][number], viewer: Viewer, now: number): ClueComment {
  const role = comment.author.role;
  return {
    id: comment.id,
    authorHandle: comment.author.handle,
    authorBadge: role === 'curator' ? 'MovieKing' : role === 'detective' ? 'Detective' : 'Seeker',
    authorInitials: initialsOf(comment.author.username),
    ...(comment.author.avatarUrl ? { authorAvatar: comment.author.avatarUrl } : {}),
    isMovieKing: role === 'curator',
    isDetective: role === 'detective',
    timeAgo: timeAgo(comment.createdAt, now),
    timestamp: comment.timestampLabel,
    content: comment.content,
    agreedCount: comment.agrees.length,
    userAgreed: viewer ? comment.agrees.some((a) => a.userId === viewer.id) : false,
    createdAt: comment.createdAt.getTime(),
  };
}

export function toTrialDto(trial: DropWithRelations['trials'][number]): UserGuessTrial {
  return {
    userId: trial.userId,
    userHandle: trial.user.handle,
    ...(trial.user.avatarUrl ? { userAvatar: trial.user.avatarUrl } : {}),
    guessedTitle: trial.guessedTitle,
    isCorrect: trial.isCorrect,
    stakeDeducted: trial.stake,
    ...(trial.isCorrect ? { rewardAwarded: trial.reward } : {}),
    pointsDelta: trial.pointsDelta,
    createdAt: trial.createdAt.getTime(),
  };
}

function validatedByText(status: string, totalVotes: number): string {
  if (status === 'solved') return 'Verified 100% Correct Match • Consensus Locked';
  if (status === 'expired') return 'Expired unsolved • Bounty returned to uploader';
  if (totalVotes === 0) return 'Awaiting first trial guess';
  return `${totalVotes} trial ${totalVotes === 1 ? 'guess' : 'guesses'} logged`;
}

export function toDropDto(
  drop: DropWithRelations,
  opts: { viewer?: Viewer; now?: number; detectivesExamining?: number } = {},
): MysteryDrop {
  const now = opts.now ?? Date.now();
  const status = effectiveStatus(drop, now);
  const totalVotes = drop.candidates.reduce((sum, c) => sum + c.votes, 0);
  const closed = status === 'solved' || status === 'expired';
  const remaining = closed ? '00:00:00' : formatRemaining(drop.expiresAt, now);

  const userTrials: Record<string, UserGuessTrial> = {};
  for (const trial of drop.trials) {
    if (opts.viewer && trial.userId === opts.viewer.id) userTrials[trial.userId] = toTrialDto(trial);
  }

  return {
    id: drop.id,
    dropNumber: drop.dropNumber,
    timecode: drop.timecode,
    source: drop.source,
    mediaType: drop.mediaType as MysteryDrop['mediaType'],
    ...(drop.clipDurationSeconds != null ? { clipDurationSeconds: drop.clipDurationSeconds } : {}),
    releaseYear: drop.releaseYear,
    correctTitle: canSeeAnswer(drop, status, opts.viewer) ? drop.correctTitle : '',
    bountyPts: drop.bounty,
    validityDurationHours: drop.validityHours,
    createdAt: drop.createdAt.getTime(),
    expiresAt: drop.expiresAt.getTime(),
    // Built from the key at read time so a CDN / base-URL change never leaves stale URLs in the DB.
    imageUrl: drop.imageKey ? getStorage().publicUrl(drop.imageKey) : drop.imageUrl,
    ...(drop.videoKey ? { videoUrl: getStorage().publicUrl(drop.videoKey) } : drop.videoUrl ? { videoUrl: drop.videoUrl } : {}),
    aspectRatioLabel: drop.aspectRatioLabel,
    spectralLabel: drop.spectralLabel,
    fpsLabel: drop.fpsLabel,
    audioStemLabel: drop.audioStemLabel,
    audioDuration: drop.audioDuration,
    tags: drop.tags.map((t) => `#${t.tag.name}`),
    uploaderId: drop.uploaderId,
    uploaderHandle: drop.uploader.handle,
    uploaderRole: drop.uploader.role,
    uploadedAgo: timeAgo(drop.createdAt, now),
    detectivesExamining: opts.detectivesExamining ?? 0,
    status,
    ...(drop.solvedBy ? { solvedBy: drop.solvedBy.handle } : {}),
    ...(drop.solvedAt ? { solvedAt: drop.solvedAt.getTime() } : {}),
    rewardClaimed: drop.rewardClaimed,
    timeRemaining: closed ? (status === 'solved' && drop.solvedBy ? `Resolved by ${drop.solvedBy.handle}` : 'Expired') : remaining,
    lockTimeRemaining: closed ? '00:00:00 (ARCHIVED)' : remaining,
    validatedByText: validatedByText(status, totalVotes),
    totalGuessesCast: totalVotes,
    ...(drop.targetPropNote ? { targetPropNote: drop.targetPropNote } : {}),
    candidates: toCandidateDtos(drop.candidates),
    comments: drop.comments.map((c) => toCommentDto(c, opts.viewer, now)),
    userTrials,
  };
}
