/**
 * Dev seed (originally ported from the retired in-memory prototype).
 * Idempotent: if the first seeded drop exists, nothing is written.
 * Refuses to run in production unless SEED_FORCE=true.
 *
 * DEV PASSWORDS (never use these anywhere real):
 *   NeonVagrant/matrix123  Deckard_Lens/replicant2049 (admin)  RetroCinephile/cinema1998
 *   everyone else: "titleplz-dev"
 */
import argon2 from 'argon2';
import { config } from '../src/config/env.js';
import { prisma, withTx, disconnectDatabase, type Tx } from '../src/db/client.js';
import { normalizeTitle } from '../src/lib/title.js';
import { applyCredit, type CreditReason } from '../src/services/creditService.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const later = (ms: number) => new Date(now + ms);

const SIGNUP_CREDITS = 100;
const SEED_TOPUP = 2000; // so seeded users can afford bounties/stakes
const STAKE = 20;

type SeedUser = {
  username: string;
  password: string;
  role: 'seeker' | 'detective' | 'curator';
  isAdmin?: boolean;
  points: number;
  agentHash: string;
  avatarUrl?: string;
  solvedCount: number;
  bountyEarned: number;
};

const USERS: SeedUser[] = [
  { username: 'NeonVagrant', password: 'matrix123', role: 'detective', points: 1420, agentHash: 'NV-8841-A', avatarUrl: '/src/assets/images/avatar_detective_1790248477577.jpg', solvedCount: 1420, bountyEarned: 3450 },
  { username: 'Deckard_Lens', password: 'replicant2049', role: 'curator', isAdmin: true, points: 4820, agentHash: 'DL-0012-G', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=160&q=80', solvedCount: 1842, bountyEarned: 12500 },
  { username: 'RetroCinephile', password: 'cinema1998', role: 'detective', points: 3100, agentHash: 'RC-9921-B', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=160&q=80', solvedCount: 1620, bountyEarned: 8200 },
  { username: 'TarkovskyGaze', password: 'titleplz-dev', role: 'detective', points: 980, agentHash: 'TG-4471-D', solvedCount: 980, bountyEarned: 1900 },
  { username: 'CriterionJunkie', password: 'titleplz-dev', role: 'detective', points: 845, agentHash: 'CJ-3310-E', solvedCount: 845, bountyEarned: 1500 },
  { username: 'SolarisGrain', password: 'titleplz-dev', role: 'detective', points: 792, agentHash: 'SG-2208-F', solvedCount: 792, bountyEarned: 1100 },
  { username: 'CinePhile_99', password: 'titleplz-dev', role: 'seeker', points: 0, agentHash: 'CP-0099-H', solvedCount: 0, bountyEarned: 0 },
  { username: 'KinoVoyeur', password: 'titleplz-dev', role: 'seeker', points: 0, agentHash: 'KV-0028-J', solvedCount: 0, bountyEarned: 0 },
  { username: 'OtakuArchive', password: 'titleplz-dev', role: 'seeker', points: 0, agentHash: 'OA-0054-K', solvedCount: 0, bountyEarned: 0 },
];

type SeedCandidate = { title: string; year?: number; director?: string; cinematographer?: string; imdbId?: string; notes?: string; votes: number };
type SeedComment = { author: string; timestampLabel: string; content: string; minutesAgo: number };
type SeedDrop = {
  dropNumber: string; uploader: string; releaseYear: number; correctTitle: string; bounty: number;
  imageUrl: string; timecode: string; source: string; aspectRatioLabel: string; spectralLabel: string;
  fpsLabel: string; audioStemLabel: string; audioDuration: number; tags: string[]; targetPropNote: string;
  status: string; createdMinutesAgo: number; solvedBy?: string;
  candidates: SeedCandidate[]; comments: SeedComment[];
};

const DROPS: SeedDrop[] = [
  {
    dropNumber: 'DROP #9042-ALPHA', uploader: 'CinePhile_99', releaseYear: 2017, correctTitle: 'Blade Runner 2049', bounty: 500,
    imageUrl: '/src/assets/images/drop_blade_runner_1790248447717.jpg', timecode: '01:14:22:04', source: '35mm Scan Rip',
    aspectRatioLabel: 'ASPECT: 2.39:1 ANAMORPHIC', spectralLabel: 'SPECTRAL: 434nm // COLOR PALETTE: CYAN-OBSIDIAN',
    fpsLabel: 'FPS: 23.976', audioStemLabel: 'Vangelis Synthesizer Harmonic (CS-80 Drone Pattern)', audioDuration: 15,
    tags: ['neonoir', 'flyingvehicles', 'anamorphic', 'dystopian'],
    targetPropNote: 'Target: Prop Communicator (Matches 80s/90s Syd Mead industrial sketch)',
    status: 'unsolved', createdMinutesAgo: 38,
    candidates: [
      { title: 'Blade Runner 2049 (2017)', year: 2017, director: 'Denis Villeneuve', cinematographer: 'Roger Deakins', imdbId: 'tt1856101', votes: 137 },
      { title: 'Dark City (1998)', year: 1998, notes: "Director's Cut", votes: 46 },
      { title: 'Mute (2018)', year: 2018, notes: 'Duncan Jones', votes: 19 },
    ],
    comments: [
      { author: 'Deckard_Lens', timestampLabel: '00:42', minutesAgo: 4, content: "Look closely at the spinner vehicle passing overhead at 00:42. It matches the Peugeot Spinner blueprint used in Villeneuve's 2049 sequence. Definitely not the 1982 original." },
      { author: 'TarkovskyGaze', timestampLabel: '01:12', minutesAgo: 11, content: "The audio waveform drone has a distinct pitch drop characteristic of Hans Zimmer and Benjamin Wallfisch's sound design on the 2049 OST." },
    ],
  },
  {
    dropNumber: 'DROP #8911', uploader: 'KinoVoyeur', releaseYear: 1974, correctTitle: 'The Conversation', bounty: 350,
    imageUrl: '/src/assets/images/drop_70s_motel_1790248459639.jpg', timecode: '00:48:19:12', source: '16mm Kodachrome Print',
    aspectRatioLabel: 'ASPECT: 1.85:1 FLAT', spectralLabel: 'SPECTRAL: 580nm // COLOR PALETTE: AMBER-MOSS',
    fpsLabel: 'FPS: 24.000', audioStemLabel: 'Faint Rotary Dial Tone & Fluorescent Hum (60Hz)', audioDuration: 12,
    tags: ['psychologicalthriller', '70scinema', 'motelnoir', 'vintagecolor'],
    targetPropNote: 'Empty green velour armchair, rotary phone with smoking cigarette in glass ashtray',
    status: 'tense_consensus', createdMinutesAgo: 72,
    candidates: [
      { title: 'The Conversation (1974)', year: 1974, director: 'Francis Ford Coppola', cinematographer: 'Bill Butler', imdbId: 'tt0071360', votes: 11 },
      { title: 'Klute (1971)', year: 1971, notes: 'Alan J. Pakula', votes: 5 },
      { title: 'Night Moves (1975)', year: 1975, notes: 'Arthur Penn', votes: 2 },
    ],
    comments: [
      { author: 'RetroCinephile', timestampLabel: '00:18', minutesAgo: 18, content: "The green armchair and wallpaper pattern are identical to the wiretapping staging room in Coppola's The Conversation." },
    ],
  },
  {
    dropNumber: 'DROP #8703', uploader: 'OtakuArchive', releaseYear: 1995, correctTitle: 'Memories', bounty: 600,
    imageUrl: '/src/assets/images/drop_anime_cockpit_1790248467929.jpg', timecode: '00:32:05:08', source: 'HD Remaster Cel Scan',
    aspectRatioLabel: 'ASPECT: 1.85:1 ACADEMY FLAT', spectralLabel: 'SPECTRAL: 495nm // COLOR PALETTE: CYAN-AZURE',
    fpsLabel: 'FPS: 24.000', audioStemLabel: 'Puccini Madame Butterfly Aria & Hull Resonance', audioDuration: 18,
    tags: ['animeclassics', 'spaceopera', 'kojimorimoto', 'magneticrose'],
    targetPropNote: 'Space debris collector ship cockpit with holographic rose interface',
    status: 'solved', createdMinutesAgo: 220, solvedBy: 'Deckard_Lens',
    candidates: [
      { title: 'Memories', year: 1995, director: 'Kōji Morimoto / Satoshi Kon', cinematographer: 'Katsuhiro Otomo team', imdbId: 'tt0113799', notes: 'Magnetic Rose segment', votes: 89 },
    ],
    comments: [
      { author: 'Deckard_Lens', timestampLabel: '00:15', minutesAgo: 120, content: 'Confirmed sequence: Memories Segment 1 "Magnetic Rose". Corona ship bridge with Heinz and Miguel inspecting the phantom singing distress beacon.' },
    ],
  },
];

async function ledger(tx: Tx, userId: string, delta: number, reason: CreditReason, key: string, ref?: { type: string; id: string }) {
  await applyCredit(tx, { userId, delta, reason, idempotencyKey: key, ref });
}

async function main() {
  if (config.isProd && process.env.SEED_FORCE !== 'true') {
    console.error('[seed] refusing to seed in production (set SEED_FORCE=true to override)');
    process.exit(1);
  }
  if (await prisma.drop.findUnique({ where: { dropNumber: DROPS[0]!.dropNumber } })) {
    console.log('[seed] already seeded, nothing to do');
    return;
  }

  const hashes = new Map<string, string>();
  for (const u of USERS) hashes.set(u.password, hashes.get(u.password) ?? (await argon2.hash(u.password)));

  await withTx(async (tx) => {
    const ids = new Map<string, string>();
    const handleOf = (username: string) => `@${username}`;

    for (const u of USERS) {
      const created = await tx.user.upsert({
        where: { usernameKey: u.username.toLowerCase() },
        update: {},
        create: {
          username: u.username,
          usernameKey: u.username.toLowerCase(),
          handle: handleOf(u.username),
          passwordHash: hashes.get(u.password)!,
          role: u.role,
          isAdmin: u.isAdmin ?? false,
          avatarUrl: u.avatarUrl,
          agentHash: u.agentHash,
          points: u.points,
        },
      });
      ids.set(u.username, created.id);
      await ledger(tx, created.id, SIGNUP_CREDITS, 'signup', `seed:signup:${created.id}`);
      await ledger(tx, created.id, SEED_TOPUP, 'purchase', `seed:topup:${created.id}`);
    }
    const id = (username: string) => ids.get(username) ?? (() => { throw new Error(`unknown seed user ${username}`); })();

    const season = await tx.season.create({
      data: { seasonNumber: 1, name: 'Season 1 // Neon Premiere', startedAt: ago(10 * 24 * HOUR), endsAt: later(21 * 24 * HOUR), isActive: true },
    });
    for (const u of USERS.filter((x) => x.points > 0)) {
      await tx.seasonStanding.create({
        data: { seasonId: season.id, userId: id(u.username), points: u.points, solvedCount: u.solvedCount, bountyEarned: u.bountyEarned },
      });
    }

    for (const d of DROPS) {
      const uploaderId = id(d.uploader);
      const drop = await tx.drop.create({
        data: {
          dropNumber: d.dropNumber, uploaderId, mediaType: 'photo', imageUrl: d.imageUrl,
          releaseYear: d.releaseYear, correctTitle: d.correctTitle, correctTitleKey: normalizeTitle(d.correctTitle),
          bounty: d.bounty, validityHours: 24 * 3, expiresAt: later(48 * HOUR), status: d.status,
          timecode: d.timecode, source: d.source, aspectRatioLabel: d.aspectRatioLabel, spectralLabel: d.spectralLabel,
          fpsLabel: d.fpsLabel, audioStemLabel: d.audioStemLabel, audioDuration: d.audioDuration,
          targetPropNote: d.targetPropNote, createdAt: ago(d.createdMinutesAgo * MIN),
          solvedById: d.solvedBy ? id(d.solvedBy) : null, solvedAt: d.solvedBy ? ago(2 * HOUR) : null,
          rewardClaimed: Boolean(d.solvedBy),
        },
      });
      await ledger(tx, uploaderId, -d.bounty, 'bounty_stake', `drop:${drop.id}:bounty`, { type: 'drop', id: drop.id });

      for (const tag of d.tags) {
        const t = await tx.tag.upsert({ where: { name: tag }, update: {}, create: { name: tag } });
        await tx.dropTag.create({ data: { dropId: drop.id, tagId: t.id } });
      }
      for (const c of d.candidates) {
        await tx.candidate.create({
          data: { dropId: drop.id, title: c.title, normalizedTitle: normalizeTitle(c.title), year: c.year, director: c.director, cinematographer: c.cinematographer, imdbId: c.imdbId, notes: c.notes, votes: c.votes },
        });
      }
      for (const c of d.comments) {
        await tx.comment.create({
          data: { dropId: drop.id, authorId: id(c.author), timestampLabel: c.timestampLabel, content: c.content, createdAt: ago(c.minutesAgo * MIN) },
        });
      }
      await tx.activity.create({
        data: { actorId: uploaderId, type: 'posted_clip', dropId: drop.id, message: `posted ${d.dropNumber}`, amount: d.bounty, createdAt: ago(d.createdMinutesAgo * MIN) },
      });

      if (d.solvedBy) {
        const winner = id(d.solvedBy);
        await tx.trial.create({
          data: { dropId: drop.id, userId: winner, guessedTitle: d.correctTitle, isCorrect: true, stake: STAKE, reward: STAKE + d.bounty, pointsDelta: 5, createdAt: ago(2 * HOUR) },
        });
        await ledger(tx, winner, -STAKE, 'stake', `trial:${drop.id}:${winner}:stake`, { type: 'drop', id: drop.id });
        await ledger(tx, winner, STAKE + d.bounty, 'reward', `trial:${drop.id}:${winner}:reward`, { type: 'drop', id: drop.id });
        await tx.activity.create({
          data: { actorId: winner, type: 'rewarded_clip', dropId: drop.id, message: `solved ${d.dropNumber}`, amount: d.bounty, pointsDelta: 5, createdAt: ago(2 * HOUR) },
        });
      }

      if (d.dropNumber === 'DROP #9042-ALPHA') {
        const guesser = id('RetroCinephile');
        await tx.trial.create({
          data: { dropId: drop.id, userId: guesser, guessedTitle: 'Dark City', isCorrect: false, stake: STAKE, reward: 0, pointsDelta: -3, createdAt: ago(20 * MIN) },
        });
        await ledger(tx, guesser, -STAKE, 'stake', `trial:${drop.id}:${guesser}:stake`, { type: 'drop', id: drop.id });
        await tx.activity.create({
          data: { actorId: guesser, type: 'answered_clip', dropId: drop.id, message: `answered ${d.dropNumber}`, pointsDelta: -3, createdAt: ago(20 * MIN) },
        });
      }
    }

    await tx.follow.create({ data: { followerId: id('NeonVagrant'), followingId: id('Deckard_Lens') } });
  });

  const counts = {
    users: await prisma.user.count(),
    drops: await prisma.drop.count(),
    candidates: await prisma.candidate.count(),
    ledger: await prisma.creditLedger.count(),
  };
  console.log('[seed] done', counts);
}

main()
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exitCode = 1;
  })
  .finally(disconnectDatabase);
