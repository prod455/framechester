// framechester-hyperframes CLI, chamado pelo motor (`framechester confronto`, `framechester internacionais`).
//   internacionais  CSV do international_results → JSON de confronto (com hash e data de leitura)
//   confronto       JSON de confronto → projeto HyperFrames → MP4 → manifesto; o QA técnico é do motor
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { readConfronto, viewModel, writeProject } from './composicao.ts';
import { buildConfronto } from './internacionais.ts';
import { type Quality, lint, packageVersion, render, sha256File } from './render.ts';

const USAGE = `uso (pelo motor, que também roda o QA técnico):
  framechester internacionais --csv results.csv --a Brazil --b Argentina --lido-em 2026-11-13 --saida confronto.json
  framechester confronto --dados confronto.json --saida artifacts/confronto [--qualidade draft|standard|high] [--corrida 46] [--sem-render]`;

function required(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || !value) throw new Error(`falta --${key}\n${USAGE}`);
  return value;
}

/** `npm --prefix hyperframes run` moves into hyperframes/; paths stay relative to where the operator typed. */
function path(values: Record<string, unknown>, key: string): string {
  return resolve(process.env.INIT_CWD ?? process.cwd(), required(values, key));
}

function internacionais(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      csv: { type: 'string' },
      a: { type: 'string' },
      b: { type: 'string' },
      'lido-em': { type: 'string' },
      saida: { type: 'string' },
    },
  });
  const data = buildConfronto({
    csv: readFileSync(path(values, 'csv'), 'utf8'),
    teamA: required(values, 'a'),
    teamB: required(values, 'b'),
    retrieved: required(values, 'lido-em'),
  });
  const vm = viewModel(data);
  const out = path(values, 'saida');
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  const t = vm.summary.tally;
  console.log(
    `${out}: ${vm.summary.matches} jogos ${vm.summary.firstYear}–${vm.summary.lastYear} · ` +
      `${data.sides[0].short} ${t.winsA} · empates ${t.draws} · ${data.sides[1].short} ${t.winsB}`,
  );
  return 0;
}

function confronto(args: string[]): number {
  const { values } = parseArgs({
    args,
    options: {
      dados: { type: 'string' },
      saida: { type: 'string' },
      qualidade: { type: 'string', default: 'standard' },
      corrida: { type: 'string' },
      'sem-render': { type: 'boolean', default: false },
    },
  });
  const quality = values.qualidade as Quality;
  if (!['draft', 'standard', 'high'].includes(quality)) throw new Error(`--qualidade inválida: ${quality}`);
  const raceSeconds = values.corrida === undefined ? undefined : Number(values.corrida);
  if (raceSeconds !== undefined && !(raceSeconds > 0))
    throw new Error(`--corrida inválida: ${values.corrida}`);

  const dataPath = path(values, 'dados');
  const out = path(values, 'saida');
  const project = join(out, 'projeto');
  const vm = viewModel(readConfronto(dataPath), raceSeconds);
  mkdirSync(out, { recursive: true });
  writeProject(vm, project);
  lint(project);
  console.log(`projeto: ${project} · ${vm.timing.total}s · ${vm.timing.perMatch}s por jogo`);
  if (values['sem-render']) return 0;

  const video = join(out, 'final.mp4');
  const started = Date.now();
  render(project, video, quality);
  const renderSeconds = (Date.now() - started) / 1000;
  const manifest = {
    renderer: 'hyperframes',
    template: 'confronto',
    versions: { hyperframes: packageVersion('hyperframes'), gsap: packageVersion('gsap') },
    quality,
    data: { path: dataPath, sha256: sha256File(dataPath), source: vm.data.source },
    project: { index_sha256: sha256File(join(project, 'index.html')) },
    video: { path: video, sha256: sha256File(video) },
    timing: vm.timing,
    summary: vm.summary,
    render_seconds: renderSeconds,
    qa: { status: 'pending', detail: 'o motor grava aqui o veredito do framechester qa' },
  };
  writeFileSync(join(out, 'render_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`vídeo: ${video} · render ${renderSeconds.toFixed(1)}s`);
  return 0;
}

function main(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === 'internacionais') return internacionais(rest);
  if (command === 'confronto') return confronto(rest);
  console.error(USAGE);
  return 64;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
