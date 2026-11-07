// Junta os trechos de vídeo e mixa narração e efeitos, cada som no seu quadro.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Argumentos do FFmpeg: silêncio do tamanho do vídeo + cada evento atrasado até o seu quadro. */
export function argumentosDaMixagem({ lista, sons, publico, fps, duracao, saida }) {
  const segundos = (duracao / fps).toFixed(3);
  const entradas = [
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    lista,
    '-f',
    'lavfi',
    '-t',
    segundos,
    '-i',
    'anullsrc=r=48000:cl=stereo',
  ];
  const filtros = [];
  sons.forEach((s, i) => {
    entradas.push('-i', join(publico, s.src));
    const ms = Math.round((s.inicio / fps) * 1000);
    filtros.push(
      `[${i + 2}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}:all=1,volume=${s.volume}[s${i}]`,
    );
  });
  const rotulos = ['[1:a]', ...sons.map((_, i) => `[s${i}]`)].join('');
  filtros.push(`${rotulos}amix=inputs=${sons.length + 1}:normalize=0:duration=first,alimiter=limit=0.97[a]`);
  return [
    '-y',
    '-loglevel',
    'error',
    ...entradas,
    '-filter_complex',
    filtros.join(';'),
    '-map',
    '0:v',
    '-map',
    '[a]',
    '-c:v',
    'copy',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-t',
    segundos,
    '-movflags',
    '+faststart',
    saida,
  ];
}

export function mixar({ trechos, pasta, ...resto }) {
  const lista = join(pasta, 'lista.txt');
  writeFileSync(lista, trechos.map((t) => `file '${t}'`).join('\n'));
  execFileSync('ffmpeg', argumentosDaMixagem({ lista, ...resto }), { stdio: 'inherit' });
}
