import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarAnuncio, AnuncioInvalido } from '../src/anuncio.ts';
import { spring } from '../src/mola.ts';
import {
  estimarPalavras,
  linhaDoTempo,
  quando,
  temposDoRoteiro,
  tokens,
  validarTranscricao,
} from '../src/alinhar.ts';

const exemplo = JSON.parse(readFileSync(new URL('../anuncio.exemplo.json', import.meta.url), 'utf8'));
const comCena = (i: number, mudanca: Record<string, unknown>) => ({
  ...exemplo,
  cenas: exemplo.cenas.map((c: object, j: number) => (j === i ? { ...c, ...mudanca } : c)),
});

test('o exemplo é válido e as somas que a narração diz batem', () => {
  const a = validarAnuncio(exemplo);
  const app = a.cenas.find((c) => c.tipo === 'app');
  assert.ok(app && app.tipo === 'app');
  const total = app.linhas.reduce((s, l) => s + l.valor, 0);
  const sobra = app.linhas.filter((l) => !l.cortar).reduce((s, l) => s + l.valor, 0);
  assert.equal(total, 187);
  assert.equal(total * 12, 2244);
  assert.equal(total - sobra, 145);
});

test('a palavra-gatilho precisa ser dita na frase da cena', () => {
  assert.throws(() => validarAnuncio(comCena(2, { em: 'janeiro' })), /janeiro" não é dito/);
  assert.throws(() => validarAnuncio(comCena(8, { palavras: ['Viu', 'Cortou', 'Sobrou'] })), AnuncioInvalido);
});

test('a narração não leva algarismos nem reticências', () => {
  assert.throws(() => validarAnuncio(comCena(0, { frase: 'Você gasta R$ 187 por mês.' })), /por extenso/);
  assert.throws(
    () => validarAnuncio(comCena(1, { frase: 'E você jura... que só assina duas.' })),
    /reticências/,
  );
});

test('campos desconhecidos e caminhos para fora de public/ param o render', () => {
  assert.throws(() => validarAnuncio(comCena(1, { cor: '#000000' })), /campo desconhecido "cor"/);
  assert.throws(() => validarAnuncio(comCena(2, { imagem: '../segredo.png' })), /caminho relativo/);
  assert.throws(() => validarAnuncio({ ...exemplo, cor: 'vermelho' }), /hexadecimal/);
});

test('o app precisa cortar algo e deixar algo', () => {
  const linhas = [
    { descricao: 'A', valor: 1, cortar: true },
    { descricao: 'B', valor: 2, cortar: true },
  ];
  assert.throws(() => validarAnuncio(comCena(7, { linhas })), /sem cortar/);
});

test('números que o Whisper escreve com algarismos ganham tempo interpolado', () => {
  const roteiro = tokens('Isso dá dois mil reais por ano.');
  const fala = [
    { texto: 'Isso', inicio: 0, fim: 0.3 },
    { texto: 'dá', inicio: 0.3, fim: 0.5 },
    { texto: '2.000', inicio: 0.5, fim: 1.1 },
    { texto: 'reais', inicio: 1.1, fim: 1.5 },
    { texto: 'por', inicio: 1.5, fim: 1.7 },
    { texto: 'ano.', inicio: 1.7, fim: 2.0 },
  ];
  const t = temposDoRoteiro(roteiro, fala);
  assert.equal(t.length, roteiro.length);
  assert.equal(t[4]!.inicio, 1.1); // "reais" casa direto
  // "dois" e "mil" dividem o trecho do "2.000", cada um com a sua fatia
  assert.ok(Math.abs(t[2]!.inicio - 0.5) < 1e-9 && Math.abs(t[3]!.fim - 1.1) < 1e-9);
  assert.ok(t[2]!.fim > t[2]!.inicio && t[3]!.inicio >= t[2]!.fim - 1e-9);
  for (let i = 1; i < t.length; i++) assert.ok(t[i]!.inicio >= t[i - 1]!.inicio);
});

test('a linha do tempo cobre a narração e prende a animação na palavra', () => {
  const a = validarAnuncio(exemplo);
  const frases = a.cenas.map((c) => c.frase);
  const fala = estimarPalavras(frases);
  const linha = linhaDoTempo(frases, fala.palavras, 60);
  assert.equal(linha.cenas.length, a.cenas.length);
  assert.equal(linha.cenas[0]!.inicio, 0);
  assert.equal(linha.cenas.at(-1)!.fim, linha.duracao);
  for (let i = 1; i < linha.cenas.length; i++) assert.equal(linha.cenas[i]!.inicio, linha.cenas[i - 1]!.fim);
  const marco = quando(linha.cenas[2]!, 'março');
  assert.ok(marco > 0 && marco < linha.cenas[2]!.fim - linha.cenas[2]!.inicio);
  assert.throws(() => quando(linha.cenas[2]!, 'janeiro'));
});

test('transcrição fora de ordem ou vazia é recusada', () => {
  assert.throws(() => validarTranscricao({ fonte: 'faster-whisper', palavras: [] }), /vazia/);
  assert.throws(
    () =>
      validarTranscricao({
        fonte: 'faster-whisper',
        palavras: [
          { texto: 'b', inicio: 2, fim: 3 },
          { texto: 'a', inicio: 1, fim: 2 },
        ],
      }),
    /fora de ordem/,
  );
});

test('a mola é determinística, parte de 0, passa do alvo e assenta em 1', () => {
  const config = { damping: 7, stiffness: 120, mass: 0.9 };
  const valores = Array.from({ length: 240 }, (_, f) => spring({ frame: f, fps: 60, config }));
  assert.equal(valores[0], 0);
  assert.deepEqual(
    valores,
    Array.from({ length: 240 }, (_, f) => spring({ frame: f, fps: 60, config })),
  );
  assert.ok(Math.max(...valores) > 1.05, 'quica: passa do alvo');
  assert.ok(Math.abs(valores.at(-1)! - 1) < 0.01, 'assenta no alvo');
});
