// Monta tudo o que o vídeo precisa antes do primeiro quadro: valida o roteiro, lê o tempo
// das palavras, calcula a linha do tempo e confere quais arquivos existem em public/.
import { validarAnuncio, type Anuncio } from './anuncio.ts';
import { linhaDoTempo, validarTranscricao } from './alinhar.ts';
import type { Calculado } from './contexto.ts';
import { FPS } from './estilo.ts';
import { staticFile } from './quadro.tsx';

/** Arquivo inexistente volta 404; o tipo esperado evita aceitar uma página no lugar. */
async function existe(caminho: string, tipo: 'image' | 'audio'): Promise<boolean> {
  const r = await fetch(staticFile(caminho), { method: 'HEAD' });
  return r.ok && (r.headers.get('content-type') ?? '').startsWith(tipo);
}

export async function prepararAnuncio(bruto: unknown): Promise<{ anuncio: Anuncio; calculado: Calculado }> {
  const anuncio = validarAnuncio(bruto);
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
  return {
    anuncio,
    calculado: {
      cenas: linha.cenas,
      duracao: linha.duracao,
      audio: anuncio.audio ? await existe(anuncio.audio, 'audio') : false,
      sons: await existe('sfx/pop.wav', 'audio'),
      imagens,
      fonteDasPalavras: transcricao.fonte,
    },
  };
}
