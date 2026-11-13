// The browser runtime (templates/confronto.js) run in node:vm with a fake DOM and a
// fake GSAP that records the timeline, so the two properties HyperFrames and the QA
// depend on are checked without a browser: any frame renders the same whatever came
// before it, and no stretch of the film sits still long enough to fail freezedetect.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
import { html, viewModel } from '../src/composicao.ts';
import type { Confronto } from '../src/confronto.ts';

const RUNTIME = readFileSync(join(import.meta.dirname, '..', 'templates', 'confronto.js'), 'utf8');

interface FakeEl {
  id: string;
  style: Record<string, string>;
  attrs: Record<string, string>;
  children: FakeEl[];
  textContent: string;
  className: string;
  setAttribute(k: string, v: unknown): void;
  append(...c: FakeEl[]): void;
  appendChild(c: FakeEl): void;
}

function el(id = ''): FakeEl {
  return {
    id,
    style: {},
    attrs: {},
    children: [],
    textContent: '',
    className: '',
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    append(...c) {
      this.children.push(...c);
    },
    appendChild(c) {
      this.children.push(c);
    },
  };
}

interface Call {
  method: string;
  target: unknown;
  vars: Record<string, unknown>;
  at: number;
}

function sample(n: number): Confronto {
  return {
    sport: 'futebol',
    sides: [
      { id: 'A', name: 'Alfa', short: 'ALF', color: '#F7D117', ink: '#10151C' },
      { id: 'B', name: 'Beta', short: 'BET', color: '#75AADB', ink: '#0B1622' },
    ],
    matches: Array.from({ length: n }, (_, i) => ({
      date: `${1900 + i}-01-01`,
      home: 'A',
      away: 'B',
      homeScore: i % 3,
      awayScore: (i * 7) % 4,
      competition: 'Amistoso',
    })),
    source: {
      name: 'teste',
      url: 'https://example.com',
      license: 'CC0 1.0',
      retrieved: '2026-11-13',
      note: 'nota',
    },
  };
}

function load(n: number) {
  const model = viewModel(sample(n));
  const page = html(model);
  const island = /<script type="application\/json" id="confronto-data">([\s\S]*?)<\/script>/.exec(page);
  assert.ok(island, 'ilha JSON presente');
  const els = new Map<string, FakeEl>();
  const calls: Call[] = [];
  const timeline = {
    from: (target: unknown, vars: Record<string, unknown>, at: number) =>
      calls.push({ method: 'from', target, vars, at }),
    to: (target: unknown, vars: Record<string, unknown>, at: number) =>
      calls.push({ method: 'to', target, vars, at }),
    fromTo: (target: unknown, _from: unknown, vars: Record<string, unknown>, at: number) =>
      calls.push({ method: 'fromTo', target, vars, at }),
    set: (target: unknown, vars: Record<string, unknown>, at: number) =>
      calls.push({ method: 'set', target, vars, at }),
  };
  const window: Record<string, unknown> = {};
  const document = {
    getElementById(id: string) {
      if (id === 'confronto-data') return { textContent: island[1] };
      if (!els.has(id)) els.set(id, el(id));
      return els.get(id);
    },
    createElement: () => el(),
  };
  vm.runInNewContext(RUNTIME, { document, window, gsap: { timeline: () => timeline } });
  const race = calls.find(
    (c) => c.method === 'fromTo' && typeof c.target === 'object' && c.target && 'p' in c.target,
  );
  assert.ok(race, 'tween da corrida registrado');
  const proxy = race.target as { p: number };
  const seek = (p: number) => {
    proxy.p = p;
    (race.vars.onUpdate as () => void)();
  };
  const snapshot = () =>
    JSON.stringify(
      [...els.entries()].map(([id, e]) => [
        id,
        e.textContent,
        e.style,
        e.attrs,
        e.children.map((c) => [c.style, c.textContent]),
      ]),
    );
  return { model, els, calls, seek, snapshot, window };
}

test('a frame is the same whatever was rendered before it', () => {
  const direct = load(40);
  direct.seek(17.3);
  const jumped = load(40);
  jumped.seek(39.9);
  jumped.seek(0.2);
  jumped.seek(-1);
  jumped.seek(17.3);
  assert.equal(jumped.snapshot(), direct.snapshot());
});

test('at the end of the race the screen shows the summary tally and shares adding to 100', () => {
  const r = load(23);
  r.seek(23);
  const t = r.model.summary.tally;
  assert.equal(String(r.els.get('wins-a')!.textContent), String(t.winsA));
  assert.equal(String(r.els.get('wins-b')!.textContent), String(t.winsB));
  assert.equal(String(r.els.get('draws')!.textContent), String(t.draws));
  const pct = ['pct-a', 'pct-d', 'pct-b'].map((id) => parseInt(r.els.get(id)!.textContent, 10));
  assert.equal(
    pct.reduce((a, b) => a + b, 0),
    100,
  );
  assert.ok(r.window.__timelines, 'timeline registrada para o HyperFrames');
});

test('no stretch of the film goes 1.8 s without a large-area change (QA freeze limit is 2 s)', () => {
  for (const n of [2, 23, 49, 110, 183]) {
    const r = load(n);
    const t = r.model.timing;
    const settle = 0.28;
    const busy: [number, number][] = [];
    for (let i = 0; i < n; i += 1) {
      const at = t.intro + i * t.perMatch;
      busy.push([at, at + settle]);
    }
    for (const c of r.calls) {
      // A thin rule and text rows fading in are too small for freezedetect (n=0.001):
      // a render whose closing had only those failed QA, so they do not count here.
      if (c.method === 'set' || c.target === '#outro-line' || c.target === '.verdict .row') continue;
      if (typeof c.target === 'object') continue; // the race proxy: counted per match above
      const stagger = typeof c.vars.stagger === 'number' ? c.vars.stagger : 0;
      const count = c.target === '.intro' ? 16 : 1;
      const duration = Number(c.vars.duration ?? 0);
      for (let k = 0; k < count; k += 1) busy.push([c.at + k * stagger, c.at + k * stagger + duration]);
    }
    busy.sort((x, y) => x[0] - y[0]);
    let reach = 0;
    let worst = 0;
    for (const [start, end] of busy) {
      worst = Math.max(worst, start - reach);
      reach = Math.max(reach, end);
    }
    worst = Math.max(worst, t.total - reach);
    assert.ok(worst < 1.8, `${n} jogos: ${worst.toFixed(2)} s parado`);
  }
});
