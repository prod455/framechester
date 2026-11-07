// Formato do anúncio (anuncio.json). Uma cena por frase da narração; cada animação fica
// presa a uma palavra dita (`em`). Validação estrita: um campo errado para o render aqui,
// e não vira um quadro estranho no vídeo.
import { tokens, casaTermo } from './alinhar.ts';

export const sons = ['pop', 'whoosh', 'notificacao', 'papel', 'caixa'] as const;
export type Som = (typeof sons)[number];
export const icones = ['tesoura', 'raio', 'check', 'estrela'] as const;
export type Icone = (typeof icones)[number];
export const fontes = ['archivo-black', 'inter', 'bebas-neue'] as const;
export type Fonte = (typeof fontes)[number];

export type Linha = { descricao: string; valor: number; cortar?: boolean };

type Base = { frase: string; som?: Som | null };
export type Cena = Base &
  (
    | { tipo: 'numero'; titulo: string; valor: number; prefixo?: string; sufixo?: string; em?: string }
    | { tipo: 'titulo'; texto: string }
    | { tipo: 'personagem'; texto: string; imagem: string; prompt: string; em?: string }
    | { tipo: 'extrato'; titulo: string; linhas: Linha[] }
    | { tipo: 'app'; titulo: string; linhas: Linha[]; em: string }
    | { tipo: 'palavras'; palavras: [string, string, string]; slogan?: string }
    | { tipo: 'logo'; slogan?: string; em?: string }
    | { tipo: 'camadas'; texto: string; em: string; alternar_em: string }
    | { tipo: 'final'; texto: string }
  );
export type TipoCena = Cena['tipo'];

export type Anuncio = {
  marca: { nome: string; icone: Icone };
  cor: string;
  fonte: Fonte;
  audio: string | null;
  palavras: string;
  cenas: Cena[];
};

const tiposCena: readonly TipoCena[] = [
  'numero',
  'titulo',
  'personagem',
  'extrato',
  'app',
  'palavras',
  'logo',
  'camadas',
  'final',
];

export class AnuncioInvalido extends Error {}

type Obj = Record<string, unknown>;
const falha = (onde: string, detalhe: string): never => {
  throw new AnuncioInvalido(`${onde}: ${detalhe}`);
};
const objeto = (v: unknown, onde: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Obj)
    : falha(onde, 'precisa ser um objeto');
const texto = (v: unknown, onde: string, max = 120): string => {
  if (typeof v !== 'string' || !v.trim() || [...v].length > max)
    falha(onde, `texto de 1 a ${max} caracteres`);
  return (v as string).trim();
};
const opcional = <T>(v: unknown, ler: (v: unknown) => T): T | undefined =>
  v === undefined ? undefined : ler(v);
const numero = (v: unknown, onde: string): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : falha(onde, 'número finito e não negativo');
const umDe = <T extends string>(v: unknown, lista: readonly T[], onde: string): T =>
  lista.includes(v as T) ? (v as T) : falha(onde, `use um de: ${lista.join(', ')}`);
const caminho = (v: unknown, onde: string): string => {
  const p = texto(v, onde, 200);
  if (p.startsWith('/') || p.split('/').includes('..')) falha(onde, 'caminho relativo dentro de public/');
  return p;
};
const semCampoExtra = (o: Obj, permitidos: string[], onde: string) => {
  for (const chave of Object.keys(o))
    if (!permitidos.includes(chave)) falha(onde, `campo desconhecido "${chave}"`);
};
/** Cada palavra-gatilho precisa ser dita na frase da cena, senão a animação não tem quando acontecer. */
const dita = (termo: string, frase: string, onde: string) => {
  if (!tokens(frase).some((t) => casaTermo(t, termo))) falha(onde, `"${termo}" não é dito na frase da cena`);
  return termo;
};
const linhas = (v: unknown, onde: string): Linha[] => {
  if (!Array.isArray(v) || v.length < 2 || v.length > 6) falha(onde, 'de 2 a 6 linhas');
  return (v as unknown[]).map((item, i) => {
    const o = objeto(item, `${onde}[${i}]`);
    semCampoExtra(o, ['descricao', 'valor', 'cortar'], `${onde}[${i}]`);
    const cortar = opcional(o.cortar, (c) =>
      typeof c === 'boolean' ? c : falha(`${onde}[${i}].cortar`, 'true ou false'),
    );
    return {
      descricao: texto(o.descricao, `${onde}[${i}].descricao`, 28),
      valor: numero(o.valor, `${onde}[${i}].valor`),
      ...(cortar === undefined ? {} : { cortar }),
    };
  });
};

const camposPorTipo: Record<TipoCena, string[]> = {
  numero: ['titulo', 'valor', 'prefixo', 'sufixo', 'em'],
  titulo: ['texto'],
  personagem: ['texto', 'imagem', 'prompt', 'em'],
  extrato: ['titulo', 'linhas'],
  app: ['titulo', 'linhas', 'em'],
  palavras: ['palavras', 'slogan'],
  logo: ['slogan', 'em'],
  camadas: ['texto', 'em', 'alternar_em'],
  final: ['texto'],
};

