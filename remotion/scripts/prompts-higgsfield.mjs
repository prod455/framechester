// Gera out/higgsfield.md: o prompt de cada personagem (mesmo começo para manter o estilo)
// e o texto da narração para a voz clonada. A geração acontece no app do Higgsfield, com a
// sua conta e os seus créditos; nada aqui chama a API nem gasta crédito.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SAIDA, lerAnuncio } from './comum.mjs';

export const ESTILO =
  'Premium 3D character render in the style of a glossy soft-touch vinyl toy: smooth rounded shapes, ' +
  'cute face with big glossy black eyes, pink blush cheeks, soft studio lighting, pastel colors, ' +
  'isolated on a transparent background, no text. SUBJECT: ';

const { anuncio, arquivo } = lerAnuncio();
const personagens = anuncio.cenas.filter((c) => c.tipo === 'personagem');
const narracao = anuncio.cenas.map((c) => c.frase).join('\n\n');
const linhas = [
  `# Higgsfield · ${anuncio.marca.nome}`,
  '',
  `Gerado de \`${arquivo.split('/').pop()}\`. Regenere com \`npm run prompts\` depois de mudar o roteiro.`,
  '',
  '## Personagens 3D',
  '',
  'No Higgsfield: Image, modelo **GPT Image**, qualidade **média**, fundo **transparente**, formato 1:1.',
  'Baixe em PNG e salve em `remotion/public/` com o nome abaixo. Fundo branco não serve: o `npm run checar` recusa PNG sem transparência.',
  '',
  ...personagens.flatMap((c, i) => [
    `### ${i + 1}. \`public/${c.imagem}\``,
    '',
    '```text',
    ESTILO + c.prompt,
    '```',
    '',
  ]),
  '## Voz clonada (só a sua)',
  '',
  '1. Separe uns 20 s de um vídeo seu falando para a câmera, sem música por baixo.',
  '2. No Higgsfield, abra Audio, escolha o modelo de voz com clonagem por referência e envie esse trecho.',
  '3. Cole o texto abaixo. Ele já está com os números por extenso e sem reticências.',
  '4. Baixe em WAV e salve como `remotion/public/narracao.wav`.',
  '5. Nome estrangeiro saiu errado? Escreva como se fala (Claude → "Clód") só no texto da voz; o roteiro continua igual.',
  '',
  'Clone só a sua própria voz e diga no vídeo que é um clone.',
  '',
  '```text',
  narracao,
  '```',
  '',
];
mkdirSync(SAIDA, { recursive: true });
writeFileSync(join(SAIDA, 'higgsfield.md'), linhas.join('\n'));
writeFileSync(join(SAIDA, 'narracao.txt'), `${narracao}\n`);
console.log(
  `Prompts em out/higgsfield.md (${personagens.length} personagens) e texto da voz em out/narracao.txt.`,
);
