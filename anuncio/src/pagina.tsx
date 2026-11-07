// Página do anúncio. Com ?render, expõe window.__anuncio para o renderizador (Playwright);
// sem, abre o Studio: assistir, pausar e pular de cena.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Anuncio, type Props } from './Anuncio.tsx';
import { fontes } from './anuncio.ts';
import {
  ALTURA,
  ARQUIVO_TEXTO,
  FONTE_TEXTO,
  FPS,
  LARGURA,
  arquivosDeFonte,
  familiaTitulo,
} from './estilo.ts';
import { prepararAnuncio } from './preparar.ts';
import { Quadro, staticFile, type EventoDeSom } from './quadro.tsx';

const carregar = (familia: string, arquivo: string) =>
  new FontFace(familia, `url('${staticFile(arquivo)}')`)
    .load()
    .then((f) => void document.fonts.add(f))
    .catch((e: unknown) => {
      throw new Error(`fonte public/${arquivo} ausente: rode npm run preparar (${String(e)})`);
    });
const fontesProntas = Promise.all([
  carregar(FONTE_TEXTO, ARQUIVO_TEXTO),
  ...fontes.map((f) => carregar(familiaTitulo(f), arquivosDeFonte[f])),
]);

async function lerRoteiro(): Promise<unknown> {
  for (const caminho of ['/anuncio.json', '/anuncio.exemplo.json']) {
    const r = await fetch(caminho);
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return r.json();
  }
  throw new Error('anuncio.json não encontrado');
}

const doisQuadrosDePintura = () =>
  new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));

const palco = document.getElementById('palco')!;
const raiz = createRoot(palco);
let props: Props | null = null;

const api = {
  async preparar(bruto?: unknown) {
    const { anuncio, calculado } = await prepararAnuncio(bruto ?? (await lerRoteiro()));
    await fontesProntas;
    props = { ...anuncio, calculado };
    return { duracao: calculado.duracao, fps: FPS, largura: LARGURA, altura: ALTURA, cenas: calculado.cenas };
  },
  async irPara(frame: number) {
    if (!props) throw new Error('chame preparar antes');
    const atual = props;
    flushSync(() =>
      raiz.render(
        <Quadro frame={frame}>
          <Anuncio {...atual} />
        </Quadro>,
      ),
    );
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
    await doisQuadrosDePintura();
  },
  /** Sons do vídeo inteiro (narração e efeitos), com o quadro em que cada um começa. */
  sons(): EventoDeSom[] {
    if (!props) throw new Error('chame preparar antes');
    const eventos: EventoDeSom[] = [];
    renderToStaticMarkup(
      <Quadro frame={0} eventos={eventos}>
        <Anuncio {...props} />
      </Quadro>,
    );
    return eventos.map((e) => ({ ...e, src: decodeURIComponent(e.src.replace(/^\//, '')) }));
  },
};
declare global {
  interface Window {
    __anuncio: typeof api;
  }
}
window.__anuncio = api;

function Studio({ dados }: { dados: Props }) {
  const duracao = dados.calculado!.duracao;
  const [frame, setFrame] = useState(0);
  const [tocando, setTocando] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!tocando) return;
    const inicio = performance.now() - (frame / FPS) * 1000;
    if (audio.current) {
      audio.current.currentTime = frame / FPS;
      void audio.current.play();
    }
    let pedido = requestAnimationFrame(function passo() {
      const t =
        audio.current && !audio.current.paused
          ? audio.current.currentTime
          : (performance.now() - inicio) / 1000;
      const f = Math.min(duracao - 1, Math.round(t * FPS));
      setFrame(f);
      if (f >= duracao - 1) setTocando(false);
      else pedido = requestAnimationFrame(passo);
    });
    return () => {
      cancelAnimationFrame(pedido);
      audio.current?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando]);
  const escala = Math.min((window.innerHeight - 120) / ALTURA, (window.innerWidth - 32) / LARGURA);
  return (
    <div
      style={{
        display: 'grid',
        justifyItems: 'center',
        gap: 12,
        padding: 16,
        fontFamily: 'system-ui',
        color: '#eef2f8',
      }}
    >
      <div style={{ width: LARGURA * escala, height: ALTURA * escala, overflow: 'hidden', borderRadius: 12 }}>
        <div
          style={{
            width: LARGURA,
            height: ALTURA,
            transform: `scale(${escala})`,
            transformOrigin: '0 0',
            position: 'relative',
          }}
        >
          <Quadro frame={frame}>
            <Anuncio {...dados} />
          </Quadro>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', width: Math.max(320, LARGURA * escala) }}>
        <button onClick={() => setTocando(!tocando)}>{tocando ? 'Pausar' : 'Assistir'}</button>
        <input
          type="range"
          min={0}
          max={duracao - 1}
          value={frame}
          style={{ flex: 1 }}
          onChange={(e) => (setTocando(false), setFrame(Number(e.target.value)))}
        />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{(frame / FPS).toFixed(2)} s</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {dados.calculado!.cenas.map((c, i) => (
          <button key={i} onClick={() => (setTocando(false), setFrame(c.inicio))}>
            {i} · {dados.cenas[i]!.tipo}
          </button>
        ))}
      </div>
      <small>O Studio toca só a narração; os efeitos entram no vídeo gerado.</small>
      {dados.calculado!.audio && dados.audio ? (
        <audio ref={audio} src={staticFile(dados.audio)} preload="auto" />
      ) : null}
    </div>
  );
}

if (!new URLSearchParams(location.search).has('render')) {
  document.body.style.background = '#0b0f17';
  api
    .preparar()
    .then(() => raiz.render(<Studio dados={props!} />))
    .catch((e: unknown) =>
      raiz.render(<pre style={{ color: '#f2b544', padding: 24, whiteSpace: 'pre-wrap' }}>{String(e)}</pre>),
    );
}
