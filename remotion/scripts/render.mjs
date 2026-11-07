// Prévia (CRF 18, 1080×1920) ou versão final do guia (H.264, CRF 12, 60 fps, --scale=2).
// A final só roda depois do `checar --final`.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { RAIZ, arquivoDoAnuncio } from './comum.mjs';

const final = process.argv.includes('--final');
if (final)
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'checar.mjs'), '--final'], { stdio: 'inherit' });
const saida = final ? 'out/final.mp4' : 'out/previa.mp4';
const args = [
  'remotion',
  'render',
  'src/index.ts',
  'Anuncio',
  saida,
  `--props=${arquivoDoAnuncio()}`,
  '--codec=h264',
];
args.push(...(final ? ['--crf=12', '--scale=2'] : ['--crf=18']));
if (process.env.REMOTION_BROWSER) args.push(`--browser-executable=${process.env.REMOTION_BROWSER}`);
execFileSync('npx', args, { stdio: 'inherit', cwd: RAIZ });
console.log(`Vídeo em remotion/${saida}`);
