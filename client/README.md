<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/6e416285-6b6a-446a-a6aa-d2dc1996b51e

## Run Locally

**Prerequisites:** Node.js 22+ (developed on Node 24).

The app talks to the backend in `../server` (Express + Prisma, SQLite in development).

1. Start the backend (in `server/`):
   - `npm install`, copy `.env.example` to `.env` and set `JWT_SECRET` (32+ characters)
   - `npx prisma migrate deploy` then `npm run db:seed` (demo accounts are listed at the top of `prisma/seed.ts`)
   - `npm run dev` (listens on http://localhost:4000)
2. Start the client (in `client/`):
   - `npm install`
   - `npm run dev` (Vite proxies `/api`, `/media` and `/socket.io` to the backend; override the target with `VITE_API_TARGET`)

**No backend?** Set `VITE_USE_MOCKS=true` (for example in `.env.local`) to run the whole UI on built-in demo data, with no server calls.

The Gemini key is **server-side only** and is not used by the client. See `../server/docs/project_progress.md` for the backend roadmap.
