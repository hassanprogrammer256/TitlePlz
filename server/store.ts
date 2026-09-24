import { User, MysteryDrop, MovieKingLeader, AnalyticsTelemetry, ClueComment } from '../types';

export class TerminalStore {
  public users: Map<string, User> = new Map();
  public userPasswords: Map<string, string> = new Map(); // username -> password
  public sessions: Map<string, string> = new Map(); // token -> userId
  public drops: Map<string, MysteryDrop> = new Map();
  public leaders: MovieKingLeader[] = [];
  public telemetry: AnalyticsTelemetry;
  public sseClients: Set<(data: string) => void> = new Set();

  constructor() {
    this.telemetry = {
      radarDropsScanning: 24,
      recognitionRate: 94.2,
      consensusEngineVersion: 'v4.2',
      activeSolvers: 482,
      solverVelocity: 14.8,
      guessesSubmittedToday: 1248,
      topGenres: [
        { name: 'Neo-Noir & Cyberpunk', percentage: 38 },
        { name: 'Psychological Thriller', percentage: 27 },
        { name: 'Anime & Sci-Fi Speculative', percentage: 21 },
        { name: 'Obscure European Giallo', percentage: 14 },
      ],
      hourlyActivity: [
        { hour: '00:00', active: 310, solved: 18 },
        { hour: '02:00', active: 280, solved: 14 },
        { hour: '04:00', active: 482, solved: 29 },
        { hour: '06:00', active: 390, solved: 22 },
        { hour: '08:00', active: 410, solved: 25 },
        { hour: '10:00', active: 520, solved: 34 },
      ],
    };

    this.seedUsers();
    this.seedDrops();
    this.seedLeaderboards();
    this.startLiveTelemetryJitter();
  }

  private seedUsers() {
    const neonVagrant: User = {
      id: 'usr_neon_vagrant',
      username: 'NeonVagrant',
      handle: '@NeonVagrant',
      role: 'detective',
      roleTitle: 'Rank #3 • Spotter',
      points: 1420,
      rank: 3,
      avatar: '/src/assets/images/avatar_detective_1790248477577.jpg',
      weeklyIdentifications: 24,
      accuracyRating: 92.4,
      cineCoinsBounty: 3450,
      pendingGuessLocks: 3,
      consensusLeadCount: 2,
      uploadedDropsCount: 1,
      submissionsReceived: 34,
      agentHash: 'NV-8841-A',
    };

    const deckardLens: User = {
      id: 'usr_deckard_lens',
      username: 'Deckard_Lens',
      handle: '@Deckard_Lens',
      role: 'curator',
      roleTitle: 'Level 99 • Cine-God',
      points: 4820,
      rank: 1,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80',
      weeklyIdentifications: 89,
      accuracyRating: 98.7,
      cineCoinsBounty: 12500,
      pendingGuessLocks: 5,
      consensusLeadCount: 5,
      uploadedDropsCount: 8,
      submissionsReceived: 210,
      agentHash: 'DL-0012-G',
    };

    const retroCinephile: User = {
      id: 'usr_retro_cinephile',
      username: 'RetroCinephile',
      handle: '@RetroCinephile',
      role: 'detective',
      roleTitle: 'Verified Detective',
      points: 3100,
      rank: 2,
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80',
      weeklyIdentifications: 45,
      accuracyRating: 95.1,
      cineCoinsBounty: 8200,
      pendingGuessLocks: 2,
      consensusLeadCount: 2,
      uploadedDropsCount: 4,
      submissionsReceived: 98,
      agentHash: 'RC-9921-B',
    };

    this.users.set(neonVagrant.id, neonVagrant);
    this.users.set(deckardLens.id, deckardLens);
    this.users.set(retroCinephile.id, retroCinephile);

    this.userPasswords.set('NeonVagrant', 'matrix123');
    this.userPasswords.set('Deckard_Lens', 'replicant2049');
    this.userPasswords.set('RetroCinephile', 'cinema1998');

    // Default active session for initial load is NeonVagrant
    this.sessions.set('token_default_neon_vagrant', neonVagrant.id);
  }

