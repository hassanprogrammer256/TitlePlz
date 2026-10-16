import { config } from '../config/env.js';
import { LocalDiskAdapter } from './localAdapter.js';
import { S3CompatibleAdapter } from './s3Adapter.js';
import type { StorageAdapter } from './types.js';

let adapter: StorageAdapter | undefined;

export function getStorage(): StorageAdapter {
  adapter ??=
    config.STORAGE_DRIVER === 's3'
      ? new S3CompatibleAdapter({
          bucket: config.S3_BUCKET!,
          publicUrl: config.S3_PUBLIC_URL!,
          endpoint: config.S3_ENDPOINT,
          region: config.S3_REGION,
          accessKeyId: config.S3_ACCESS_KEY_ID!,
          secretAccessKey: config.S3_SECRET_ACCESS_KEY!,
        })
      : new LocalDiskAdapter(config.LOCAL_MEDIA_DIR, config.PUBLIC_BASE_URL);
  return adapter;
}

/** Test seam. */
export function setStorageForTests(next: StorageAdapter | undefined) {
  adapter = next;
}

export type { StorageAdapter, StoredObject } from './types.js';
