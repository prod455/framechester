// Utilidades dos scripts: leem o anuncio.json (ou o exemplo) e os arquivos em public/.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarAnuncio } from '../src/anuncio.ts';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLICO = join(RAIZ, 'public');
export const SAIDA = join(RAIZ, 'out');

export function arquivoDoAnuncio() {
  const proprio = join(RAIZ, 'anuncio.json');
  return existsSync(proprio) ? proprio : join(RAIZ, 'anuncio.exemplo.json');
}

export function lerAnuncio() {
  const arquivo = arquivoDoAnuncio();
  return { arquivo, anuncio: validarAnuncio(JSON.parse(readFileSync(arquivo, 'utf8'))) };
}
