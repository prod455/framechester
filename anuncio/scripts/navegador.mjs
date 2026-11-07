// Abre o anúncio num Chromium sem janela, servido pelo Vite no loopback.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { RAIZ, arquivoDoAnuncio } from './comum.mjs';

export async function abrirAnuncio({ escala = 1 } = {}) {
  const roteiro = JSON.parse(readFileSync(arquivoDoAnuncio(), 'utf8'));
  const servidor = await createServer({
    root: RAIZ,
    configFile: join(RAIZ, 'vite.config.ts'),
    server: { port: 0, hmr: false, watch: null },
  });
  // Sem recarga automática: editar um arquivo no meio do render não pode trocar a página.
  await servidor.listen();
  const endereco = servidor.resolvedUrls.local[0];
  let navegador;
  try {
    navegador = await chromium.launch({ executablePath: process.env.NAVEGADOR || undefined });
  } catch (erro) {
    await servidor.close();
    throw new Error(
      `Chromium não encontrado: rode npx playwright-core install chromium ou defina NAVEGADOR (${erro.message})`,
    );
  }
  const erros = [];
  async function pagina() {
    const contexto = await navegador.newContext({
      viewport: { width: 1080, height: 1920 },
      deviceScaleFactor: escala,
    });
    const p = await contexto.newPage();
    p.on('pageerror', (e) => erros.push(e.message));
    await p.goto(`${endereco}?render`);
    await p.waitForFunction(() => window.__anuncio !== undefined);
    const meta = await p.evaluate((r) => window.__anuncio.preparar(r), roteiro);
    return { p, meta };
  }
  return {
    pagina,
    erros,
    async fechar() {
      await navegador.close();
      await servidor.close();
    },
  };
}

/** Renderiza um quadro e devolve o PNG. Erro de página interrompe: quadro errado não vira vídeo. */
export async function quadro({ p }, frame, erros) {
  await p.evaluate((f) => window.__anuncio.irPara(f), frame);
  if (erros.length) throw new Error(`erro na página no quadro ${frame}: ${erros[0]}`);
  return p.locator('#palco').screenshot({ type: 'png' });
}
