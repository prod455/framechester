import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the favicon is the Studio brand mark and the page links it', async () => {
  const [favicon, page, dom] = await Promise.all([
    readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/dom.ts', import.meta.url), 'utf8'),
  ]);
  const film = /film: '([^']+)'/.exec(dom)?.[1];
  assert.ok(film, 'the brand icon path exists in dom.ts');
  assert.ok(favicon.includes(`d="${film}"`), 'favicon draws the same film icon as the sidebar brand');
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="\/favicon.svg" \/>/);
});
