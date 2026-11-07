import { AbsoluteFill, Som, Sequence, staticFile, useCurrentFrame } from './quadro.tsx';
import type { Anuncio as DadosDoAnuncio, Cena } from './anuncio.ts';
import type { CenaNoTempo } from './alinhar.ts';
import { ConteudoDaCena } from './cenas.tsx';
import { Contexto, type Calculado } from './contexto.ts';
import { FPS, LARGURA, PAPEL, easeInOut, r2, tons as gerarTons, type Tons } from './estilo.ts';
import { Fundo, Grao } from './pecas.tsx';

export type Props = DadosDoAnuncio & { calculado?: Calculado };

/** Meia transição "whip": 10 frames de cada lado da fronteira entre cenas. */
export const MEIO_WHIP = 10;
const BORRAO_MAXIMO = 80;

function deslocamentoWhip(f: number, duracao: number, primeira: boolean, ultima: boolean): number {
  if (!primeira && f < MEIO_WHIP) return (1 - easeInOut((f + MEIO_WHIP) / (2 * MEIO_WHIP))) * LARGURA;
  if (!ultima && f > duracao - MEIO_WHIP)
    return -easeInOut((f - (duracao - MEIO_WHIP)) / (2 * MEIO_WHIP)) * LARGURA;
  return 0;
}

function Palco(props: {
  dados: DadosDoAnuncio;
  calculado: Calculado;
  cena: Cena;
  tempo: CenaNoTempo;
  indice: number;
  deslocamento: number;
  tons: Tons;
}) {
  const { calculado, tempo, indice, deslocamento } = props;
  const f = useCurrentFrame() - deslocamento;
  const duracao = tempo.fim - tempo.inicio;
  const ultima = indice === calculado.cenas.length - 1;
  const x = deslocamentoWhip(f, duracao, indice === 0, ultima);
  const borrao = r2(Math.sin((Math.abs(x) / LARGURA) * Math.PI) * BORRAO_MAXIMO);
  const id = `whip-${indice}`;
  return (
    <Contexto.Provider
      value={{
        anuncio: props.dados,
        calculado,
        cena: props.cena,
        tempo,
        f,
        duracao,
        tons: props.tons,
        deslocamento,
        indice,
      }}
    >
      <AbsoluteFill
        style={{ transform: `translateX(${r2(x)}px)`, filter: borrao > 0.5 ? `url(#${id})` : undefined }}
      >
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={id} x="-20%" y="0" width="140%" height="100%">
            <feGaussianBlur stdDeviation={`${borrao} 0`} />
          </filter>
        </svg>
        <ConteudoDaCena cena={props.cena} />
      </AbsoluteFill>
    </Contexto.Provider>
  );
}

export function Anuncio(props: Props) {
  const { calculado, ...dados } = props;
  if (!calculado) throw new Error('anúncio não preparado: abra pelo Studio (npm run studio) ou pelo render');
  const tons = gerarTons(dados.cor);
  const ultima = calculado.cenas.length - 1;
  return (
    <AbsoluteFill style={{ background: PAPEL, overflow: 'hidden' }}>
      <Fundo tons={tons} />
      {calculado.cenas.map((tempo, i) => {
        const de = i === 0 ? 0 : tempo.inicio - MEIO_WHIP;
        const ate = i === ultima ? tempo.fim : tempo.fim + MEIO_WHIP;
        return (
          <Sequence key={i} from={de} durationInFrames={ate - de} name={`${i} · ${dados.cenas[i]!.tipo}`}>
            <Palco
              dados={dados}
              calculado={calculado}
              cena={dados.cenas[i]!}
              tempo={tempo}
              indice={i}
              deslocamento={tempo.inicio - de}
              tons={tons}
            />
          </Sequence>
        );
      })}
      {calculado.sons
        ? calculado.cenas.slice(1).map((tempo, i) => (
            <Sequence
              key={`whoosh-${i}`}
              from={tempo.inicio - MEIO_WHIP - 4}
              durationInFrames={FPS}
              layout="none"
            >
              <Som src={staticFile('sfx/whoosh.wav')} volume={0.22} />
            </Sequence>
          ))
        : null}
      {calculado.audio && dados.audio ? <Som src={staticFile(dados.audio)} /> : null}
      <Grao />
      {calculado.fonteDasPalavras === 'estimativa' || !calculado.audio ? (
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 26,
            letterSpacing: 3,
            color: 'rgba(21,23,29,0.55)',
          }}
        >
          PRÉVIA · {calculado.audio ? 'TEMPO ESTIMADO' : 'SEM NARRAÇÃO · TEMPO ESTIMADO'}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
