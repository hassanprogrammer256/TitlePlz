# TitlePlz Backend: Progress & Roadmap

_Last updated: 2026-10-16 (P0-P8 complete)_ · Task legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked

## 1. Project

Crowd-sourced "name that movie" game ("Cinematic Terminal"). Uploaders stake a credit bounty on a photo or short clip (under 10 min) whose title they know. Detectives pay a **$20 stake** to lock **one guess per drop**. A correct guess wins stake + bounty and +5 pts. A wrong guess loses the stake and −3 pts. A seasonal MovieKing leaderboard promotes and demotes tiers.

| Area | Choice |
|---|---|
| Runtime / language | Node 24, npm 11, TypeScript |
| HTTP | Express + cookie-parser |
| Realtime | Socket.IO (events) + SSE (`/api/analytics/stream`) |
| ORM | Prisma |
| DB (dev / prod) | SQLite / PostgreSQL |
| Auth | Username + password (argon2 or bcrypt), JWT in httpOnly cookie |
| Media | Storage adapter: local disk (dev), S3-compatible (prod) |
| AI | Out of scope for v1 (placeholder module only) |

**Target repo layout:** `client/` (Vite + React 19) · `server/` (this plan) · `shared/` (shared TS types) · `design.md` (UI design system).

## 2. Decisions (confirmed 2026-10-16)

| ID | Topic | Decision |
|---|---|---|
| D1 | Framework | Express + Socket.IO. The client already depends on express, cookie-parser and socket.io-client, and calls an SSE endpoint. |
| D2 | Auth | Password hashed with argon2/bcrypt. JWT in httpOnly cookie. register/login/me/logout. `switch-user` exists **only** when `NODE_ENV=development`. No plaintext passwords. |
| D3 | Credits | Virtual currency with an immutable ledger. Balance is cached on `User.credits` and updated in the same DB transaction. The purchase endpoint is a stub. |
| D4 | Media | `StorageAdapter` interface with `LocalDiskAdapter` (dev) and `S3CompatibleAdapter` (prod, R2/S3). The DB stores only keys and URLs. |
| D5 | Dual DB | **One portable Prisma schema**, provider switched by `db:use sqlite\|postgres`. See rules below. |
| D6 | AI (Gemini) | Out of scope for v1. Leave a `src/modules/ai` placeholder. The key stays server-side. |
| D7 | Structure | Rebuild in `server/src` (routes → services → repositories). Shared types in `shared/`. Port seed data to `prisma/seed.ts`, then delete `server/store.ts`. |
| D8 | Production | Final phase covers Postgres migration, Docker, CI and env docs. Hosting target TBD. |

**D5 portable-schema rules**
- No scalar lists (tags use `Tag` + `DropTag` join tables).
- No native enums (status and role are strings validated in code via shared constants).
- No `Json`/`Jsonb` columns (store as `String` if ever needed).
- No raw SQL unless it is portable.
- Migrations are stored per provider (`prisma/migrations/sqlite`, `prisma/migrations/postgresql`).
- Credits are `Int`, never `Float`.

## 3. Current state (2026-10-16)

**Git:** branch `master`, 1 commit (`initial`), `client/.gitignore` modified.

### Client: UI done, runs fully on mocks
- Stack: Vite 8, React 19, Tailwind 4, react-router, socket.io-client, motion, @google/genai.
- Key files: `client/src/App.tsx` (715 lines; all API/socket/SSE calls plus mock fallbacks), `client/src/data/mockApi.ts` (**authoritative game rules**), `client/src/data/dummyData.ts`, `client/src/types/index.ts` (most current domain types).
- The client falls back to mocks whenever `/api/*` fails, so integration can go endpoint by endpoint.
- `vite.config.ts` has no dev proxy for `/api` or `/socket.io` yet.
- `client/package.json` carries server deps (express, dotenv, cookie-parser, tsx).
- `SystemStatus` type still says `mongodb`; it must become `database`.

### Server: effectively empty
- `server/server.ts` is a comment-only stub. `server/package.json` has no deps or scripts. `server/.env.example` still references MongoDB.
- `server/store.ts` (17 KB in-memory prototype) **does not compile**: it imports a nonexistent `../types`.
- Its types are outdated vs the client (no credits, mediaType, correctTitle, trials, expiry, seasons, following).
- It stores plaintext passwords and a hard-coded default session token. Neither carries over.
- Its guess logic (substring match, +50 pts) **conflicts** with the client rules (exact normalized match, $20 stake, +5/−3). Client rules win.
- Its seed data (3 users, 3 drops, leaderboard) is worth porting.
- `server/.env` holds a real-looking `GEMINI_API_KEY` and an obsolete `MONGODB_URI`. It is untracked and gitignored. Keep it that way and never log it.

### Everything else
Database: not started. Tests: none. CI/CD: none.

## 4. API contract (inferred from `client/src/App.tsx`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/system/status` | Health, DB status, socket count |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/register` | Create account (100 credits) |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Clear cookie (new) |
| POST | `/api/auth/switch-user` | **Dev-only** impersonation |
| GET | `/api/users` | List detectives |
| GET | `/api/drops` | List drops (hide `correctTitle` unless solved or owner) |
| POST | `/api/drops` | Create drop and stake bounty |
| POST | `/api/drops/:id/guess` | Submit trial guess (stake, resolve) |
| POST | `/api/drops/:id/vote` | Vote on a candidate |
| POST | `/api/drops/:id/comment` | Post clue comment |
| POST | `/api/drops/:id/comments/:commentId/agree` | Toggle agree |
| GET | `/api/leaderboard` | Leaders + season |
| POST | `/api/season/start` | Reset season (admin) |
| POST | `/api/credits/refill` | Daily +20 (24h cooldown) |
| POST | `/api/credits/purchase` | Stub top-up |
| GET | `/api/scouts/feed` | Followed detectives' activity |
| POST | `/api/scouts/follow` · `/unfollow` | Follow (max 5) / unfollow |
| GET | `/api/analytics/stream` | SSE telemetry (`initial_telemetry`, `telemetry`, `season_reset`) |
| GET | `/api/analytics` | Telemetry snapshot (new) |
| POST | `/api/uploads?kind=image` or `video` | Media upload, multipart field `file` (new) |
| GET | `/api/drops/:id` | One drop (new) |
| GET | `/api/credits/ledger` | Own credit history (new) |

