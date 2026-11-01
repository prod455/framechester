// Reads duration, size and frame rate of an MP4 from its boxes: deterministic, no external tool.
import { open, rm } from 'node:fs/promises';

export interface VideoProbe {
  bytes: number;
  seconds: number;
  width: number;
  height: number;
  fps: number;
}
export class Mp4Error extends Error {
  constructor() {
    super('Não foi possível ler duração e resolução do vídeo; gere a versão final novamente.');
    this.name = 'Mp4Error';
  }
}
/** A moov this large is not a video the engine wrote. */
const MAX_MOOV = 64 * 1024 * 1024;

interface Box {
  type: string;
  start: number;
  end: number;
}
function boxes(data: Buffer, start: number, end: number): Box[] {
  const found: Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = data.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) throw new Mp4Error();
      size = Number(data.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) throw new Mp4Error();
    found.push({
      type: data.toString('latin1', offset + 4, offset + 8),
      start: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return found;
}
const child = (data: Buffer, box: Box, type: string) =>
  boxes(data, box.start, box.end).find((item) => item.type === type);

/** Duration from mvhd; size and frame rate from the first video track (tkhd, mdhd, stts). */
function parseMoov(data: Buffer, bytes: number): VideoProbe {
  const moov: Box = { type: 'moov', start: 0, end: data.length };
  const mvhd = child(data, moov, 'mvhd');
  if (!mvhd) throw new Mp4Error();
  const version = data[mvhd.start];
  const timescale = data.readUInt32BE(mvhd.start + (version === 1 ? 20 : 12));
  const duration =
    version === 1 ? Number(data.readBigUInt64BE(mvhd.start + 24)) : data.readUInt32BE(mvhd.start + 16);
  for (const trak of boxes(data, moov.start, moov.end).filter((item) => item.type === 'trak')) {
    const mdia = child(data, trak, 'mdia');
    const hdlr = mdia && child(data, mdia, 'hdlr');
    if (!mdia || !hdlr || data.toString('latin1', hdlr.start + 8, hdlr.start + 12) !== 'vide') continue;
    const tkhd = child(data, trak, 'tkhd');
    const mdhd = child(data, mdia, 'mdhd');
    const stbl = child(data, child(data, mdia, 'minf') ?? mdia, 'stbl');
    const stts = stbl && child(data, stbl, 'stts');
    if (!tkhd || !mdhd || !stts) throw new Mp4Error();
    const size = tkhd.start + (data[tkhd.start] === 1 ? 88 : 76);
    const mediaVersion = data[mdhd.start];
    const mediaScale = data.readUInt32BE(mdhd.start + (mediaVersion === 1 ? 20 : 12));
    const mediaDuration =
      mediaVersion === 1 ? Number(data.readBigUInt64BE(mdhd.start + 24)) : data.readUInt32BE(mdhd.start + 16);
    let frames = 0;
    const entries = data.readUInt32BE(stts.start + 4);
    for (let index = 0; index < entries; index++) frames += data.readUInt32BE(stts.start + 8 + index * 8);
    const probe = {
      bytes,
      seconds: duration / timescale,
      // 16.16 fixed point.
      width: data.readUInt32BE(size) / 65536,
      height: data.readUInt32BE(size + 4) / 65536,
      fps: frames / (mediaDuration / mediaScale),
    };
    if (!Object.values(probe).every((value) => Number.isFinite(value) && value > 0)) throw new Mp4Error();
    return probe;
  }
  throw new Mp4Error();
}

export async function probeMp4(path: string): Promise<VideoProbe> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const header = Buffer.alloc(16);
    let offset = 0;
    while (offset + 8 <= size) {
      await file.read(header, 0, 16, offset);
      let length = header.readUInt32BE(0);
      let skip = 8;
      if (length === 1) {
        length = Number(header.readBigUInt64BE(8));
        skip = 16;
      } else if (length === 0) length = size - offset;
      if (length < skip || offset + length > size) throw new Mp4Error();
      if (header.toString('latin1', 4, 8) === 'moov') {
        if (length - skip > MAX_MOOV) throw new Mp4Error();
        const moov = Buffer.alloc(length - skip);
        await file.read(moov, 0, moov.length, offset + skip);
        return parseMoov(moov, size);
      }
      offset += length;
    }
    throw new Mp4Error();
  } catch (error) {
    throw error instanceof Mp4Error ? error : new Mp4Error();
  } finally {
    await file.close();
  }
}

