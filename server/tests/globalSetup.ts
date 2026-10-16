import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/** Builds a fresh SQLite test database from the real migration files before the suite runs. */
export default function setup() {
  const root = path.resolve(import.meta.dirname, '..');
  const dbPath = path.join(root, 'test.db');
  for (const suffix of ['', '-wal', '-shm', '-journal']) fs.rmSync(dbPath + suffix, { force: true });

  fs.rmSync(path.join(root, 'test-uploads'), { recursive: true, force: true });

  const migrationsDir = path.join(root, 'prisma', 'migrations', 'sqlite');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // persisted in the file; keeps the suite fast (see src/db/client.ts)
  for (const dir of fs.readdirSync(migrationsDir).filter((d) => fs.statSync(path.join(migrationsDir, d)).isDirectory()).sort()) {
    db.exec(fs.readFileSync(path.join(migrationsDir, dir, 'migration.sql'), 'utf8'));
  }
  db.close();
}
