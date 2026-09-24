export type UserRole = 'seeker' | 'detective' | 'curator';

export interface User {
  id: string;
  username: string;
  handle: string; // e.g. @NeonVagrant
  role: UserRole;
  roleTitle: string; // e.g. "Rank #3 • Spotter" or "Level 99 • Cine-God"
  credits: number; // Balance in $ (starts with $100)
  lastDailyRefillAt: number; // Timestamp of last $20 refill
  following: string[]; // List of user handles scouted (max 5)
  points: number; // MovieKing leaderboard points (+5 correct, -3 wrong)
  rank: number;
  avatar: string;
  weeklyIdentifications: number;
  accuracyRating: number;
  cineCoinsBounty: number;
  pendingGuessLocks: number;
  consensusLeadCount: number;
  uploadedDropsCount: number;
  submissionsReceived: number;
  agentHash: string; // e.g. "NV-8841-A"
  tierStanding?: 'promoted' | 'safe' | 'demoted';
}

export interface CandidateTitle {
  id: string;
  title: string;
  year?: number;
  director?: string;
  cinematographer?: string;
  imdbId?: string;
  votes: number;
  percentage: number;
  commentersCount: number;
  isLeader?: boolean;
  notes?: string;
}

export interface ClueComment {
  id: string;
  authorHandle: string;
  authorBadge?: string;
  authorInitials: string;
  authorAvatar?: string;
  isMovieKing?: boolean;
  isDetective?: boolean;
  timeAgo: string;
  timestamp: string; // e.g. "00:42"
  content: string;
  agreedCount: number;
  userAgreed?: boolean;
  createdAt: number;
}

export interface UserGuessTrial {
  userId: string;
  userHandle: string;
  userAvatar?: string;
  guessedTitle: string;
  isCorrect: boolean;
  stakeDeducted: number; // $20
  rewardAwarded?: number; // $20 stake + bounty
  pointsDelta: number; // +5 or -3
  createdAt: number;
}

export interface MysteryDrop {
  id: string;
  dropNumber: string; // e.g. "DROP #9042-ALPHA"
  timecode: string; // e.g. "01:14:22:04"
  source: string; // e.g. "35mm Scan Rip"
  mediaType: 'photo' | 'clip'; // Photo or clip less than 10 mins
  clipDurationSeconds?: number; // < 600 seconds
  releaseYear: number; // Year of release
  correctTitle: string; // Verified title (hidden until solved or for creator)
  bountyPts: number; // Bounty amount in $ staked by uploader
  validityDurationHours: number; // Between 24 (1 day) and 168 hours (1 week)
  createdAt: number;
  expiresAt: number;
  imageUrl: string;
  videoUrl?: string;
  aspectRatioLabel: string; // e.g. "2.39:1 ANAMORPHIC"
  spectralLabel: string; // e.g. "SPECTRAL: 434nm // COLOR PALETTE: CYAN-OBSIDIAN"
  fpsLabel: string; // e.g. "FPS: 23.976"
  audioStemLabel: string; // e.g. "Vangelis Synthesizer Harmonic (CS-80 Drone Pattern)"
  audioDuration: number; // e.g. 15.00
  tags: string[];
  uploaderId?: string;
  uploaderHandle: string;
  uploaderRole: string;
  uploadedAgo: string;
  detectivesExamining: number;
  status: 'unsolved' | 'tense_consensus' | 'high_consensus' | 'solved' | 'expired';
  solvedBy?: string;
  solvedAt?: number;
  rewardClaimed?: boolean;
  timeRemaining?: string;
  lockTimeRemaining?: string; // e.g. "01:21:44"
  validatedByText: string;
  totalGuessesCast: number;
  targetPropNote?: string;
  candidates: CandidateTitle[];
  comments: ClueComment[];
  userTrials: Record<string, UserGuessTrial>; // userId -> single trial
}

export interface MovieKingLeader {
  rank: number;
  id?: string;
  handle: string;
  title: string;
  points: number; // Actual current points
  solvedCount: number;
  bountyEarnedTotal: number;
  weeklyDelta: string;
  isCurrent?: boolean;
  avatar?: string;
  badge?: string;
  crownEmoji?: string;
  tier: 'promoted' | 'safe' | 'demoted'; // Top 10 promoted, middle safe, bottom 10 demoted
}

export interface SeasonInfo {
  seasonNumber: number;
  name: string;
  startedAt: number;
  durationDays: number; // 31 days
  endsAt: number;
  isActive: boolean;
  promotedCount: number; // 10
  demotedCount: number; // 10
}

export interface ScoutActivityNotification {
  id: string;
  userId: string;
  userHandle: string;
  userAvatar?: string;
  type: 'posted_clip' | 'answered_clip' | 'rewarded_clip';
  dropId: string;
  dropNumber: string;
  title: string;
  message: string;
  amount?: number;
  pointsDelta?: number;
  timestamp: number;
  isRead?: boolean;
}

export interface AnalyticsTelemetry {
  radarDropsScanning: number;
  recognitionRate: number;
  consensusEngineVersion: string;
  activeSolvers: number;
  solverVelocity: number; // guesses/min
  guessesSubmittedToday: number;
  topGenres: { name: string; percentage: number }[];
  hourlyActivity: { hour: string; active: number; solved: number }[];
}

export interface SystemStatus {
  status: string;
  sockets: {
    activeSockets: number;
    protocol: string;
  };
  mongodb: {
    status: 'connected' | 'connecting' | 'disconnected' | 'embedded_synced';
    host: string;
    database: string;
    modelsLoaded: number;
  };
  uptimeSeconds: number;
  timestamp: number;
}
