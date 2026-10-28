# Overflow de texto e elementos — 28/10/2026

Passe adicional com Impeccable adapt, UI/acessibilidade e QA. Foram usados
somente dados sintéticos em `artifacts/overflow-qa/profile`, com canais,
títulos, contas, nomes de arquivo, fontes, notas e avisos contendo cadeias
longas sem espaços. Nenhum perfil, prompt pessoal ou conta real foi usado.

## Regressões encontradas e corrigidas

- Em 390 px, a visão geral alargava o documento para **1.733 px**. Títulos de
  produção e rascunhos e tracks de grid preservavam largura intrínseca.
- Canais, pesquisa, contas e avisos também extrapolavam com textos longos.
- A biblioteca de arquivos precisava de track `minmax(0,1fr)` e itens flex
  com `min-width:0`, além do tratamento do nome e da licença.
- `body` com mínimo de 320 px excedia o espaço útil de 305 px quando o
  navegador usava uma barra vertical de 15 px.
- O rótulo da aba Desenvolvimento vazava em 320 px, mesmo sem alargar a
  página. O passe mede também texto dentro das caixas, não apenas o documento.

Textos compactos usam ellipsis: rótulos de botões/abas, listas de documentos,
nomes de canal/conta e arquivo. O texto integral continua no DOM e em `title`,
e pode ser consultado no documento ou select nativo. `setButtonLabel()` mantém
o contrato durante envio e restauração. Textos de leitura, erros, referências,
licenças e valores financeiros quebram linha; nenhum dado foi cortado no
armazenamento. Flex/grid se adaptam sem `overflow-x:hidden` global.

## Evidência final

| Cenário com dados longos | Larguras em CSS px | Estados | Resultado |
|---|---|---:|---|
| Nove telas principais | 320, 390, 760, 1280 | 36 | Sem overflow horizontal do documento |
| Abas de roteiro e narrativa | 320, 390, 760, 1280 | 24 | Sem elementos ou textos escapando |
| Abas do diálogo da pauta e assistente | 320, 390, 760, 1280 | 24 | Sem elementos ou textos escapando |

Nos textos efetivamente truncados, o navegador confirmou `text-overflow:
ellipsis`, `white-space:nowrap`, overflow local oculto e texto completo
preservado. Comparou-se `documentElement.scrollWidth` com `clientWidth`,
incluindo a largura ocupada pela barra vertical.

**103 testes web**, TypeScript e build aprovados. Três contratos novos de
rótulos/select/abas falharam antes da implementação e passaram depois; o teste
de envio existente também confere a preservação do rótulo durante o estado
ocupado. Happy DOM verifica contratos DOM, não layout de pixels. As medições
de layout foram feitas no Chromium do navegador integrado, com viewports
emulados, sem celular físico ou certificação entre todos os navegadores.

Tabelas largas conservam rolagem dentro de `.table-scroll`; campos de edição
mantêm comportamento nativo. Esses overflows internos intencionais não são
vazamentos para a página. A aba Proposta foi conferida no estado vazio, com
modelo desativado na fixture; contexto/avisos longos foram exercitados. Esta
rodada não reavaliou inferência real ou qualidade de conteúdo gerado.

Medições e capturas estão em `artifacts/overflow-qa/`, ignoradas pelo Git:
`before.json`, `after.json`, `editor-tabs.json`, `dialog-tabs.json` e
`screenshots/`. A evidência cobre os estados descritos; alterações futuras,
outras fontes, zoom e outros navegadores exigem nova conferência.
