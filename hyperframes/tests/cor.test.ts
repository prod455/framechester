import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { test } from 'node:test';
import { percentages } from '../src/composicao.ts';
import { AA, PANEL, contrast, readableOnDark } from '../src/cor.ts';
import { TEAMS, sidesFor } from '../src/internacionais.ts';
import { hyperframesEnv } from '../src/render.ts';

test('every team: ink on the kit colour and the kit colour as text both read at AA', () => {
  for (const [name, team] of Object.entries(TEAMS)) {
    assert.ok(
      contrast(team.color, team.ink) >= AA,
      `${name}: tinta ${contrast(team.color, team.ink).toFixed(2)}`,
    );
    assert.ok(contrast(readableOnDark(team.color), PANEL) >= AA, `${name}: texto`);
  }
  for (const [a, b] of [
    ['Argentina', 'Uruguay'],
    ['Germany', 'England'],
  ] as const) {
    const [, side] = sidesFor(a, b);
    assert.ok(contrast(side.color, side.ink) >= AA, `${a} × ${b}: tinta do fallback`);
    assert.ok(contrast(readableOnDark(side.color), PANEL) >= AA, `${a} × ${b}: texto do fallback`);
  }
  assert.equal(readableOnDark('#F7D117'), '#F7D117', 'cor que já passa não muda');
  assert.ok(contrast('#9AA3B5', PANEL) >= AA, 'texto secundário');
  assert.ok(contrast('#8A93A6', PANEL) >= AA, 'empates');
});

test('shares are whole numbers that add up to 100', () => {
  assert.deepEqual(percentages([13, 5, 5]), [56, 22, 22]);
  assert.deepEqual(percentages([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(percentages([0, 0, 0]), [0, 0, 0]);
  for (let a = 0; a < 12; a += 1)
    for (let d = 0; d < 12; d += 1)
      for (let b = 1; b < 12; b += 1) {
        assert.equal(
          percentages([a, d, b]).reduce((x, y) => x + y, 0),
          100,
        );
      }
});

test('HyperFrames runs with its own home and cache, telemetry off', () => {
  const root = mkdtempSync(join(tmpdir(), 'fc-hf-env-'));
  try {
    const env = hyperframesEnv({ HOME: '/home/operador', PATH: '/bin' }, root);
    assert.equal(env.HOME, join(root, 'home'));
    assert.equal(env.USERPROFILE, join(root, 'home'));
    assert.equal(env.HYPERFRAMES_CACHE_DIR, join(root, 'cache'));
    assert.equal(env.HYPERFRAMES_NO_TELEMETRY, '1');
    assert.equal(env.DO_NOT_TRACK, '1');
    assert.equal(env.PATH, '/bin');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
