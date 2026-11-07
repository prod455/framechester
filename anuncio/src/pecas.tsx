import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame } from './quadro.tsx';
import type { Icone as NomeIcone } from './anuncio.ts';
import { casaTermo, type CenaNoTempo } from './alinhar.ts';
import { useCena } from './contexto.ts';
import {
  ALTURA,
  familiaTitulo,
  LARGURA,
  PAPEL,
  TINTA,
  alfa,
  easeOut,
  limitar,
  r2,
  type Tons,
} from './estilo.ts';

/** Fundo claro com gradiente suave nos tons do acento, deriva lenta e determinística. */
export function Fundo({ tons }: { tons: Tons }) {
  const frame = useCurrentFrame();
  const a = r2(18 + Math.sin(frame / 240) * 6);
  const b = r2(86 + Math.cos(frame / 300) * 5);
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(90% 55% at ${a}% 12%, ${alfa(tons.cor, 0.2)} 0%, transparent 70%)`,
          `radial-gradient(80% 50% at ${b}% 92%, ${alfa(tons.suave, 0.45)} 0%, transparent 70%)`,
          `linear-gradient(180deg, ${PAPEL} 0%, ${tons.claro} 100%)`,
        ].join(', '),
      }}
    />
  );
}

/** Grão de filme: ruído com semente trocada a cada 2 frames (sem Math.random). */
export function Grao() {
  const frame = useCurrentFrame();
  const semente = Math.floor(frame / 2) % 9;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'multiply', opacity: 0.16 }}>
      <svg width={LARGURA} height={ALTURA}>
        <filter id={`grao-${semente}`}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves={2}
            seed={semente}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
        </filter>
        <rect width="100%" height="100%" filter={`url(#grao-${semente})`} />
      </svg>
    </AbsoluteFill>
  );
}

export type PalavraExibida = { texto: string; destaque: boolean; entrada: number };

/** Liga cada palavra exibida à palavra dita; sem par, entra logo depois da anterior. */
export function tempoDasPalavras(texto: string, tempo: CenaNoTempo): PalavraExibida[] {
  const partes = texto.split(/\s+/).filter(Boolean);
  let cursor = 0;
  let anterior = 0;
  return partes.map((bruto) => {
    const destaque = bruto.includes('*');
    const limpo = bruto.replaceAll('*', '');
    const k = tempo.palavras.findIndex((p, i) => i >= cursor && casaTermo(p.token, limpo));
    let entrada = anterior + 3;
    if (k >= 0) {
      cursor = k + 1;
      entrada = Math.max(anterior, tempo.palavras[k]!.inicio);
    }
    if (entrada < 0) entrada = 0;
    anterior = entrada;
    return { texto: limpo, destaque, entrada };
  });
}

/** Título grosso com uma palavra em destaque; cada palavra entra quando é dita. */
export function Destaque({
  texto,
  tamanho,
  cor = TINTA,
  alinhar = 'center',
  largura,
}: {
  texto: string;
  tamanho: number;
  cor?: string;
  alinhar?: 'center' | 'left';
  largura?: number;
}) {
  const { tempo, f, tons, anuncio } = useCena();
  const palavras = tempoDasPalavras(texto, tempo);
  return (
    <div
      style={{
        fontFamily: familiaTitulo(anuncio.fonte),
        fontSize: tamanho,
        lineHeight: 1.04,
        letterSpacing: -tamanho * 0.025,
        color: cor,
        textAlign: alinhar,
        width: largura,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: alinhar === 'center' ? 'center' : 'flex-start',
        columnGap: tamanho * 0.24,
        rowGap: tamanho * 0.08,
      }}
    >
      {palavras.map((p, i) => {
        const t = limitar((f - p.entrada) / 9);
        const marca = easeOut((f - p.entrada - 4) / 14);
        const estilo: CSSProperties = {
          display: 'inline-block',
          position: 'relative',
          opacity: r2(t),
          transform: `translateY(${r2((1 - easeOut(t)) * tamanho * 0.3)}px)`,
          filter: t < 1 ? `blur(${r2((1 - t) * 6)}px)` : undefined,
          color: p.destaque ? tons.cor : undefined,
        };
        return (
          <span key={i} style={estilo}>
            {p.destaque ? (
              <span
                style={{
                  position: 'absolute',
                  left: -tamanho * 0.06,
                  right: -tamanho * 0.06,
                  bottom: tamanho * 0.04,
                  height: tamanho * 0.3,
                  background: alfa(tons.cor, 0.18),
                  borderRadius: tamanho * 0.08,
                  transformOrigin: 'left center',
                  transform: `scaleX(${r2(marca)})`,
                  zIndex: -1,
                }}
              />
            ) : null}
            {p.texto}
          </span>
        );
      })}
    </div>
  );
}

