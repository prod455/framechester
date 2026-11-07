// Confere tudo antes do render. Com --final, exige narração real, tempo do faster-whisper e
// todos os personagens com transparência: a versão final não sai com nada pendente.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizar, parear, tokens, validarTranscricao } from '../src/alinhar.ts';
import { PUBLICO, lerAnuncio } from './comum.mjs';

const final = process.argv.includes('--final');
const erros = [];
const avisos = [];
const falta = (msg) => (final ? erros : avisos).push(msg);

/** PNG com canal alfa (tipo de cor 4 ou 6) ou com chunk tRNS. */
function temTransparencia(arquivo) {
  const b = readFileSync(arquivo);
  if (b.subarray(1, 4).toString('ascii') !== 'PNG') return false;
  const tipo = b[25];
  return tipo === 4 || tipo === 6 || b.includes(Buffer.from('tRNS'));
}

let anuncio;
try {
  ({ anuncio } = lerAnuncio());
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}

for (const f of ['fonts/ArchivoBlack-Regular.ttf', 'fonts/Inter-SemiBold.otf'])
  if (!existsSync(join(PUBLICO, f))) erros.push(`public/${f} ausente: rode npm run preparar`);
if (!existsSync(join(PUBLICO, 'sfx', 'pop.wav')))
  avisos.push('efeitos ausentes: rode npm run preparar (o vídeo sai sem efeitos)');

for (const c of anuncio.cenas) {
  if (c.tipo !== 'personagem') continue;
  const caminho = join(PUBLICO, c.imagem);
  if (!existsSync(caminho)) falta(`public/${c.imagem} ausente: rode npm run personagens`);
  else if (!temTransparencia(caminho)) erros.push(`public/${c.imagem} não tem fundo transparente`);
}

let duracaoAudio = null;
if (!anuncio.audio) falta('anúncio sem narração ("audio": null)');
else if (!existsSync(join(PUBLICO, anuncio.audio)))
  falta(`public/${anuncio.audio} ausente: grave em public/referencia.wav uns 20 s seus e rode npm run voz`);
else
  duracaoAudio = Number(
    execFileSync('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'csv=p=0',
      join(PUBLICO, anuncio.audio),
    ])
      .toString()
      .trim(),
  );

const arquivoPalavras = join(PUBLICO, anuncio.palavras);
if (!existsSync(arquivoPalavras))
  erros.push(`public/${anuncio.palavras} ausente: rode npm run transcrever ou npm run palavras:estimar`);
else {
  const t = validarTranscricao(JSON.parse(readFileSync(arquivoPalavras, 'utf8')));
  if (t.fonte === 'estimativa') falta('tempo das palavras é estimado: rode npm run transcrever');
  const roteiro = anuncio.cenas.flatMap((c) => tokens(c.frase));
  const fala = t.palavras.map((p) => normalizar(p.texto));
  const acertos = parear(roteiro, fala).filter((j, i) => j >= 0 && fala[j] === roteiro[i]).length;
  const taxa = acertos / roteiro.length;
  if (taxa < 0.6)
    erros.push(
      `só ${Math.round(taxa * 100)}% das palavras do roteiro aparecem na transcrição: a narração não é este roteiro`,
    );
  else if (taxa < 0.85)
    avisos.push(
      `${Math.round(taxa * 100)}% das palavras do roteiro batem com a transcrição; confira as cenas no Studio`,
    );
  const fimDaFala = t.palavras.at(-1).fim;
  if (duracaoAudio !== null && Math.abs(duracaoAudio - fimDaFala) > 2.5 && t.fonte !== 'estimativa')
    erros.push(
      `a transcrição termina em ${fimDaFala.toFixed(1)} s e o áudio tem ${duracaoAudio.toFixed(1)} s: transcreva de novo`,
    );
  if (fimDaFala > 60)
    avisos.push(`${fimDaFala.toFixed(0)} s de fala: acima de 60 s o Reels e o Shorts cortam o alcance`);
}

for (const a of avisos) console.log(`! ${a}`);
for (const e of erros) console.log(`✗ ${e}`);
if (erros.length) process.exit(1);
console.log(final ? '✓ pronto para a versão final' : '✓ pronto para a prévia');
