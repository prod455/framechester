import type { ReactNode } from 'react';
import { spring } from './mola.ts';
import { AbsoluteFill, Som as Audio, Img, Sequence, staticFile } from './quadro.tsx';
import type { Cena, Linha, Som } from './anuncio.ts';
import { quando } from './alinhar.ts';
import { useCena } from './contexto.ts';
import {
  ALTURA,
  BASE_SEGURA,
  FONTE_TEXTO,
  FPS,
  LARGURA,
  MARGEM,
  SECUNDARIO,
  TINTA,
  TOPO_SEGURO,
  alfa,
  easeInOut,
  easeOut,
  familiaTitulo,
  limitar,
  misturar,
  r2,
  vidro,
} from './estilo.ts';
import { Centro, Destaque, Icone, Marca, PersonagemPendente, tempoDasPalavras } from './pecas.tsx';

type De<T extends Cena['tipo']> = Extract<Cena, { tipo: T }>;
const moeda = (v: number) => new Intl.NumberFormat('pt-BR').format(v);
const VOLUME_EFEITO = 0.42;

/** Efeito curto. `som` da cena troca o efeito principal; `null` desliga os da cena. */
export function Efeito({ nome, em, principal = false }: { nome: Som; em: number; principal?: boolean }) {
  const { calculado, cena, deslocamento } = useCena();
  if (!calculado.sons || cena.som === null) return null;
  const escolhido = principal && cena.som ? cena.som : nome;
  return (
    <Sequence from={deslocamento + Math.max(0, Math.round(em))} durationInFrames={FPS} layout="none">
      <Audio src={staticFile(`sfx/${escolhido}.wav`)} volume={VOLUME_EFEITO} />
    </Sequence>
  );
}

const entrada = (f: number, atraso = 0, damping = 12) =>
  spring({ frame: f - atraso, fps: FPS, config: { damping, stiffness: 150, mass: 0.8 } });

