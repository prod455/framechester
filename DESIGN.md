# Framechester Studio

## Superfície e contexto

Modo: **Operar**. Esta é uma ferramenta de produção local, usada por um operador
para pesquisar, escrever e revisar vídeos em vários canais. Não é o site de
marketing do produto. O seletor de canal define o contexto de trabalho; a
superfície principal contém o próprio trabalho.

O operador rejeitou tanto o painel decorativo roxo quanto a revisão seguinte,
em cartões âmbar. A direção atual segue a orientação distill/quieter do
Impeccable: moldura contida, conteúdo real, controles nativos consistentes e
uma escala tipográfica pequena e fixa. Não recrie um kit de dashboard colocando
cada título, contagem, nota e ação dentro de um retângulo arredondado.

## Composição

- Uma superfície secundária clara leva a navegação; a área de trabalho é branca.
- O cabeçalho contém o seletor de canal e a ação de atualizar. Não repita o
  título da página em um breadcrumb nem adicione um segundo painel de perfil do canal.
- As produções usam linhas alinhadas com as thumbnails locais reais, título, data,
  estado e ação. Nunca invente thumbnails, receita ou atividade para enfeitar.
- Pesquisas e roteiros em desenvolvimento usam listas compactas. Selecionar um item
  abre aquele item real. Uma ação de revisão abre o vídeo correspondente.
- Os detalhes financeiros ficam na seção expansível da visão geral e em Resultados.
- Os formulários agrupam campos relacionados com espaçamento e separadores leves.
  Evite cartões aninhados, blocos decorativos de ícones e ações de criar duplicadas.
- A autenticação é um formulário, não o hero de uma landing page. Não adicione
  slogans, ilustrações, listas de benefícios ou prova social falsa.

## Tokens e componentes

`web/src/design-tokens.css` define cores e tamanhos. O corpo usa a família de
interface local do sistema em 14px; textos auxiliares têm 12–13px, títulos de
seção 15px e títulos de página 24px. Os títulos do produto usam tamanhos fixos,
sem escala pela viewport.

A paleta é formada por área de trabalho branca, uma superfície de navegação neutra
clara, ações principais em grafite, foco e links em azul e cores semânticas de
estado. A cor não substitui o texto do estado. Sombras decorativas e fundos de
destaque não pertencem às seções de trabalho; diálogos podem usar elevação.

O Basecoat 1.1.0 define a estrutura compartilhada dos controles, as variantes e os
estados interativos. Seu CSS é compilado localmente pelo Tailwind/Vite a partir de
`basecoat.css`. O núcleo local do Basecoat e o runtime de abas cuidam da seleção de
abas, do ARIA e das teclas de seta/Home/End; nenhum CDN ou framework é necessário.
`dom.ts` e `components.ts` adaptam os controles nativos à API tipada da aplicação.
`components.css` contém dimensionamento do Studio, tratamentos de status e layouts
de tarefa, não implementações duplicadas de botões ou inputs. `design-tokens.css`
mapeia o contrato semântico do Basecoat: `--primary` é a ação principal, `--muted`
é uma superfície e `--muted-foreground` é o texto secundário. Valores de formulário
no celular usam texto de 16px. Diálogos nativos têm um único `.dialog-surface` com o
cabeçalho e o corpo rolável; a modalidade nativa e os caminhos de fechamento
protegidos contra perda de edição continuam em TypeScript. Mantenha as classes do
Basecoat nos controles; use namespace nos layouts próprios de barra lateral, toast
e estado vazio para evitar colisão com regras de estilo da biblioteca que não são usadas.

Pesquisa, roteiros e narrativas usam painéis de abas do Basecoat montados e
agrupados por tarefa. Mantenha as ações de salvar/aplicar em uma barra de
ferramentas estável e mostre o primeiro painel inválido antes da validação nativa.
O assistente assume a mesma superfície do editor, com as abas Pedido, Dados usados
e Proposta, e depois volta ao formulário montado. Não empilhe um diálogo de
assistente sobre um editor nem coloque caixas com rolagem dentro da resposta dele.
Em telas estreitas, escolha o documento com um select nativo em vez de uma faixa
horizontal. Abas inativas usam o token de texto secundário com opacidade total,
para preservar o contraste no branco.

Rótulos compactos (botões, abas, listas de documentos, nomes de arquivo, nomes de
canal/conta) usam reticências, com o texto completo mantido no DOM e em um title
nativo; abrir o registro ou o select nativo mostra o conteúdo. `setButtonLabel()`
preserva essa estrutura nos estados ocupado e restaurado. Conteúdo de leitura,
erros, referências e valores financeiros quebram linha, inclusive strings sem
espaços; não os corte para fazer um layout passar. Filhos de flex precisam poder
encolher (`min-width: 0`); trilhas de grid de conteúdo usam `minmax(0, 1fr)`. Não
esconda o overflow da página para mascarar um filho que escapa. Tabelas largas
rolam dentro do próprio contêiner delimitado. O body não tem largura mínima em
pixels que gere overflow horizontal quando uma barra de rolagem clássica reduz a
largura disponível.

