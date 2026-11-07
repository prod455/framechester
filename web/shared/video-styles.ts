import type { MotionDirective, SceneLayout } from './scene-layouts.ts';

// Editorial conventions of faceless tech/science channels, written as rules a model can follow.
// They are recurring genre patterns, not measured retention data: validate each one against the
// channel's own analytics before treating it as a result (docs/GUIA_VISUAL.md).
export interface VideoStyle {
  id: string;
  name: string;
  summary: string;
  beats: string[];
  layouts: (SceneLayout | MotionDirective)[];
}

export const videoStyles = [
  {
    id: 'explicador',
    name: 'Explicador direto',
    summary: 'Uma pergunta concreta respondida com mecanismo, analogia e consequência.',
    beats: [
      'Gancho: a pergunta exata que o título promete, com a primeira pista útil já na abertura.',
      'Resposta curta antes do detalhe, para o espectador saber aonde vai.',
      'Mecanismo em até 3 passos, um por cena, com uma analogia própria.',
      'Exemplo hipotético identificado como hipotético.',
      'Consequência prática e retorno à pergunta inicial.',
    ],
    layouts: ['pergunta', 'lista', 'comparacao', 'destaque'],
  },
  {
    id: 'misterio',
    name: 'Mistério documental',
    summary: 'Um fato estranho e verificável investigado até a explicação documentada.',
    beats: [
      'Abertura fria no fato estranho, sem introdução do canal.',
      'Contexto mínimo: quando, onde e por que importa.',
      'Pistas em ordem, cada cena termina com uma pergunta que a próxima responde.',
      'Explicação popular e por que ela não fecha, só quando as fontes sustentarem.',
      'Virada com a explicação documentada e o que ainda é desconhecido.',
    ],
    layouts: ['pergunta', 'linha-do-tempo', 'citacao', 'numero'],
  },
  {
    id: 'ranking',
    name: 'Ranking',
    summary: 'N itens com critério explícito, do menos ao mais relevante.',
    beats: [
      'Gancho: o critério do ranking e por que o primeiro lugar surpreende.',
      'Critério dito em uma frase antes do primeiro item.',
      'Um item por cena: o quê, por que está nessa posição, um dado ou exemplo.',
      'Primeiro lugar por último, cumprindo a promessa do gancho.',
      'Fechamento curto que convida a comparar com a experiência do espectador.',
    ],
    layouts: ['lista', 'numero', 'destaque'],
  },
  {
    id: 'historia',
    name: 'Linha do tempo',
    summary: 'Origem, marcos e ponto de virada de uma tecnologia ou ideia.',
    beats: [
      'Gancho no presente: algo cotidiano que depende dessa história.',
      'Origem com data e responsável documentados.',
      'Dois a quatro marcos, cada um com o problema que resolveu.',
      'Ponto de virada que explica por que hoje é diferente.',
      'Pergunta em aberto sobre o próximo marco, sem previsão apresentada como fato.',
    ],
    layouts: ['linha-do-tempo', 'citacao', 'destaque'],
  },
  {
    id: 'versus',
    name: 'Comparativo',
    summary: 'Duas opções medidas pelos mesmos critérios, com veredito condicionado.',
    beats: [
      'Gancho: a decisão real que o espectador precisa tomar.',
      'Critérios declarados antes da comparação.',
      'Um critério por cena, com os dois lados lado a lado.',
      'Números só com fonte e unidade claras.',
      'Veredito por perfil de uso, nunca um vencedor absoluto sem evidência.',
    ],
    layouts: ['comparacao', 'numero', 'lista'],
  },
  {
    id: 'dor-solucao',
    name: 'Dor e solução',
    summary: 'Uma dor que o público reconhece, quanto ela custa e uma solução real funcionando na tela.',
    beats: [
      'Gancho: um número que assusta, preso a uma situação que o espectador já viveu; o número vem de fonte citada ou de uma conta dita na narração.',
      'A negação que quase todo mundo faz diante desse número, em uma frase curta.',
      'Três exemplos concretos e com humor da mesma dor, um por cena; exemplo inventado é dito como hipotético e não leva número sem fonte.',
      'O custo acumulado por mês ou por ano, calculado só com os números já ditos, com a conta falada.',
      'A solução: uma ferramenta, técnica ou hábito que existe de verdade; nunca um produto inventado apresentado como real.',
      'A solução funcionando na tela, com o estado mudando de antes para depois.',
      'Três palavras que resumem a mudança e uma frase de fechamento.',
      'Virada: um bastidor verdadeiro que muda o sentido do vídeo, como o fato de ele ter sido feito com IA, e uma chamada para ação que não promete resultado.',
    ],
    layouts: ['numero', 'personagem', 'palco', 'transformacao', 'destaque'],
  },
] as const satisfies readonly VideoStyle[];
export type VideoStyleId = (typeof videoStyles)[number]['id'];

const formatRules = {
  short:
    'Short de 65 a 90 segundos: a primeira cena dura até 3 segundos e já mostra a pergunta ou o fato; uma única ideia; frases curtas para leitura em legenda; a última fala retoma o gancho para fechar o ciclo.',
  long: 'Vídeo longo de 7 a 12 minutos: promessa clara nos primeiros 30 segundos; um novo dado, pergunta ou virada a cada 60 a 90 segundos; recapitulação curta antes da conclusão.',
} as const;

export function videoStyle(id: unknown): VideoStyle | undefined {
  return videoStyles.find((style) => style.id === id);
}

/** Style guide appended to the task instruction. */
export function videoStyleGuide(style: VideoStyle, format?: 'short' | 'long'): string {
  return [
    `Formato editorial: ${style.name} — ${style.summary}`,
    'Estrutura:',
    ...style.beats.map((beat, index) => `${index + 1}. ${beat}`),
    `Layouts visuais preferidos: ${style.layouts.map((name) => `#${name}`).join(', ')}. Varie o layout entre cenas consecutivas.`,
    ...(format ? [formatRules[format]] : []),
  ].join('\n');
}
