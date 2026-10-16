import { createReadStream } from 'node:fs';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { isValidKey } from './keys.js';
import type { StorageAdapter, StoredObject } from './types.js';

type S3Like = Pick<S3Client, 'send'>;

export type S3Options = {
  bucket: string;
  publicUrl: string;
  endpoint?: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** Any S3-compatible store: AWS S3, Cloudflare R2, MinIO, ... */
export class S3CompatibleAdapter implements StorageAdapter {
  private readonly client: S3Like;
  private readonly bucket: string;
  private readonly base: string;

  constructor(opts: S3Options, client?: S3Like) {
    this.bucket = opts.bucket;
    this.base = opts.publicUrl.replace(/\/+$/, '');
    this.client =
      client ??
      new S3Client({
        region: opts.region ?? 'auto',
        endpoint: opts.endpoint,
        forcePathStyle: Boolean(opts.endpoint), // R2/MinIO style addressing
        credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      });
  }

  private check(key: string) {
    if (!isValidKey(key)) throw new Error(`Invalid storage key "${key}"`);
  }

  async put(key: string, source: StoredObject): Promise<void> {
    this.check(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(source.filePath),
        ContentType: source.contentType,
        ContentLength: source.sizeBytes,
        // Keys are random and never reused, so the object is immutable.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }

  async delete(key: string): Promise<void> {
    this.check(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async exists(key: string): Promise<boolean> {
    this.check(key);
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === 'NotFound' || e.name === 'NoSuchKey' || e.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  publicUrl(key: string): string {
    this.check(key);
    return `${this.base}/${key}`;
  }
}
