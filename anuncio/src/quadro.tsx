// Motor de quadros do anúncio: o mínimo para descrever um vídeo em React e renderizá-lo
// quadro a quadro. Tudo é função do número do quadro; nada depende do relógio do navegador.
import { createContext, useContext, type CSSProperties, type ImgHTMLAttributes, type ReactNode } from 'react';

type Relogio = { frame: number; absoluto: number; coletando: boolean };
const ContextoRelogio = createContext<Relogio>({ frame: 0, absoluto: 0, coletando: false });

export type EventoDeSom = { src: string; inicio: number; volume: number };
const ContextoColeta = createContext<EventoDeSom[] | null>(null);

/** Raiz: define o quadro atual. Com `eventos`, renderiza tudo para listar os sons. */
export function Quadro({
  frame,
  eventos,
  children,
}: {
  frame: number;
  eventos?: EventoDeSom[];
  children: ReactNode;
}) {
  return (
    <ContextoColeta.Provider value={eventos ?? null}>
      <ContextoRelogio.Provider value={{ frame, absoluto: 0, coletando: Boolean(eventos) }}>
        {children}
      </ContextoRelogio.Provider>
    </ContextoColeta.Provider>
  );
}

export const useCurrentFrame = (): number => useContext(ContextoRelogio).frame;

export function AbsoluteFill({ style, children }: { style?: CSSProperties; children?: ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Trecho do vídeo: os filhos veem o quadro relativo a `from` e só aparecem dentro da duração. */
export function Sequence({
  from,
  durationInFrames,
  layout,
  children,
}: {
  from: number;
  durationInFrames: number;
  layout?: 'none';
  name?: string;
  children: ReactNode;
}) {
  const pai = useContext(ContextoRelogio);
  const local = pai.frame - from;
  if (!pai.coletando && (local < 0 || local >= durationInFrames)) return null;
  const filhos = (
    <ContextoRelogio.Provider
      value={{ frame: local, absoluto: pai.absoluto + from, coletando: pai.coletando }}
    >
      {children}
    </ContextoRelogio.Provider>
  );
  return layout === 'none' ? filhos : <AbsoluteFill>{filhos}</AbsoluteFill>;
}

/** Som que começa no início da Sequence em que está. Não toca no navegador: vira evento para o FFmpeg. */
export function Som({ src, volume = 1 }: { src: string; volume?: number }) {
  const relogio = useContext(ContextoRelogio);
  const eventos = useContext(ContextoColeta);
  if (eventos) eventos.push({ src, inicio: relogio.absoluto, volume });
  return null;
}

export const staticFile = (caminho: string): string =>
  `/${caminho.split('/').map(encodeURIComponent).join('/')}`;

export function Img(props: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} decoding="sync" />;
}