  private seedDrops() {
    const mainDrop: MysteryDrop = {
      id: 'drop-9042-alpha',
      dropNumber: 'DROP #9042-ALPHA',
      timecode: '01:14:22:04',
      source: '35mm Scan Rip',
      bountyPts: 500,
      imageUrl: '/src/assets/images/drop_blade_runner_1790248447717.jpg',
      aspectRatioLabel: 'ASPECT: 2.39:1 ANAMORPHIC',
      spectralLabel: 'SPECTRAL: 434nm // COLOR PALETTE: CYAN-OBSIDIAN',
      fpsLabel: 'FPS: 23.976',
      audioStemLabel: 'Vangelis Synthesizer Harmonic (CS-80 Drone Pattern)',
      audioDuration: 15.0,
      tags: ['#NeoNoir', '#FlyingVehicles', '#Anamorphic', '#Dystopian'],
      uploaderHandle: '@CinePhile_99',
      uploaderRole: 'Level 42 Seeker',
      uploadedAgo: '38 mins ago',
      detectivesExamining: 142,
      status: 'unsolved',
      lockTimeRemaining: '01:21:44',
      validatedByText: 'Validated by 4 MovieKings & 2 Admins',
      totalGuessesCast: 202,
      targetPropNote: 'Target: Prop Communicator (Matches 80s/90s Syd Mead industrial sketch)',
      candidates: [
        {
          id: 'cand-1',
          title: 'Blade Runner 2049 (2017)',
          year: 2017,
          director: 'Denis Villeneuve',
          cinematographer: 'Roger Deakins',
          imdbId: 'tt1856101',
          votes: 137,
          percentage: 68,
          commentersCount: 142,
          isLeader: true,
        },
        {
          id: 'cand-2',
          title: 'Dark City (1998)',
          year: 1998,
          notes: "Director's Cut • 48 votes",
          votes: 46,
          percentage: 23,
          commentersCount: 48,
          isLeader: false,
        },
        {
          id: 'cand-3',
          title: 'Mute (2018)',
          year: 2018,
          notes: 'Duncan Jones • 12 votes',
          votes: 19,
          percentage: 6,
          commentersCount: 12,
          isLeader: false,
        },
      ],
      comments: [
        {
          id: 'com-1',
          authorHandle: '@Deckard_Lens',
          authorBadge: '#1 MovieKing',
          authorInitials: 'DL',
          isMovieKing: true,
          timeAgo: '4m ago',
          timestamp: '00:42',
          content: 'Look closely at the spinner vehicle passing overhead at 00:42. It matches the Peugeot Spinner blueprint used in Villeneuve\'s 2049 sequence. Definitely not the 1982 original.',
          agreedCount: 43,
          createdAt: Date.now() - 4 * 60 * 1000,
        },
        {
          id: 'com-2',
          authorHandle: '@TarkovskyGaze',
          authorBadge: 'Detective',
          authorInitials: 'TG',
          isDetective: true,
          timeAgo: '11m ago',
          timestamp: '01:12',
          content: 'The audio waveform drone has a distinct pitch drop characteristic of Hans Zimmer and Benjamin Wallfisch\'s sound design on the 2049 OST.',
          agreedCount: 19,
          createdAt: Date.now() - 11 * 60 * 1000,
        },
      ],
    };

    const drop8911: MysteryDrop = {
      id: 'drop-8911',
      dropNumber: 'DROP #8911',
      timecode: '00:48:19:12',
      source: '16mm Kodachrome Print',
      bountyPts: 350,
      imageUrl: '/src/assets/images/drop_70s_motel_1790248459639.jpg',
      aspectRatioLabel: 'ASPECT: 1.85:1 FLAT',
      spectralLabel: 'SPECTRAL: 580nm // COLOR PALETTE: AMBER-MOSS',
      fpsLabel: 'FPS: 24.000',
      audioStemLabel: 'Faint Rotary Dial Tone & Fluorescent Hum (60Hz)',
      audioDuration: 12.0,
      tags: ['#PsychologicalThriller', '#70sCinema', '#MotelNoir', '#VintageColor'],
      uploaderHandle: '@KinoVoyeur',
      uploaderRole: 'Level 28 Seeker',
      uploadedAgo: '1h 12m ago',
      detectivesExamining: 74,
      status: 'tense_consensus',
      timeRemaining: '8m remaining',
      lockTimeRemaining: '00:08:14',
      validatedByText: 'Validated by 2 MovieKings & 1 Admin',
      totalGuessesCast: 18,
      targetPropNote: 'Empty green velour armchair, rotary phone with smoking cigarette in glass ashtray',
      candidates: [
        {
          id: 'cand-8911-1',
          title: 'The Conversation (1974)',
          year: 1974,
          director: 'Francis Ford Coppola',
          cinematographer: 'Bill Butler',
          imdbId: 'tt0071360',
          votes: 11,
          percentage: 61,
          commentersCount: 11,
          isLeader: true,
        },
        {
          id: 'cand-8911-2',
          title: 'Klute (1971)',
          year: 1971,
          notes: 'Alan J. Pakula • 5 votes',
          votes: 5,
          percentage: 28,
          commentersCount: 5,
          isLeader: false,
        },
        {
          id: 'cand-8911-3',
          title: 'Night Moves (1975)',
          year: 1975,
          notes: 'Arthur Penn • 2 votes',
          votes: 2,
          percentage: 11,
          commentersCount: 2,
          isLeader: false,
        },
      ],
      comments: [
        {
          id: 'com-8911-1',
          authorHandle: '@RetroCinephile',
          authorBadge: 'Verified Detective',
          authorInitials: 'RC',
          isDetective: true,
          timeAgo: '18m ago',
          timestamp: '00:18',
          content: 'The green armchair and wallpaper pattern are identical to the wiretapping staging room in Coppola\'s The Conversation.',
          agreedCount: 12,
          createdAt: Date.now() - 18 * 60 * 1000,
        },
      ],
    };

    const drop8703: MysteryDrop = {
      id: 'drop-8703',
      dropNumber: 'DROP #8703',
      timecode: '00:32:05:08',
      source: 'HD Remaster Cel Scan',
      bountyPts: 600,
      imageUrl: '/src/assets/images/drop_anime_cockpit_1790248467929.jpg',
      aspectRatioLabel: 'ASPECT: 1.85:1 ACADEMY FLAT',
      spectralLabel: 'SPECTRAL: 495nm // COLOR PALETTE: CYAN-AZURE',
      fpsLabel: 'FPS: 24.000',
      audioStemLabel: 'Puccini Madame Butterfly Aria & Hull Resonance',
      audioDuration: 18.0,
      tags: ['#AnimeClassics', '#SpaceOpera', '#KojiMorimoto', '#MagneticRose'],
      uploaderHandle: '@OtakuArchive',
      uploaderRole: 'Level 54 Archivist',
      uploadedAgo: '3h 40m ago',
      detectivesExamining: 204,
      status: 'solved',
      timeRemaining: 'Resolved by @Deckard',
      lockTimeRemaining: '00:00:00 (ARCHIVED)',
      validatedByText: 'Verified 100% Correct Match • IMDb Consensus Locked',
      totalGuessesCast: 89,
      targetPropNote: 'Space debris collector ship cockpit with holographic rose interface',
      candidates: [
        {
          id: 'cand-8703-1',
          title: 'Memories (Magnetic Rose, 1995)',
          year: 1995,
          director: 'Kōji Morimoto / Satoshi Kon',
          cinematographer: 'Katsuhiro Otomo team',
          imdbId: 'tt0113799',
          votes: 89,
          percentage: 100,
          commentersCount: 89,
          isLeader: true,
        },
      ],
      comments: [
        {
          id: 'com-8703-1',
          authorHandle: '@Deckard_Lens',
          authorBadge: '#1 MovieKing',
          authorInitials: 'DL',
          isMovieKing: true,
          timeAgo: '2h ago',
          timestamp: '00:15',
          content: 'Confirmed sequence: Memories Segment 1 "Magnetic Rose". Corona ship bridge with Heinz and Miguel inspecting the phantom singing distress beacon.',
          agreedCount: 68,
          createdAt: Date.now() - 120 * 60 * 1000,
        },
      ],
    };

    this.drops.set(mainDrop.id, mainDrop);
    this.drops.set(drop8911.id, drop8911);
    this.drops.set(drop8703.id, drop8703);
  }

