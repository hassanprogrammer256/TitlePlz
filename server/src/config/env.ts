import 'dotenv/config';
import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0), // number of reverse-proxy hops in front of the app
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

    DATABASE_URL: z.string().min(1).default('file:./dev.db'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/, 'use a number plus s, m, h or d (e.g. 7d)').default('7d'),
    COOKIE_SECURE: bool.optional(),

    // The purchase endpoint is a stub that grants credits for free. Never enable it against real users.
    ALLOW_FAKE_PURCHASES: bool.optional(),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    LOCAL_MEDIA_DIR: z.string().default('./uploads'),
    PUBLIC_BASE_URL: z.string().url().optional(), // prefix for local media URLs; relative `/media/...` when unset
    S3_ENDPOINT: z.string().url().optional(),
    S3_REGION: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_PUBLIC_URL: z.string().url().optional(),

    GEMINI_API_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_DRIVER === 's3') {
      for (const key of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const) {
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required when STORAGE_DRIVER=s3` });
      }
    }
  });

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    console.error(`Invalid environment configuration:\n${lines.join('\n')}`);
    process.exit(1);
  }
  const env = parsed.data;
  const provider = env.DATABASE_URL.startsWith('file:') ? ('sqlite' as const) : ('postgresql' as const);
  return {
    ...env,
    isProd: env.NODE_ENV === 'production',
    isDev: env.NODE_ENV === 'development',
    cookieSecure: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    allowFakePurchases: env.ALLOW_FAKE_PURCHASES ?? env.NODE_ENV !== 'production',
    dbProvider: provider,
  };
}

export const config = load();
export type Config = typeof config;