`components.ts` também cuida das thumbnails de mídia.
`styles.css` cuida do shell; `workspace.css` cuida dos layouts de tarefa;
`overview.css` cuida da visão geral do conteúdo. Ao mudar esses arquivos, substitua
as regras obsoletas em vez de acrescentar mais uma camada de overrides.

## Precisão entre elementos vizinhos

Use `precise-ui-alignment` quando estiver disponível. Compare relações nomeadas na
renderização, não pares arbitrários de coordenadas: títulos irmãos, título da página
e ações, bordas de abas/formulários, padding dos controles, centros de ícones e
trilhos da barra lateral. A tolerância para bordas/centros equivalentes é de 0,5 px
CSS. Registre a viewport e os participantes; seções empilhadas no celular têm um
contrato diferente das colunas vizinhas no desktop. Esta é uma preferência visual
deste produto, não uma afirmação clínica ou universal de acessibilidade.

Os controles compartilham `--control-height:44px`, `--control-inset:12px`,
`--control-gap:8px`, `--icon-size:18px` e `--line-ui:20px`. Os títulos da interface
usam entrelinha explícita de 24/32px; o texto de leitura usa `--line-copy:24px`. Não
acrescente outro tamanho quase igual em um override de componente. As linhas de
cabeçalho reservam uma faixa de alinhamento de 44px, inclusive títulos de seção sem
ação. Ações simples de seção alinham o texto visível ao trilho final; botões com
moldura alinham a borda externa. Os labels nativos continuam associados aos controles.
Os títulos de diálogos nativos ocupam uma faixa de linha de 44px alinhada ao botão
de fechar.

Linhas horizontais de formulário usam subgrid onde houver suporte, para que labels
e dicas que quebram linha compartilhem as trilhas. Layouts de uma coluna voltam ao
fluxo normal dos campos. Estatísticas usam trilhas compartilhadas para rótulos,
valores e detalhes. As trilhas de abas têm padding herdado zero e 44px de altura; a
marcação da aba ativa fica dentro dos limites reais da aba. Cabeçalho e conteúdo
compartilham `--page-inset` e os mesmos trilhos de largura máxima, inclusive em
janelas largas. Marca, ícones de navegação e rótulos de grupo compartilham um trilho
inicial; os textos da marca e da navegação compartilham um segundo trilho.

Use a escala de espaçamento para elementos relacionados. Não esconda
desalinhamentos estruturais com transforms por elemento ou margens negativas.
Ajustes ópticos exigem evidência visual e um escopo explícito. Preserve reticências,
foco, áreas de toque, proteção de edição, autenticação e isolamento entre canais.

## Piso funcional

Preserve o canal selecionado, a autenticação, o CSRF, o armazenamento local de
segredos, a procedência das fontes e os estados separados de QA técnico e revisão
editorial. A publicação continua desativada. Layouts responsivos mantêm controles
funcionando, texto legível, foco visível, rótulos significativos e o comportamento
da tecla Escape. A saída dos modelos continua sendo texto para revisão; o estilo da
interface nunca autoriza ações externas.

Valide no navegador os estados preenchido, vazio e de erro, no desktop e em larguras
estreitas. Rode o detector mecânico como evidência complementar, nunca como
substituto do julgamento visual. A telemetria do Impeccable está desativada no projeto.

## Leis de UX na prática

As mudanças no Studio são conferidas contra as 20 leis listadas em
`docs/UI_REVIEW_20261031.md`. As regras permanentes que saíram delas:

- Uma ação principal (escura) por tela; em listas, só o passo que leva um vídeo
  adiante é principal (Von Restorff, Hick).
- Um nome por ação em todas as páginas e diálogos (similaridade, Jakob): **Novo
  vídeo**, **Assistir**, **Gerar versão final**, **Tentar de novo**.
- Um estado fica ao lado da coisa que ele descreve; os rótulos nomeiam fatos em vez
  de deixá-los para serem decifrados (proximidade, reconhecimento em vez de memória).
- Necessidades ocasionais ficam em uma única seção expansível recolhida (revelação
  progressiva); custo, consentimento e erros nunca ficam escondidos.
- Toda espera mostra movimento e tempo decorrido; toda parada termina com um caminho
  para seguir (Doherty, pico-fim, ciclos de feedback).
- Use o componente do Basecoat antes de escrever CSS: `item`/`item-group` para linhas
  de passo ou de registro, `progress` para barras, e só as variantes de badge `primary`,
  `secondary`, `outline` e `destructive`. Ajustes de espaçamento e alinhamento são
  utilitários do Tailwind no próprio elemento (o Tailwind lê `src/**/*.ts`), não regras
  novas empilhadas sobre o Basecoat.
- Cascade layers: `theme, base, components, studio, utilities`. O CSS do Studio fica em
  `studio` (ainda vence o Basecoat; um utilitário vence ele). Tokens e overrides
  responsivos de tokens ficam fora de layers, em `design-tokens.css`. O status é um
  ponto e palavras, não um badge do Basecoat restilizado.
- Estados em segundo plano usam cor e borda, nunca opacidade no texto; links dentro do
  texto corrido ficam sublinhados. O axe-core (WCAG 2 A/AA) roda em Criar vídeo,
  Vídeos, Canais e no diálogo Novo vídeo antes do merge de mudanças de interface.