// ── número que rola com borrão vertical ─────────────────────────────────────────────
function Coluna({
  alvo,
  voltas,
  p,
  pAntes,
  altura,
  id,
}: {
  alvo: number;
  voltas: number;
  p: number;
  pAntes: number;
  altura: number;
  id: string;
}) {
  const pos = (e: number) => e * (alvo + 10 * voltas);
  const atual = pos(p);
  const velocidade = Math.abs(atual - pos(pAntes));
  const borrao = r2(Math.min(velocidade * altura * 0.45, 48));
  const y = r2(-(atual % 10) * altura);
  return (
    <span style={{ display: 'inline-block', height: altura, overflow: 'hidden', verticalAlign: 'top' }}>
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <filter id={id} x="0" y="-50%" width="100%" height="200%">
          <feGaussianBlur stdDeviation={`0 ${borrao}`} />
        </filter>
      </svg>
      <span
        style={{
          display: 'block',
          transform: `translateY(${y}px)`,
          filter: borrao > 0.5 ? `url(#${id})` : undefined,
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, i) => (
          <span key={i} style={{ display: 'block', height: altura, lineHeight: `${altura}px` }}>
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function CenaNumero({ cena }: { cena: De<'numero'> }) {
  const { f, tempo, tons, anuncio, indice } = useCena();
  // Rola desde a entrada e pousa logo depois da palavra: nunca fica parado em zeros.
  const t0 = 4;
  const pouso = Math.max((cena.em ? quando(tempo, cena.em) : 0) + 14, t0 + 50);
  const DURACAO = pouso - t0;
  const p = easeOut((f - t0) / DURACAO);
  const pAntes = easeOut((f - 1 - t0) / DURACAO);
  const texto = moeda(cena.valor);
  const digitos = [...texto].filter((c) => /\d/.test(c)).length;
  // Largura em múltiplos do tamanho da fonte (medida da Archivo Black, com folga), para caber no cartão.
  const separadores = texto.length - digitos;
  const largura =
    0.7 * digitos +
    0.3 * separadores +
    (cena.prefixo ? 0.42 * 0.72 * cena.prefixo.length : 0) +
    (cena.sufixo ? 0.3 * 0.62 * cena.sufixo.length : 0);
  const tamanho = Math.min(300, (LARGURA - 2 * MARGEM - 128 - 36) / largura);
  const altura = Math.round(tamanho * 1.08);
  const caixa = entrada(f);
  let k = 0;
  return (
    <Centro>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 44,
          transform: `scale(${r2(0.85 + 0.15 * caixa)})`,
          opacity: r2(limitar(caixa * 1.4)),
        }}
      >
        <div
          style={{
            fontFamily: FONTE_TEXTO,
            fontSize: 52,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: SECUNDARIO,
          }}
        >
          {cena.titulo}
        </div>
        <div
          style={{
            ...vidro,
            padding: '56px 64px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 18,
            fontFamily: familiaTitulo(anuncio.fonte),
            color: TINTA,
          }}
        >
          {cena.prefixo ? (
            <span style={{ fontSize: tamanho * 0.42, color: tons.cor }}>{cena.prefixo}</span>
          ) : null}
          <span
            style={{
              fontSize: tamanho,
              letterSpacing: -tamanho * 0.03,
              display: 'inline-flex',
              alignItems: 'flex-start',
            }}
          >
            {[...texto].map((c, i) => {
              if (!/\d/.test(c))
                return (
                  <span key={i} style={{ height: altura, lineHeight: `${altura}px` }}>
                    {c}
                  </span>
                );
              const voltas = 1 + (digitos - 1 - k++);
              return (
                <Coluna
                  key={i}
                  alvo={Number(c)}
                  voltas={voltas}
                  p={p}
                  pAntes={pAntes}
                  altura={altura}
                  id={`num-${indice}-${i}`}
                />
              );
            })}
          </span>
          {cena.sufixo ? (
            <span style={{ fontSize: tamanho * 0.3, color: SECUNDARIO }}>{cena.sufixo}</span>
          ) : null}
        </div>
      </div>
      <Efeito nome="caixa" em={pouso - 6} principal />
    </Centro>
  );
}

// ── título ─────────────────────────────────────────────────────────────────────────
function CenaTitulo({ cena }: { cena: De<'titulo'> }) {
  return (
    <Centro style={{ padding: `0 ${MARGEM}px` }}>
      <Destaque texto={cena.texto} tamanho={136} largura={LARGURA - 2 * MARGEM} />
    </Centro>
  );
}

// ── personagem 3D que quica, flutua, treme e tem sombra ─────────────────────────────
function Boneco({ imagem, tamanho }: { imagem: string; tamanho: number }) {
  const { calculado, tons } = useCena();
  return calculado.imagens[imagem] ? (
    <Img src={staticFile(imagem)} style={{ width: tamanho, height: tamanho, objectFit: 'contain' }} />
  ) : (
    <PersonagemPendente tamanho={tamanho} tons={tons} nome={imagem.split('/').pop() ?? imagem} />
  );
}

function CenaPersonagem({ cena }: { cena: De<'personagem'> }) {
  const { f, tempo } = useCena();
  const TAMANHO = 700;
  const queda = spring({ frame: f, fps: FPS, config: { damping: 7, stiffness: 120, mass: 0.9 } });
  const y = (1 - queda) * -900;
  const pouso = limitar((f - 18) / 24);
  const flutua = Math.sin((f / FPS) * Math.PI * 2 * 0.55) * 18 * pouso;
  const esmaga = 1 + Math.max(0, queda - 1) * 0.6; // achata no impacto
  const tremor = cena.em ? quando(tempo, cena.em) : null;
  const d = tremor === null ? -1 : f - tremor;
  const giro = d >= 0 && d < 26 ? Math.sin(d * 1.7) * 7 * (1 - d / 26) : 0;
  const altura = -y - flutua; // quanto acima do chão
  const sombra = limitar(1 - altura / 900);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: TOPO_SEGURO, left: MARGEM, right: MARGEM }}>
        <Destaque texto={cena.texto} tamanho={100} largura={LARGURA - 2 * MARGEM} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: (LARGURA - TAMANHO) / 2,
          top: 640,
          width: TAMANHO,
          height: TAMANHO,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: TAMANHO * 0.18,
            right: TAMANHO * 0.18,
            bottom: -30,
            height: 70,
            borderRadius: '50%',
            background: 'rgba(21,23,29,0.28)',
            filter: 'blur(18px)',
            opacity: r2(sombra),
            transform: `scale(${r2(0.6 + 0.4 * sombra - flutua * 0.004)})`,
          }}
        />
        <div
          style={{
            transform: `translateY(${r2(y + flutua)}px) rotate(${r2(giro)}deg) scale(${r2(1 / esmaga)}, ${r2(esmaga)})`,
            transformOrigin: '50% 100%',
          }}
        >
          <Boneco imagem={cena.imagem} tamanho={TAMANHO} />
        </div>
      </div>
      <Efeito nome="pop" em={10} principal />
    </AbsoluteFill>
  );
}

