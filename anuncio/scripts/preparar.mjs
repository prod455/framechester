// Copia as fontes OFL do repositório para public/fonts e gera os efeitos curtos com o FFmpeg.
// Os efeitos são sintetizados (seno e ruído com semente fixa): nada de arquivo sem licença.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLICO, RAIZ } from './comum.mjs';

const fontes = join(RAIZ, '..', 'assets', 'fonts');
mkdirSync(join(PUBLICO, 'fonts'), { recursive: true });
for (const [pasta, arquivo] of [
  ['archivo-black', 'ArchivoBlack-Regular.ttf'],
  ['bebas-neue', 'BebasNeue-Regular.ttf'],
  ['inter', 'Inter-Bold.otf'],
  ['inter', 'Inter-SemiBold.otf'],
])
  copyFileSync(join(fontes, pasta, arquivo), join(PUBLICO, 'fonts', arquivo));

const efeitos = {
  pop: ['-f', 'lavfi', '-i', "aevalsrc='sin(2*PI*(500+2200*t)*t)*exp(-t*28)*0.9':s=48000:d=0.2"],
  whoosh: [
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=0.45:c=pink:seed=7:a=0.6:r=48000',
    '-af',
    'highpass=f=350,lowpass=f=2800,afade=t=in:d=0.22,afade=t=out:st=0.22:d=0.23',
  ],
  notificacao: [
    '-f',
    'lavfi',
    '-i',
    "aevalsrc='(sin(2*PI*880*t)*lt(t,0.11)+sin(2*PI*1320*t)*gte(t,0.11))*exp(-mod(t,0.11)*16)*0.55':s=48000:d=0.34",
  ],
  papel: [
    '-f',
    'lavfi',
    '-i',
    'anoisesrc=d=0.38:c=white:seed=3:a=0.5:r=48000',
    '-af',
    "highpass=f=1600,lowpass=f=7000,volume='0.6+0.4*sin(2*PI*38*t)':eval=frame,afade=t=out:st=0.18:d=0.2",
  ],
  caixa: [
    '-f',
    'lavfi',
    '-i',
    "aevalsrc='(sin(2*PI*1568*t)+0.6*sin(2*PI*2349*t)+0.3*sin(2*PI*3136*t))*exp(-t*5)*0.32':s=48000:d=0.9",
  ],
};
mkdirSync(join(PUBLICO, 'sfx'), { recursive: true });
for (const [nome, args] of Object.entries(efeitos))
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    ...args,
    '-ac',
    '1',
    join(PUBLICO, 'sfx', `${nome}.wav`),
  ]);
console.log('Fontes em public/fonts e efeitos em public/sfx.');