  private seedLeaderboards() {
    this.leaders = [
      {
        rank: 1,
        handle: '@Deckard_Lens',
        title: 'Level 99 • Cine-God',
        solvedCount: 1842,
        weeklyDelta: '+14 this week',
        badge: '👑',
        crownEmoji: '👑',
      },
      {
        rank: 2,
        handle: '@RetroCinephile',
        title: 'Verified Detective',
        solvedCount: 1620,
        weeklyDelta: '+8 this week',
        badge: '🥈',
        crownEmoji: '🥈',
      },
      {
        rank: 3,
        handle: '@NeonVagrant',
        title: 'Rank #3 • Spotter',
        solvedCount: 1420,
        weeklyDelta: '+2 today',
        badge: '🥉',
        crownEmoji: '🥉',
        isCurrent: true,
      },
      {
        rank: 4,
        handle: '@TarkovskyGaze',
        title: 'Auteur Specialist',
        solvedCount: 980,
        weeklyDelta: 'Active now',
        badge: '#4',
      },
      {
        rank: 5,
        handle: '@CriterionJunkie',
        title: 'Archival Inspector',
        solvedCount: 845,
        weeklyDelta: '+5 this week',
        badge: '#5',
      },
      {
        rank: 6,
        handle: '@SolarisGrain',
        title: 'Spectral Analyst',
        solvedCount: 792,
        weeklyDelta: '+3 this week',
        badge: '#6',
      },
    ];
  }

