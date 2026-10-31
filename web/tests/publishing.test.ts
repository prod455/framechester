import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canPublish,
  countTags,
  crossReferences,
  mediaProblem,
  measure,
  networkLimits,
  postText,
  publicPlatforms,
} from '../shared/publishing.ts';
import { probeMp4 } from '../server/mp4.ts';
import { mp4Fixture } from './mp4-fixture.ts';

const links = [
  { platform: 'facebook' as const, url: 'https://www.facebook.com/1' },
  { platform: 'youtube' as const, url: 'https://www.youtube.com/@canal' },
  { platform: 'tiktok' as const, url: 'https://www.tiktok.com/@canal' },
];

test('each description cites the other connected networks, never itself, in a fixed order', () => {
  assert.equal(
    crossReferences('tiktok', links, 'pt-BR'),
    'Acompanhe também:\nYouTube: https://www.youtube.com/@canal\nFacebook: https://www.facebook.com/1',
  );
  assert.match(crossReferences('youtube', links, 'en-US'), /^Also on:\nTikTok: /);
  assert.match(crossReferences('youtube', links, 'es'), /^Síguenos también en:/);
  assert.equal(crossReferences('youtube', [links[1]], 'pt-BR'), '', 'Nothing else connected, no block');
});

test('the references sit between the text and the trailing tag; a caption opens with the title', () => {
  const parts = { title: 'Título', body: 'Fontes\n', references: 'Acompanhe também:\nX: y', tag: '#Shorts' };
  assert.deepEqual(postText('youtube', parts), {
    title: 'Título',
    text: 'Fontes\n\nAcompanhe também:\nX: y\n\n#Shorts',
  });
  assert.equal(
    postText('tiktok', { ...parts, tag: undefined }).text,
    'Título\n\nFontes\n\nAcompanhe também:\nX: y',
  );
});

test('every network gets text within its limit, cut at the body so the references stay whole', () => {
  const references =
    'Acompanhe também:\nYouTube: https://www.youtube.com/@canal\nTikTok: https://www.tiktok.com/@canal';
  const body = 'ação '.repeat(3000);
  for (const platform of ['youtube', 'tiktok', 'instagram', 'facebook'] as const) {
    const limits = networkLimits[platform];
    const first = postText(platform, { title: `Título <longo> ${'é'.repeat(200)}`, body, references });
    assert.deepEqual(
      first,
      postText(platform, { title: `Título <longo> ${'é'.repeat(200)}`, body, references }),
    );
    if (limits.title) assert.ok(first.title.length <= limits.title, platform);
    if (limits.text) {
      assert.ok(measure(first.text, limits.textUnit) <= limits.text, platform);
      assert.ok(first.text.endsWith(references), `${platform} keeps the references`);
      assert.match(first.text, /ação…\n\nAcompanhe/, `${platform} cuts at a word`);
    }
  }
  assert.equal(
    postText('youtube', { title: 'a', body: 'é'.repeat(2600), references: '' }).text.length < 2600,
    true,
  );
  assert.equal(postText('youtube', { title: 'a <b>', body: '<script>', references: '' }).title, 'a b');
});

test('Instagram keeps at most 30 hashtags and 20 mentions, the fixed parts first', () => {
  const body = Array.from({ length: 40 }, (_, index) => `#tag${index} @user${index}`).join(' ');
  const { text } = postText('instagram', {
    title: 'Título',
    body,
    references: 'Acompanhe também:\nTikTok: https://www.tiktok.com/@canal',
  });
  assert.deepEqual(countTags(text), { hashtags: 30, mentions: 20 });
  assert.match(text, /tiktok\.com\/@canal$/);
});

test('the MP4 reader gets duration, size and frame rate from the boxes, deterministically', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fc-mp4-'));
  try {
    const path = join(directory, 'final.mp4');
    const file = mp4Fixture({ seconds: 95, width: 1080, height: 1920, fps: 30 });
    await writeFile(path, file);
    assert.deepEqual(await probeMp4(path), {
      bytes: file.length,
      seconds: 95,
      width: 1080,
      height: 1920,
      fps: 30,
    });
    await writeFile(path, 'not a video');
    await assert.rejects(probeMp4(path), /duração e resolução/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('media limits come from each network documentation', () => {
  const reel = { bytes: 50_000_000, seconds: 58, width: 1080, height: 1920, fps: 30 };
  for (const platform of ['youtube', 'tiktok', 'instagram', 'facebook'] as const)
    assert.equal(mediaProblem(platform, reel), null, platform);
  assert.match(mediaProblem('facebook', { ...reel, seconds: 95 })!, /de 3 a 90 s; este vídeo tem 95 s/);
  assert.match(mediaProblem('tiktok', { ...reel, seconds: 720 })!, /até 600 s/);
  assert.match(mediaProblem('instagram', { ...reel, bytes: 300_000_001 })!, /até 300 MB/);
  assert.match(mediaProblem('instagram', { ...reel, seconds: 2 })!, /de 3 a 900 s/);
  assert.match(mediaProblem('facebook', { ...reel, fps: 23.976 })!, /quadros por segundo/);
  assert.match(mediaProblem('facebook', { ...reel, width: 1080, height: 1350 })!, /resolução/);
  assert.match(mediaProblem('instagram', { ...reel, width: 3840, height: 2160 })!, /resolução/);
  assert.equal(mediaProblem('youtube', { ...reel, seconds: 720, width: 1920, height: 1080 }), null);
});

test('Facebook and Instagram take only vertical video, and only Instagram is public', () => {
  assert.equal(canPublish('facebook', false), false);
  assert.equal(canPublish('facebook', true), true);
  assert.equal(canPublish('tiktok', false), true);
  assert.equal(canPublish('instagram', true), true);
  assert.equal(canPublish('instagram', false), false);
  assert.deepEqual(publicPlatforms, ['instagram']);
});
