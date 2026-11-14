// Confronto → HyperFrames project: index.html, its runtime, fonts, GSAP and the sound track.
// The HTML carries only markup and a JSON island; every text node is escaped here or set
// with textContent by the runtime, so no field of the source data becomes markup.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Confronto,
  type Step,
  type Summary,
  type Timing,
  steps,
  summarize,
  timing,
  validate,
} from './confronto.ts';
import { readableOnDark } from './cor.ts';
import { type Blip, renderWav } from './sfx.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATES = join(HERE, '..', 'templates');
const REPO = join(HERE, '..', '..');
const require = createRequire(import.meta.url);

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
const CHART_W = 820;
const CHART_H = 90;
const DRAW_COLOR = '#8A93A6';

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** JSON safe inside a <script> element: no "</script>", no "<!--". */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** Whole percentages of the parts that always add up to 100 (largest remainder). */
export function percentages(parts: number[]): number[] {
  const total = parts.reduce((a, b) => a + b, 0);
  if (total === 0) return parts.map(() => 0);
  const exact = parts.map((p) => (p / total) * 100);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  for (const [, i] of order) {
    if (left === 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return floors;
}

/** DD/MM/AAAA for an ISO date. */
export function brDate(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function chipDate(iso: string): string {
  const month = Number(iso.slice(5, 7));
  return `${MONTHS[month - 1]} ${iso.slice(0, 4)}`;
}

export function times(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Year ticks under the chart: first and last match plus evenly spaced ones between, never crowded. */
export function yearTicks(all: Step[], width = CHART_W): { x: number; year: number }[] {
  const last = all.length - 1;
  const x = (i: number) => Math.round((last === 0 ? 0 : i / last) * width);
  const wanted = 5;
  const picks = new Set<number>();
  for (let k = 0; k < wanted; k += 1) picks.add(Math.round((k / (wanted - 1)) * last));
  const ticks: { x: number; year: number }[] = [];
  for (const i of [...picks].sort((a, b) => a - b)) {
    const tick = { x: x(i), year: all[i]!.year };
    const prev = ticks[ticks.length - 1];
    if (prev && (prev.year === tick.year || tick.x - prev.x < 110)) continue;
    ticks.push(tick);
  }
  // Keep labels inside the chart's width.
  return ticks.map((t) => ({ ...t, x: Math.min(width - 30, Math.max(30, t.x)) }));
}

/** Win difference (A − B) after each match, mapped to the chart box with zero in the middle. */
export function chartPoints(all: Step[]): { points: [number, number][]; zero: number } {
  const diffs = all.map((s) => s.tally.winsA - s.tally.winsB);
  const maxAbs = Math.max(1, ...diffs.map(Math.abs));
  const last = all.length - 1;
  const zero = CHART_H / 2;
  const half = CHART_H / 2 - 8;
  const points = diffs.map((d, i): [number, number] => [
    Math.round((last === 0 ? 0 : i / last) * CHART_W * 10) / 10,
    Math.round((zero - (d / maxAbs) * half) * 10) / 10,
  ]);
  return { points, zero };
}

function winLine(s: Step | null, winnerFirst: 'a' | 'b'): string {
  if (!s) return 'nenhuma vitória';
  const score = winnerFirst === 'a' ? `${s.a}–${s.b}` : `${s.b}–${s.a}`;
  return `${score} · ${s.year} · ${s.competition}`;
}

function streakLine(short: string, summary: Summary['streakA']): string {
  if (!summary) return `${short} 0`;
  const [from, to] = [summary.from.slice(0, 4), summary.to.slice(0, 4)];
  return `${short} ${summary.length} (${from === to ? from : `${from}–${to}`})`;
}

export interface ViewModel {
  data: Confronto;
  steps: Step[];
  summary: Summary;
  timing: Timing;
  /** The video's editorial angle, written by the operator; shown under the title. */
  hook: string | null;
}

/** Longest hook that fits the 936 px subtitle line at 34 px. */
export const HOOK_MAX = 44;

export function viewModel(input: Confronto, seconds?: number, hook?: string): ViewModel {
  const data = validate(input);
  const all = steps(data);
  const angle = hook?.trim() || null;
  if (angle && angle.length > HOOK_MAX) {
    throw new Error(`gancho com ${angle.length} caracteres; o máximo que cabe é ${HOOK_MAX}`);
  }
  return {
    data,
    steps: all,
    summary: summarize(all),
    timing: timing(all.length, seconds),
    hook: angle,
  };
}

export function soundTrack(vm: ViewModel): Blip[] {
  const { timing: t } = vm;
  const pitch = { a: 784, draw: 659, b: 523 } as const;
  const blips: Blip[] = vm.steps.map((s, i) => ({
    at: t.intro + i * t.perMatch,
    hz: pitch[s.outcome],
    gain: 0.22,
    decay: 0.03,
  }));
  blips.push({ at: t.intro + t.race + t.hold + 0.3, hz: 82, gain: 0.55, decay: 0.35 });
  return blips;
}

export function html(vm: ViewModel): string {
  const { data, steps: all, summary, timing: t } = vm;
  const [A, B] = data.sides;
  const title = data.title ?? `${A.name} × ${B.name}`;
  const titleHtml = data.title
    ? escapeHtml(title)
    : `${escapeHtml(A.name)}<span class="x">×</span>${escapeHtml(B.name)}`;
  const span =
    summary.firstYear === summary.lastYear
      ? `${summary.firstYear}`
      : `${summary.firstYear}–${summary.lastYear}`;
  // Team colours as text are lifted until they read at AA on the panel; fills keep the kit.
  const textA = readableOnDark(A.color);
  const textB = readableOnDark(B.color);
  const diff = summary.tally.winsA - summary.tally.winsB;
  const more = (n: number) => `${times(n, 'vitória', 'vitórias')} a mais`;
  const verdict =
    diff > 0
      ? { text: `${A.name}: ${more(diff)}`, color: textA }
      : diff < 0
        ? { text: `${B.name}: ${more(-diff)}`, color: textB }
        : { text: 'Confronto empatado em vitórias', color: '#F4F6FA' };
  const rows: [string, string][] = [
    [`MAIOR VITÓRIA · ${A.name.toUpperCase()}`, winLine(summary.biggestWinA, 'a')],
    [`MAIOR VITÓRIA · ${B.name.toUpperCase()}`, winLine(summary.biggestWinB, 'b')],
    [
      'MAIS VITÓRIAS SEGUIDAS',
      `${streakLine(A.short, summary.streakA)} · ${streakLine(B.short, summary.streakB)}`,
    ],
    ['A LIDERANÇA TROCOU DE LADO', times(summary.leadChanges, 'vez', 'vezes')],
  ];
  const runtime = {
    timing: t,
    colors: { a: A.color, b: B.color, draw: DRAW_COLOR },
    short: { a: A.short, b: B.short },
    showDetail: t.perMatch >= 0.6,
    text: { goals: '{n} gols', progress: 'JOGO {k} / {n}' },
    lead: {
      start: 'COMEÇA O CONFRONTO',
      a: { text: `${A.name.toUpperCase()} À FRENTE · +{n}`, bg: A.color, ink: A.ink },
      b: { text: `${B.name.toUpperCase()} À FRENTE · +{n}`, bg: B.color, ink: B.ink },
      tie: { text: 'EMPATE NO CONFRONTO', bg: '#343B4D', ink: '#F4F6FA' },
    },
    steps: all.map((s) => ({
      y: s.year,
      label: chipDate(s.date),
      a: s.a,
      b: s.b,
      o: s.outcome,
      c: s.competition,
      pl: s.place,
      t: s.tally,
      pc: percentages([s.tally.winsA, s.tally.draws, s.tally.winsB]),
    })),
    chart: chartPoints(all),
    ticks: yearTicks(all),
  };
  const { zero } = runtime.chart;
  const footer = `Fonte: ${data.source.name} · ${data.source.license} · lida em ${brDate(data.source.retrieved)}`;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="confronto.css">
<script src="gsap.min.js"></script>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-duration="${t.total}" data-width="${WIDTH}" data-height="${HEIGHT}" data-fps="${FPS}">
  <div id="cena" class="layer clip" data-start="0" data-duration="${t.total}">
    <div class="abs year" id="year"></div>
    <div class="abs kicker intro">${escapeHtml(`${data.sport} · ${times(summary.matches, 'jogo', 'jogos')} · ${span}`.toUpperCase())}</div>
    <div class="abs progress intro" id="progress"></div>
    <div class="abs title intro">${titleHtml}</div>
    <div class="abs subtitle intro">${escapeHtml(vm.hook ?? `Todos os ${times(summary.matches, 'jogo', 'jogos')}, um por um`)}</div>

    <div class="abs side a intro">
      <div class="badge" style="background:${A.color};color:${A.ink}">${escapeHtml(A.short)}</div>
      <div class="name">${escapeHtml(A.name.toUpperCase())}</div>
      <div class="role">VITÓRIAS</div>
      <div class="big" id="wins-a" style="color:${textA}">0</div>
      <div class="goals" id="goals-a"></div>
    </div>
    <div class="abs draws intro">
      <div class="role">EMPATES</div>
      <div class="mid" id="draws">0</div>
    </div>
    <div class="abs side b intro">
      <div class="badge" style="background:${B.color};color:${B.ink}">${escapeHtml(B.short)}</div>
      <div class="name">${escapeHtml(B.name.toUpperCase())}</div>
      <div class="role">VITÓRIAS</div>
      <div class="big" id="wins-b" style="color:${textB}">0</div>
      <div class="goals" id="goals-b"></div>
    </div>

    <div class="abs lead intro"><span class="pill" id="lead-pill"></span></div>
    <div class="abs bar intro">
      <div class="seg" id="seg-a" style="background:${A.color}"></div>
      <div class="seg" id="seg-d" style="background:${DRAW_COLOR}"></div>
      <div class="seg" id="seg-b" style="background:${B.color}"></div>
    </div>
    <div class="abs pct a intro" id="pct-a" style="color:${textA}"></div>
    <div class="abs pct d intro" id="pct-d"></div>
    <div class="abs pct b intro" id="pct-b" style="color:${textB}"></div>

    <div class="race-only">
      <div class="abs chart-label intro">SALDO DE VITÓRIAS · ${escapeHtml(A.short)} ACIMA, ${escapeHtml(B.short)} ABAIXO</div>
      <svg class="abs chart intro" viewBox="0 0 ${CHART_W} ${CHART_H}" width="${CHART_W}" height="${CHART_H}">
        <defs>
          <clipPath id="up"><rect x="0" y="0" width="${CHART_W}" height="${zero}"/></clipPath>
          <clipPath id="down"><rect x="0" y="${zero}" width="${CHART_W}" height="${CHART_H - zero}"/></clipPath>
        </defs>
        <line x1="0" y1="${zero}" x2="${CHART_W}" y2="${zero}" stroke="#343B4D" stroke-width="2" stroke-dasharray="6 8"/>
        <path id="chart-area-up" clip-path="url(#up)" fill="${A.color}" fill-opacity="0.28"/>
        <path id="chart-area-down" clip-path="url(#down)" fill="${B.color}" fill-opacity="0.28"/>
        <path id="chart-line" fill="none" stroke="#F4F6FA" stroke-width="3" stroke-linejoin="round"/>
        <circle id="chart-dot" r="0" fill="#F4F6FA"/>
      </svg>
      <div class="abs ticks intro" id="ticks"></div>
      <div class="abs strip-window intro"><div class="strip" id="strip"></div></div>
      <div class="abs detail intro" id="detail"></div>
    </div>

    <div class="abs verdict">
      <div class="row head" style="color:${verdict.color}">${escapeHtml(verdict.text)}</div>
${rows.map(([k, v]) => `      <div class="row"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div></div>`).join('\n')}
    </div>
    <div class="abs outro-line" id="outro-line" style="background:${verdict.color}"></div>

    <div class="abs footer intro">${escapeHtml(footer)}<br>${escapeHtml(data.source.note)}</div>
  </div>
  <audio id="sfx" class="clip" src="sfx.wav" data-start="0" data-duration="${t.total}" data-volume="1"></audio>
</div>
<script type="application/json" id="confronto-data">${scriptJson(runtime)}</script>
<script src="confronto.js"></script>
</body>
</html>
`;
}

export const FONTS = [
  'assets/fonts/bebas-neue/BebasNeue-Regular.ttf',
  'assets/fonts/inter/Inter-Regular.otf',
  'assets/fonts/inter/Inter-SemiBold.otf',
  'assets/fonts/inter/Inter-Bold.otf',
];

/** Writes a self-contained project: no network at render time. */
export function writeProject(vm: ViewModel, dir: string): void {
  mkdirSync(join(dir, 'fonts'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), html(vm));
  copyFileSync(join(TEMPLATES, 'confronto.css'), join(dir, 'confronto.css'));
  copyFileSync(join(TEMPLATES, 'confronto.js'), join(dir, 'confronto.js'));
  copyFileSync(require.resolve('gsap/dist/gsap.min.js'), join(dir, 'gsap.min.js'));
  for (const font of FONTS) {
    copyFileSync(join(REPO, font), join(dir, 'fonts', font.split('/').pop()!));
  }
  writeFileSync(join(dir, 'sfx.wav'), renderWav(vm.timing.total, soundTrack(vm)));
}

export function readConfronto(path: string): Confronto {
  return JSON.parse(readFileSync(path, 'utf8')) as Confronto;
}
