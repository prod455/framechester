# Design system audiovisual

Direção de arte do motor motion (`crates/framechester-motion/src/tokens.rs`,
`format.rs`). Um tema escuro editorial, cores com significado, uma escala tipográfica
por formato e movimento justificado pela narração. Componentes nunca escolhem cores
cruas: pedem um papel (`role`).

## Cores

| Token | Valor | Uso |
|---|---|---|
| `BACKGROUND` | `#0B0F17` | fundo de todas as telas |
| `BACKGROUND_RAISED` / `SURFACE` / `SURFACE_STRONG` | `#121926` / `#182130` / `#223044` | camadas, cartões, barras vazias |
| `RULE` | `#2B3A52` | réguas, trilhos, bordas neutras |
| `INK` / `INK_SOFT` / `MUTED` | `#EEF2F8` / `#C7D0DE` / `#8C99AE` | texto principal, detalhe, metadados |
| `ACCENT` | `#F2B544` | o foco da tela: palavra falada, destaque, setas de causa |
| `PRIMARY` | `#5B9DFF` | lado/objeto primário (ex.: agente) |
| `SECONDARY` | `#3DD6B5` | lado/objeto secundário (ex.: skill) |
| `SUCCESS` / `WARNING` / `DANGER` | `#58D68D` / `#F2B544` / `#FF6B6B` | estados |

Cada `role` mapeia para preenchimento, borda, texto e cor do brilho (`palette()`).

## Tipografia

Fontes embutidas no binário (OFL-1.1, em `assets/fonts/`): **Inter** (Regular,
SemiBold, Bold) para interface e legendas e **Liberation Mono** para código. Por serem
embutidas, a medição e a quebra de linha são idênticas em qualquer máquina; o
manifesto de render registra o SHA-256 de cada fonte.

| Papel | Vertical 1080×1920 | Horizontal 1920×1080 | X 1280×720 |
|---|---|---|---|
| título | 82 | 86 | 62 |
| cabeçalho da cena | 58 | 56 | 42 |
| corpo | 42 | 38 | 29 |
| rótulo | 38 | 34 | 26 |
| pequeno | 30 | 27 | 21 |
| legenda | 54 | 46 | 36 |
| código | 34 | 32 | 24 |
| número | 190 | 210 | 150 |

Entrelinha 1,22. Hierarquia fixa: cabeçalho da cena em Bold, rótulos em SemiBold,
detalhes em Regular com `INK_SOFT`. Texto encolhe até um mínimo por componente e, se
ainda não couber, **o QA reprova** — nunca há reticências.

## Áreas seguras e layout por formato

Cada formato tem geometria própria (`Canvas::for_format`); nenhum é recorte de outro.

| | Conteúdo | Legendas | Motivo |
|---|---|---|---|
| Vertical | x 72–1008, y 230–1270 | x 72–892, y 1330–1560 | barra de status no topo, botões à direita entre ~55 % e ~85 % da altura, faixa de descrição e áudio no rodapé |
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
  linhas, caixa semitransparente, palavra falada em `ACCENT`, palavras de ênfase em
  `ACCENT` permanente;
- ícones vetoriais próprios em grade 24 px, traço 2 (`icons.rs`).

## Movimento

| Movimento | Duração padrão | Easing | Quando |
|---|---|---|---|
| `reveal` | 0,55 s | ease-out | objeto entra quando é mencionado |
| `pop` | 0,55 s | back | nós de fluxo e arquitetura |
| `draw` | 0,45 s | ease-out | aresta depois que as duas pontas existem |
| `highlight` | 1,2 s | ease-out | anel de brilho enquanto o objeto é discutido |
| `grow` / `count` | ≥ 0,8 s | ease-out | barras crescem e números contam |
| `type` | 0,04 s por caractere | linear | linhas de código |
| `move_to` | 0,9 s | ease-in-out | uma cópia viaja até o destino; o original fica a 30 % |
| `breathe` | ±3 px, 4 s | senoidal | deriva vertical suave entre eventos |

Transições entre cenas (0,42 s): `push` (padrão a partir da segunda cena), `fade`,
`zoom`, `cut`. Irmãos que entram no mesmo cue são escalonados em 0,16 s.

Justificativa: movimento só quando a narração traz algo novo (um objeto, uma relação,
um valor) ou para manter o quadro vivo; nunca zoom decorativo, nunca animação aleatória.

## Câmera e variedade

Cada cena tem um movimento lento de câmera que cobre a duração inteira, em ciclo para que
duas cenas seguidas nunca repitam: aproximar 2,5%, deslizar para a esquerda, afastar
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
