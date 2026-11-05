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
    id: 'mito',
    name: 'Mito ou fato',
    summary: 'Uma crença comum testada contra a evidência, com o veredito no fim.',
    beats: [
      'Gancho: a crença dita como o espectador a conhece, já com a pergunta "é verdade?".',
      'Por que ela parece verdade: a parte certa ou a experiência que a sustenta.',
      'A evidência das fontes, uma por cena, sem exagerar o que elas dizem.',
      'Veredito claro (mito, fato ou depende) e a condição em que muda.',
      'Fechamento com a regra prática que fica no lugar da crença.',
    ],
    layouts: ['pergunta', 'comparacao', 'citacao', 'palco'],
  },
  {
    id: 'erro-comum',
    name: 'Erro comum',
    summary: 'Algo que quase todo mundo faz errado, o custo disso e o jeito certo em passos.',
    beats: [
      'Gancho: o erro descrito na segunda pessoa, reconhecível em uma frase.',
      'O custo do erro mostrado como algo que se perde (tempo, dinheiro, bateria, limite).',
      'A causa em uma frase, sem jargão.',
      'O jeito certo em até 3 passos, um por cena.',
      'O mesmo cenário do gancho, agora sem a perda.',
    ],
    layouts: ['palco', 'lista', 'numero'],
  },
  {
    id: 'por-dentro',
    name: 'Como funciona por dentro',
    summary: 'Abre a caixa de algo cotidiano: entrada, mecanismo e saída, uma peça por vez.',
    beats: [
      'Gancho: o objeto ou ação cotidiana e a pergunta sobre o que acontece por dentro.',
      'O que entra e o que sai, antes do mecanismo.',
      'O mecanismo em etapas na ordem em que acontecem, cada uma com uma analogia própria.',
      'A peça que surpreende ou que quase ninguém conhece.',
      'Retorno ao objeto do gancho, agora entendido.',
    ],
    layouts: ['fluxo', 'palco', 'lista'],
  },
  {
    id: 'e-se',
    name: 'E se…?',
    summary: 'Uma hipótese levada passo a passo até a consequência, cada passo com base nas fontes.',
    beats: [
      'Gancho: a hipótese em uma pergunta curta, declarada como hipótese.',
      'O primeiro efeito, imediato e concreto.',
      'Escalada: cada cena leva o efeito anterior um passo adiante, com a fonte que sustenta o passo.',
      'O ponto em que a hipótese quebra ou o limite do que se sabe.',
      'A volta para o mundo real: o que isso ensina sobre como as coisas funcionam hoje.',
    ],
    layouts: ['pergunta', 'linha-do-tempo', 'numero', 'palco'],
  },
  {
    id: 'escala',
    name: 'Escala',
    summary: 'Um número grande ou pequeno demais traduzido em algo que dá para ver e comparar.',
    beats: [
      'Gancho: o número cru, dito com a unidade e a fonte.',
      'Por que o número sozinho não diz nada: falta referência.',
      'Comparações em escada, da mais próxima do dia a dia à mais extrema, cada uma com sua conta.',
      'A comparação final que fica na memória.',
      'O que essa escala muda na prática.',
    ],
    layouts: ['numero', 'grafico', 'palco'],
  },
  {
    id: 'teste',
    name: 'Teste na prática',
    summary: 'Uma pergunta respondida com um teste que o próprio canal fez, com método e resultado medidos.',
    beats: [
      'Gancho: a pergunta e o resultado parcial que deixa a dúvida.',
      'O método em uma frase: o que foi comparado, como e quantas vezes.',
      'Os resultados medidos, um por cena, sem arredondar a favor da conclusão.',
      'O que surpreendeu e o que o teste não prova.',
      'Recomendação condicionada ao perfil de uso.',
    ],
    layouts: ['numero', 'grafico', 'comparacao'],
  },
  {
    id: 'palco',
    name: 'Palco com mascote',
    summary: 'Uma metáfora física e um número que muda, contados por um elenco fixo em blocos contínuos.',
    beats: [
      'Antes das cenas, escolha uma metáfora física (moeda que é mordida, funil que separa, muro que cresce) e um número de 0 a 100 que conta a história.',
      'Gancho: o número caindo ou subindo por causa do problema, já na primeira cena.',
      'Um elenco de até 2 mascotes que atravessa o vídeo, cada um com seu acessório; cada tarefa citada voa até quem a executa.',
      'Blocos com título fixo de até 6 palavras e uma palavra de destaque; o título só muda quando a ideia muda.',
      'Virada: a solução entra como objeto (funil, rival, tabela) e o número passa a se comportar diferente.',
      'Fechamento: o número final e um envelope com a palavra que o espectador deve comentar.',
    ],
    layouts: ['palco'],
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
