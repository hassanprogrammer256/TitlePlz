import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import type { Express } from 'express';
import request from 'supertest';

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const box = (type: string, payload: Buffer) => Buffer.concat([u32(8 + payload.length), Buffer.from(type, 'ascii'), payload]);

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const makePng = (extra = 64) => Buffer.concat([PNG_SIGNATURE, randomBytes(extra)]);
export const makeJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(64)]);
export const makeWebp = () => Buffer.concat([Buffer.from('RIFF'), u32(100), Buffer.from('WEBP'), randomBytes(64)]);

type Mp4Options = {
  seconds: number;
  timescale?: number;
  /** mvhd version 1 uses 64-bit times. */
  version?: 0 | 1;
  /** Put moov after the mdat, like a non-"faststart" file. */
  moovLast?: boolean;
  /** Encode the mdat with a 64-bit (largesize) header. */
  bigMdat?: boolean;
};

export function makeMp4({ seconds, timescale = 1000, version = 0, moovLast = false, bigMdat = false }: Mp4Options): Buffer {
  const duration = Math.round(seconds * timescale);
  let body: Buffer;
  if (version === 0) {
    body = Buffer.concat([Buffer.alloc(4), u32(0), u32(0), u32(timescale), u32(duration), Buffer.alloc(80)]);
  } else {
    const d = Buffer.alloc(8);
    d.writeBigUInt64BE(BigInt(duration));
    body = Buffer.concat([Buffer.from([1, 0, 0, 0]), Buffer.alloc(16), u32(timescale), d, Buffer.alloc(80)]);
  }
  const moov = box('moov', box('mvhd', body));
  const ftyp = box('ftyp', Buffer.concat([Buffer.from('isom'), u32(0), Buffer.from('isom')]));
  const payload = randomBytes(2048);
  let mdat: Buffer;
  if (bigMdat) {
    const size = Buffer.alloc(8);
    size.writeBigUInt64BE(BigInt(16 + payload.length));
    mdat = Buffer.concat([u32(1), Buffer.from('mdat'), size, payload]);
  } else {
    mdat = box('mdat', payload);
  }
  return Buffer.concat(moovLast ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}

export type UploadResult = { key: string; url: string; kind: string; contentType: string; sizeBytes: number; durationSeconds?: number };
type Target = Express | Server;

export function uploadFile(app: Target, cookie: string, kind: 'image' | 'video', data: Buffer, filename: string) {
  return request(app).post(`/api/uploads?kind=${kind}`).set('Cookie', cookie).attach('file', data, { filename });
}

export async function uploadOk(app: Target, cookie: string, kind: 'image' | 'video', data: Buffer, filename: string): Promise<UploadResult> {
  const res = await uploadFile(app, cookie, kind, data, filename);
  if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.upload;
}
