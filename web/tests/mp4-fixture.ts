// A minimal MP4 (ftyp, moov with one video track, mdat): enough for the box reader, no codec data.
function box(type: string, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(8 + body.length, 0);
  header.write(type, 4, 'latin1');
  return Buffer.concat([header, body]);
}
const u32 = (...values: number[]) => {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32BE(value, index * 4));
  return buffer;
};

export function mp4Fixture(
  options: {
    seconds?: number;
    width?: number;
    height?: number;
    fps?: number;
    payload?: number;
    /** An edit list in the track and a chunk offset into the media, as FFmpeg writes. */
    editList?: boolean;
  } = {},
): Buffer {
  const { seconds = 30, width = 1080, height = 1920, fps = 30, payload = 32, editList = false } = options;
  const scale = 1000;
  // version/flags, creation, modification, timescale, duration, then fields the reader skips.
  const mvhd = box('mvhd', u32(0, 0, 0, scale, Math.round(seconds * scale)), Buffer.alloc(80));
  const tkhd = box(
    'tkhd',
    u32(0, 0, 0, 1, 0, Math.round(seconds * scale)),
    Buffer.alloc(52),
    u32(width * 65536, height * 65536),
  );
  const mediaScale = fps * 1000;
  const frames = Math.round(seconds * fps);
  const mdhd = box('mdhd', u32(0, 0, 0, mediaScale, frames * 1000), Buffer.alloc(4));
  const hdlr = box('hdlr', u32(0, 0), Buffer.from('vide', 'latin1'), Buffer.alloc(13));
  const stts = box('stts', u32(0, 1, frames, 1000));
  const ftyp = box(
    'ftyp',
    Buffer.from('isom', 'latin1'),
    u32(512),
    Buffer.from('isomiso2avc1mp41', 'latin1'),
  );
  const media = Buffer.alloc(payload, 7);
  media.write('CHUNK', 0, 'latin1');
  const build = (chunkOffset: number) => {
    const stbl = editList ? box('stbl', stts, box('stco', u32(0, 1, chunkOffset))) : box('stbl', stts);
    const edts = box('edts', box('elst', u32(0, 1, Math.round(seconds * scale), 1024, 0x10000)));
    const trak = editList
      ? box('trak', tkhd, edts, box('mdia', mdhd, hdlr, box('minf', stbl)))
      : box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', stbl)));
    return box('moov', mvhd, trak);
  };
  // The chunk offset points at the media bytes, right after the mdat header.
  const moov = build(ftyp.length + build(0).length + 8);
  return Buffer.concat([ftyp, moov, box('mdat', media)]);
}
