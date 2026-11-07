import {
  Composition,
  cancelRender,
  continueRender,
  delayRender,
  staticFile,
  type CalculateMetadataFunction,
} from 'remotion';
import exemplo from '../anuncio.exemplo.json';
import { fontes, validarAnuncio } from './anuncio.ts';
import { linhaDoTempo, validarTranscricao } from './alinhar.ts';
import { Anuncio, type Props } from './Anuncio.tsx';
import type { Calculado } from './contexto.ts';
import {
  ALTURA,
  ARQUIVO_TEXTO,
  FONTE_TEXTO,
  FPS,
  LARGURA,
  arquivosDeFonte,
  familiaTitulo,
} from './estilo.ts';

function carregarFonte(familia: string, arquivo: string) {
  const espera = delayRender(`fonte ${arquivo}`);
  new FontFace(familia, `url('${staticFile(arquivo)}')`)
    .load()
    .then((fonte) => {
      document.fonts.add(fonte);
      continueRender(espera);
    })
    .catch((erro: unknown) =>
      cancelRender(new Error(`fonte public/${arquivo} ausente: rode npm run preparar (${String(erro)})`)),
    );
}
carregarFonte(FONTE_TEXTO, ARQUIVO_TEXTO);
for (const fonte of fontes) carregarFonte(familiaTitulo(fonte), arquivosDeFonte[fonte]);

/** O servidor de arquivos responde HTML para caminho inexistente; só vale o tipo esperado. */
async function existe(caminho: string, tipo: 'image' | 'audio'): Promise<boolean> {
  const r = await fetch(staticFile(caminho), { method: 'HEAD' });
  return r.ok && (r.headers.get('content-type') ?? '').startsWith(tipo);
}

const calcular: CalculateMetadataFunction<Props> = async ({ props }) => {
  const anuncio = validarAnuncio(props);
  const resposta = await fetch(staticFile(anuncio.palavras));
  if (!resposta.ok || !(resposta.headers.get('content-type') ?? '').includes('json'))
    throw new Error(
      `public/${anuncio.palavras} não existe: rode npm run palavras:estimar ou npm run transcrever`,
    );
  const transcricao = validarTranscricao(await resposta.json());
  const linha = linhaDoTempo(
    anuncio.cenas.map((c) => c.frase),
    transcricao.palavras,
    FPS,
  );
  const imagens: Record<string, boolean> = {};
  for (const cena of anuncio.cenas)
    if (cena.tipo === 'personagem') imagens[cena.imagem] = await existe(cena.imagem, 'image');
  const calculado: Calculado = {
    cenas: linha.cenas,
    duracao: linha.duracao,
    audio: anuncio.audio ? await existe(anuncio.audio, 'audio') : false,
    sons: await existe('sfx/pop.wav', 'audio'),
    imagens,
    fonteDasPalavras: transcricao.fonte,
  };
  return { durationInFrames: linha.duracao, props: { ...anuncio, calculado } };
};

export function Root() {
  return (
    <Composition
      id="Anuncio"
      component={Anuncio}
      width={LARGURA}
      height={ALTURA}
      fps={FPS}
      durationInFrames={FPS * 35}
      defaultProps={validarAnuncio(exemplo) as Props}
      calculateMetadata={calcular}
    />
  );
}
