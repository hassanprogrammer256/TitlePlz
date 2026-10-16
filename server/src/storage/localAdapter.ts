import fs from 'node:fs/promises';
import path from 'node:path';
import { isValidKey } from './keys.js';
import type { StorageAdapter, StoredObject } from './types.js';

export class LocalDiskAdapter implements StorageAdapter {
  readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicBase = '',
  ) {
    this.root = path.resolve(rootDir);
  }

  /** Keys are validated against a strict pattern AND resolved inside root, so `..` can never escape. */
  private resolve(key: string): string {
    if (!isValidKey(key)) throw new Error(`Invalid storage key "${key}"`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Storage key escapes root: "${key}"`);
    return full;
  }

  async put(key: string, source: StoredObject): Promise<void> {
    const dest = this.resolve(key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(source.filePath, dest, 1 /* COPYFILE_EXCL: never overwrite */);
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  publicUrl(key: string): string {
    this.resolve(key); // validates
    return `${this.publicBase.replace(/\/+$/, '')}/media/${key}`;
  }
}
