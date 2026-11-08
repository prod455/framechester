import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error módulo .mjs sem tipos
import { planoDeQuadros } from '../scripts/plano.mjs';

test('o vídeo sai a 30 fps pegando um quadro a cada dois da animação a 60', () => {
  const plano = planoDeQuadros({ duracao: 2731, fpsInterno: 60, fpsSaida: 30, trabalhadores: 3 });
  assert.equal(plano.passo, 2);
  assert.equal(plano.total, 1366);
  const todos: number[] = plano.trechos.flat();
  assert.deepEqual(
    todos,
    Array.from({ length: 1366 }, (_, i) => i * 2),
  );
  assert.equal(plano.trechos.length, 3);
  assert.ok(Math.abs(plano.segundos - 2731 / 60) < 1 / 30);
});

test('fps que não divide é recusado e trabalhadores a mais não criam trechos vazios', () => {
  assert.throws(() => planoDeQuadros({ duracao: 100, fpsInterno: 60, fpsSaida: 24, trabalhadores: 2 }));
  const plano = planoDeQuadros({ duracao: 4, fpsInterno: 60, fpsSaida: 30, trabalhadores: 8 });
  assert.deepEqual(plano.trechos, [[0], [2]]);
});
