# Precisão de alinhamento — 28/10/2026

O requisito deste passe é corrigir elementos vizinhos quase alinhados.
As regras são preferências visuais deste produto e estão em `DESIGN.md`;
não representam uma alegação clínica ou necessidade universal de um grupo.
A identidade clara e os fluxos existentes foram preservados.

Foi criada a skill pessoal `precise-ui-alignment`, instalada no diretório de
skills do operador. O repositório conserva o contrato portátil em DESIGN e a
instrução de aplicá-la quando disponível. A skill complementa Impeccable:
mede relações semânticas, distingue caixa/texto/ícone e exige evidência do
render. Seu checker aceita contrato `expected`, reprova relações/participantes
ausentes e recusa `verified:false`. Não descobre por conta própria todas as
relações da tela nem prova que o contrato escolhido é completo.

## Problemas reproduzidos

| Relação ou medida | Antes | Depois |
|---|---:|---:|
| Centros dos títulos Em desenvolvimento / Contas | diferença de 11,5 px | diferença de 0 px |
| Centro do título da página / primeira ação | diferença de 13,890625 px | diferença de 0 px na mesma linha |
| Régua da primeira aba / borda do campo | diferença de 3 px | diferença de 0 px |
| Track das abas / altura dos botões | 36 / 44 px | 44 / 44 px |
| Ícone de ação / ícone comum | 17 / 18 px | 18 / 18 px |
| Recuo interno de campo | 10 px | token de 12 px |
| Campos com label de duas linhas / label curto | diferença de 20 px | diferença de 0 px em duas colunas |

Os títulos irmãos compartilham uma faixa de cabeçalho, mesmo sem ação em uma
das colunas. A linha ativa de aba fica dentro dos limites reais do botão.
Marca, grupos e ícones da navegação usam um eixo; textos de marca/navegação,
outro. Header e conteúdo usam as mesmas réguas também em janelas largas.
Os controles têm tamanho/entrelinha/recuos compartilhados; estatísticas e
formulários compartilham tracks quando há conteúdo com alturas diferentes.
Mobile usa cabeçalho de uma coluna e ações preenchendo sua largura.

## Evidência e limites

- Nove telas × larguras de **320, 390, 760, 1280 e 1920 CSS px**: **45
  combinações**, **348 relações medidas**, todas dentro de **0,5 px** nos
  contratos conferidos e sem overflow horizontal do documento.
- Fixture de componentes com label longo, label curto e ajuda opcional:
  controles alinhados em 900/1280 px; reorganização de uma coluna sem overflow
  em 320/390 px. Subgrid foi confirmado no Chromium do navegador integrado.
- Os rótulos também são comparados com a borda de seu controle. O passe visual
  encontrou um efeito de `align-self` ao retornar de grid para flex em uma
  coluna; o fallback foi corrigido e ganhou essa régua de verificação.
  No diálogo móvel, título/fechar compartilham centro e ações dividem a mesma
  largura. O contrato inclui o seletor de documento nas larguras estreitas.
- O manifesto inicial reprovou **7 de 8 grupos**, preservando valores antes
  da refatoração. O checker não confunde medidas iguais com dimensões corretas
  quando há um `target` explícito.
- **103 testes web**, TypeScript e build aprovados. Checker da skill com
  **10 testes**; validador oficial de skill aprovado. A avaliação independente
  encontrou os problemas de cabeçalhos e abas, e o teste independente da
  skill motivou a validação de cobertura e estados não verificados.
- Após os ajustes de alinhamento, as nove telas foram novamente exercitadas
  com nomes, títulos, arquivos, avisos e referências longos sem espaços, em
  320/390/760/1280 px: **36 cenários sem regressão de overflow de página ou
  vazamento de texto**, preservando rolagem interna das tabelas. Console sem
  erros/avisos nos perfis conferidos. O detector mecânico retornou `[]`;
  as medidas e a inspeção visual continuam sendo a evidência de alinhamento.

As medidas são do navegador Chromium com viewports emulados. Não certificam
baseline tipográfica de cada glifo, hardware real ou todos os navegadores.
A verificação compara caixas, entrelinhas e réguas declaradas, além da
inspeção visual. A aprovação não implica perfeição universal nem substitui
o retorno do operador sobre o conforto visual.

O contrato revisado foi preservado em `contract.json` antes da captura final;
ele é comparado com os participantes coletados, evitando aprovar uma captura
que omita silenciosamente um seletor previsto.

Dados, capturas e manifestos sintéticos ficam em `artifacts/alignment-qa/`,
ignorados pelo Git. O prompt pessoal e o perfil real foram preservados.
Não houve publicação, rede social real, nova mídia ou inferência paga.
