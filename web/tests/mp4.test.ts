import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probeMp4, withoutEditLists } from '../server/mp4.ts';
import { mp4Fixture } from './mp4-fixture.ts';

const chunkOffset = (file: Buffer) => file.readUInt32BE(file.indexOf('stco', 0, 'latin1') + 12);

test('edit lists are removed and every chunk offset still points at the same media bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-mp4-edts-'));
  try {
    const source = join(directory, 'final.mp4');
    const clean = join(directory, 'clean.mp4');
    const original = mp4Fixture({ editList: true });
    await writeFile(source, original);
    assert.equal(original.toString('latin1', chunkOffset(original), chunkOffset(original) + 5), 'CHUNK');
    assert.equal(await withoutEditLists(source, clean), true);
    const written = await readFile(clean);
    assert.equal(written.indexOf('edts', 0, 'latin1'), -1);
    assert.equal(written.indexOf('elst', 0, 'latin1'), -1);
    assert.equal(written.length, original.length - 36, 'edts (8) + elst (28) bytes removed');
    assert.equal(written.toString('latin1', chunkOffset(written), chunkOffset(written) + 5), 'CHUNK');
    assert.deepEqual(
      { ...(await probeMp4(clean)), bytes: 0 },
      { ...(await probeMp4(source)), bytes: 0 },
      'duration, size and frame rate unchanged',
    );
    assert.equal(await withoutEditLists(clean, join(directory, 'again.mp4')), false, 'nothing to remove');
    await assert.rejects(readFile(join(directory, 'again.mp4')), /ENOENT/, 'and nothing written');
    await writeFile(join(directory, 'broken.mp4'), Buffer.from('not an mp4'));
    await assert.rejects(withoutEditLists(join(directory, 'broken.mp4'), join(directory, 'x.mp4')));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const ffmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test(
  "a video muxed like the engine's loses its edit lists and keeps every packet",
  { skip: ffmpeg ? false : 'ffmpeg not installed' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fc-mp4-ffmpeg-'));
    try {
      const source = join(directory, 'final.mp4');
      const clean = join(directory, 'clean.mp4');
      const run = (...args: string[]) =>
        execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd: directory });
      run(
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=320x568:d=1:r=30',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        'v.mp4',
      );
      run('-f', 'lavfi', '-i', 'sine=d=1:sample_rate=24000', 'a.wav');
      run(
        ...['-i', 'v.mp4', '-i', 'a.wav', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac'],
        ...['-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', source],
      );
      assert.notEqual((await readFile(source)).indexOf('elst', 0, 'latin1'), -1, 'FFmpeg writes edit lists');
      assert.equal(await withoutEditLists(source, clean), true);
      assert.equal((await readFile(clean)).indexOf('elst', 0, 'latin1'), -1);
      run('-i', clean, '-f', 'null', '-');
      const packets = (file: string, stream: string) =>
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-map',
          stream,
          '-c',
          'copy',
          '-f',
          'md5',
          '-',
        ]).toString();
      for (const stream of ['0:v', '0:a']) assert.equal(packets(clean, stream), packets(source, stream));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
