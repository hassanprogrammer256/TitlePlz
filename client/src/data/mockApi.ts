// Client-side simulation of the backend actions — used as a fallback whenever
// the real /api/* endpoints are unreachable, so every interaction (guessing,
// voting, staking bounties, credits, scouting, auth) can be explored end to
// end before a real server exists.

import { User, MysteryDrop, ClueComment, UserGuessTrial, MovieKingLeader, SeasonInfo, UserRole } from '../types';
import defaultAvatar from '../assets/images/default-avatar.jpg';

const STAKE = 20;

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function recomputeConsensus(candidates: MysteryDrop['candidates']): MysteryDrop['candidates'] {
  const totalVotes = candidates.reduce((sum, c) => sum + c.votes, 0);
  const leader = candidates.reduce<MysteryDrop['candidates'][number] | null>(
    (best, c) => (!best || c.votes > best.votes ? c : best),
    null
  );
  return candidates.map(c => ({
    ...c,
    percentage: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 100) : 0,
    isLeader: leader ? c.id === leader.id : false,
  }));
}

export function mockSubmitGuess(drop: MysteryDrop, user: User, rawTitle: string): { drop: MysteryDrop; user: User } {
  if (drop.status === 'solved' || drop.status === 'expired') {
    throw new Error('This drop is no longer accepting trial guesses.');
  }
  if (drop.userTrials[user.id]) {
    throw new Error('You already have an active trial guess locked on this drop.');
  }
  if (user.credits < STAKE) {
    throw new Error(`Insufficient credits — a trial guess costs $${STAKE}.`);
  }

  const isCorrect = normalizeTitle(rawTitle) === normalizeTitle(drop.correctTitle);

  const trial: UserGuessTrial = {
    userId: user.id,
    userHandle: user.handle,
    userAvatar: user.avatar,
    guessedTitle: rawTitle,
    isCorrect,
    stakeDeducted: STAKE,
    rewardAwarded: isCorrect ? STAKE + drop.bountyPts : undefined,
    pointsDelta: isCorrect ? 5 : -3,
    createdAt: Date.now(),
  };

  const updatedUser: User = {
    ...user,
    credits: user.credits - STAKE + (isCorrect ? STAKE + drop.bountyPts : 0),
    points: user.points + trial.pointsDelta,
    pendingGuessLocks: isCorrect ? user.pendingGuessLocks : user.pendingGuessLocks + 1,
    weeklyIdentifications: isCorrect ? user.weeklyIdentifications + 1 : user.weeklyIdentifications,
    accuracyRating: user.accuracyRating,
  };

  let candidates = drop.candidates.map(c => ({ ...c }));
  const normalizedGuess = normalizeTitle(rawTitle);
  const matched = candidates.find(c => normalizeTitle(c.title) === normalizedGuess);
  if (matched) {
    matched.votes += 1;
  } else {
    candidates.push({
      id: `c-${Date.now()}`,
      title: rawTitle,
      votes: 1,
      percentage: 0,
      commentersCount: 0,
    });
  }
  candidates = recomputeConsensus(candidates);

  const updatedDrop: MysteryDrop = {
    ...drop,
    candidates,
    totalGuessesCast: drop.totalGuessesCast + 1,
    userTrials: { ...drop.userTrials, [user.id]: trial },
    status: isCorrect ? 'solved' : drop.status,
    solvedBy: isCorrect ? user.handle : drop.solvedBy,
    solvedAt: isCorrect ? Date.now() : drop.solvedAt,
    rewardClaimed: isCorrect ? true : drop.rewardClaimed,
  };

  return { drop: updatedDrop, user: updatedUser };
}

export function mockVote(drop: MysteryDrop, candidateId: string): { drop: MysteryDrop } {
  const candidates = recomputeConsensus(
    drop.candidates.map(c => (c.id === candidateId ? { ...c, votes: c.votes + 1 } : { ...c }))
  );
  return { drop: { ...drop, candidates, totalGuessesCast: drop.totalGuessesCast + 1 } };
}

export function mockPostComment(user: User, content: string, timestamp?: string): { comment: ClueComment } {
  const initials = user.handle.replace('@', '').slice(0, 2).toUpperCase();
  const comment: ClueComment = {
    id: `cm-${Date.now()}`,
    authorHandle: user.handle,
    authorInitials: initials,
    authorAvatar: user.avatar,
    isDetective: user.role === 'detective' || user.role === 'curator',
    timeAgo: 'just now',
    timestamp: timestamp || '00:00',
    content,
    agreedCount: 0,
    userAgreed: false,
    createdAt: Date.now(),
  };
  return { comment };
}

export function mockAgreeComment(drop: MysteryDrop, commentId: string): { comment: ClueComment } {
  const target = drop.comments.find(c => c.id === commentId);
  if (!target) throw new Error('Comment not found.');
  const comment: ClueComment = {
    ...target,
    agreedCount: target.userAgreed ? target.agreedCount - 1 : target.agreedCount + 1,
    userAgreed: !target.userAgreed,
  };
  return { comment };
}