// ── extrato que desenrola de cima para baixo ───────────────────────────────────────
function CenaExtrato({ cena }: { cena: De<'extrato'> }) {
  const { f, duracao, tons, anuncio } = useCena();
  const ALTURA_LINHA = 104;
  const passo = Math.min(22, Math.max(6, (duracao - 50) / cena.linhas.length));
  const visiveis = cena.linhas.map((_, j) => easeOut((f - 12 - j * passo) / 12));
  const total = cena.linhas.reduce((s, l) => s + l.valor, 0);
  const alturaPapel =
    170 +
    visiveis.reduce((s, v) => s + v * ALTURA_LINHA, 0) +
    easeOut((f - 12 - cena.linhas.length * passo) / 12) * 130;
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: TOPO_SEGURO }}>
      <div
        style={{
          width: 860,
          height: r2(alturaPapel),
          overflow: 'hidden',
          background: '#FFFFFF',
          borderRadius: '32px 32px 0 0',
          boxShadow: '0 30px 80px rgba(21,23,29,0.14)',
          position: 'relative',
        }}
      >
        <div
          style={{
            padding: '52px 60px 24px',
            fontFamily: familiaTitulo(anuncio.fonte),
            fontSize: 64,
            color: TINTA,
          }}
        >
          {cena.titulo}
        </div>
        {cena.linhas.map((l, j) => (
          <div
            key={j}
            style={{
              height: ALTURA_LINHA,
              margin: '0 60px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '3px dashed #E4E1DA',
              fontFamily: FONTE_TEXTO,
              fontSize: 50,
              color: TINTA,
              opacity: r2(visiveis[j]!),
              transform: `translateY(${r2((1 - visiveis[j]!) * -30)}px)`,
            }}
          >
            <span>{l.descricao}</span>
            <span>R$ {moeda(l.valor)}</span>
          </div>
        ))}
        <div
          style={{
            margin: '0 60px',
            padding: '30px 0',
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: `5px solid ${TINTA}`,
            fontFamily: familiaTitulo(anuncio.fonte),
            fontSize: 64,
            color: tons.cor,
          }}
        >
          <span>Total</span>
          <span>R$ {moeda(total)}</span>
        </div>
      </div>
      <svg width="860" height="28" viewBox="0 0 860 28" style={{ marginTop: -1 }}>
        <path
          d={`M0 0 ${Array.from({ length: 22 }, (_, i) => `L${r2(i * 39.1 + 19.5)} 26 L${r2((i + 1) * 39.1)} 0`).join(' ')} Z`}
          fill="#FFFFFF"
        />
      </svg>
      <Efeito nome="papel" em={8} principal />
    </AbsoluteFill>
  );
}

// ── tela do app: rosca por categoria e tesoura cortando ────────────────────────────
function Rosca({
  valores,
  cores,
  varredura,
  tamanho,
  centro,
}: {
  valores: number[];
  cores: string[];
  varredura: number;
  tamanho: number;
  centro: string;
}) {
  const { anuncio } = useCena();
  const r = tamanho / 2 - 40;
  const C = 2 * Math.PI * r;
  const soma = valores.reduce((s, v) => s + v, 0) || 1;
  let acumulado = 0;
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
      <svg width={tamanho} height={tamanho}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="#EEEBE5" strokeWidth={60} />
        {valores.map((v, i) => {
          const comprimento = (v / soma) * C * varredura;
          const inicio = acumulado;
          acumulado += comprimento;
          return comprimento < 0.5 ? null : (
            <circle
              key={i}
              cx={tamanho / 2}
              cy={tamanho / 2}
              r={r}
              fill="none"
              stroke={cores[i]}
              strokeWidth={60}
              strokeDasharray={`${r2(Math.max(0, comprimento - 6))} ${r2(C)}`}
              strokeDashoffset={r2(-inicio)}
              transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
              strokeLinecap="butt"
            />
          );
        })}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          fontFamily: familiaTitulo(anuncio.fonte),
          fontSize: 58,
          color: TINTA,
        }}
      >
        {centro}
      </div>
    </div>
  );
}

