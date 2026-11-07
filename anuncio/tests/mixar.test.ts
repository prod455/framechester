import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo .mjs sem tipos
import { argumentosDaMixagem } from '../scripts/mixar.mjs';

test('cada som entra no seu quadro e o silêncio fixa a duração do vídeo', () => {
  const args: string[] = argumentosDaMixagem({
    lista: 'l.txt',
    sons: [
      { src: 'narracao.wav', inicio: 0, volume: 1 },
      { src: 'sfx/pop.wav', inicio: 90, volume: 0.42 },
    ],
    publico: '/p',
    fps: 60,
    duracao: 600,
    saida: 'o.mp4',
  });
  const filtro = args[args.indexOf('-filter_complex') + 1]!;
  assert.match(filtro, /\[2:a\].*adelay=0:all=1,volume=1\[s0\]/);
  assert.match(filtro, /\[3:a\].*adelay=1500:all=1,volume=0.42\[s1\]/);
  assert.match(filtro, /\[1:a\]\[s0\]\[s1\]amix=inputs=3:normalize=0:duration=first/);
  assert.ok(args.includes('/p/sfx/pop.wav'));
  assert.equal(args.at(-1), 'o.mp4');
  assert.ok(args.includes('10.000'));
});