function cena(v: unknown, i: number): Cena {
  const onde = `cenas[${i}]`;
  const o = objeto(v, onde);
  const tipo = umDe(o.tipo, tiposCena, `${onde}.tipo`);
  semCampoExtra(o, ['tipo', 'frase', 'som', ...camposPorTipo[tipo]], onde);
  const frase = texto(o.frase, `${onde}.frase`, 220);
  if (/\.\.\.|…/.test(frase)) falha(`${onde}.frase`, 'sem reticências: a voz clonada pode esticar o som');
  if (/\d/.test(frase)) falha(`${onde}.frase`, 'escreva os números por extenso na narração');
  const som = o.som === null ? null : opcional(o.som, (s) => umDe(s, sons, `${onde}.som`));
  const base = { frase, ...(som === undefined ? {} : { som }) };
  const em = (campo: string) =>
    opcional(o[campo], (t) => dita(texto(t, `${onde}.${campo}`, 40), frase, `${onde}.${campo}`));
  const destaque = (campo: string) => {
    const t = texto(o[campo], `${onde}.${campo}`, 60);
    if ((t.match(/\*/g) ?? []).length > 2) falha(`${onde}.${campo}`, 'só uma *palavra* em destaque');
    return t;
  };
  switch (tipo) {
    case 'numero': {
      const prefixo = opcional(o.prefixo, (t) => texto(t, `${onde}.prefixo`, 4));
      const sufixo = opcional(o.sufixo, (t) => texto(t, `${onde}.sufixo`, 8));
      const gatilho = em('em');
      return {
        ...base,
        tipo,
        titulo: texto(o.titulo, `${onde}.titulo`, 32),
        valor: numero(o.valor, `${onde}.valor`),
        ...(prefixo ? { prefixo } : {}),
        ...(sufixo ? { sufixo } : {}),
        ...(gatilho ? { em: gatilho } : {}),
      };
    }
    case 'titulo':
      return { ...base, tipo, texto: destaque('texto') };
    case 'personagem': {
      const gatilho = em('em');
      return {
        ...base,
        tipo,
        texto: destaque('texto'),
        imagem: caminho(o.imagem, `${onde}.imagem`),
        prompt: texto(o.prompt, `${onde}.prompt`, 200),
        ...(gatilho ? { em: gatilho } : {}),
      };
    }
    case 'extrato':
      return {
        ...base,
        tipo,
        titulo: texto(o.titulo, `${onde}.titulo`, 28),
        linhas: linhas(o.linhas, `${onde}.linhas`),
      };
    case 'app': {
      const l = linhas(o.linhas, `${onde}.linhas`);
      if (!l.some((x) => x.cortar)) falha(`${onde}.linhas`, 'marque ao menos uma linha com "cortar": true');
      if (l.every((x) => x.cortar)) falha(`${onde}.linhas`, 'deixe ao menos uma linha sem cortar');
      return {
        ...base,
        tipo,
        titulo: texto(o.titulo, `${onde}.titulo`, 28),
        linhas: l,
        em: em('em') ?? falha(`${onde}.em`, 'diga em que palavra a tesoura começa'),
      };
    }
    case 'palavras': {
      const p = o.palavras;
      if (!Array.isArray(p) || p.length !== 3) falha(`${onde}.palavras`, 'exatamente 3 palavras');
      const tres = (p as unknown[]).map((w, j) =>
        dita(texto(w, `${onde}.palavras[${j}]`, 14), frase, `${onde}.palavras[${j}]`),
      );
      const slogan = opcional(o.slogan, (t) => texto(t, `${onde}.slogan`, 40));
      return { ...base, tipo, palavras: tres as [string, string, string], ...(slogan ? { slogan } : {}) };
    }
    case 'logo': {
      const slogan = opcional(o.slogan, (t) => texto(t, `${onde}.slogan`, 40));
      const gatilho = em('em');
      return { ...base, tipo, ...(slogan ? { slogan } : {}), ...(gatilho ? { em: gatilho } : {}) };
    }
    case 'camadas':
      return {
        ...base,
        tipo,
        texto: destaque('texto'),
        em: em('em') ?? falha(`${onde}.em`, 'diga em que palavra as camadas se separam'),
        alternar_em:
          em('alternar_em') ?? falha(`${onde}.alternar_em`, 'diga em que palavra o botão vira para clone'),
      };
    case 'final':
      return { ...base, tipo, texto: destaque('texto') };
  }
}

export function validarAnuncio(v: unknown): Anuncio {
  const o = objeto(v, 'anuncio');
  semCampoExtra(o, ['marca', 'cor', 'fonte', 'audio', 'palavras', 'cenas', 'calculado'], 'anuncio');
  const marca = objeto(o.marca, 'marca');
  semCampoExtra(marca, ['nome', 'icone'], 'marca');
  const cor = texto(o.cor, 'cor', 20);
  if (!/^#[0-9a-fA-F]{6}$/.test(cor)) falha('cor', 'cor hexadecimal como #FF5A36');
  if (!Array.isArray(o.cenas) || o.cenas.length < 3 || o.cenas.length > 16) falha('cenas', 'de 3 a 16 cenas');
  return {
    marca: { nome: texto(marca.nome, 'marca.nome', 24), icone: umDe(marca.icone, icones, 'marca.icone') },
    cor: cor.toUpperCase(),
    fonte: umDe(o.fonte, fontes, 'fonte'),
    audio: o.audio === null ? null : caminho(o.audio, 'audio'),
    palavras: caminho(o.palavras, 'palavras'),
    cenas: (o.cenas as unknown[]).map(cena),
  };
}
