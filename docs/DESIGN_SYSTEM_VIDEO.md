# Design system audiovisual

Direção de arte do motor motion (`crates/framechester-motion/src/tokens.rs`,
`format.rs`). Um tema escuro editorial, cores com significado, uma escala tipográfica
por formato e movimento justificado pela narração. Componentes nunca escolhem cores
cruas: pedem um papel (`role`).

## Looks (2026-11-04)

Cada canal escolhe um look (`look = "…"` em `[[channels]]`, campo "Visual dos vídeos" no
Studio, `look` no storyboard ou `--look` no `plan`/`produce`; o flag vence o storyboard,
que vence o canal). Um look é a regra de um meio, não uma troca de paleta
(`crates/framechester-motion/src/look.rs`):

| Look | Meio | Chão | Tintas | Cartões | Título |
|---|---|---|---|---|---|
| `noite` (padrão) | tela à noite | `#070B14` + luz radial + aurora fria | tinta `#EEF2F8`, acento `#F2B544` | vidro iluminado, sombra suave | Inter Bold em gradiente |
| `papel` | risografia | papel plano `#EFE8DA`, sem gradiente | tinta A navy `#1F2A55`, tinta B vermelhão `#CC3314` | impressos planos com contorno em tinta A e a placa B deslocada 9 px | Archivo Black |
| `planta` | blueprint | cobalto `#0F3D91` + grade de 60 px | linhas brancas, acento amarelo-segurança `#FFD23F` | painéis translúcidos, só traço, sem sombra | Bebas Neue (×1,3) |

Os componentes pintam com referências semânticas (`tokens::INK` é `"@ink"`); o frame as
resolve no look ao escrever o SVG. A fonte de título é escolhida no layout
(`Ctx::display`), porque o texto é medido na fonte em que é desenhado.

**Contraste é medido, não estimado**: `look::Theme::contrast_failures` calcula o contraste
WCAG 2 de cada par texto/fundo que os componentes desenham (fundos translúcidos compostos
sobre o chão, a luz do topo incluída): texto de leitura ≥ 4,5:1; texto grande (títulos,
números, rótulos de 21 px semibold ou mais, ênfase) ≥ 3:1. O teste
`every_look_meets_wcag_contrast_for_what_it_draws` reprova qualquer look abaixo disso — foi
ele que levou o acento do `papel` de laranja fluorescente (2,7:1 sobre o papel) a
vermelhão (≥ 3,5:1) com a palavra falada em branco-papel (5,1:1), e escureceu o topo
iluminado de três cartões do `noite`.

## Cores (look `noite`)

| Token | Valor | Uso |
|---|---|---|
| `BACKGROUND` / `BACKGROUND_TOP` | `#070B14` / `#0D1630` | fundo sólido com luz radial do topo (gradiente linear de tela cheia faz banding no H.264) |
| `AURORA` | `#3D6BFF`, `#8B5CF6`, `#14B8A6` | três campos de cor fria atrás do conteúdo, derivando devagar |
| `BACKGROUND_RAISED` / `SURFACE` / `SURFACE_STRONG` | `#121926` / `#182130` / `#223044` | camadas, cartões, barras vazias |
| `RULE` | `#2B3A52` | réguas, trilhos, bordas neutras |
| `INK` / `INK_SOFT` / `MUTED` | `#EEF2F8` / `#C7D0DE` / `#8C99AE` | texto principal, detalhe, metadados |
| `ACCENT` | `#F2B544` | o foco da tela: palavra falada, destaque, setas de causa |
| `PRIMARY` | `#5B9DFF` | lado/objeto primário (ex.: agente) |
| `SECONDARY` | `#3DD6B5` | lado/objeto secundário (ex.: skill) |
| `SUCCESS` / `WARNING` / `DANGER` | `#58D68D` / `#F2B544` / `#FF6B6B` | estados |

Cada `role` mapeia para preenchimento (`fill` embaixo, `fill_top` em cima), borda,
texto e cor do brilho (`palette()`).

### Profundidade (2026-11-04)

- **Fundo vivo**: base sólida azul-noite com luz radial do topo, três campos de aurora em tons frios
  (azul, violeta, verde-água) que derivam alguns por cento da tela a cada dez segundos, e
  vinheta. Nada quente no fundo: brilho âmbar sobre o escuro virava marrom. Cada campo
  pinta só o próprio quadrado, então o custo de render fica em ~3% (`bench_raster`).
- **Cartões de vidro**: gradiente `fill_top` → `fill` por papel (`tokens::card_fill`) e
  borda fina iluminada no topo que some embaixo (`tokens::card_edge`), mais a sombra já
  existente. Gradientes ficam no `<defs>` de cada frame.
