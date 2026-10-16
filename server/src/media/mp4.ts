import fs from 'node:fs/promises';

export type Mp4Info = {
  durationSeconds: number;
  /** Fragmented MP4 (moov has an `mvex` box): the header duration is normally 0 and the real length lives in the fragments. */
  fragmented: boolean;
};

/**
 * Reads the presentation duration (seconds) from an MP4's `moov/mvhd` box without
 * decoding the file, so no ffprobe/ffmpeg install is needed. Only top-level boxes are
 * walked with small positioned reads, so a 100 MB file costs a few KB of I/O even when
 * `moov` is at the end. Returns null if the file isn't a well-formed MP4.
 *
 * Trust note: this is container metadata, which is what players use too. A hostile
 * file could understate its length; that is an accepted limit (see roadmap P9.3).
 */
export async function inspectMp4(filePath: string): Promise<Mp4Info | null> {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size } = await fh.stat();

    const readAt = async (pos: number, len: number): Promise<Buffer | null> => {
      if (pos < 0 || pos + len > size) return null;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, pos);
      return bytesRead === len ? buf : null;
    };

    // Find `box` named `type` among sibling boxes in [start, end).
    const findBox = async (type: string, start: number, end: number): Promise<{ bodyStart: number; end: number } | null> => {
      let pos = start;
      for (let guard = 0; pos + 8 <= end && guard < 10_000; guard++) {
        const head = await readAt(pos, 8);
        if (!head) return null;
        let boxSize = head.readUInt32BE(0);
        const boxType = head.toString('ascii', 4, 8);
        let headerLen = 8;
        if (boxSize === 1) {
          const ext = await readAt(pos + 8, 8);
          if (!ext) return null;
          const big = ext.readBigUInt64BE(0);
          if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
          boxSize = Number(big);
          headerLen = 16;
        } else if (boxSize === 0) {
          boxSize = end - pos; // box extends to the end of the enclosing container
        }
        if (boxSize < headerLen || pos + boxSize > end) return null;
        if (boxType === type) return { bodyStart: pos + headerLen, end: pos + boxSize };
        pos += boxSize;
      }
      return null;
    };

    const moov = await findBox('moov', 0, size);
    if (!moov) return null;
    const mvhd = await findBox('mvhd', moov.bodyStart, moov.end);
    if (!mvhd) return null;

    const body = await readAt(mvhd.bodyStart, Math.min(32, mvhd.end - mvhd.bodyStart));
    if (!body || body.length < 20) return null;

    const version = body[0];
    let timescale: number;
    let duration: number;
    if (version === 0) {
      timescale = body.readUInt32BE(12);
      duration = body.readUInt32BE(16);
    } else if (version === 1) {
      if (body.length < 32) return null;
      timescale = body.readUInt32BE(20);
      const d = body.readBigUInt64BE(24);
      if (d > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      duration = Number(d);
    } else {
      return null;
    }
    if (timescale === 0) return null;
    const fragmented = (await findBox('mvex', moov.bodyStart, moov.end)) !== null;
    return { durationSeconds: duration / timescale, fragmented };
  } catch {
    return null;
  } finally {
    await fh.close();
  }
}

/** Duration in seconds, or null if the file isn't a readable MP4. */
export async function readMp4DurationSeconds(filePath: string): Promise<number | null> {
  return (await inspectMp4(filePath))?.durationSeconds ?? null;
}
