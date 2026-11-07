// Dois quadros de cada cena (fim da entrada e perto do fim), para olhar antes do render:
// texto cortado, sobreposto ou fora da área segura.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAIDA } from './comum.mjs';
import { abrirAnuncio, quadro } from './navegador.mjs';

const anuncio = await abrirAnuncio();
try {
  const pagina = await anuncio.pagina();
  const { cenas, duracao, fps } = pagina.meta;
  const pasta = join(SAIDA, 'quadros');
  rmSync(pasta, { recursive: true, force: true });
  mkdirSync(pasta, { recursive: true });
  for (const [i, c] of cenas.entries()) {
    for (const [nome, frame] of [
      ['a', Math.min(c.inicio + 45, c.fim - 12)],
      ['b', c.fim - 12],
    ])
      writeFileSync(
        join(pasta, `cena-${String(i).padStart(2, '0')}-${nome}.png`),
        await quadro(pagina, frame, anuncio.erros),
      );
    console.log(`cena ${i}: quadros ${c.inicio}–${c.fim}`);
  }
  console.log(`Quadros em anuncio/out/quadros (${(duracao / fps).toFixed(1)} s).`);
} finally {
  await anuncio.fechar();
}