- **Títulos** em gradiente branco → azul-gelo (`tokens::HEADLINE`).
- Objetos neutros têm traço `#8EA2C8` (ícones e marcadores legíveis sobre o vidro).
- Linha do tempo vertical compacta e centrada, com marcadores grandes até 4 marcos;
  cartões de infográfico com altura derivada do conteúdo, e o texto que não cabe no
  cartão é reportado (antes a área era esticada para fora dele).
- **Zoom de layout**: fluxos, comparações, linhas do tempo, gráficos (não no vertical),
  arquiteturas, anotações, infográficos, causa/efeito e passos são refeitos com tipo,
  ícones e espaçamento 1,6×, 1,45×, 1,3× ou 1,15× (`Canvas::zoomed`). Fica o maior que
  cabe na área e passa em todo o QA de layout; uma cena que já tem problema fica no
  tamanho de referência, para o relatório descrever o design base.

## Tipografia

Fontes embutidas no binário (OFL-1.1, em `assets/fonts/`): **Inter** (Regular,
SemiBold, Bold) para interface e legendas, **Liberation Mono** para código e as fontes
de título dos looks, **Archivo Black** (`papel`) e **Bebas Neue** (`planta`). Por serem
embutidas, a medição e a quebra de linha são idênticas em qualquer máquina; o
manifesto de render registra o SHA-256 de cada fonte.

| Papel | Vertical 1080×1920 | Horizontal 1920×1080 | X 1280×720 |
|---|---|---|---|
| título | 82 | 86 | 62 |
| cabeçalho da cena | 58 | 56 | 42 |
| corpo | 42 | 38 | 29 |
| rótulo | 38 | 34 | 26 |
| pequeno | 30 | 27 | 21 |
| legenda | 64 | 52 | 40 |
| código | 34 | 32 | 24 |
| número | 190 | 210 | 150 |

Entrelinha 1,22. Hierarquia fixa: cabeçalho da cena em Bold, rótulos em SemiBold,
detalhes em Regular com `INK_SOFT`. Texto encolhe até um mínimo por componente, depois
até o piso de legibilidade (`pequeno`, o tamanho dos detalhes); títulos de comparação
quebram em até 3 linhas e cartões do fluxo vertical crescem até a célula. Só o que não
cabe nem no piso **reprova** — nunca há reticências. O `produce` (e o `short`) roda esse
layout sobre o plano **antes** do TTS e do render (`layout_preflight`) e para em segundos,
dizendo a cena e o texto a encurtar.

## Áreas seguras e layout por formato

Cada formato tem geometria própria (`Canvas::for_format`); nenhum é recorte de outro.

| | Conteúdo | Legendas | Motivo |
|---|---|---|---|
| Vertical | x 72–1008, y 230–1070 | x 72–892, y 1100–1320 | barra de status e busca nos 168 px do topo, botões à direita entre ~55 % e ~85 % da altura; título, @ e áudio cobrem tudo abaixo de 1330 px, onde só fica textura |
| Horizontal | x 112–1808, y 92–852 | x 312–1608, y 896–1016 | barra de progresso e controles do player no rodapé |
| X | x 72–1208, y 56–556 | x 180–1100, y 586–682 | miniatura pequena no feed; tipo maior, legendas mais curtas |

Regras de composição:

- um conceito por tela; o `concept` da cena é o cabeçalho e o contador `n / total`
  fica no canto;
- componentes ocupam a área de conteúdo de cima para baixo e, quando sobra mais de um
  terço, descem parte do caminho para equilibrar com as legendas;
- fluxos empilham no vertical e enfileiram no horizontal; comparações sempre em duas
  colunas; infográfico em duas colunas no vertical e até três no horizontal;
- legendas em blocos de até 5 palavras (vertical) ou 7 (horizontal/X), no máximo duas
  linhas, caixa semitransparente; as palavras do bloco entram uma a uma (45 ms) subindo
  com leve overshoot, a palavra falada ganha pílula `ACCENT` com tinta escura e "pop" de
  escala, e palavras de ênfase ficam em `ACCENT` permanente;
- ícones vetoriais próprios em grade 24 px, traço 2 (`icons.rs`).

## Movimento

