# Análise do HyperFrames e o que o Framechester faz melhor

Fonte: `github.com/heygen-com/hyperframes`, commit `845bd63` (2026-11-04), Apache-2.0.
Lido o código e a documentação; nenhum código deles foi copiado nem executado. O que foi
adotado são medidas e regras de ofício (números), reimplementadas em Rust.

## Onde está a qualidade deles

Não está no motor de render (Chrome headless + FFmpeg, como qualquer HTML→vídeo) nem só
no catálogo (456 itens: blocos, shaders de transição, câmera, legendas). Está na
**gramática medida quadro a quadro** dos filmes oficiais, escrita para o agente em
`skills/hyperframes/references/` (`motion.md`, `look.md`, `captions.md`, `review.md`,
`spec.md`, `types/*.md`): curvas por papel, tempos de stagger, holds de leitura, zonas
seguras por plataforma e uma lista de "sinais de vídeo gerado" proibidos por padrão.

O ponto fraco: tudo isso é **prosa para um modelo seguir**. Nada no runtime impede uma
entrada igual em todas as cenas, um título que continua deslizando ou texto sob a UI do
Shorts; o `check` deles só avisa parte disso, e a revisão é um passe do agente.

## O que o Framechester passou a impor no motor (com teste)

| Regra medida por eles | Antes no Framechester | Agora (imposto) |
|---|---|---|
| Chegada em cauda longa; mesmo `power2.out` em tudo "parece gerado" | ease-out cúbico em tudo | `EASE_ARRIVE` = `cubic-bezier(0.16,1,0.3,1)`; `pop` com `EASE_EMPHASIS` (overshoot ~0,75) |
| Stagger: itens 40–80 ms, palavras 60–120 ms | 160 ms / 45 ms | 80 ms / 70–80 ms, faixa travada em teste |
| Sinal: "todo elemento entra com fade e sobe"; "toda cena entra igual" | sempre deslizar | entrada gira por cena: deslizar, só opacidade, chegar e assentar |
| Sinal: loops de respiração no conteúdo; título que continua se mexendo | conteúdo flutuava ±3 px; câmera andava a cena toda | conteúdo parado depois de pousar; câmera assenta em 2,4 s e segura; o movimento contínuo fica no fundo |
| Gradiente linear de tela cheia em fundo escuro faz banding no H.264 | gradiente linear vertical | base sólida + luz radial |
| Vertical: nada legível abaixo de 1330 px (título, @, áudio do app) | legendas em 1330–1560 | conteúdo 230–1070, legendas 1100–1320, travado em teste |

E o que já era nosso e eles não têm: o QA de layout **reprova** (texto que não cabe, fora
da área segura, sobreposto) em vez de avisar; o `layout_preflight` pega isso antes do TTS;
a animação é ancorada na palavra narrada; um storyboard vale para três formatos; o zoom de
layout escolhe o maior tamanho que passa no QA.

## O que eles ainda fazem melhor (próximas fatias, por impacto)

1. ~~Looks a partir de um meio.~~ Feito em 2026-11-04: `papel` (risografia) e `planta`
   (blueprint) ao lado do `noite`, por canal, com fontes de título OFL embutidas e
   contraste WCAG verificado em teste para cada par texto/fundo — o que os presets deles
   não garantem. Próximos looks possíveis: editorial em duas cores, lousa.
2. ~~Transições com causa.~~ Feito em 2026-11-04: `expand` (objeto vira o mundo), `iris`
   do ponto focal, `blur_swap` e `dip_cut`, escolhidas pelo planner a partir da cena
   anterior, sem repetir e sem fade cruzado. `morph` (o cartão em foco vira o primeiro
   cartão da cena seguinte) entrou em seguida. Falta: inundação de cor com objeto herói
   compartilhado entre cenas.
3. ~~Blur de entrada por palavra.~~ Feito em 2026-11-04 (6 px → 0 em 0,13 s, sem
   translação, região do filtro limitada ao elemento; custo medido dentro do ruído).
   Blur de movimento em deslocamentos rápidos entrou em seguida por acúmulo temporal
   (amostras do obturador), sem filtro e sem custo medido.
4. ~~Checagens de ofício no QA.~~ Feito em 2026-11-04: `text_below_floor`, `line_unread`
   e `dead_stretch`, com o motor garantindo as três (piso no `fit`, entradas antecipadas)
   — nelas o deles só avisa.
5. Mídia real (tela do produto, footage) com proveniência — fora do escopo atual.