export function mockCreateDrop(dropData: any, user: User): { drop: MysteryDrop; user: User } {
  const bounty = Number(dropData.bountyPts) || 0;
  if (user.credits < bounty) {
    throw new Error('Insufficient credits to stake this bounty.');
  }

  const drop: MysteryDrop = {
    id: `drop-${Date.now()}`,
    dropNumber: `DROP #${Math.floor(1000 + Math.random() * 8999)}-USER`,
    timecode: dropData.timecode || '00:00:00:00',
    source: dropData.source || 'User Upload',
    mediaType: dropData.mediaType,
    clipDurationSeconds: dropData.clipDurationSeconds,
    releaseYear: Number(dropData.releaseYear),
    correctTitle: dropData.title,
    bountyPts: bounty,
    validityDurationHours: dropData.validityDurationHours,
    createdAt: Date.now(),
    expiresAt: Date.now() + dropData.validityDurationHours * 3600 * 1000,
    imageUrl: dropData.imageUrl,
    videoUrl: dropData.videoUrl,
    aspectRatioLabel: dropData.aspectRatioLabel,
    spectralLabel: dropData.spectralLabel,
    fpsLabel: dropData.fpsLabel,
    audioStemLabel: dropData.audioStemLabel,
    audioDuration: dropData.mediaType === 'clip' ? 12 : 0,
    tags: dropData.tags || [],
    uploaderId: user.id,
    uploaderHandle: user.handle,
    uploaderRole: user.role,
    uploadedAgo: 'just now',
    detectivesExamining: 0,
    status: 'unsolved',
    timeRemaining: `${dropData.validityDurationHours}:00:00`,
    lockTimeRemaining: 'Active',
    validatedByText: 'Awaiting first trial guess',
    totalGuessesCast: 0,
    targetPropNote: dropData.targetPropNote,
    candidates: [],
    comments: [],
    userTrials: {},
  };

  const updatedUser: User = {
    ...user,
    credits: user.credits - bounty,
    uploadedDropsCount: user.uploadedDropsCount + 1,
  };

  return { drop, user: updatedUser };
}

export function mockClaimDailyRefill(user: User): { user: User } {
  const REFILL = 20;
  const elapsed = Date.now() - (user.lastDailyRefillAt || 0);
  if (elapsed < 24 * 3600 * 1000) {
    throw new Error('Daily refill is not ready yet.');
  }
  return { user: { ...user, credits: user.credits + REFILL, lastDailyRefillAt: Date.now() } };
}

export function mockPurchaseCredits(user: User, amount: number): { user: User } {
  return { user: { ...user, credits: user.credits + amount } };
}

export function mockFollow(user: User, handle: string): { user: User } {
  if (user.following.includes(handle)) return { user };
  if (user.following.length >= 5) {
    throw new Error('You can only scout up to 5 detectives at once.');
  }
  return { user: { ...user, following: [...user.following, handle] } };
}

export function mockUnfollow(user: User, handle: string): { user: User } {
  return { user: { ...user, following: user.following.filter(h => h !== handle) } };
}

export function mockResetSeason(
  currentSeason: SeasonInfo,
  leaders: MovieKingLeader[]
): { season: SeasonInfo; leaders: MovieKingLeader[] } {
  const season: SeasonInfo = {
    seasonNumber: currentSeason.seasonNumber + 1,
    name: `Season ${currentSeason.seasonNumber + 1} // Reset Cycle`,
    startedAt: Date.now(),
    durationDays: 31,
    endsAt: Date.now() + 31 * 24 * 3600 * 1000,
    isActive: true,
    promotedCount: 10,
    demotedCount: 10,
  };
  return { season, leaders: leaders.map(l => ({ ...l, weeklyDelta: '+0' })) };
}

export function mockUserSwitch(allUsers: User[], userId: string): { user: User } {
  const found = allUsers.find(u => u.id === userId);
  if (!found) throw new Error('Detective not found.');
  return { user: found };
}

export function mockLogin(allUsers: User[], username: string): { user: User } {
  const clean = username.trim().toLowerCase();
  const found = allUsers.find(u => u.username.toLowerCase() === clean || u.handle.toLowerCase() === `@${clean}`);
  if (!found) throw new Error('No detective found with that username. Try registering instead.');
  return { user: found };
}

export function mockRegister(allUsers: User[], username: string, role: UserRole = 'seeker'): { user: User } {
  const clean = username.trim();
  if (!clean) throw new Error('Username is required.');
  if (allUsers.some(u => u.username.toLowerCase() === clean.toLowerCase())) {
    throw new Error('That username is already taken.');
  }
  const handle = `@${clean.charAt(0).toUpperCase()}${clean.slice(1)}`;
  const user: User = {
    id: `u-${Date.now()}`,
    username: clean,
    handle,
    role,
    roleTitle: 'Rank #— • New Recruit',
    credits: 100,
    lastDailyRefillAt: 0,
    following: [],
    points: 0,
    rank: allUsers.length + 1,
    avatar: defaultAvatar,
    weeklyIdentifications: 0,
    accuracyRating: 0,
    cineCoinsBounty: 0,
    pendingGuessLocks: 0,
    consensusLeadCount: 0,
    uploadedDropsCount: 0,
    submissionsReceived: 0,
    agentHash: `NR-${Math.floor(1000 + Math.random() * 8999)}-X`,
  };
  return { user };
}