**Socket.IO** (path `/socket.io`): client emits `join_user`, `join_drop`. Server emits `telemetry`, `new_drop`, `guess_result`, `scout_activity`, `credit_update`, `leaderboard_update`.

## 5. Data model (draft, finalized in P1)

Conventions: `cuid()` string ids, `DateTime` timestamps (the DTO layer converts to epoch ms), `Int` credits.

- **User**: id, username, usernameKey (unique, lowercase), handle (unique), passwordHash, role (seeker/detective/curator), isAdmin, avatarUrl, credits, lastDailyRefillAt, points, agentHash, createdAt
- **Follow**: followerId, followingId, createdAt (unique pair; max 5 enforced in service)
- **Drop**: id, dropNumber (unique), uploaderId, mediaType (photo/clip), clipDurationSeconds, imageUrl, imageKey, videoUrl, videoKey, releaseYear, correctTitle, correctTitleKey (normalized), bounty, validityHours, expiresAt, status, solvedById, solvedAt, rewardClaimed, refundedAt, timecode, source, aspectRatioLabel, spectralLabel, fpsLabel, audioStemLabel, audioDuration, targetPropNote, createdAt
- **Tag** / **DropTag**: tag name (unique) and the join table
- **Candidate**: id, dropId, title, normalizedTitle, votes, createdAt (unique `dropId + normalizedTitle`)
- **CandidateVote**: candidateId, userId (unique pair; stops vote spam)
- **Trial**: dropId, userId, guessedTitle, isCorrect, stake, reward, pointsDelta, createdAt (unique `dropId + userId`)
- **Comment** / **CommentAgree**: dropId, authorId, timestampLabel, content / unique `commentId + userId`
- **CreditLedger**: userId, delta, reason (signup/daily_refill/purchase/stake/bounty_stake/reward/refund), refType, refId, balanceAfter, idempotencyKey (unique), createdAt
- **Season** / **SeasonStanding**: seasonNumber (unique), name, startedAt, endsAt, isActive / points, solvedCount, bountyEarned, tier (promoted/safe/demoted)
- **Activity**: actorId, type (posted_clip/answered_clip/rewarded_clip), dropId, message, amount, pointsDelta, createdAt (backs the scouts feed; the viewer's feed is activities whose actor they follow)

**Derived, not stored:** candidate `percentage` and `isLeader`; `uploadedAgo`, `timeAgo` and `timeRemaining` strings; `rank`.

## 6. Business rules (source of truth: `client/src/data/mockApi.ts`)

- Signup credits: **100**. Guess stake: **20**. Daily refill: **+20 every 24h**.
- Points: **+5** correct, **−3** wrong. One trial per user per drop.
- Correct = normalized exact match (lowercase, strip non-alphanumerics) against `correctTitle`.
- Correct payout: stake refund + bounty. The drop becomes `solved`, with `solvedBy` and `solvedAt` set.
- Drop validity: 24–168 h. Clip max: 600 s. The uploader stakes the bounty on create.
- Follow cap: 5. Season: 31 days, top 10 promoted, bottom 10 demoted.
- **Guards:** the uploader can't guess their own drop. Solved or expired drops reject guesses. `correctTitle` is never sent until the drop is solved or expired (except to the uploader). Every credit mutation runs in a DB transaction with an idempotent ledger row.

## 7. Roadmap

### P0: Foundation & cleanup ✅ done
- [x] P0.1 Package layout: `shared/types.ts` is now the single source of types (`client/src/types/index.ts` re-exports it; server imports it type-only via relative path; no path aliases needed). `mongodb` status field renamed to `database` in shared types, client mock and 2 components. Vite `server.fs.allow` widened so the client can read `../shared`
- [x] P0.2 Server deps (argon2 chosen; installs and verifies on this Windows machine; server package is now ESM, tsc NodeNext, so relative imports use `.js`): express, cookie-parser, cors, helmet, zod, jsonwebtoken, argon2 (or bcryptjs), socket.io, multer, dotenv, pino; dev: tsx, typescript, vitest, supertest, @types/*
- [x] P0.3 Scripts: dev (tsx watch), build, start, lint, test. _The `db:*` scripts move to P1.2 because they need Prisma_
- [x] P0.4 Rewrite `.env.example` (PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, COOKIE_SECURE, CLIENT_ORIGIN, STORAGE_DRIVER, S3_*, GEMINI_API_KEY); drop MONGODB_URI
- [x] P0.5 Move server deps out of `client/package.json` once the server runs
- [x] P0.6 Vite dev proxy (also `/media`; target from `VITE_API_TARGET`, default `http://localhost:4000`) for `/api` and `/socket.io` (ws)
- [x] P0.7 Zod-validated config module (`server/src/config/env.ts`); fails fast with a readable list of issues

**Done when:** `npm run dev` boots Express and `GET /api/system/status` returns 200. ✅ **P0 complete (2026-10-16).** Verified: server `lint`, `build` and 2 vitest tests pass; live `curl` returns 200; client `lint` and `vite build` pass after the type move and dependency removal.

### P1: Prisma & dual-database setup ✅ done
- [x] P1.1 Prisma **pinned to 7.10.1** (CLI + client + `adapter-better-sqlite3` + `adapter-pg`). Plain `npm i -D prisma` resolves to an 8.0 release candidate with a different command set, so keep exact versions. Portable `prisma/schema.prisma` written per D5; client generated to `src/generated/prisma` (gitignored; `postinstall` regenerates)
- [x] P1.2 `scripts/db.ts` + npm scripts. The schema's `provider` line is derived from `DATABASE_URL` by `db:sync` (runs before every `db:generate|migrate|deploy|reset`), so the two can't drift. `db:use sqlite` or `db:use -- postgresql <url>` writes `DATABASE_URL` to `.env`. `prisma.config.ts` picks the migrations folder per provider
- [x] P1.3 All 14 models, with the indexes and unique constraints from the data model (the `Notification` model became `Activity`; see section 5)
- [x] P1.4 Migrations: `prisma/migrations/sqlite/…_init` (applied) and `prisma/migrations/postgresql/…_init`. The Postgres SQL was generated with `migrate diff` and executed against a throwaway PGlite Postgres (14 tables, 24 unique indexes)
- [x] P1.5 `prisma/seed.ts` ports the old store.ts data: 9 users (argon2 hashes), 3 drops, 7 candidates, comments, trials, 1 active season, follow, activity, 24 ledger rows. Idempotent, and refuses to run in production without `SEED_FORCE=true`. Dev logins are in the file header
- [x] P1.6 `src/db/client.ts`: singleton `prisma` (adapter chosen from `DATABASE_URL`), `withTx()` interactive-transaction helper, `checkDatabase()`, `disconnectDatabase()`. Also added `src/lib/title.ts` (`normalizeTitle`, mirrors the client) with tests

**Done when:** `db:reset && db:seed` works on SQLite and on a local Postgres with no schema edits. ✅ **P1 complete (2026-10-16).**

**Verification**
- SQLite: migration applied, seed runs, second seed is a no-op, `User.credits == SUM(ledger.delta)` for all 9 users, server `lint` and 5 vitest tests pass.
- Postgres: the same schema and seed ran on PGlite through the `pg` adapter with identical row counts.
- Caveats:
  - `prisma migrate dev` could not talk to PGlite's socket wrapper, which is why the Postgres SQL came from `migrate diff`. Re-confirm with `prisma migrate deploy` on real Postgres in P9.2/P10.1 (Docker was not running, and port 5432 is occupied by an existing local service that I did not touch).
  - `npm run db:reset` is blocked by Prisma's built-in guard when an AI agent invokes it. Run it yourself in a terminal. The `db:seed` path was verified instead.

### P2: Core app skeleton ✅ done
- [x] P2.1 `src/app.ts` (app factory, no listening) and `src/server.ts` (http + Socket.IO bootstrap, graceful shutdown closes sockets, HTTP and the DB). `src/realtime/io.ts` exposes `rooms`, `emitToDrop/User`, `broadcast`, `activeSocketCount`. `join_drop` works; `join_user` is deliberately ignored until P3 binds private rooms to the authenticated cookie (a client-supplied user id must never grant a room)
- [x] P2.2 Middleware: request-id (`X-Request-Id`), pino + pino-http (cookie/authorization redacted, silent in tests, healthz not logged), helmet, CORS (single origin, credentials), JSON limit 100 kb, cookie-parser, global limiter 300 req/min/IP (`createLimiter` factory for stricter per-route limits in P3). New env: `TRUST_PROXY`, `LOG_LEVEL`
- [x] P2.3 `AppError` (400/401/403/404/409/422/429 helpers) and a central handler returning `{ error, code, details?, requestId }`. It also maps malformed JSON to 400, oversized bodies to 413, Prisma P2002 to 409 and P2025 to 404. Unknown errors become 500 without leaking internals in production
- [x] P2.4 `validate({ body, params, query })` with zod 4. It replaces the request values with the parsed ones, including `req.query` (Express 5 makes it read-only, so it is shadowed on the instance). The first issue becomes the readable `error` text
- [x] P2.5 DTO mappers: `toUserDto` (credits, refill clock and scouting list only for the user themself; never the hash), `toDropDto` (`dropInclude(viewerId)` loads only the viewer's own trial), candidate percentages and leader, comments with `userAgreed`, relative-time strings in `src/lib/time.ts`
  - **Answer-leak guard:** `correctTitle` is `''` unless the drop is solved or expired, or the viewer is the uploader or an admin. Open drops past their deadline count as expired even before the expiry job runs
- [x] P2.6 `GET /api/system/status` reports the real database state (503 and `degraded` when the DB is down) and live socket count; `database.modelsLoaded` comes from Prisma. Added `GET /api/healthz` (liveness, no DB)

**Done when:** a supertest suite passes for health, 404, validation error and error-handler shapes. ✅ **P2 complete (2026-10-16).**

**Verification:** server `lint` clean; 29 vitest tests pass (error and validation shapes, 429 limiter, status/health, time helpers, DTO answer-hiding and per-viewer trial/credit visibility). Live run: status 200 with `database.status: connected`, `X-Request-Id` and `RateLimit` headers present, Socket.IO handshake OK, CORS only echoes the configured origin. The signal-based graceful shutdown was not exercised on Windows (processes were force-killed); re-check in P10.5.

### P3: Auth & users ✅ done
- [x] P3.1 `POST /api/auth/register` (201 `{ user }`): username 3-20 of `[A-Za-z0-9_]`, case-insensitively unique via `usernameKey`; password 8-128 chars, hashed with argon2id; role `seeker|detective` (default `detective`); the 100 signup credits go through the ledger in the same transaction. **`role: "curator"` is rejected with 403** (the current client UI offers it; see "client follow-ups" below)
- [x] P3.2 `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Session = HS256 JWT (`sub` = user id) in the `tp_session` cookie: httpOnly, SameSite=Lax, `secure` in production, lifetime `JWT_EXPIRES_IN`. Every request re-loads the user, so deleted accounts are logged out immediately and expired/tampered/`alg:none` tokens are rejected
- [x] P3.3 `attachUser` (optional), `requireAuth`, `requireRole(...)` (admins pass), `requireAdmin` in `src/middleware/auth.ts`
- [x] P3.4 `POST /api/auth/switch-user` exists only when `NODE_ENV=development`; in any other mode the route is not mounted (404)
- [x] P3.5 `GET /api/users`: sorted by points, ranks from the active season; credits, refill clock and scouting list are visible only on the caller's own entry. Requires a session, except in development where the pre-login demo-agent picker needs it
- [x] P3.6 Login limiter (10 failed attempts per 15 min per IP; successful logins don't count) and register limiter (10/hour/IP). Unknown user and wrong password return the identical 401 and both burn one argon2 verification (no enumeration by message or timing)
- [x] Socket auth: the Socket.IO handshake verifies the session cookie; authenticated sockets auto-join `user:<id>`. A client-sent `join_user` is ignored, so forged or anonymous sockets can never read someone's private room
- [x] `userStatsService`: rank, weekly identifications, accuracy, bounty earned, pending locks, uploads, submissions received and scouting list, via a fixed number of grouped queries. `consensusLeadCount` and `tierStanding` stay 0/unset until P7
- [x] `npm run admin:grant -- <username> [--revoke]` (see Q4)

**Done when:** register → me → logout → login flow tested; client AuthPage works against real API. Server side ✅ **P3 complete (2026-10-16).** Client wiring of the real flow is P8.2.

**Verification:** `lint` clean; 60 vitest tests pass (auth: validation matrix, duplicate names, role rules, token attacks, deleted user, role guards, dev-only switch; sockets: private-room isolation, forged cookie, drop rooms; credits: see P4). Live run against the dev DB: bad login 401, login sets an HttpOnly cookie, `/me` works with it, `/users` ranks match the seed, `switch-user` reachable in dev. Tests now build a fresh SQLite DB from the real migrations (`tests/globalSetup.ts`) and run files serially.

**Client follow-ups discovered (all P8):**
- AuthPage offers "Archival Curator (Admin)" at signup; remove that option (the server refuses it).
- AuthPage's "Demo Agents (any password)" panel is a mock feature: real login needs the real password, and the panel's user list only loads pre-login in development.
- `handleLogout` only clears local state; it must call `POST /api/auth/logout`.
- The user-switcher should be hidden outside development.

### P4: Credits ledger ✅ done
- [x] P4.1 `applyCredit(tx, { userId, delta, reason, idempotencyKey, ref })` in `src/services/creditService.ts`: guarded `UPDATE ... WHERE credits >= amount` so concurrent spends can't overdraw, ledger row with `balanceAfter`, idempotent replay, rejects key reuse for a different change. The seed now uses it too, so it is the only code path that changes balances
- [x] P4.2 `POST /api/credits/refill`: +20 per 24 h. The cooldown check is part of the `UPDATE` itself, so six simultaneous claims yield exactly one grant. An early claim returns **429** `REFILL_NOT_READY` with `details.nextRefillAt` / `retryAfterMs` and a `Retry-After` header. A claim exactly at 24 h succeeds
- [x] P4.3 `POST /api/credits/purchase` (stub, body `{ packageId, amount? }`): the server maps `tier_20|tier_50|tier_100` to 20/50/100 credits and only cross-checks the client's `amount` (mismatch = 400). Optional `Idempotency-Key` header makes retries apply once. **Gated by `ALLOW_FAKE_PURCHASES`** (defaults on outside production, off in production): when off the endpoint answers 503 `PAYMENTS_DISABLED`, because a free stub would otherwise let anyone mint credits. Rate limited to 30/hour/IP. Stripe replaces `purchaseCredits()` later
- [x] P4.4 Invariant tests (see below)
- [x] P4.5 `credit_update { credits }` is emitted to the owner's private room **after** the transaction commits; failed claims emit nothing
- [x] Extra: `GET /api/credits/ledger?limit=` returns the caller's own history, newest first (not used by the client yet; handy for a future statement view)

**Done when:** concurrent refill/guess tests cannot double-spend or double-claim. ✅ **P4 complete (2026-10-16)** for refill/purchase/ledger. The guess-side concurrency test belongs to P6.1.

**Verification:** `lint` clean; 74 vitest tests pass in total. P4-specific: first claim, 429 with retry info, 24 h boundary (claim at 23 h 59 m refused, at 24 h allowed), 6 parallel claims = 1 grant, each package, forged/missing/negative amounts, idempotent retry, 503 when disabled, ledger isolation between users, socket push only to the owner. Plus the earlier credit-service tests (8 concurrent spends against 100 credits = exactly 3 successes, ledger sum always equals balance). Live: anonymous refill 401, mismatched purchase 400, ledger readable. The real refill/purchase mutations were not run against the seeded dev DB, to keep its balances untouched.

### P5: Drops, media upload & storage ✅ done
- [x] P5.1 `StorageAdapter { put, delete, exists, publicUrl }` with `LocalDiskAdapter` (served from `/media`, immutable caching, range requests, cross-origin-readable) and `S3CompatibleAdapter` (AWS S3 / R2 / MinIO). Storage keys are strictly shaped (`u/<userId>/<24 hex>.<ext>`) so they can never traverse out of the media root; local `put` never overwrites. DTOs build media URLs from the key at read time, so a CDN or base-URL change never leaves stale URLs in the DB. New env: `PUBLIC_BASE_URL`
- [x] P5.2 `POST /api/uploads?kind=image|video` (multipart, field `file`, auth required, 60/hour/IP): type decided by **magic bytes** (PNG/JPEG/WebP images, MP4 video; the declared name and mime are ignored and the server picks the extension), size limits (10 MB image, 100 MB clip), clip length read from the MP4 `moov/mvhd` header in pure JS (no ffprobe needed; handles v0/v1 headers, moov-at-end files and 64-bit boxes) and **rounded up** against the 600 s cap, max 20 unused uploads per user per 24 h, temp files always removed. New `Upload` table (migration `add_uploads` for both providers) records owner, kind, size, duration and the drop that claims it
- [x] P5.3 `POST /api/drops` (201 `{ drop, user }`): validates 24-168 h validity, bounty 20-10,000 (whole credits), year, tags (normalized to lowercase `[a-z0-9_]`, max 10). Media is referenced by **`imageKey` (+ `videoKey` for clips)** and must be uploads this user made that no other drop has claimed; the clip length comes from the stored upload, not the request. One transaction: stake via `applyCredit('bounty_stake')`, create drop, tags, claim uploads (guarded `dropId IS NULL`), activity row. Insufficient credits aborts everything (drop, charge and upload claim all roll back)
- [x] P5.4 `GET /api/drops` (public; answers hidden except for the uploader/admins): filters `status=all|open|solved|expired` (open drops past their deadline already count as expired), `mine=true`, `tag=`; newest-first cursor pagination (`limit` 1-100, `nextCursor`); the caller's own trial is included. `GET /api/drops/:id` added. `detectivesExamining` is the live count of sockets in the drop's room
- [x] P5.5 Expiry job (`expireOverdueDrops`, runs on boot and every 60 s): closes overdue drops and refunds the bounty in full (Q1) via `applyCredit('refund')`. The refund is claimed by a guarded `refundedAt IS NULL` update plus a fixed idempotency key, so concurrent or repeated sweeps pay out once. It also heals a drop that is already `expired` but was never refunded
- [x] P5.6 `new_drop` is broadcast to everyone (answer hidden) and the uploader gets `credit_update` after commit

**Done when:** client DropMysteryModal creates a drop end to end and it appears in ActiveRadarQueue. Server side ✅ **P5 complete (2026-10-16)**; the client still posts `blob:`/data URLs, so the end-to-end check waits for P8.

**Verification:** `lint` clean; 137 vitest tests pass in total. P5-specific: MP4 parser against v0/v1/moov-last/64-bit/truncated/garbage files; sniffing (including a script renamed `.png`, SVG, GIF); local and S3 adapters (S3 against a fake client); uploads (all image types served back with correct headers, range requests, size and length limits, 600 s boundary, rounding, temp-file cleanup, per-user cap, no path escape); drops (staking and ledger, insufficient credits leaves no trace, stolen/reused/forged keys, 4 concurrent creates with one upload = 1 drop and 1 charge, media-kind checks, 9 invalid-input cases, `new_drop` payload contains no answer); listing (answer visibility per viewer, every filter, pagination without gaps or repeats, own-trial only); expiry (refund once, concurrent sweeps, batches, self-healing). Live run against the dev DB: seeded drops list with the answer hidden, `status=solved` reveals it, the uploader sees their own answer. Real uploads/creates were not run against the seeded dev DB.

**Not verified / deferred:**
- The S3 adapter has only been tested against a fake client. Run it against a real bucket (R2/S3) in P10.4.
- Uploads that are never attached to a drop stay in storage and in the `Upload` table (capped at 20 per user per day). A cleanup job that deletes unattached uploads older than ~24 h belongs in P10.
- The MP4 length is container metadata: a hostile file could understate its length. Accepted for now; revisit in P9.3.
- The seed's media URLs still point at the client's `/src/assets/...` files (no `imageKey`), which the DTO passes through unchanged.

**Client follow-ups discovered (all P8):**
- Upload flow: for each drop, `POST /api/uploads?kind=image` (and `kind=video` for clips) first, then send `imageKey` / `videoKey` in `POST /api/drops`. The clip poster frame must be uploaded as its own image (it is currently sent as a data URL).
- The client accepts only `.png` photos and `.mp4` clips at 100 MB; the server also accepts JPEG/WebP and has the same 100 MB clip cap.
- `POST /api/drops` ignores the client's `imageUrl`, `videoUrl` and `clipDurationSeconds`.
- `loadData` runs once at mount, so after a fresh login the drop list is not reloaded; reload it when the user changes.

### P6: Guessing, voting, comments (game loop) ✅ done
- [x] P6.1 `POST /api/drops/:id/guess` (`{ title }` -> `{ drop, isCorrect, user }`): one transaction does stake (`applyCredit('stake')`, -20) -> trial -> candidate upsert + the user's vote -> (correct: guarded solve + `reward` of stake + bounty) -> points -> activity. Correct = normalized title equals the stored `correctTitleKey` (case and punctuation ignored). **Wrong stakes are burned (Q2).** Refused with 403 for the uploader, 409 for solved/expired drops (a drop past its deadline counts even before the sweeper runs) and for a second guess, 422 when the stake can't be paid (nothing is written), 400 for blank/symbol-only/over-long titles. If two people answer correctly at the same instant exactly one wins; the other transaction rolls back and is never charged. Collisions on unique rows (same new title typed at once) retry the whole transaction
- [x] P6.2 `POST /api/drops/:id/vote` (`{ candidateId }` -> `{ drop }`): free; **one vote per user per drop**, so voting for another candidate moves the vote; idempotent for the one you already back; the uploader cannot vote; a guess **is** a locked vote and can't be moved by voting elsewhere (guessing after voting moves the vote to the guessed title). `Candidate.votes` always equals the number of voters. Drop status follows the crowd via `consensusStatus` (`src/lib/consensus.ts`, Q3): `high_consensus` = leader >= 60% of >= 10 votes; `tense_consensus` = top two within 15 points (inclusive); fewer than 3 votes is always `unsolved` (my addition so a first 1-1 split doesn't flip the status)
- [x] P6.3 `POST /api/drops/:id/comment` (`{ content, timestamp? }` -> `{ comment }`, content 1-1000 chars, timestamp like `01:12`, allowed on solved drops too) and `POST /api/drops/:id/comments/:commentId/agree` (toggle, returns `{ comment }` with `userAgreed`; you cannot agree with your own comment; a comment from another drop is a 404)
- [x] P6.4 Realtime: `guess_result` (client's existing handler) and `consensus_update` go to the drop room with candidates, status and totals and **never the answer or the guessed title**; `new_comment` to the drop room; `credit_update` to the guesser only
- [x] P6.5 Activity rows: `answered_clip` / `rewarded_clip` (`posted_clip` was added in P5). Season standing (`points`, `solvedCount`, `bountyEarned`) and lifetime `User.points` are updated in the same transaction as the trial; points floor at 0
- [x] P6.6 Tests (below)

**Done when:** two users can play a full drop lifecycle in a test and balances/points reconcile. ✅ **P6 complete (2026-10-16).**

**Verification:** `lint` clean; 174 vitest tests pass in total (31 new gameplay tests plus a 6-case consensus-boundary suite). Covered: wrong and correct payouts against the ledger, season standing, one-guess-per-user including 5 simultaneous submits (charged once), two simultaneous correct answers (one winner, loser uncharged), four simultaneous guesses of the same new title (one candidate with 4 votes), every refusal, credit conservation (accounts + burned stakes = starting total, and every balance equals its ledger sum), tense-status transitions, vote add/idempotency/move/lock, votes == voters under concurrent moves, comment validation, agree toggling and its edge cases, and the socket events including answer-leak checks.

**Performance fix found while testing:** SQLite's default journaling took about **284 ms per small write transaction** on this Windows machine versus **2.3 ms** in WAL mode. `src/db/client.ts` now applies `journal_mode=WAL`, `synchronous=NORMAL` and `busy_timeout=5000` for SQLite (no-op on PostgreSQL); the server awaits it before listening and the test DB is created in WAL mode. The whole suite dropped from about 175 s to 18 s. This closes the open "SQLite WAL / busy-timeout tuning" item. `*.db-wal` and `*.db-shm` are git-ignored. Ranks are also computed with two count queries per user instead of loading every user (large lists still use one ordered scan).

**Known gaps / notes:**
- `consensusLeadCount` on the user DTO is still 0 (P7).
- Seeded drop `#8911` keeps its seeded `tense_consensus` until the next vote or guess recomputes it.
- A comment can still spoil the answer; there is no moderation yet (P9.3).
- The real guess/vote/comment calls were not run against the seeded dev DB (they would spend seeded users' credits); the live check covered auth gating only.

**Client follow-ups (all P8):**
- `handleGuessSubmit` merges `data.user` into the current user; that still works because the server returns the full self DTO.
- The client can now listen for `consensus_update` and `new_comment` (not handled yet) to keep the bars and comment list live without re-fetching.
- `guess_result` now also carries `candidates`, `status`, `totalGuessesCast`; the client's handler ignores the extras.

### P7: Leaderboard, seasons, scouting, analytics ✅ done
- [x] P7.1 `GET /api/leaderboard` (public, `{ leaderboard, season }`): the active season's top 100 by points, ties broken by account age and sharing a competition rank; badges (👑🥈🥉 then `#n`), `weeklyDelta` ("+N this week" from the last 7 days of trials), `bountyEarnedTotal`, `solvedCount`, `isCurrent` for the signed-in viewer only. **Tiers** (`src/lib/tiers.ts`): promoted = rank <= 10 (a tie at the cut-off promotes everyone tied), demoted = the last 10 positions but never anyone tied with a safe player, and with few players everyone is promoted before anyone is demoted
- [x] P7.2 `POST /api/season/start` (admin, `{ durationDays }` 1-366, default 31): one transaction closes the active season (guarded `UPDATE`, writes every participant's final `SeasonStanding.tier`) and opens the next; returns 201 `{ season, leaders: [] }`. Two simultaneous rollovers leave exactly one active season. **Refuses with 409 if the current season started under a minute ago**, so a double-click can't wipe a fresh season
- [x] P7.3 Automatic season management: Season 1 is created on boot if none exists, and a 60 s job rolls over a season whose end date has passed (`checkSeason`). Rollover and `leaderboard_update` go out over Socket.IO, and `season_reset { season, leaders }` over SSE. Guesses trigger a coalesced `leaderboard_update` (at most one per 2 s)
- [x] P7.4 Scouting: `POST /api/scouts/follow` and `/unfollow` (`{ handle }`, with or without `@`, any case; both return `{ user }`; follow is idempotent; cap 5 enforced under concurrency by locking the follower row first; cannot follow yourself), `GET /api/scouts/feed` (`{ activities }`: what the people I scout did, newest first). Followers get a private `scout_activity` event when a scouted detective posts a drop or guesses (never including what was guessed)
- [x] P7.5 Real telemetry from the database (cached 5 s): open drops, recognition rate (solved / closed), guesses today (UTC), guesses per minute over 10 min, live socket count, top 4 tags as genres, 12 hourly activity buckets. `GET /api/analytics` and the public SSE stream `GET /api/analytics/stream` (`initial_telemetry`, then `telemetry` every 5 s, `season_reset`; one shared timer that stops when nobody listens, 500-client cap, keep-alive pings, closed on shutdown)
- [x] Profile stats completed: `consensusLeadCount` (open drops where the user's guess is the current or tied leader) and `tierStanding` (tier in the most recently closed season)

**Done when:** client Leaderboard, Scouting hub and Telemetry HUD run on live data with no mock fallback triggered. Server side ✅ **P7 complete (2026-10-16)**; the client check waits for P8.

**Verification:** `lint` clean; **217 vitest tests pass, six consecutive full runs with no failures**. P7-specific: tier assignment (competition ranks, tie at promotion cut-off, tie across the demotion boundary, 12 and 25 players); leaderboard (ordering, badges, viewer flag, tie-break, real play moving a player to #1, 10/5/10 tier split); season start (admin only, tiers recorded, custom and invalid durations, double-click guard, concurrent rollovers); automatic creation and rollover; follow/unfollow (handle forms, idempotency, cap 5 including 8 simultaneous follows, self/unknown/blank); feed filtering and copy; private `scout_activity` push that non-followers do not receive; telemetry (shape, real counts, recognition-rate math, genres, hourly buckets, cache); SSE (headers, initial + tick events, disconnect cleanup, `season_reset`). Live run against the dev DB: seeded leaderboard renders with ranks, badges and tiers; analytics returns real numbers; the SSE stream delivers `initial_telemetry` then `telemetry`; NeonVagrant's feed shows the seeded solve.

**Bug found by the flaky run and fixed:** `GET /api/users` returns the top 200 by points, so once the test database passed 200 users a brand-new account fell off its own list (it also meant a real user outside the top 200 would be missing, along with the detectives they scout). The endpoint now always includes the caller and everyone they scout; a regression test pushes both below 205 higher-ranked users.

**Notes:**
- The client's SSE handlers for `guess_submitted`, `new_drop_created`, `vote_recorded` and `user_credited` belong to the old design; the real server sends those updates over Socket.IO (`guess_result`, `consensus_update`, `new_drop`, `credit_update`, `new_comment`, `scout_activity`, `leaderboard_update`) and only telemetry plus `season_reset` over SSE.
- `leaderboard_update` carries the board without a viewer, so `isCurrent` is absent; the client should mark the current user by handle.
- Lifetime `User.points` is unaffected by season rollovers; only standings are per season.

### P8: Client integration & cleanup ✅ done
- [x] P8.1 Every `fetch`/socket/SSE call in `App.tsx` was checked against the real server and **driven in a real browser** (Edge, two simultaneous sessions) against an isolated server and scratch database. The real-API code paths had never run before (`OFFLINE_MODE` was hard-coded `true`), and several needed fixes: the socket reconnected on every drop selection (now only on login/logout, with a separate join/leave of the drop room); data loaded once at mount (now reloads when the signed-in user changes, which also restores a session from the cookie on refresh); the POST response and the socket push could both add the same drop or comment (both now dedupe by id); the SSE effect re-subscribed on every credit change (now once)
- [x] P8.2 Auth: signup no longer offers "Archival Curator" (server refuses it anyway); logout calls `POST /api/auth/logout` and verified that `/dashboard` is unreachable afterwards; the demo-agents panel is mock-only; the quick-switch roster is development-only and no longer shows other people's balances; admin controls follow the server's `isAdmin` (new optional field on the user DTO, sent only to the user themself) instead of `role === 'curator'`
- [x] P8.3 `VITE_USE_MOCKS=true` runs the whole UI on the built-in demo data with **zero** server calls (verified: login with any password, simulated guess); the default is the real API, so failures now surface instead of silently showing fake data. Flag, dev-only switcher gate and admin check live in `client/src/config.ts`
- [x] P8.4 Deleted `server/store.ts` and the empty `server/server.ts`; no MongoDB references remain in code
- [x] P8.5 `server/src/modules/ai/index.ts` placeholder (documents the intended `/api/ai/deconstruct`, server-side key, auth and no-answer rules); nothing imports it
- [x] Drop creation now uploads first: the video, then the poster frame extracted in the browser (video first, so a refused clip stores nothing), then `POST /api/drops` with the keys. Verified with real H.264 clips: the video plays from `/media` and reports its true 3.2 s duration
- [x] Errors are visible: fire-and-forget actions (vote, agree, scout) show a toast with the server's reason ("You cannot play your own drop"); the season-reset buttons show the double-click refusal inline; the drop modal shows upload errors
- [x] New users get a default avatar (`/default-avatar.jpg`, served by the client) instead of an empty `src`

**Done when:** client runs against the real server with mocks disabled. ✅ **P8 complete (2026-10-16).**

**Browser verification (Edge, two sessions, isolated server + scratch DB)** — all passed:
- Auth: wrong password shows the server error; register lands on the dashboard; logout clears the session; a reload restores it; a non-admin never sees the season control.
- Play: stake charged ($2100 → $2080), wrong guess acknowledged; **the second browser sees the new candidate, the comment and the vote count appear without reloading**; agree toggles; daily refill claimed; a solve pays the bounty ($2100 → $2200) and the uploader's browser flips to solved live.
- Drops: a photo drop and a real clip drop created through the upload flow; images and video served from `/media/u/<user>/...`; the second browser receives `new_drop` live; the answer is absent from every API payload while the drop is open.
- Admin: new season started, pushed to the second browser over SSE; an immediate second start is refused with a readable message.
- Mock mode: works offline with no `/api` calls.
Screenshots of each step were inspected. The only console errors were the expected 401s from anonymous `auth/me` checks and the intentional 409/422 refusals.

**Real-world file finding (fixed):** with an actual encoder (ffmpeg) standard MP4s parse correctly whether `moov` is first or last, but a **fragmented MP4** (screen recorders, browser `MediaRecorder`) has a zero header duration and was rejected with a vague message. It is now detected and the user is told to re-save it as a standard MP4. Supporting fragmented files would need summing per-fragment sample durations; deferred unless users hit it. Three small real ffmpeg files are kept in `server/tests/fixtures/` as regression fixtures.

**Known limitations / follow-ups:**
- Headless Edge cannot encode H.264, so the clip test used ffmpeg-made files, not a recording made in the browser.
- The `/api/auth/me` and `scouts/feed` 401s on the anonymous first load show as console noise (the feed is no longer requested when logged out; `me` must stay 401 for the tests and clients).
- A failed drop creation can leave its (already uploaded) files unattached; the per-user cap of 20 per day applies, and a cleanup job is planned for P10.
- Toasts reuse the scout-alert toast component; duplicates can appear for follow/unfollow failures inside the Scouting Hub (inline error plus toast).
- The client has no automated tests; the browser scripts used here were throwaway and are not in the repo (see P9.1).

### P9: Hardening & testing _(needs P8)_
- [ ] P9.1 vitest unit (services), supertest integration on a temp SQLite file per run, socket.io-client tests
- [ ] P9.2 Run the integration suite against Postgres in CI (D5 parity check)
- [ ] P9.3 Security pass: rate limits, upload validation, CSRF stance (sameSite + origin check), helmet, input limits, secrets scan
- [ ] P9.4 Load-sanity test of the guess endpoint for races
- [ ] P9.5 API docs (OpenAPI, or `docs/api.md` from the zod schemas)

**Done when:** CI is green on SQLite and Postgres and the security checklist is signed off.

### P10: Production readiness _(needs P9)_
- [ ] P10.1 `db:use postgres` and the `prisma migrate deploy` workflow; document data-safe steps
- [ ] P10.2 Multi-stage Dockerfile and docker-compose with local Postgres
- [ ] P10.3 GitHub Actions: lint, typecheck, test (sqlite + postgres), build
- [ ] P10.4 S3-compatible bucket config, CORS, signed/public URL policy
- [ ] P10.5 Structured logs, `/healthz` and `/readyz`, graceful shutdown, error-reporting hook
- [!] P10.6 Choose hosting target and write the deploy runbook (**blocked: needs host decision**)

## 8. Open questions

Defaults will be used unless overridden.

| ID | Needed before | Question | Proposed default |
|---|---|---|---|
| Q1 | P5 | ~~Refund on expiry?~~ | **Resolved (default): full refund** via the ledger, exactly once |
| Q2 | P6 | ~~Where do wrong-guess stakes go?~~ | **Resolved (default): burned** |
| Q3 | P6 | ~~Consensus thresholds?~~ | **Resolved (default + one addition):** high = leader >= 60% of >= 10 votes; tense = top two within 15 points; below 3 votes always unsolved |
| Q4 | P3 | ~~How is the first admin created?~~ | **Resolved: CLI.** `npm run admin:grant -- <username>` (not an env var, because an env var naming a not-yet-registered user would give admin to whoever registers it first). The dev seed already makes `Deckard_Lens` admin |
| Q5 | P3 | ~~argon2 or bcryptjs?~~ | **Resolved: argon2** (installed and verified on this machine) |
| Q6 | P3 | ~~Are roles promoted automatically or assigned manually?~~ | **Resolved by the client's rule:** role is chosen at signup (`seeker`/`detective`) and fixed ("cannot be changed later" in AuthPage). `curator` is admin-granted only. No auto-promotion. Revisit if you want season-based role changes |
| Q7 | P5 | ~~Upload limits?~~ | **Resolved to match the client:** image 10 MB (PNG/JPEG/WebP), clip 100 MB (MP4 only) |

## 9. Risks

| Risk | Mitigation |
|---|---|
| SQLite/Postgres drift (case sensitivity, locking, isolation) | Portable-schema rules (D5), explicit `normalizedTitle`, CI on both |
| Race conditions on credits and guesses | Interactive transactions, unique constraints, idempotency keys, concurrency tests |
| Answer leakage (`correctTitle` in responses) | DTO layer is the only serializer; contract test asserts the field is absent for non-owners |
| Client/server type drift (already happened in `store.ts`) | Single `shared/` types package; DTOs typed against it |
| Gemini key in `server/.env` | Keep gitignored (verified), never log, rotate if ever committed or shared |
| Silent mock fallback hides integration bugs | P8.3 makes mocks opt-in |

## 10. Next action

**Phase P9** (hardening and testing). Suggested order:
1. **P9.1 / P9.2 test infrastructure:** run the existing suite against PostgreSQL as well (Docker was not running earlier and port 5432 is used by another local service, so use a throwaway container on another port, or ask the user for a connection string); consider turning the browser scenarios from P8 into a small committed Playwright suite (needs a decision: it adds a dev dependency and relies on an installed browser, here Edge).
2. **P9.3 security pass:** CSRF stance for the cookie session (SameSite=Lax plus an `Origin` check on state-changing requests), upload hardening review (hostile MP4 lengths, decompression-style abuse of images), comment spam/spoiler moderation, helmet/CSP review for the served `/media`, a secrets scan, and a look at the leaked-answer surface once more.
3. **P9.4:** load-sanity test of the guess endpoint.
4. **P9.5:** API docs generated from the zod schemas.

Then **P10** (production readiness: Postgres migration workflow, Docker, CI, real S3 bucket test, unattached-upload cleanup job, structured logs/readiness probe, hosting runbook; the host is still undecided).

Other notes carried over:
- Tests share `test.db`, run serially, use unique usernames; the suite builds a fresh WAL-mode DB from the real migrations (about 20 s for 223 tests).
- The S3 adapter is only tested against a fake client (P10.4).
- Signal-based graceful shutdown was never exercised on Windows (P10.5).