export function Icone({ nome, tamanho, cor }: { nome: NomeIcone; tamanho: number; cor: string }) {
  const s = {
    fill: 'none',
    stroke: cor,
    strokeWidth: 9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100">
      {nome === 'tesoura' ? (
        <g {...s}>
          <circle cx="28" cy="72" r="13" />
          <circle cx="72" cy="72" r="13" />
          <path d="M37 62 L74 18 M63 62 L26 18" />
        </g>
      ) : nome === 'raio' ? (
        <path {...s} d="M56 10 L24 56 H50 L42 90 L76 42 H50 Z" />
      ) : nome === 'check' ? (
        <path {...s} d="M20 52 L42 74 L82 28" />
      ) : (
        <path {...s} d="M50 12 L61 38 L89 40 L67 58 L74 86 L50 71 L26 86 L33 58 L11 40 L39 38 Z" />
      )}
    </svg>
  );
}

export function Marca({ tamanho }: { tamanho: number }) {
  const { anuncio, tons } = useCena();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: tamanho * 0.28 }}>
      <div
        style={{
          width: tamanho,
          height: tamanho,
          borderRadius: tamanho * 0.28,
          background: tons.cor,
          display: 'grid',
          placeItems: 'center',
          boxShadow: `0 ${tamanho * 0.12}px ${tamanho * 0.4}px ${alfa(tons.cor, 0.35)}`,
        }}
      >
        <Icone nome={anuncio.marca.icone} tamanho={tamanho * 0.66} cor="#FFFFFF" />
      </div>
      <div
        style={{
          fontFamily: familiaTitulo(anuncio.fonte),
          fontSize: tamanho * 0.62,
          color: TINTA,
          letterSpacing: -tamanho * 0.015,
        }}
      >
        {anuncio.marca.nome}
      </div>
    </div>
  );
}

/** Personagem que ainda não foi gerado (npm run personagens): só para prévia; o render final recusa. */
export function PersonagemPendente({ tamanho, tons, nome }: { tamanho: number; tons: Tons; nome: string }) {
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho} viewBox="0 0 200 200">
        <defs>
          <radialGradient id="pendente" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor={tons.suave} />
            <stop offset="100%" stopColor={tons.cor} />
          </radialGradient>
        </defs>
        <rect x="30" y="30" width="140" height="140" rx="56" fill="url(#pendente)" />
        <ellipse cx="78" cy="96" rx="12" ry="16" fill={TINTA} />
        <ellipse cx="122" cy="96" rx="12" ry="16" fill={TINTA} />
        <circle cx="82" cy="90" r="4" fill="#FFFFFF" />
        <circle cx="126" cy="90" r="4" fill="#FFFFFF" />
        <ellipse cx="62" cy="122" rx="11" ry="6" fill="#FF9DB0" opacity="0.8" />
        <ellipse cx="138" cy="122" rx="11" ry="6" fill="#FF9DB0" opacity="0.8" />
        <path d="M88 130 Q100 140 112 130" stroke={TINTA} strokeWidth="5" fill="none" strokeLinecap="round" />
      </svg>
      <div
        style={{
          position: 'absolute',
          bottom: -10,
          width: '100%',
          textAlign: 'center',
          fontFamily: 'monospace',
          fontSize: 26,
          color: TINTA,
          opacity: 0.6,
        }}
      >
        PENDENTE · {nome}
      </div>
    </div>
  );
}

export function Centro({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', ...style }}>
      {children}
    </AbsoluteFill>
  );
}
