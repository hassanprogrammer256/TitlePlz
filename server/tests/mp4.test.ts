import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { inspectMp4, readMp4DurationSeconds } from '../src/media/mp4.js';
import { sniffContentType } from '../src/media/sniff.js';
import { makeJpeg, makeMp4, makePng, makeWebp } from './media.js';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tp-mp4-'));
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

async function durationOf(buf: Buffer) {
  const file = path.join(dir, `${Math.random().toString(36).slice(2)}.mp4`);
  await fs.writeFile(file, buf);
  return readMp4DurationSeconds(file);
}

describe('readMp4DurationSeconds', () => {
  it('reads the duration from a v0 mvhd with moov first', async () => {
    expect(await durationOf(makeMp4({ seconds: 12.5 }))).toBeCloseTo(12.5, 3);
  });

  it('finds moov at the end of the file', async () => {
    expect(await durationOf(makeMp4({ seconds: 90, moovLast: true }))).toBe(90);
  });

  it('supports mvhd version 1 (64-bit) and other timescales', async () => {
    expect(await durationOf(makeMp4({ seconds: 600, version: 1, timescale: 90000 }))).toBe(600);
    expect(await durationOf(makeMp4({ seconds: 7, timescale: 44100 }))).toBeCloseTo(7, 3);
  });

  it('walks past a 64-bit (largesize) mdat box', async () => {
    expect(await durationOf(makeMp4({ seconds: 33, moovLast: true, bigMdat: true }))).toBe(33);
  });

  it('returns null for non-MP4 data, a missing moov, truncation and a zero timescale', async () => {
    expect(await durationOf(Buffer.from('definitely not a video file at all'))).toBeNull();
    expect(await durationOf(makePng())).toBeNull();
    const noMoov = makeMp4({ seconds: 5 }).subarray(0, 28); // ftyp only
    expect(await durationOf(noMoov)).toBeNull();
    const full = makeMp4({ seconds: 5, moovLast: true });
    expect(await durationOf(full.subarray(0, full.length - 40))).toBeNull(); // cut inside moov
    expect(await durationOf(makeMp4({ seconds: 5, timescale: 0 }))).toBeNull();
  });
});

describe('real encoder output (ffmpeg fixtures)', () => {
  const fixture = (name: string) => path.join(import.meta.dirname, 'fixtures', name);

  it('reads a faststart MP4 (moov first)', async () => {
    expect(await readMp4DurationSeconds(fixture('clip-faststart.mp4'))).toBeCloseTo(3.2, 1);
  });

  it('reads an MP4 with moov at the end', async () => {
    expect(await readMp4DurationSeconds(fixture('clip-moovlast.mp4'))).toBeCloseTo(3.2, 1);
  });

  it('identifies a fragmented MP4, whose header duration is zero', async () => {
    expect(await inspectMp4(fixture('clip-fragmented.mp4'))).toEqual({ durationSeconds: 0, fragmented: true });
    expect((await inspectMp4(fixture('clip-faststart.mp4')))?.fragmented).toBe(false);
  });
});

describe('sniffContentType', () => {
  it('identifies accepted formats by magic bytes only', () => {
    expect(sniffContentType(makePng())).toBe('image/png');
    expect(sniffContentType(makeJpeg())).toBe('image/jpeg');
    expect(sniffContentType(makeWebp())).toBe('image/webp');
    expect(sniffContentType(makeMp4({ seconds: 1 }))).toBe('video/mp4');
  });

  it('rejects everything else', () => {
    expect(sniffContentType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffContentType(Buffer.from('GIF89a......'))).toBeNull();
    expect(sniffContentType(Buffer.from('#!/bin/sh\necho hi'))).toBeNull();
    expect(sniffContentType(Buffer.alloc(0))).toBeNull();
  });
});
