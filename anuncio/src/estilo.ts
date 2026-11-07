// Tokens visuais do anúncio: interface clara e minimalista, um acento de cor.
import type { Fonte } from './anuncio.ts';

export const FPS = 60;
export const LARGURA = 1080;
export const ALTURA = 1920;
/** Margem lateral e faixa de segurança das interfaces de Reels/Shorts/TikTok. */
export const MARGEM = 84;
export const TOPO_SEGURO = 220;
export const BASE_SEGURA = 360;

export const TINTA = '#15171D';
export const SECUNDARIO = '#5B6170';
export const PAPEL = '#FBFAF7';

/** Transforms com 2 casas: o mesmo quadro sai igual em qualquer máquina. */
export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const limitar = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
export const easeOut = (t: number) => 1 - Math.pow(1 - limitar(t), 3);
export const easeInOut = (t: number) => {
  const x = limitar(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

const canal = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
export function misturar(hex: string, com: string, quanto: number): string {
  const c = [0, 1, 2].map((i) => Math.round(canal(hex, i) * (1 - quanto) + canal(com, i) * quanto));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
export const alfa = (hex: string, a: number) =>
  `rgba(${canal(hex, 0)}, ${canal(hex, 1)}, ${canal(hex, 2)}, ${r2(a)})`;

export type Tons = { cor: string; claro: string; suave: string; escuro: string };
export const tons = (cor: string): Tons => ({
  cor,
  claro: misturar(cor, '#FFFFFF', 0.86),
  suave: misturar(cor, '#FFFFFF', 0.55),
  escuro: misturar(cor, '#000000', 0.28),
});

export const arquivosDeFonte: Record<Fonte, string> = {
  'archivo-black': 'fonts/ArchivoBlack-Regular.ttf',
  inter: 'fonts/Inter-Bold.otf',
  'bebas-neue': 'fonts/BebasNeue-Regular.ttf',
};
export const familiaTitulo = (fonte: Fonte) => `Titulo-${fonte}`;
export const FONTE_TEXTO = 'AnuncioTexto';
export const ARQUIVO_TEXTO = 'fonts/Inter-SemiBold.otf';

export const vidro = {
  background: 'rgba(255, 255, 255, 0.58)',
  border: '2px solid rgba(255, 255, 255, 0.85)',
  boxShadow: '0 30px 80px rgba(21, 23, 29, 0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
  backdropFilter: 'blur(28px) saturate(140%)',
  borderRadius: 48,
} as const;
