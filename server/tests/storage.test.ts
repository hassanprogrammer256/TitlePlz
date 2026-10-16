import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isValidKey, keyOwnerId, newKey } from '../src/storage/keys.js';
import { LocalDiskAdapter } from '../src/storage/localAdapter.js';
import { S3CompatibleAdapter } from '../src/storage/s3Adapter.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-store-'));
afterAll(() => fs.rm(root, { recursive: true, force: true }));

async function tempFile(content: string) {
  const p = path.join(root, `src-${Math.random().toString(36).slice(2)}`);
  await fs.writeFile(p, content);
  return { filePath: p, contentType: 'image/png', sizeBytes: Buffer.byteLength(content) };
}

describe('storage keys', () => {
  it('generates well-formed, unique, owner-tagged keys', () => {
    const a = newKey('user_1', 'image/png');
    const b = newKey('user_1', 'image/png');
    expect(isValidKey(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.endsWith('.png')).toBe(true);
    expect(newKey('u', 'video/mp4').endsWith('.mp4')).toBe(true);
    expect(keyOwnerId(a)).toBe('user_1');
  });

  it.each([
    '../etc/passwd',
    'u/../x/aaaaaaaaaaaaaaaaaaaaaaaa.png',
    'u/a/b.png',
    'u/a/aaaaaaaaaaaaaaaaaaaaaaaa.exe',
    '/abs/path.png',
    'u/a/aaaaaaaaaaaaaaaaaaaaaaaa.png/extra',
    '',
  ])('rejects %j', (key) => {
    expect(isValidKey(key)).toBe(false);
    expect(keyOwnerId(key)).toBeNull();
  });
});

describe('LocalDiskAdapter', () => {
  const adapter = new LocalDiskAdapter(path.join(root, 'media'), 'http://cdn.test/');

  it('stores, reports, builds a URL for, and deletes an object', async () => {
    const key = newKey('u1', 'image/png');
    expect(await adapter.exists(key)).toBe(false);
    await adapter.put(key, await tempFile('hello'));
    expect(await adapter.exists(key)).toBe(true);
    expect(await fs.readFile(path.join(adapter.root, key), 'utf8')).toBe('hello');
    expect(adapter.publicUrl(key)).toBe(`http://cdn.test/media/${key}`);
    await adapter.delete(key);
    expect(await adapter.exists(key)).toBe(false);
    await adapter.delete(key); // deleting a missing object is fine
  });

  it('uses a relative URL when no base is configured', () => {
    const key = newKey('u1', 'image/png');
    expect(new LocalDiskAdapter(root).publicUrl(key)).toBe(`/media/${key}`);
  });

  it('never overwrites an existing object', async () => {
    const key = newKey('u1', 'image/png');
    await adapter.put(key, await tempFile('first'));
    await expect(adapter.put(key, await tempFile('second'))).rejects.toThrow();
    expect(await fs.readFile(path.join(adapter.root, key), 'utf8')).toBe('first');
  });

  it('refuses keys that could escape the root', async () => {
    const src = await tempFile('x');
    for (const bad of ['../../outside.png', 'u/../../x/aaaaaaaaaaaaaaaaaaaaaaaa.png']) {
      await expect(adapter.put(bad, src)).rejects.toThrow(/Invalid storage key/);
      await expect(adapter.exists(bad)).resolves.toBe(false);
      expect(() => adapter.publicUrl(bad)).toThrow();
    }
  });
});

describe('S3CompatibleAdapter (against a fake client)', () => {
  const calls: { name: string; input: Record<string, unknown> }[] = [];
  let headError: unknown;
  const fake = {
    send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
      calls.push({ name: cmd.constructor.name, input: cmd.input });
      if (cmd.constructor.name === 'HeadObjectCommand' && headError) throw headError;
      return {};
    },
  };
  const adapter = new S3CompatibleAdapter({ bucket: 'b', publicUrl: 'https://cdn.example.com/', accessKeyId: 'k', secretAccessKey: 's' }, fake as never);

  it('sends a PutObject with type, length and immutable caching, and builds public URLs', async () => {
    const key = newKey('u1', 'image/png');
    await adapter.put(key, await tempFile('payload'));
    const put = calls.find((c) => c.name === 'PutObjectCommand')!;
    expect(put.input).toMatchObject({ Bucket: 'b', Key: key, ContentType: 'image/png', ContentLength: 7 });
    expect(String(put.input.CacheControl)).toContain('immutable');
    expect(adapter.publicUrl(key)).toBe(`https://cdn.example.com/${key}`);
  });

  it('maps 404s to exists=false and rethrows other errors', async () => {
    const key = newKey('u1', 'image/png');
    headError = Object.assign(new Error('nf'), { name: 'NotFound' });
    expect(await adapter.exists(key)).toBe(false);
    headError = Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    await expect(adapter.exists(key)).rejects.toThrow('denied');
    headError = undefined;
    expect(await adapter.exists(key)).toBe(true);
  });

  it('deletes via DeleteObject and rejects malformed keys before calling S3', async () => {
    const before = calls.length;
    await adapter.delete(newKey('u1', 'image/png'));
    expect(calls.at(-1)!.name).toBe('DeleteObjectCommand');
    await expect(adapter.delete('../nope')).rejects.toThrow(/Invalid storage key/);
    expect(calls.length).toBe(before + 1);
  });
});
