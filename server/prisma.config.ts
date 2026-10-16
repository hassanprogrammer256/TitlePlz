import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url = process.env.DATABASE_URL ?? 'file:./dev.db';
const provider = url.startsWith('file:') ? 'sqlite' : 'postgresql';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Separate migration histories per provider (SQL differs between dialects).
  migrations: {
    path: `prisma/migrations/${provider}`,
    seed: 'tsx prisma/seed.ts',
  },
  datasource: { url },
});
