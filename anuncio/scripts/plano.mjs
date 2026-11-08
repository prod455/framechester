// Quais quadros cada trabalhador renderiza. A animação é calculada a `fpsInterno` (60) e o
// vídeo sai no fps do projeto (`fpsSaida`, 30 em config.toml): pega-se um a cada `passo`.
export const FPS_SAIDA = 30;

export function planoDeQuadros({ duracao, fpsInterno, fpsSaida = FPS_SAIDA, trabalhadores }) {
  if (fpsInterno % fpsSaida !== 0) throw new Error(`${fpsInterno} fps não se divide em ${fpsSaida} fps`);
  const passo = fpsInterno / fpsSaida;
  const quadros = [];
  for (let f = 0; f < duracao; f += passo) quadros.push(f);
  const tamanho = Math.ceil(quadros.length / Math.max(1, trabalhadores));
  const trechos = [];
  for (let i = 0; i < quadros.length; i += tamanho) trechos.push(quadros.slice(i, i + tamanho));
  return { passo, total: quadros.length, trechos, segundos: quadros.length / fpsSaida };
}
