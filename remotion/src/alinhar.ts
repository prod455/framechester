// Alinha as frases do roteiro às palavras transcritas (faster-whisper) e monta a linha do
// tempo das cenas. O Whisper às vezes escreve "3.847" onde o roteiro diz "três mil
// oitocentos e quarenta e sete"; por isso o alinhamento é global (Needleman-Wunsch por
// palavra) e as palavras sem par recebem tempo interpolado entre as vizinhas.

export type Palavra = { texto: string; inicio: number; fim: number };
export type Transcricao = { fonte: 'faster-whisper' | 'estimativa'; palavras: Palavra[] };

export const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const tokens = (frase: string): string[] => frase.split(/\s+/).map(normalizar).filter(Boolean);

/** Uma palavra dita casa com o termo pelo radical de até 5 letras ("corte" casa com "cortar"). */
export function casaTermo(token: string, termo: string): boolean {
  const alvo = normalizar(termo);
  if (!alvo) return false;
  if (token === alvo) return true;
  const raiz = alvo.slice(0, Math.min(5, alvo.length));
  return alvo.length >= 4 && token.length >= 4 && token.startsWith(raiz);
}

export function validarTranscricao(v: unknown): Transcricao {
  const erro = (d: string): never => {
    throw new Error(`palavras.json: ${d}`);
  };
  if (typeof v !== 'object' || v === null) erro('precisa ser um objeto');
  const o = v as Record<string, unknown>;
  if (o.fonte !== 'faster-whisper' && o.fonte !== 'estimativa')
    erro('fonte precisa ser faster-whisper ou estimativa');
  if (!Array.isArray(o.palavras) || o.palavras.length === 0) erro('lista de palavras vazia');
  let anterior = 0;
  const palavras = (o.palavras as unknown[]).map((p, i) => {
    const w = p as Record<string, unknown>;
    if (typeof w.texto !== 'string' || typeof w.inicio !== 'number' || typeof w.fim !== 'number')
      erro(`palavra ${i} precisa de texto, inicio e fim`);
    const palavra = { texto: w.texto as string, inicio: w.inicio as number, fim: w.fim as number };
    if (!(palavra.inicio >= anterior - 1e-6) || !(palavra.fim >= palavra.inicio))
      erro(`palavra ${i} fora de ordem`);
    anterior = palavra.inicio;
    return palavra;
  });
  return { fonte: o.fonte as Transcricao['fonte'], palavras };
}

/** Para cada token do roteiro, o índice da palavra transcrita pareada (ou -1). */
export function parear(roteiro: string[], fala: string[]): number[] {
  const n = roteiro.length,
    m = fala.length;
  const ACERTO = 2,
    TROCA = -1,
    LACUNA = -1;
  const pontos: number[][] = Array.from({ length: n + 1 }, (_, i) =>
    Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j * LACUNA : j === 0 ? i * LACUNA : 0)),
  );
  const at = (i: number, j: number) => pontos[i]![j]!;
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      pontos[i]![j] = Math.max(
        at(i - 1, j - 1) + (roteiro[i - 1] === fala[j - 1] ? ACERTO : TROCA),
        at(i - 1, j) + LACUNA,
        at(i, j - 1) + LACUNA,
      );
  const par = new Array<number>(n).fill(-1);
  let i = n,
    j = m;
  while (i > 0 && j > 0) {
    const diag = at(i - 1, j - 1) + (roteiro[i - 1] === fala[j - 1] ? ACERTO : TROCA);
    if (at(i, j) === diag) {
      // Acerto ou troca: a palavra transcrita dá o tempo do token do roteiro.
      par[i - 1] = j - 1;
      i--;
      j--;
    } else if (at(i, j) === at(i - 1, j) + LACUNA) i--;
    else j--;
  }
  return par;
}

