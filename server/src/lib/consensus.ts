export type ConsensusStatus = 'unsolved' | 'tense_consensus' | 'high_consensus';

/** Below this many votes the crowd hasn't said anything yet. */
export const MIN_VOTES_FOR_CONSENSUS = 3;
export const HIGH_CONSENSUS_MIN_VOTES = 10;
export const HIGH_CONSENSUS_SHARE = 60; // percent of all votes held by the leader
export const TENSE_GAP = 15; // percentage points between the top two

/**
 * Crowd state of an open drop from its candidates' vote counts (roadmap Q3):
 *  - high_consensus: leader holds >= 60% of at least 10 votes
 *  - tense_consensus: two or more candidates, top two within 15 points
 *  - unsolved: anything else, including fewer than 3 votes
 */
export function consensusStatus(voteCounts: number[]): ConsensusStatus {
  const total = voteCounts.reduce((sum, v) => sum + v, 0);
  if (total < MIN_VOTES_FOR_CONSENSUS) return 'unsolved';

  const sorted = [...voteCounts].sort((a, b) => b - a);
  const leaderShare = ((sorted[0] ?? 0) / total) * 100;
  if (total >= HIGH_CONSENSUS_MIN_VOTES && leaderShare >= HIGH_CONSENSUS_SHARE) return 'high_consensus';

  if (sorted.length >= 2 && (((sorted[0] ?? 0) - (sorted[1] ?? 0)) / total) * 100 <= TENSE_GAP) return 'tense_consensus';
  return 'unsolved';
}
