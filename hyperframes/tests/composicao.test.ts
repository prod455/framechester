import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  chartPoints,
  chipDate,
  html,
  scriptJson,
  soundTrack,
  viewModel,
  writeProject,
  yearTicks,
} from '../src/composicao.ts';
import type { Confronto } from '../src/confronto.ts';
import { lint } from '../src/render.ts';
import { SAMPLE_RATE, renderWav } from '../src/sfx.ts';

function sample(competition = 'Amistoso'): Confronto {
  const matches = Array.from({ length: 12 }, (_, i) => ({
    date: `${1950 + i * 5}-06-1${i % 9}`,
    home: i % 2 ? 'B' : 'A',
    away: i % 2 ? 'A' : 'B',
    homeScore: i % 3,
    awayScore: (i + 1) % 2,
    competition,
    city: 'Cidade',
    country: 'País',
  }));
  return {
    sport: 'futebol',
    sides: [
      { id: 'A', name: 'Alfa', short: 'ALF', color: '#F7D117', ink: '#10151C' },
      { id: 'B', name: 'Beta', short: 'BET', color: '#75AADB', ink: '#0B1622' },
    ],
    matches,
    source: {
      name: 'teste',
      url: 'https://example.com',
      license: 'CC0 1.0',
      retrieved: '2026-11-13',
      note: 'nota',
    },
  };
}

test('data never becomes markup: text is escaped and the JSON island cannot close its script', () => {
  const vm = viewModel(sample('</script><img src=x onerror=alert(1)>'));
  const page = html(vm);
  assert.ok(!page.includes('<img src=x'));
  assert.equal(page.match(/<\/script>/g)?.length, 3); // gsap, data island, runtime
  assert.ok(scriptJson({ s: '</script>' }).includes('\\u003c/script>'));
});

test('the composition is offline and timed by its own duration', () => {
  const vm = viewModel(sample());
  const page = html(vm);
  assert.ok(!/(src|href)="https?:/.test(page), 'no network at render time');
  assert.ok(page.includes(`data-composition-id="root"`));
  assert.ok(page.includes(`data-duration="${vm.timing.total}"`));
  assert.ok(page.includes('data-width="1080" data-height="1920"'));
});

test('chart maps the win difference around a centred zero and ticks never crowd', () => {
  const vm = viewModel(sample());
  const { points, zero } = chartPoints(vm.steps);
  assert.equal(points.length, 12);
  assert.equal(points[0]![0], 0);
  assert.equal(points[11]![0], 820);
  for (const [, y] of points) assert.ok(y >= 0 && y <= 110);
  vm.steps.forEach((s, i) => {
    const d = s.tally.winsA - s.tally.winsB;
    assert.equal(Math.sign(zero - points[i]![1]), Math.sign(d));
  });
  const ticks = yearTicks(vm.steps);
  for (let i = 1; i < ticks.length; i += 1) assert.ok(ticks[i]!.x - ticks[i - 1]!.x >= 110);
  assert.equal(chipDate('2021-07-10'), 'JUL 2021');
});

test('one blip per match, on the frame the match appears, plus the verdict hit', () => {
  const vm = viewModel(sample());
  const blips = soundTrack(vm);
  assert.equal(blips.length, 13);
  assert.equal(blips[0]!.at, vm.timing.intro);
  for (const b of blips) assert.ok(b.at < vm.timing.total);
});

test('wav header and length match the composition', () => {
  const wav = renderWav(2, [{ at: 0.5, hz: 440, gain: 0.5, decay: 0.03 }]);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), SAMPLE_RATE);
  assert.equal(wav.length, 44 + 2 * 2 * SAMPLE_RATE);
  assert.throws(() => renderWav(1, [{ at: 1.5, hz: 440, gain: 0.5, decay: 0.03 }]), /fora do vídeo/);
});

test('written project is self-contained and passes hyperframes lint', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fc-hf-'));
  writeProject(viewModel(sample()), dir);
  assert.deepEqual(readdirSync(dir).sort(), [
    'confronto.css',
    'confronto.js',
    'fonts',
    'gsap.min.js',
    'index.html',
    'sfx.wav',
  ]);
  assert.equal(readdirSync(join(dir, 'fonts')).length, 4);
  assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes('confronto.js'));
  lint(dir);
});