  private startLiveTelemetryJitter() {
    setInterval(() => {
      // Small organic pulse for active solvers and velocity
      const deltaSolvers = Math.floor(Math.random() * 7) - 3;
      this.telemetry.activeSolvers = Math.max(450, Math.min(520, this.telemetry.activeSolvers + deltaSolvers));
      
      const deltaVelocity = (Math.random() * 0.4 - 0.2);
      this.telemetry.solverVelocity = Number((Math.max(12, Math.min(18, this.telemetry.solverVelocity + deltaVelocity))).toFixed(1));

      // Broadcast telemetry tick to SSE clients
      this.broadcast('telemetry', {
        activeSolvers: this.telemetry.activeSolvers,
        solverVelocity: this.telemetry.solverVelocity,
        radarDropsScanning: this.telemetry.radarDropsScanning,
        recognitionRate: this.telemetry.recognitionRate,
      });
    }, 4000);
  }

  public broadcast(event: string, payload: any) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const send of this.sseClients) {
      try {
        send(msg);
      } catch (err) {
        // client closed
      }
    }
  }

  public recalculateConsensus(drop: MysteryDrop) {
    const totalVotes = drop.candidates.reduce((sum, c) => sum + c.votes, 0);
    drop.totalGuessesCast = totalVotes;

    if (totalVotes === 0) {
      drop.candidates.forEach(c => {
        c.percentage = 0;
        c.isLeader = false;
      });
      return;
    }

    let highestVotes = -1;
    let leaderId = '';

    drop.candidates.forEach(c => {
      c.percentage = Math.round((c.votes / totalVotes) * 100);
      if (c.votes > highestVotes) {
        highestVotes = c.votes;
        leaderId = c.id;
      }
    });

    drop.candidates.forEach(c => {
      c.isLeader = c.id === leaderId && c.votes > 0;
    });

    // Sort descending by votes
    drop.candidates.sort((a, b) => b.votes - a.votes);
  }

  public submitGuess(dropId: string, user: User, title: string) {
    const drop = this.drops.get(dropId);
    if (!drop) throw new Error('Drop not found');

    const cleanTitle = title.trim();
    if (!cleanTitle) throw new Error('Title cannot be empty');

    // Check if matching candidate exists (case-insensitive substring or exact match)
    let candidate = drop.candidates.find(
      c => c.title.toLowerCase().includes(cleanTitle.toLowerCase()) || cleanTitle.toLowerCase().includes(c.title.toLowerCase())
    );

    if (candidate) {
      candidate.votes += 1;
      candidate.commentersCount += 1;
    } else {
      // Add as new candidate
      candidate = {
        id: `cand-${Date.now()}`,
        title: cleanTitle,
        votes: 1,
        percentage: 0,
        commentersCount: 1,
        notes: `Submitted by ${user.handle}`,
      };
      drop.candidates.push(candidate);
    }

    this.recalculateConsensus(drop);

    // Add a comment to evidence stream
    const newComment: ClueComment = {
      id: `com-${Date.now()}`,
      authorHandle: user.handle,
      authorBadge: user.role === 'curator' ? '#1 MovieKing' : user.role === 'detective' ? 'Detective' : 'Seeker',
      authorInitials: user.handle.replace('@', '').slice(0, 2).toUpperCase(),
      authorAvatar: user.avatar,
      isDetective: user.role === 'detective',
      isMovieKing: user.role === 'curator',
      timeAgo: 'Just now',
      timestamp: drop.timecode.split(':').slice(0, 2).join(':') || '01:14',
      content: `Candidate Film submitted: "${cleanTitle}". Cross-referencing against production notes and visual cues.`,
      agreedCount: 1,
      createdAt: Date.now(),
    };

    drop.comments.unshift(newComment);

    // Reward user with 50 PTS
    user.points += 50;
    user.cineCoinsBounty += 50;
    user.weeklyIdentifications += 1;
    this.telemetry.guessesSubmittedToday += 1;

    // Check if user is on leaderboard
    const leaderEntry = this.leaders.find(l => l.handle === user.handle);
    if (leaderEntry) {
      leaderEntry.solvedCount += 1;
    }

    this.broadcast('guess_submitted', {
      dropId,
      user: { handle: user.handle, points: user.points },
      candidate,
      totalGuessesCast: drop.totalGuessesCast,
      candidates: drop.candidates,
      newComment,
    });

    return { drop, newComment, user };
  }

  public voteCandidate(dropId: string, candidateId: string, user: User) {
    const drop = this.drops.get(dropId);
    if (!drop) throw new Error('Drop not found');

    const candidate = drop.candidates.find(c => c.id === candidateId);
    if (!candidate) throw new Error('Candidate not found');

    candidate.votes += 1;
    this.recalculateConsensus(drop);

    // Reward small voting points
    user.points += 5;
    user.cineCoinsBounty += 5;

    this.broadcast('vote_recorded', {
      dropId,
      candidateId,
      candidates: drop.candidates,
      totalGuessesCast: drop.totalGuessesCast,
    });

    return { drop, candidate, user };
  }
}

export const terminalStore = new TerminalStore();
