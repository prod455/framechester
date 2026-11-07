import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo .mjs sem tipos
import { comandoDoQa } from '../scripts/qa.mjs';

const args = ['qa', '--format', 'short', '--video', 'v.mp4'];

test('o QA usa o binário indicado, depois o compilado, depois o cargo', () => {
  assert.deepEqual(comandoDoQa('v.mp4', { ambiente: { FRAMECHESTER_BIN: '/bin/fc' }, existe: () => true }), [
    '/bin/fc',
    args,
  ]);
  const [compilado, a] = comandoDoQa('v.mp4', { ambiente: {}, existe: () => true, windows: true });
  assert.match(compilado, /target[\\/]release[\\/]framechester\.exe$/);
  assert.deepEqual(a, args);
  assert.deepEqual(comandoDoQa('v.mp4', { ambiente: {}, existe: () => false }), [
    'cargo',
    ['run', '--release', '-q', '-p', 'framechester-cli', '--', ...args],
  ]);
});
