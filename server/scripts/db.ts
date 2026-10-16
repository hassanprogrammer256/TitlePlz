/**
 * DB provider helper.
 *   tsx scripts/db.ts sync                        -> set schema provider from DATABASE_URL
 *   tsx scripts/db.ts use sqlite|postgresql [url] -> write DATABASE_URL to .env, then sync
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const envPath = path.join(root, '.env');

type Provider = 'sqlite' | 'postgresql';
const providerFromUrl = (url: string): Provider => (url.startsWith('file:') ? 'sqlite' : 'postgresql');

function setSchemaProvider(provider: Provider) {
  const src = fs.readFileSync(schemaPath, 'utf8');
  const re = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")(\w+)(")/;
  if (!re.test(src)) throw new Error('datasource provider line not found in schema.prisma');
  const next = src.replace(re, `$1${provider}$3`);
  if (next !== src) {
    fs.writeFileSync(schemaPath, next);
    console.log(`[db] schema provider -> ${provider}`);
  } else {
    console.log(`[db] schema provider already ${provider}`);
  }
}

function setEnvVar(key: string, value: string) {
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(existing) ? existing.replace(re, line) : `${existing.replace(/\n*$/, '\n')}${line}\n`;
  fs.writeFileSync(envPath, next);
}

const [cmd, arg, urlArg] = process.argv.slice(2);

if (cmd === 'sync') {
  setSchemaProvider(providerFromUrl(process.env.DATABASE_URL ?? 'file:./dev.db'));
} else if (cmd === 'use') {
  if (arg !== 'sqlite' && arg !== 'postgresql') {
    console.error('usage: db:use <sqlite|postgresql> [database-url]');
    process.exit(1);
  }
  const url = urlArg ?? (arg === 'sqlite' ? 'file:./dev.db' : process.env.DATABASE_URL);
  if (!url || providerFromUrl(url) !== arg) {
    console.error(
      arg === 'postgresql'
        ? 'postgresql needs a URL: npm run db:use -- postgresql postgresql://user:pass@host:5432/db'
        : `URL "${url}" does not match provider ${arg}`,
    );
    process.exit(1);
  }
  setEnvVar('DATABASE_URL', url);
  setSchemaProvider(arg);
  console.log('[db] .env DATABASE_URL updated. Run `npm run db:generate`.');
} else {
  console.error('usage: tsx scripts/db.ts <sync|use>');
  process.exit(1);
}