const header = (type: string, bodyLength: number): Buffer => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + bodyLength, 0);
  head.write(type, 4, 'latin1');
  return head;
};
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl']);

/**
 * `moov` rebuilt without `edts` (edit lists) in any track, its chunk offsets moved back by
 * the bytes removed when the media sits after it; undefined when there was none to remove.
 */
function moovWithoutEditLists(moov: Buffer, moovAt: number, moovLength: number): Buffer | undefined {
  let removed = 0;
  const rebuild = (data: Buffer, start: number, end: number, type: string): Buffer => {
    const parts: Buffer[] = [];
    for (const item of boxes(data, start, end)) {
      if (type === 'trak' && item.type === 'edts') {
        removed += item.end - item.start + 8;
        continue;
      }
      const body = CONTAINERS.has(item.type)
        ? rebuild(data, item.start, item.end, item.type)
        : Buffer.from(data.subarray(item.start, item.end));
      parts.push(header(item.type, body.length), body);
    }
    return Buffer.concat(parts);
  };
  const body = rebuild(moov, 0, moov.length, 'moov');
  if (!removed) return undefined;
  // Everything the moov lost, edit lists and any 64-bit header rewritten as 32-bit.
  const shift = moovLength - (8 + body.length);
  // Only media after the moov moves; with faststart (moov first), that is all of it.
  const patch = (start: number, end: number) => {
    for (const item of boxes(body, start, end)) {
      if (CONTAINERS.has(item.type) && item.type !== 'moov') patch(item.start, item.end);
      const count = item.type === 'stco' || item.type === 'co64' ? body.readUInt32BE(item.start + 4) : 0;
      for (let index = 0; index < count; index++) {
        if (item.type === 'stco') {
          const at = item.start + 8 + index * 4;
          const offset = body.readUInt32BE(at);
          if (offset > moovAt) body.writeUInt32BE(offset - shift, at);
        } else {
          const at = item.start + 8 + index * 8;
          const offset = body.readBigUInt64BE(at);
          if (offset > BigInt(moovAt)) body.writeBigUInt64BE(offset - BigInt(shift), at);
        }
      }
    }
  };
  patch(0, body.length);
  return Buffer.concat([header('moov', body.length), body]);
}

/**
 * Writes `output` as `path` without edit lists, which Instagram refuses ("no edit lists" in
 * its video spec; FFmpeg writes them for the AAC priming and the B-frame delay). Samples are
 * copied as they are, nothing is re-encoded. Returns false, writing nothing, when the file
 * has none.
 */
export async function withoutEditLists(path: string, output: string): Promise<boolean> {
  const file = await open(path, 'r');
  try {
    const { size } = await file.stat();
    const head = Buffer.alloc(16);
    let offset = 0;
    while (offset + 8 <= size) {
      await file.read(head, 0, 16, offset);
      let length = head.readUInt32BE(0);
      let skip = 8;
      if (length === 1) {
        length = Number(head.readBigUInt64BE(8));
        skip = 16;
      } else if (length === 0) length = size - offset;
      if (length < skip || offset + length > size) throw new Mp4Error();
      if (head.toString('latin1', 4, 8) === 'moov') {
        if (length - skip > MAX_MOOV) throw new Mp4Error();
        const moov = Buffer.alloc(length - skip);
        await file.read(moov, 0, moov.length, offset + skip);
        const rebuilt = moovWithoutEditLists(moov, offset, length);
        if (!rebuilt) return false;
        const target = await open(output, 'wx', 0o600);
        try {
          const copy = async (from: number, to: number) => {
            const chunk = Buffer.alloc(Math.min(4 * 1024 * 1024, Math.max(0, to - from)));
            for (let at = from; at < to;) {
              const { bytesRead } = await file.read(chunk, 0, Math.min(chunk.length, to - at), at);
              if (!bytesRead) throw new Mp4Error();
              await target.write(chunk, 0, bytesRead);
              at += bytesRead;
            }
          };
          await copy(0, offset);
          await target.write(rebuilt);
          await copy(offset + length, size);
        } catch (error) {
          await target.close();
          await rm(output, { force: true });
          throw error;
        }
        await target.close();
        return true;
      }
      offset += length;
    }
    throw new Mp4Error();
  } catch (error) {
    throw error instanceof Mp4Error ? error : new Mp4Error();
  } finally {
    await file.close();
  }
}
