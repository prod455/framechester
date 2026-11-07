// Prévia (CRF 18, 1080×1920) ou versão final do guia (H.264, CRF 12, 60 fps, 2160×3840).
// Cada trabalhador gera um trecho contínuo; o FFmpeg junta os trechos e mixa os sons.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { PUBLICO, RAIZ, SAIDA } from './comum.mjs';
import { mixar } from './mixar.mjs';
import { abrirAnuncio, quadro } from './navegador.mjs';

const final = process.argv.includes('--final');
if (final)
  execFileSync(process.execPath, [join(RAIZ, 'scripts', 'checar.mjs'), '--final'], { stdio: 'inherit' });
const crf = final ? 12 : 18;
const saida = join(SAIDA, final ? 'final.mp4' : 'previa.mp4');
const tmp = join(SAIDA, 'trechos');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

process.on('unhandledRejection', (e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
const anuncio = await abrirAnuncio({ escala: final ? 2 : 1 });
try {
  const primeira = await anuncio.pagina();
  const { duracao, fps } = primeira.meta;
  const sons = await primeira.p.evaluate(() => window.__anuncio.sons());
  const trabalhadores = Math.max(
    1,
    Math.min(Number(process.env.TRABALHADORES) || availableParallelism() - 1, 8),
  );
  const tamanho = Math.ceil(duracao / trabalhadores);
  const paginas = [
    primeira,
    ...(await Promise.all(Array.from({ length: trabalhadores - 1 }, () => anuncio.pagina()))),
  ];
  let feitos = 0;
  const trechos = await Promise.all(
    paginas.map(async (pagina, i) => {
      const de = i * tamanho;
      const ate = Math.min(duracao, de + tamanho);
      const arquivo = join(tmp, `${String(i).padStart(2, '0')}.mp4`);
      if (de >= ate) return null;
      const ffmpeg = spawn(
        'ffmpeg',
        [
          '-y',
          '-loglevel',
          'error',
          '-f',
          'image2pipe',
          '-framerate',
          String(fps),
          '-c:v',
          'png',
          '-i',
          '-',
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          String(crf),
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(fps),
          arquivo,
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] },
      );
      const terminou = new Promise((ok, falha) =>
        ffmpeg.on('close', (c) => (c === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${c}`)))),
      );
      for (let f = de; f < ate; f++) {
        const png = await quadro(pagina, f, anuncio.erros);
        if (!ffmpeg.stdin.write(png)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
        if (++feitos % 120 === 0) console.log(`${feitos}/${duracao} quadros`);
      }
      ffmpeg.stdin.end();
      await terminou;
      return arquivo;
    }),
  );
  mixar({ trechos: trechos.filter(Boolean), pasta: tmp, sons, publico: PUBLICO, fps, duracao, saida });
  const segundos = (duracao / fps).toFixed(1);
  rmSync(tmp, { recursive: true, force: true });
  console.log(`Vídeo em anuncio/out/${final ? 'final' : 'previa'}.mp4 (${segundos} s, ${sons.length} sons).`);
} finally {
  await anuncio.fechar();
}
