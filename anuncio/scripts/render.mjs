// Prévia (CRF 18) ou versão final (CRF 12, capturada em 2× e reduzida com lanczos), as duas em
// 1080×1920 no fps do projeto: o mesmo perfil de Short que o QA do Framechester confere.
// Cada trabalhador gera um trecho contínuo; o FFmpeg junta os trechos e mixa os sons.
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join, relative } from 'node:path';
import { PUBLICO, RAIZ, SAIDA } from './comum.mjs';
import { mixar } from './mixar.mjs';
import { abrirAnuncio, quadro } from './navegador.mjs';
import { FPS_SAIDA, planoDeQuadros } from './plano.mjs';
import { qaDoProjeto } from './qa.mjs';

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
  const plano = planoDeQuadros({ duracao, fpsInterno: fps, trabalhadores });
  const paginas = [primeira, ...(await Promise.all(plano.trechos.slice(1).map(() => anuncio.pagina())))];
  let feitos = 0;
  const trechos = await Promise.all(
    plano.trechos.map(async (quadros, i) => {
      const arquivo = join(tmp, `${String(i).padStart(2, '0')}.mp4`);
      const ffmpeg = spawn(
        'ffmpeg',
        [
          ...[
            '-y',
            '-loglevel',
            'error',
            '-f',
            'image2pipe',
            '-framerate',
            String(FPS_SAIDA),
            '-c:v',
            'png',
            '-i',
            '-',
          ],
          ...(final ? ['-vf', 'scale=1080:1920:flags=lanczos'] : []),
          ...[
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            String(crf),
            '-pix_fmt',
            'yuv420p',
            '-r',
            String(FPS_SAIDA),
          ],
          arquivo,
        ],
        { stdio: ['pipe', 'inherit', 'inherit'] },
      );
      const terminou = new Promise((ok, falha) =>
        ffmpeg.on('close', (c) => (c === 0 ? ok() : falha(new Error(`ffmpeg saiu com ${c}`)))),
      );
      for (const f of quadros) {
        const png = await quadro(paginas[i], f, anuncio.erros);
        if (!ffmpeg.stdin.write(png)) await new Promise((ok) => ffmpeg.stdin.once('drain', ok));
        if (++feitos % 60 === 0) console.log(`${feitos}/${plano.total} quadros`);
      }
      ffmpeg.stdin.end();
      await terminou;
      return arquivo;
    }),
  );
  mixar({ trechos, pasta: tmp, sons, publico: PUBLICO, fps, duracao, saida });
  rmSync(tmp, { recursive: true, force: true });
  console.log(
    `Vídeo em anuncio/${relative(RAIZ, saida)} (${plano.segundos.toFixed(1)} s, ${sons.length} sons).`,
  );
} finally {
  await anuncio.fechar();
}

// A versão final só fica pronta se passar no mesmo QA técnico dos Shorts do canal.
if (final) process.exit(qaDoProjeto(saida));
