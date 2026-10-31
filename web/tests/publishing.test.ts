import test from 'node:test';
import assert from 'node:assert/strict';
import { canPublish, crossReferences, postDescription, publicPlatforms } from '../shared/publishing.ts';

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

test('the references sit between the text and the trailing tag', () => {
  assert.equal(
    postDescription('Fontes\n', 'Acompanhe também:\nX: y', '#Shorts'),
    'Fontes\n\nAcompanhe também:\nX: y\n\n#Shorts',
  );
  assert.equal(postDescription('Fontes', ''), 'Fontes');
});

test('Facebook and Instagram take only vertical video, and only Instagram is public', () => {
  assert.equal(canPublish('facebook', false), false);
  assert.equal(canPublish('facebook', true), true);
  assert.equal(canPublish('tiktok', false), true);
  assert.equal(canPublish('instagram', true), true);
  assert.equal(canPublish('instagram', false), false);
  assert.deepEqual(publicPlatforms, ['instagram']);
});