| Movimento | Duração padrão | Easing | Quando |
|---|---|---|---|
| `reveal` | 0,6 s | chegada de cauda longa `cubic-bezier(0.16,1,0.3,1)` | objeto entra quando é mencionado; a entrada gira por cena: deslizar, sem translação (texto entra nítido a partir de 6 px de desfoque em 0,13 s, palavra por palavra; cartões só aparecem) ou chegar 6% maior e assentar. O desfoque fica restrito à caixa do elemento e dura 4 frames: custo dentro do ruído do render |
| `pop` | 0,6 s | ênfase `cubic-bezier(0.34,1.56,0.64,1)` (overshoot de amortecimento ~0,75) | nós de fluxo e arquitetura |
| `draw` | 0,45 s | ease-out | aresta depois que as duas pontas existem |
| `highlight` | 1,2 s | ease-out | anel de brilho enquanto o objeto é discutido |
| `grow` / `count` | ≥ 0,8 s | ease-out | barras crescem e números contam |
| `type` | 0,04 s por caractere | linear | linhas de código |
| `move_to` | 0,9 s | ease-in-out | uma cópia viaja até o destino; o original fica a 30 % |
| `breathe` | — | — | movimento contínuo vem do fundo (aurora); o conteúdo nunca flutua |

Transições entre cenas **com causa** (o planner escolhe pelo que a cena anterior deixa na
tela, nunca repete a mesma costura em seguida e não usa fade cruzado — mundos não se
dissolvem um no outro):

| Transição | Causa | Como (duração medida em filmes de referência) |
|---|---|---|
| `morph` | um cartão dos dois lados | o cartão em foco que sai muda de lugar, tamanho e cor até virar o primeiro cartão da cena que entra (0,5 s, chegada de cauda longa); o conteúdo antigo sai rápido e o novo aparece dentro dele |
| `expand` | o cartão em foco da cena que sai (o último a entrar) | cresce até passar do quadro com o raio encolhendo (0,65 s, ease-in-out); o resto sai; a cor dele é o fundo onde a próxima cena entra e depois assenta no chão do look |
| `iris` | o ponto em foco | a próxima cena abre num círculo a partir do centro do objeto em foco, acelerando (0,45 s) |
| `blur_swap` | o mesmo palco (depois de título ou personagem) | a cena sai com desfoque crescendo até 8 px e entra focando (0,18 s + 0,18 s); o chão nunca corta |
| `dip_cut` | corte intencional | o quadro escurece 40% por 3 frames antes do corte seco |

De cena com cartões para cena com cartões (fluxo, arquitetura, infográfico, causa, passos,
transformação): `morph`, `expand` ou `iris`; de cena com cartões para as outras: `expand`,
`iris` ou `blur_swap`; depois das outras: `blur_swap`, `dip_cut` ou `iris`. Sem cartão dos
dois lados, um `morph` vira `blur_swap`. A
abertura entra em corte. `push`, `fade`, `zoom` e `whip_pan` continuam disponíveis para
storyboards escritos à mão. Revisão visual:
`cargo run --release -p framechester-motion --example preview_transitions -- <pasta> [look]`.
Irmãos que entram no mesmo cue são escalonados em 80 ms (itens de lista 40–80 ms, palavras 60–120 ms; legendas a 70 ms).

Justificativa: movimento só quando a narração traz algo novo (um objeto, uma relação,
um valor) ou para manter o quadro vivo; nunca zoom decorativo, nunca animação aleatória.

## Câmera e variedade

Cada cena tem um movimento de câmera que assenta em até 2,4 s com cauda longa e depois
fica parado (um empurrão que continua enquanto se lê é sinal de vídeo gerado), em ciclo
para que duas cenas seguidas nunca repitam: aproximar 2,5%, deslizar para a esquerda, afastar
2,5%, deslizar para a direita (14 px de cada lado, com 1,25% de zoom). As legendas ficam
fora do movimento. A escala vai para o SVG com 4 casas decimais: com 2, um zoom lento
andaria em degraus de ~10 px. A primeira cena entra em corte; as seguintes alternam
empurrar, zoom e fade. O personagem troca de lado nas cenas ímpares (no horizontal e no
X ele fica à direita do balão, virado para a esquerda).

## Gancho (primeira cena)

O quadro 0 é a capa do Short e a primeira impressão: tudo o que entraria nos primeiros
0,6 s da cena de abertura já está na tela nele (inclusive o personagem), e um punch-in de
câmera de 5% assenta em 0,5 s para o quadro inicial já ter movimento. As cenas seguintes
mantêm suas entradas. O QA bloqueia (`hook_first_frame`) se o quadro 0 não tiver texto
legível e (`hook_voice`) se a primeira palavra começar depois de 0,5 s.

## Personagens

