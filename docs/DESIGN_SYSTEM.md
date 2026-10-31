# Design system do Studio

A direção vigente está em [DESIGN.md](../DESIGN.md). O passe Impeccable de
28/10/2026 substitui a revisão anterior de painéis em âmbar. A superfície é
uma ferramenta de produção: o conteúdo e a próxima ação têm prioridade sobre
decoração, contadores e explicações repetidas.

## Composição

- Navegação clara sobre fundo neutro; conteúdo sobre fundo branco.
- Um seletor de canal no cabeçalho, sem breadcrumb repetindo o título.
- Produções em linhas com miniatura real, título, data, estado e ação.
- Pesquisas e roteiros em desenvolvimento em listas, com acesso ao item certo.
- Revisão abre o vídeo diretamente. Finanças ficam em detalhes expansíveis
  na visão geral e na página Resultados.
- Grupos de formulário usam espaçamento e separadores. Containers não exigem
  cartões; campos continuam tendo bordas, rótulos e foco identificáveis.
- O corpo dos diálogos mantém 24 px entre filhos diretos, inclusive quando
  um seletor fica fora do formulário. No preparo de vídeo, o resumo, as cenas
  e as opções usam essa mesma régua; ações relacionadas têm 12 px entre si.
- Autenticação é uma tela de formulário, sem slogan ou hero de marketing.

## Tokens

| Papel | Token | Valor |
|---|---|---|
| Área de trabalho | `--canvas` | `#ffffff` |
| Navegação | `--sidebar` | `#f8f9fb` |
| Texto | `--ink` | `#24282e` |
| Texto secundário | `--muted-foreground` | `#606874` |
| Ação principal | `--primary` | `#30363e` |
| Links | `--link` | `#315a8d` |
| Foco | `--focus` | `#3367b2` |

A família local de interface usa corpo de 14 px, auxiliares de 12–13 px,
seções de 15 px e título de página fixo de 24 px. Campos usam 14 px no desktop
e 16 px em telas estreitas. Estados
conservam texto explícito e cores semânticas; ponto colorido é apenas reforço.
Monoespaçada fica restrita a código, caminhos e dados que a justificam.

## Organização

- `design-tokens.css`: valores semânticos compartilhados.
- `basecoat.css`: imports locais do Basecoat e compilação Tailwind; nenhum CDN.
- `styles.css`: reset, tipografia e navegação persistente.
- `dom.ts` e `components.ts`: API TypeScript para controles nativos, diálogos,
  mensagens e miniaturas. `components.css` mantém ajustes de tamanho e layouts.
- `workspace.css`: pesquisa, editores, produção, resultados, contas e autenticação.
- `overview.ts` e `overview.css`: composição da visão geral.

`mediaThumbnail` usa o endpoint autenticado do próprio job. Se a imagem
estiver ausente, mostra um ícone SVG neutro, sem fabricar uma miniatura.
Texto de fontes e modelos continua sendo inserido como texto pelo DOM.

## Basecoat

A biblioteca instalada é `basecoat-css@1.1.0`, com licença MIT. Ela fornece
estados e variantes dos controles; o Studio mantém sua composição e paleta.
O [contrato oficial](https://basecoatui.com/installation/) foi conferido na
documentação e no pacote instalado. Tailwind 4.3.1 compila os estilos no Vite;
o core e o módulo de abas Basecoat são empacotados localmente. Não há React,
CDN ou download de fontes no aplicativo.

`button()` aceita variantes tipadas `primary`, `secondary`, `light`, `ghost`
e `danger`, mapeadas para o contrato `data-variant` da biblioteca. Adicione
classes de layout com `classList`, sem concatená-las no argumento da variante.
`field()` cria grupo, label associado ao controle nativo e ajuda por
`aria-describedby`. `input()`, `select()` e `textarea()` conservam valores,
validação e participação no formulário. Não os substitua por controles
simulados sem preservar esses contratos e a proteção de edições.

`dialogFrame()` concentra o markup Basecoat: um `<dialog>` nativo, uma
superfície, cabeçalho e corpo rolável. `createDialog()` mantém foco e Escape;
`formWithSave()` mantém validação, erro, envio único, estado ocupado e registro
de edições. O aviso de descarte usa a mesma estrutura visual. Todos os eventos
são ligados por TypeScript, preservando a CSP sem handlers inline.

`ui-tabs.ts` adapta as abas Basecoat sem reimplementar sua seleção ou teclado.
Os painéis ficam montados para preservar os campos. `editorWorkspace()` mantém
as ações acessíveis no topo; botões externos usam o atributo nativo `form`.
Validação abre a primeira aba inválida antes de focar o campo. O assistente
ocupa a mesma superfície do editor, com Pedido, Dados usados e Proposta;
aplicar volta ao formulário sem salvar. No celular, um select nativo troca o
documento. Resultados usam pares rótulo/conteúdo e a rolagem da página ou do
diálogo, sem caixas roláveis aninhadas. Detalhes técnicos usam o accordion
nativo Basecoat. Abas inativas usam `--muted-foreground` opaco, evitando a
transparência padrão da variante Vega sobre branco.

Basecoat diferencia superfícies (`--muted`, `--accent`) de texto
(`--muted-foreground`, `--accent-foreground`). A ação principal usa
`--primary`/`--primary-foreground`. Os tokens Framechester fazem esse mapa;
não use `--muted` como cor de texto nem `--accent` como botão principal.

O estilo Vega completo acompanha as estruturas importadas; o CSS compilado
inclui regras de variantes ainda não usadas. Não se afirma redução do CSS.
Os layouts próprios de sidebar, notificações e estados vazios têm nomes
separados para evitar colisões. Licenças são copiadas para `web/public/licenses/`
e incluídas no build.

Validação da migração: **78 testes web**, seis novos testes DOM de componentes,
TypeScript e build aprovados; detector de fonte Impeccable retornou `[]` nos
nove arquivos selecionados. No navegador foram conferidos acesso, campos,
diálogo, revisão do vídeo existente, filtros de rede, proteção ao fechar/trocar
canal e viewport de 390 × 844. Artefatos locais em
`artifacts/basecoat-20261028/`. Não foi gerada nova mídia nesta migração.

## Verificação

O passe de precisão posterior aplica o contrato de [DESIGN.md](../DESIGN.md#precisão-entre-elementos-vizinhos):
controles de 44 px, ícones de 18 px, recuo de 12 px e entrelinha de UI de
20 px. Cabeçalhos irmãos reservam a mesma faixa de 44 px; abas não herdam
padding de 3 px nem track de 36 px para botões de 44 px. Formulários usam
subgrid onde suportado para alinhar controles com labels e ajudas de alturas
diferentes; em uma coluna voltam ao fluxo normal. Regras, medidas e limites
constam em [ALIGNMENT_QA.md](ALIGNMENT_QA.md).

O passe conferiu desktop, 760 px e 390 px, menu por teclado/Escape, abertura
direta da revisão, roteiro selecionado, detalhes financeiros e autenticação.
As larguras medidas no navegador não apresentaram overflow horizontal.
Build e 62 testes web passaram. O detector estático Impeccable retornou
`[]` nos oito arquivos de UI examinados; isso complementa a inspeção visual.

Skill oficial, revisão `8409a564d1baee90b2dde4f7a8f06288838e3921`:
[pbakaus/impeccable](https://github.com/pbakaus/impeccable).
Aplicados os guias `distill`, `quieter`, `polish` e `operate`, com telemetria
desativada e sem instalação de hooks. Evidências em
`artifacts/impeccable-20261028/`, ignoradas pelo Git.
