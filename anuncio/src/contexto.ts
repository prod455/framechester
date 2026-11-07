import { createContext, useContext } from 'react';
import type { Anuncio, Cena } from './anuncio.ts';
import type { CenaNoTempo } from './alinhar.ts';
import type { Tons } from './estilo.ts';

export type Calculado = {
  cenas: CenaNoTempo[];
  duracao: number;
  audio: boolean;
  sons: boolean;
  imagens: Record<string, boolean>;
  fonteDasPalavras: 'faster-whisper' | 'estimativa';
};

export type ContextoCena = {
  anuncio: Anuncio;
  calculado: Calculado;
  cena: Cena;
  tempo: CenaNoTempo;
  /** Frame relativo ao início da cena (negativo durante a transição de entrada). */
  f: number;
  duracao: number;
  tons: Tons;
  /** Frame da Sequence em que a cena começa (para posicionar sons dentro dela). */
  deslocamento: number;
  indice: number;
};
export const Contexto = createContext<ContextoCena | null>(null);
export function useCena(): ContextoCena {
  const c = useContext(Contexto);
  if (!c) throw new Error('componente de cena fora do Contexto');
  return c;
}