Quatro figuras vetoriais em estilo flat, desenhadas pelo motor numa caixa de 110 × 160
unidades: **apresentador** (camisa `PRIMARY`), **dev** (moletom `SECONDARY` e óculos),
**cientista** (jaleco `INK` e gravata `ACCENT`) e **robô** (corpo `SURFACE_STRONG`, rosto
de tela e antena `ACCENT`). Mesma pele neutra para os humanos; nenhuma é retrato de pessoa
real. No vertical o balão ocupa o terço de cima e o personagem fica abaixo; no horizontal
e no X o personagem ocupa a coluna esquerda e o balão aponta para a cabeça.

**Expressões.** A pose define o rosto: explicar tem sobrancelhas em arco e sorriso;
apontar, sobrancelhas niveladas e boca reta; pensar, uma sobrancelha erguida e a boca de
lado; comemorar, as duas no alto e sorriso aberto. **Objetos na mão livre:** notebook (dev),
frasco com líquido `SECONDARY` (cientista), microfone (apresentador); o robô não segura
nada e comemorar levanta as duas mãos, então não há objeto.

| Vida | Ritmo |
|---|---|
| entrada | sobe 40 px com fade em 0,5 s |
| boca | abre e fecha a cada 0,14 s, só enquanto um segmento da narração toca |
| olhos | piscam a cada 3,1 s |
| braço do gesto | balança 6 px a cada 0,7 s |
| sobrancelhas | sobem 4 px no começo de cada frase |

## Thumbnail

`render/thumbnail.png`, 1280 × 720: o personagem do vídeo (ou o da pauta) ocupa a coluna
esquerda apontando para o título, em Inter Bold de 104 a 56 px com barra `ACCENT` ao lado;
título com `?` usa a pose pensar. Título que não cabe no tamanho mínimo vira aviso no
relatório, nunca texto cortado. Revisão visual: `cargo run --release -p
framechester-motion --example preview_components -- <pasta>`.

## Desfoque de movimento

Quem se move rápido (pop, deslize, viagem de `move_to`) deixa um rastro por **acúmulo
temporal**: três amostras de dentro do obturador (0,025 s, ~270° a 30 fps), atrás do nó e
com opacidade 35%, 22% e 12%. Só entra quando o nó anda mais de 2 px no obturador, nunca
nas legendas (precisam ser lidas). Um filtro gaussiano por frame custaria ~10 ms por linha
no resvg; as amostras são desenhos vetoriais e o render fica na mesma velocidade.

## Ofício medido (garantido pelo motor, guardado pelo QA)

| Regra | Garantia no motor | Guarda no QA |
|---|---|---|
| Nenhum texto legível abaixo de 2,6% do lado menor (28 px em 1080p, 19 px no X) | `Ctx::fit` nunca desce abaixo de `Canvas::text_floor`; o que não cabe é reportado | `text_below_floor` reprova |
| Cada linha fica na tela 0,5 s + 0,3 s por palavra (mais a cascata das palavras) | `compose` antecipa a entrada de objetos, notas e rótulos que entrariam tarde demais | `line_unread` pede revisão (só quando a cena é curta demais para o próprio texto) |
| Nenhum trecho de mais de 3 s sem mudança | legendas por bloco, destaques por palavra, câmera que assenta | `dead_stretch` pede revisão |

## Proibições (impostas por QA quando mensuráveis)

- parágrafos longos ocupando a tela — rótulos ≤ 60 caracteres, detalhes ≤ 120;
- texto truncado com reticências — `text_overflow` reprova;
- telas paradas durante a explicação — `long_still` (≥ `max_still_secs`, padrão 5 s)
  e `semantic_motion` (mínimo de mudanças por cena) reprovam;
- texto fora das áreas seguras ou sobreposto — `outside_safe_area`, `text_intersection`;
- imagens que não explicam o roteiro — a composição é derivada do roteiro; não há
  mídia de terceiros nem imagens decorativas.

## Áudio

Narração por frase (Kokoro-82M PT-BR), pausas semânticas, efeito de transição
procedural (ruído filtrado, −13 dBFS de pico, determinístico), música opcional e
licenciada com ducking (`sidechaincompress`), `loudnorm` em duas passagens e
`alimiter`. Alvo padrão: **−14 LUFS integrado, true peak −1,5 dBTP, LRA 9 LU**,
configuráveis em `[audio]` (faixa aceita de −30 a −8 LUFS e −6 a 0 dBTP). O QA mede
com `ebur128`, `silencedetect` e `astats`. Esses valores são um ponto de partida sujeito
a validação auditiva por plataforma; não são promessa de normalização igual à do
YouTube.