function CenaApp({ cena }: { cena: De<'app'> }) {
  const { f, tempo, tons, anuncio } = useCena();
  const tela = entrada(f, 0, 14);
  const tCorte = quando(tempo, cena.em);
  const CORTE = 26,
    INTERVALO = 34;
  const ordem = new Map<number, number>();
  cena.linhas.forEach((l, j) => l.cortar && ordem.set(j, ordem.size));
  const cortes = cena.linhas.map((_, j) => {
    const k = ordem.get(j);
    return k === undefined ? null : tCorte + k * INTERVALO;
  });
  const progressoCorte = (j: number) => (cortes[j] === null ? 0 : easeInOut((f - cortes[j]!) / CORTE));
  const encolhe = (j: number) => (cortes[j] === null ? 0 : easeOut((f - cortes[j]! - CORTE) / 20));
  const valores = cena.linhas.map((l, j) => l.valor * (1 - encolhe(j)));
  const atual = Math.round(valores.reduce((s, v) => s + v, 0));
  const cores = cena.linhas.map((_, j) =>
    misturar(tons.cor, j % 2 ? '#FFFFFF' : '#000000', [0, 0.35, 0.55, 0.2, 0.7, 0.4][j] ?? 0.3),
  );
  const ALTURA_LINHA = 112;
  const TOPO_LISTA = 640;
  const ativo = cena.linhas.findIndex(
    (_, j) => cortes[j] !== null && f >= cortes[j]! && f < cortes[j]! + CORTE + 6,
  );
  const tesouraX = ativo >= 0 ? -40 + progressoCorte(ativo) * 720 : -200;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          ...vidro,
          width: 840,
          height: 1240,
          borderRadius: 72,
          position: 'relative',
          transform: `translateY(${r2((1 - tela) * 260)}px) scale(${r2(0.92 + 0.08 * tela)})`,
          opacity: r2(limitar(tela * 1.5)),
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 30,
            left: 360,
            width: 120,
            height: 14,
            borderRadius: 7,
            background: 'rgba(21,23,29,0.18)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: 60,
            right: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 20,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 20,
              background: tons.cor,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icone nome={anuncio.marca.icone} tamanho={46} cor="#FFFFFF" />
          </div>
          <div style={{ fontFamily: familiaTitulo(anuncio.fonte), fontSize: 56, color: TINTA }}>
            {cena.titulo}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 190,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Rosca
            valores={valores}
            cores={cores}
            varredura={easeOut((f - 6) / 40)}
            tamanho={420}
            centro={`R$ ${moeda(atual)}`}
          />
        </div>
        {cena.linhas.map((l: Linha, j) => {
          const aparece = easeOut((f - 16 - j * 5) / 14);
          const corte = progressoCorte(j);
          const cortado = encolhe(j);
          return (
            <div
              key={j}
              style={{
                position: 'absolute',
                left: 60,
                right: 60,
                top: TOPO_LISTA + j * ALTURA_LINHA,
                height: ALTURA_LINHA - 16,
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                fontFamily: FONTE_TEXTO,
                fontSize: 46,
                color: TINTA,
                opacity: r2(aparece * (1 - 0.6 * cortado)),
                transform: `translateX(${r2((1 - aparece) * 60 + cortado * 24)}px)`,
              }}
            >
              <div style={{ width: 26, height: 26, borderRadius: 13, background: cores[j] }} />
              <span style={{ flex: 1 }}>{l.descricao}</span>
              <span style={{ color: l.cortar && corte > 0 ? tons.cor : TINTA }}>R$ {moeda(l.valor)}</span>
              {l.cortar ? (
                <div
                  style={{
                    position: 'absolute',
                    left: -10,
                    top: '50%',
                    height: 6,
                    borderRadius: 3,
                    width: `${r2(corte * 104)}%`,
                    background: tons.cor,
                  }}
                />
              ) : null}
            </div>
          );
        })}
        {ativo >= 0 ? (
          <div
            style={{
              position: 'absolute',
              left: 60 + tesouraX,
              top: TOPO_LISTA + ativo * ALTURA_LINHA - 4,
              transform: `rotate(${r2(-90 + Math.sin(f * 0.9) * 14)}deg)`,
            }}
          >
            <Icone nome="tesoura" tamanho={96} cor={TINTA} />
          </div>
        ) : null}
      </div>
      <Efeito nome="notificacao" em={4} principal />
      {cortes.map((c, j) => (c === null ? null : <Efeito key={j} nome="papel" em={c} />))}
    </AbsoluteFill>
  );
}

