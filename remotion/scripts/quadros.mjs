// Um quadro de cada cena (no fim da animação de entrada e perto do fim da cena), para olhar
// antes do render: texto cortado, sobreposto ou fora da área segura.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { RAIZ, SAIDA, arquivoDoAnuncio } from './comum.mjs';

const inputProps = JSON.parse(readFileSync(arquivoDoAnuncio(), 'utf8'));
const serveUrl = await bundle({ entryPoint: join(RAIZ, 'src', 'index.ts') });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const composition = await selectComposition({ serveUrl, id: 'Anuncio', inputProps, browserExecutable });
const pasta = join(SAIDA, 'quadros');
mkdirSync(pasta, { recursive: true });
const cenas = composition.props.calculado.cenas;
for (const [i, c] of cenas.entries()) {
  const tipo = inputProps.cenas[i].tipo;
  for (const [nome, frame] of [
    ['a', Math.min(c.inicio + 45, c.fim - 12)],
    ['b', c.fim - 12],
  ]) {
    const output = join(pasta, `cena-${String(i).padStart(2, '0')}-${tipo}-${nome}.png`);
    await renderStill({ composition, serveUrl, inputProps, frame, output, browserExecutable });
  }
  console.log(`cena ${i} (${tipo}): frames ${c.inicio}–${c.fim}`);
}
console.log(
  `Quadros em out/quadros (${composition.durationInFrames} frames, ${(composition.durationInFrames / composition.fps).toFixed(1)} s).`,
);
