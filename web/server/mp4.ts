// Reads duration, size and frame rate of an MP4 from its boxes: deterministic, no external tool.
import { open } from 'node:fs/promises';

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