// ── três palavras ──────────────────────────────────────────────────────────────────
function CenaPalavras({ cena }: { cena: De<'palavras'> }) {
  const { f, tempo, tons, anuncio } = useCena();
  const exibidas = tempoDasPalavras(cena.palavras.join(' '), tempo);
  const ultima = exibidas.at(-1)!.entrada;
  const slogan = easeOut((f - ultima - 24) / 16);
  return (
    <Centro>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        {exibidas.map((p, i) => {
          const s = entrada(f, p.entrada, 9);
          return (
            <div
              key={i}
              style={{
                fontFamily: familiaTitulo(anuncio.fonte),
                fontSize: 176,
                lineHeight: 1.05,
                letterSpacing: -5,
                color: i === 2 ? tons.cor : TINTA,
                opacity: r2(limitar(s * 1.5)),
                transform: `scale(${r2(0.4 + 0.6 * s)})`,
              }}
            >
              {p.texto}.
              <Efeito nome="pop" em={p.entrada} />
            </div>
          );
        })}
        {cena.slogan ? (
          <div
            style={{
              marginTop: 40,
              fontFamily: FONTE_TEXTO,
              fontSize: 56,
              color: SECUNDARIO,
              opacity: r2(slogan),
              transform: `translateY(${r2((1 - slogan) * 20)}px)`,
            }}
          >
            {cena.slogan}
          </div>
        ) : null}
      </div>
    </Centro>
  );
}

// ── logo: círculo na cor de destaque cobre a tela ──────────────────────────────────
function CenaLogo({ cena }: { cena: De<'logo'> }) {
  const { f, tempo, tons, anuncio } = useCena();
  const raio = easeInOut(f / 30) * Math.hypot(LARGURA, ALTURA) * 0.55;
  const marca = entrada(f, 14, 10);
  const tSlogan = cena.em ? quando(tempo, cena.em) : 40;
  const slogan = easeOut((f - tSlogan) / 14);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: LARGURA / 2 - raio,
          top: ALTURA / 2 - raio,
          width: raio * 2,
          height: raio * 2,
          borderRadius: '50%',
          background: tons.cor,
        }}
      />
      <Centro>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 50,
            transform: `scale(${r2(0.5 + 0.5 * marca)})`,
            opacity: r2(limitar(marca * 1.5)),
          }}
        >
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 66,
              background: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              boxShadow: `0 30px 80px ${alfa(tons.escuro, 0.5)}`,
            }}
          >
            <Icone nome={anuncio.marca.icone} tamanho={160} cor={tons.cor} />
          </div>
          <div
            style={{
              fontFamily: familiaTitulo(anuncio.fonte),
              fontSize: 120,
              color: '#FFFFFF',
              letterSpacing: -3,
            }}
          >
            {anuncio.marca.nome}
          </div>
        </div>
      </Centro>
      {cena.slogan ? (
        <div
          style={{
            position: 'absolute',
            left: MARGEM,
            right: MARGEM,
            bottom: BASE_SEGURA + 40,
            textAlign: 'center',
            fontFamily: FONTE_TEXTO,
            fontSize: 64,
            color: '#FFFFFF',
            opacity: r2(slogan),
            transform: `translateY(${r2((1 - slogan) * 24)}px)`,
          }}
        >
          {cena.slogan}
        </div>
      ) : null}
      <Efeito nome="whoosh" em={0} principal />
      <Efeito nome="pop" em={16} />
    </AbsoluteFill>
  );
}

