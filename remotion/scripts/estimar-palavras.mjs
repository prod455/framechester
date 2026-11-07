// Tempo estimado das palavras, sem áudio: serve para a prévia antes da narração existir.
// Com a narracao.wav pronta, use npm run transcrever (faster-whisper) no lugar.
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimarPalavras } from '../src/alinhar.ts';
import { PUBLICO, lerAnuncio } from './comum.mjs';

const { anuncio } = lerAnuncio();
const destino = join(PUBLICO, anuncio.palavras);
if (existsSync(destino) && !process.argv.includes('--sobrescrever')) {
  console.error(`public/${anuncio.palavras} já existe. Use --sobrescrever para trocar pela estimativa.`);
  process.exit(1);
}
const transcricao = estimarPalavras(anuncio.cenas.map((c) => c.frase));
writeFileSync(destino, `${JSON.stringify(transcricao, null, 1)}\n`);
console.log(
  `Estimativa em public/${anuncio.palavras}: ${transcricao.palavras.at(-1).fim.toFixed(1)} s de fala.`,
);