/** Tempos de cada token do roteiro, interpolando os que ficaram sem par. */
export function temposDoRoteiro(roteiro: string[], fala: Palavra[]): { inicio: number; fim: number }[] {
  const falados = fala.map((p) => normalizar(p.texto));
  // Só acertos exatos ancoram o tempo; trocas ("dois mil" × "2.000") são interpoladas
  // entre as âncoras vizinhas, para cada palavra do roteiro ganhar a sua fatia.
  const par = parear(roteiro, falados).map((j, i) => (j >= 0 && falados[j] === roteiro[i] ? j : -1));
  if (!par.some((j) => j >= 0)) throw new Error('nenhuma palavra do roteiro foi encontrada na narração');
  const tempos = par.map((j) => (j >= 0 ? { inicio: fala[j]!.inicio, fim: fala[j]!.fim } : null));
  const fimDaFala = fala[fala.length - 1]!.fim;
  for (let i = 0; i < tempos.length; i++) {
    if (tempos[i]) continue;
    let a = i - 1;
    while (a >= 0 && !tempos[a]) a--;
    let b = i;
    while (b < tempos.length && !tempos[b]) b++;
    const de = a >= 0 ? tempos[a]!.fim : 0;
    const ate = b < tempos.length ? tempos[b]!.inicio : fimDaFala;
    const passo = Math.max(0, ate - de) / (b - a - 1);
    for (let k = i; k < b; k++) {
      const inicio = de + passo * (k - a - 1);
      tempos[k] = { inicio, fim: inicio + passo };
    }
    i = b - 1;
  }
  return tempos as { inicio: number; fim: number }[];
}

export type CenaNoTempo = {
  /** Frame em que a cena está inteira na tela (o meio da transição). */
  inicio: number;
  fim: number;
  /** Palavras da frase da cena, em frames relativos ao início da cena. */
  palavras: { token: string; inicio: number; fim: number }[];
};
export type LinhaDoTempo = { fps: number; duracao: number; cenas: CenaNoTempo[] };

export const CAUDA_SEGUNDOS = 1.2;
export const MIN_FRAMES_CENA = 20;

export function linhaDoTempo(frases: string[], fala: Palavra[], fps: number): LinhaDoTempo {
  const porCena = frases.map(tokens);
  const todos = porCena.flat();
  const tempos = temposDoRoteiro(todos, fala);
  const f = (s: number) => Math.round(s * fps);
  let k = 0;
  const inicios: number[] = [];
  const blocos = porCena.map((toks, i) => {
    const meus = tempos.slice(k, k + toks.length);
    k += toks.length;
    inicios.push(i === 0 ? 0 : f(meus[0]!.inicio));
    return { toks, meus };
  });
  const ultimo = tempos[tempos.length - 1]!.fim;
  const duracao = f(Math.max(ultimo, fala[fala.length - 1]!.fim) + CAUDA_SEGUNDOS);
  const cenas = blocos.map(({ toks, meus }, i) => {
    const inicio = inicios[i]!;
    const fim = i + 1 < inicios.length ? inicios[i + 1]! : duracao;
    if (fim - inicio < MIN_FRAMES_CENA)
      throw new Error(
        `cena ${i}: só ${fim - inicio} frames; junte a frase com a vizinha ou fale mais devagar`,
      );
    return {
      inicio,
      fim,
      palavras: toks.map((token, j) => ({
        token,
        inicio: f(meus[j]!.inicio) - inicio,
        fim: f(meus[j]!.fim) - inicio,
      })),
    };
  });
  return { fps, duracao, cenas };
}

/** Frame (relativo à cena) em que o termo é dito pela primeira vez. */
export function quando(cena: CenaNoTempo, termo: string): number {
  const achado = cena.palavras.find((p) => casaTermo(p.token, termo));
  if (!achado) throw new Error(`"${termo}" não é dito nesta cena`);
  return Math.max(0, achado.inicio);
}

/** Estimativa sem áudio: sílabas por segundo, pausa em pontuação. Só para prévia. */
export function estimarPalavras(frases: string[], silabasPorSegundo = 5.6): Transcricao {
  const silabas = (w: string) => Math.max(1, (normalizar(w).match(/[aeiou]+/g) ?? []).length);
  let t = 0.25;
  const palavras: Palavra[] = [];
  for (const frase of frases) {
    for (const bruto of frase.split(/\s+/).filter((w) => normalizar(w))) {
      const d = silabas(bruto) / silabasPorSegundo;
      palavras.push({ texto: bruto.replace(/[^\p{L}\p{N}-]/gu, ''), inicio: round3(t), fim: round3(t + d) });
      t += d + 0.04;
      if (/[.!?]$/.test(bruto)) t += 0.32;
      else if (/[,;:]$/.test(bruto)) t += 0.14;
    }
    t += 0.12;
  }
  return { fonte: 'estimativa', palavras };
}
const round3 = (n: number) => Math.round(n * 1000) / 1000;