// ── virada: a cena se separa em camadas 3D e o botão vira "clone" ──────────────────
function CenaCamadas({ cena }: { cena: De<'camadas'> }) {
  const { f, tempo, tons, anuncio } = useCena();
  const separa = easeInOut((f - quando(tempo, cena.em)) / 44);
  const alterna = easeInOut((f - quando(tempo, cena.alternar_em)) / 14);
  const personagem = anuncio.cenas.find((c) => c.tipo === 'personagem');
  const L = 720,
    H = 980;
  const camada = (z: number, conteudo: ReactNode, rotulo: string, i: number) => (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        transform: `translateZ(${r2(z * separa)}px)`,
        transformStyle: 'preserve-3d',
      }}
    >
      {conteudo}
      <div
        style={{
          position: 'absolute',
          left: -24,
          top: [H - 120, 90, H / 2][i],
          transform: 'translateX(-100%)',
          fontFamily: 'monospace',
          fontSize: 34,
          color: tons.escuro,
          opacity: r2(separa),
          whiteSpace: 'nowrap',
        }}
      >
        {rotulo} →
      </div>
    </div>
  );
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', top: TOPO_SEGURO - 40, left: MARGEM, right: MARGEM }}>
        <Destaque texto={cena.texto} tamanho={104} largura={LARGURA - 2 * MARGEM} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: (LARGURA - L) / 2 + 90,
          top: 470,
          width: L,
          height: H,
          perspective: 2600,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${r2(14 * separa)}deg) rotateY(${r2(-34 * separa)}deg) scale(${r2(1 - 0.18 * separa)})`,
          }}
        >
          {camada(
            0,
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: 48,
                background: `linear-gradient(160deg, ${tons.claro}, ${tons.suave})`,
                boxShadow: '0 30px 80px rgba(21,23,29,0.18)',
              }}
            />,
            'fundo',
            0,
          )}
          {camada(
            170,
            <div
              style={{
                position: 'absolute',
                top: 70,
                left: 50,
                right: 50,
                fontFamily: familiaTitulo(anuncio.fonte),
                fontSize: 84,
                lineHeight: 1.05,
                color: TINTA,
              }}
            >
              {cena.texto.split('*').map((parte, i) => (
                <span key={i} style={{ color: i % 2 ? tons.cor : TINTA }}>
                  {parte}
                </span>
              ))}
            </div>,
            'texto',
            1,
          )}
          {camada(
            340,
            <div style={{ position: 'absolute', left: 110, bottom: 60 }}>
              {personagem && personagem.tipo === 'personagem' ? (
                <Boneco imagem={personagem.imagem} tamanho={500} />
              ) : (
                <Icone nome={anuncio.marca.icone} tamanho={420} cor={tons.cor} />
              )}
            </div>,
            'personagem',
            2,
          )}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: BASE_SEGURA - 20,
          left: (LARGURA - 700) / 2,
          width: 700,
          height: 116,
          ...vidro,
          borderRadius: 58,
          display: 'flex',
          alignItems: 'center',
          fontFamily: FONTE_TEXTO,
          fontSize: 44,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 10,
            bottom: 10,
            left: r2(10 + alterna * 340),
            width: 340,
            borderRadius: 48,
            background: tons.cor,
          }}
        />
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            position: 'relative',
            color: alterna < 0.5 ? '#FFFFFF' : SECUNDARIO,
          }}
        >
          voz original
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            position: 'relative',
            color: alterna >= 0.5 ? '#FFFFFF' : SECUNDARIO,
          }}
        >
          clone
        </div>
      </div>
      <Efeito nome="whoosh" em={quando(tempo, cena.em)} principal />
      <Efeito nome="pop" em={quando(tempo, cena.alternar_em)} />
    </AbsoluteFill>
  );
}

// ── final: logo grande e a última frase em destaque ────────────────────────────────
function CenaFinal({ cena }: { cena: De<'final'> }) {
  const { f } = useCena();
  const marca = entrada(f, 0, 11);
  return (
    <Centro>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 110 }}>
        <div style={{ transform: `scale(${r2(0.6 + 0.4 * marca)})`, opacity: r2(limitar(marca * 1.5)) }}>
          <Marca tamanho={130} />
        </div>
        <div style={{ width: LARGURA - 2 * MARGEM }}>
          <Destaque texto={cena.texto} tamanho={124} largura={LARGURA - 2 * MARGEM} />
        </div>
      </div>
      <Efeito nome="pop" em={2} principal />
    </Centro>
  );
}

export function ConteudoDaCena({ cena }: { cena: Cena }) {
  switch (cena.tipo) {
    case 'numero':
      return <CenaNumero cena={cena} />;
    case 'titulo':
      return <CenaTitulo cena={cena} />;
    case 'personagem':
      return <CenaPersonagem cena={cena} />;
    case 'extrato':
      return <CenaExtrato cena={cena} />;
    case 'app':
      return <CenaApp cena={cena} />;
    case 'palavras':
      return <CenaPalavras cena={cena} />;
    case 'logo':
      return <CenaLogo cena={cena} />;
    case 'camadas':
      return <CenaCamadas cena={cena} />;
    case 'final':
      return <CenaFinal cena={cena} />;
  }
}
