# Auditoria de Motion — Framechester

> Escopo: somente leitura. Nenhum arquivo foi editado e nenhum teste foi
> executado nas auditorias de origem (audit-1 a audit-4).
> Toda afirmacao abaixo vem de corpo de codigo/teste/configuracao
> inspecionado nessas auditorias, com `arquivo:linha` quando disponivel.
> Afirmacoes de ausencia (ex.: rotacao, blur) vem de busca regex em
> `framechester-motion/src` + storyboard/planner com 0 hits relevantes
> (audit-2) e sao marcadas como tal.
> Restricoes do projeto aplicadas a todas as decisoes: render de
> producao deterministico e offline, sem IA generativa/APIs pagas,
> sem SaaS/telemetria, sem assets sem licenca, sem copiar codigo de
> concorrente sem licenca verificada, preservar funcionalidades e
> contratos existentes.

## 1. Arquitetura real resumida

### 1.1 Crates e dependencias (audit-1)

DAG limpo e sem ciclos, confirmado por `cargo metadata`/`cargo tree`:

| Crate | Depende de | Papel verificado |
|---|---|---|
| `framechester-core` | — (sem deps internas) | Dominio, config, storyboard, planner, pipeline, ports |
| `framechester-adapters` | `core` | FFmpeg, TTS (Piper/Kokoro), Anthropic, backup |
| `framechester-motion` | `core` | Scene graph SVG, compose, raster (resvg), render, QA, audio |
| `framechester-cli` | `core`+`adapters`+`motion` | 14 subcomandos (`plan`/`produce`/`run`/`qa`/...) |

- Evidencia: `crates/framechester-core/Cargo.toml:15-19`,
  `crates/framechester-adapters/Cargo.toml:16`,
  `crates/framechester-motion/Cargo.toml:16`,
  `crates/framechester-cli/Cargo.toml:20-22`.
- Ports hexagonais: traits `TrendSource/Llm/Tts/Asset/Renderer/QaGate/
  Publisher/Metrics/Backup` em `crates/framechester-core/src/ports.rs:77-169`,
  consumidos via `Box<dyn>` em `crates/framechester-core/src/pipeline.rs:14-24`.

### 1.2 Dois caminhos de orquestracao (audit-1)

- Pipeline canonico: `crates/framechester-core/src/pipeline.rs:96-407`
  (editorial -> LLM -> facts -> assets -> TTS -> render -> QA ->
  package -> publish -> metrics).
- Caminho motion: `crates/framechester-cli/src/commands/produce.rs:223-467`
  reimplementa editorial/package/QA e termina em
  `Stage::EditorialQa`/`Blocked` (`produce.rs:420-427`), sem
  publish/metrics. `run --engine motion` delega para `produce`
  (`crates/framechester-cli/src/commands/run.rs:76-110`).

### 1.3 Motor de motion (audit-2, audit-4)

- Timeline seekable e deterministica, sem relogio/playhead mutavel:
  `Track::eval(t)` puro com hold antes/depois
  (`crates/framechester-motion/src/anim.rs:82-106`);
  `Graph::svg(t)` instantaneo (`scene.rs:368-378`);
  `compose::frame_svg(composed, t)` seleciona cena/local/transicao
  por `t` absoluto (`compose.rs:744-822`); render chama
  `frame_svg(index/fps)` (`render.rs:202-207`) e o raster renderiza
  SVG -> resvg sem estado (`raster.rs:26-33`).
- Keyframes: `Keyframe{t, value, easing-por-key-destino}` + `Track`
  ordenada, replace em `t` igual, `to()` a partir de `eval(start)`
  (`anim.rs:34-80`). `Props` expoe 9 tracks: `opacity, dx, dy, scale,
  sx, sy, draw, glow, typed` (`scene.rs:55-71`).
- Easings fechados (6): `Linear, EaseOut (cubic-out), EaseIn,
  EaseInOut, Back (c1=1.70158), Spring (2^-10t*sin, tipo
  easeOutElastic simplificado)` — `anim.rs:5-32`,
  `storyboard.rs:101-112`, testes em `anim.rs:122-136`.
- Presets: 12 `Motion` (`Reveal, Draw, Pop, Highlight, Pulse, Focus,
  Count, Grow, MoveTo, Type, Hide, Breathe` —
  `storyboard.rs:115-142`) aplicados centralmente em
  `apply_animation` (`compose.rs:257-435`); helpers `Props`
  (`scene.rs:674-741`).
- Componentes (13 `Composition`): `Title, Flow, Comparison, Timeline,
  Chart, Architecture, Code, Transformation, Annotation,
  Infographic, CauseEffect, Steps, Character`
  (`storyboard.rs:285-358` -> `build_component` em
  `compose.rs:127-189`). Todos retornam `Vec<Node>`; a animacao e
  aplicada centralmente.
- Transicoes de cena: `Cut/Fade/Push/Zoom` (`storyboard.rs:541-551`),
  `TRANSITION_SECS=0.42` fixo, `EaseInOut` (`compose.rs:50-51,760-813`).
- Tipografia: `Typesetter` com fontes embutidas Inter/Liberation +
  cache (`text.rs:43-115`), wrap greedy sem truncar (`117-149`), fit
  descendo 2px ate minimo, `None` -> issue de QA (`151-180`).
- Render: `compose -> frames (resvg) -> silent video -> mix -> mux
  FFmpeg -> SRT -> contact sheet -> RenderManifest` com
  `storyboard_sha256`/`fonts sha256`/`video_sha256`
  (`render.rs:299-324`). SFX deterministico com LCG de seed fixa
  (`audio.rs:201-215`).
- Formatos: vertical `1080x1920`, horizontal `1920x1080`,
  X `1280x720` (`format.rs` `Canvas::for_format`;
  `storyboard.rs:24-31`).

### 1.4 Determinismo (audit-3)

- Conteudo nao usa relogio real: `render.rs:193`
  `frames=ceil(duration*fps)`, `render.rs:202-205` `t=index/fps`,
  `compose.rs:744` `frame_svg(t)` puro. `Instant` so mede fases em
  `log.rs:40,67-75` e nao entra no frame.
- Ordem preservada apesar do paralelismo: `raster.rs:136-158`
  (collect por chunk/indice).
- Reproducao indicada: renderizar 2x o mesmo storyboard e comparar
  `video_sha256` do manifest (`render.rs:324`). Nao executado nas
  auditorias (ver Secao 6).

## 2. Achados reproduziveis (arquivo:linha e severidade)

Severidade: **P0** regressao/correcao sem rede de seguranca;
**P1** custo, robustez ou divergencia de comportamento;
**P2** qualidade de saida, rastreabilidade ou completude.

### 2.1 Arquitetura e contratos (audit-1)

| # | Sev. | Achado | Evidencia |
|---|---|---|---|
| A1 | P1 | Duplicacao de orquestracao: `Pipeline` canonico bypassado pelo caminho motion; divergencia de semantica/QA entre engines e manutencao dupla | `pipeline.rs:96-407` vs `produce.rs:223-467`; fim sem publish/metrics em `produce.rs:420-427`; delegacao em `run.rs:76-110` |
| A2 | P1 | Resolucao duplicada e inconsistente: `produce` ignora `render_profile_for` e usa `VideoFormat::dimensions()`, montando `RenderProfile` manualmente. Reproduzivel: `render.width/height` customizados no TOML afetam `run` legacy e nao o `produce`/motion | `config.rs:340-350`; `storyboard.rs:24-31`; `produce.rs:321,379-387`. Defaults duplicados: `config.rs:140-154` vs `domain.rs:241-253` (`1920x1080/30/libx264/crf20/160k`) |
| A3 | P1 | FFmpeg/ffprobe/sha256 duplicados por fronteira acyclica; `sha256_file` da motion le o arquivo inteiro (`fs::read`) — pico de memoria em videos grandes; `Command::new` espalhado sem modulo compartilhado de processo/probe | adapters `ffmpeg.rs:577-590` vs motion `qa.rs:646-667` (`framechester_adapters_free_probe`); adapters `ffmpeg.rs:562-575` (streaming) vs motion `render.rs:71-77` (inteiro); `Command::new` em motion `audio.rs:266-267`, `raster.rs:78`, `render.rs:80/125/253` e adapters `ffmpeg.rs:44`, `kokoro.rs:47`, `backup.rs:90`, `piper.rs:49/183` |
| A4 | P2 | Modulos grandes e API publica total: 17 `pub mod`, campos `pub` sem encapsulamento; maiores arquivos `planner.rs` 1588, adapters `ffmpeg.rs` 1558, `storyboard.rs` 1290, motion `compose.rs` 1231, `pipeline.rs` 950 linhas. `publish=false` mitiga crates.io, nao o acoplamento interno | `crates/framechester-core/src/lib.rs:1-19`; `domain.rs:80-409`; `Cargo.toml:20-21` |
| A5 | P2 | `resvg` fora de `workspace.dependencies`: `resvg =0.49.0` duplicado em motion e adapters (segundo rasterizador em `editorial_visuals.rs` alem de `motion/raster.rs`); upgrade/drift exige 2 edicoes | `Cargo.toml:23-32` centraliza serde/toml/clap/reqwest; `crates/framechester-motion/Cargo.toml:20`; `crates/framechester-adapters/Cargo.toml:21`; `editorial_visuals.rs:5,501-556`; lock hoje unico: resvg/usvg `0.49.0`, tiny-skia `0.12.0` |
| A6 | P2 | Crates nao autocontidas (acoplamento ao layout do repo): build fora da arvore do workspace ou `cargo package` quebra; `publish=false` esconde, nao resolve | adapters `kokoro.rs:9` `include_str! ../../../scripts/kokoro_tts.py`; motion `text.rs:12-17` `include_bytes! ../../../assets/fonts/*`; adapters `scene_layout.rs:217` e `authored_script.rs:449-450` incluem tests/examples da raiz |
| A7 | P2 | Determinismo/ambiente vazando para o core: wall-clock no dominio; `Default` nao puro le ambiente e caminho absoluto Windows. Mesmo TOML/default gera comportamento distinto por SO/ambiente | `domain.rs:5-10` (`now_unix`, usado em `run.rs:133-137` com pid); `config.rs:156-186` (`FRAMECHESTER_CONTAINER`, `/.dockerenv`, `cfg!(windows)`); `config.rs:218-227` (`C:/whisper/models/ggml-base.bin`) |
| A8 | P2 | Superficie CLI inconsistente: `ProduceArgs.format` e `String` livre resolvida so em runtime, enquanto `Run`/`Short` usam `ValueEnum` tipado; struct reutilizada com campos ignorados conforme o comando. Erros de formato so aparecem apos load_config/select_channel | `cli.rs:30-130` (14 subcomandos); `cli.rs:211-215` vs `cli.rs:304-317`; `cli.rs:194-239`; `produce.rs:125-132`; `run.rs:93-109` |
| A9 | P2 | Contratos com drift parcial possivel: teste de schema cobre apenas `Composition::KINDS`, `Motion`, contagem de icones (22) e `VideoFormat`; `deny_unknown_fields` ausente em `Config` (campos TOML com erro de grafia ignorados silenciosamente) ao contrario de `Storyboard` | `storyboard.schema.json:5`; `storyboard.rs:1237-1289`; schema `scenes maxItems 64` (`schema:16-21`) vs `storyboard.rs:603-628`; `config.rs:7-20`; `storyboard.rs:553-554` |
| A10 | P2 | Caminho morto com custo: `reqwest blocking` arrasta `tokio 1.54.1` transitivo (lock) para `AnthropicLlm::generate`, cujo `preflight` sempre erra | adapters `anthropic.rs:77-86,245` |
| A11 | P1 | Licencas declaradas mas nao auditadas pacote a pacote: `Cargo.lock` com 217 pacotes sem campo `license`; nenhum `deny.toml`; CI so roda `cargo audit` (vulnerabilidade) + `npm audit`. FFmpeg GPL por libx264 e Piper/faber com autorizacao comercial nao resolvida (bloqueado em runtime, modelo ainda referenciado) | `Cargo.toml:10-14`; `LICENSE:2`; `THIRD_PARTY_NOTICES.md:5-6,11,15,21,23-29`; workflows `audit.yml`/`ci.yml`; fontes OFL-1.1 em `text.rs:12-17`; resvg/usvg MIT OR Apache-2.0 e tiny-skia BSD-3 declarados em `THIRD_PARTY_NOTICES.md:33-42` (metadado, nao verificacao de bytes) |

### 2.2 Expressividade do motor (audit-2)

Existe hoje: keyframes com hold implicito, 6 easings, translacao
`dx/dy`, escala uniforme e nao-uniforme com origin por no
(`scene.rs:430-449`), opacidade com cull `<=0.002` (`418-421`),
`draw` stroke-dasharray (`597-620`), `glow` (`504-542`), sombra de
cartao em 2 camadas sem blur (`479-501`), camera global
`PushIn/PullOut/DriftLeft/DriftRight` (`scene.rs:211-251`;
`compose.rs:686-691`), multicamada flat `Vec<Node>` + `z i32`
(`scene.rs:101,383-384`), kinetic typography parcial (por palavra
nas captions `captions.rs:151-310`; typewriter por caractere so em
`Code` `scene.rs:634-649`), tokens minimos (`tokens.rs:6-105`),
canvas por formato (`format.rs:66-168`).

| # | Sev. | Falta (busca com 0 hits relevantes, salvo indicacao) |
|---|---|---|
| M1 | P1 | Rotacao, skew: nenhum campo `rotate/angle` em `Props`/`Shape`; SVG `transform` so emite translate+scale (`scene.rs:435-449`) |
| M2 | P2 | Blur/filter (so mencionado como evitado em `scene.rs:476`), mascara/`clipPath` (unico "clip" e audio clipping em `qa.rs`), cor animavel (`fill`/`stroke` sao `String` estatica em `scene.rs:17-52`) |
| M3 | P2 | `cubic-bezier(x1,y1,x2,y2)` parametrizavel, `steps()`, spring parametrizavel (stiffness/damping/mass), easing por segmento alem do easing da key destino (`anim.rs:5-32`); sem tipo `Hold`/`Step` explicito |
| M4 | P2 | Subcomposicao aninhada: sem `Node::Group`/`Graph` dentro de `Graph`, sem pre-comp nem parent transform hierarquico (`scene.rs:94-98`); `VisualObject.parent` (`storyboard.rs:251-255`) e dado de layout, nao hierarquia de transform |
| M5 | P2 | Kinetic type generico: sem split chars/words com stagger/easing proprio em titulos, sem `letter-spacing`/tracking (0 hits), sem leading animavel, sem text on path |
| M6 | P2 | Delay/repeat/yoyo/loop por track (loops de `blink/talk/arm` sao artesanais via keys repetidas, `character.rs:864-920`); stagger generico limitado a `STAGGER 0.16` entre irmaos (`compose.rs:209-247`) |
| M7 | P2 | Transicoes fixas: duracao `0.42s`/`EaseInOut` nao configuravel por cena; sem wipe/mask transition nem morph entre objetos compartilhados |
| M8 | P2 | Tokens incompletos: sem token de easing/motion por tema, sem temas multiplos, sem tokens por canal (unica theme dark editorial, `tokens.rs:1-3`); duracoes de token pouco usadas (literais em `planner.rs:929-981` e `compose.rs`) |

Sintese da audit-2: o motor e "scene graph SVG seekable + tracks
escalares", nao um motor de motion geral. Tudo no caminho motion
lido e offline/deterministico: fontes embutidas com SHA no manifest
(`text.rs:19-38`; `render.rs:310-313`), sem rede/IA.

### 2.3 Performance, sync e robustez (audit-3)

Bom (preservar): frame-accuracy deterministica (Secao 1.4);
timing de palavra por janelas RMS de 10ms (`audio.rs:62`, abaixo do
frame de 33ms a 30fps); narracao montada por amostras
(`narrate.rs:96-108`, `mix_at` com round em `audio.rs:48`).

| # | Sev. | Achado | Evidencia / reproducao |
|---|---|---|---|
| R1 | P1 | Todo frame re-parseia o SVG completo e aloca `Pixmap` novo, sem cache de fundo/camadas estaticas; lote inteiro em memoria antes de escrever: 1080x1920 RGBA = 8,3MB/frame, 8 workers => 16 pixmaps ~132MB + copias; barreira por lote (frame lento de transicao renderiza 2 grafos); `thread::scope` respawna threads a cada lote | `raster.rs:26-33` (`usvg::Tree::from_str`+`Pixmap::new` por frame); `raster.rs:129,136-175`; `compose.rs:765-812`. Reproduzir: `cargo run --release -p framechester-motion --example bench_raster -- out.mp4` (1080x1920, 150f, `bench_raster.rs:38-57`) observando fps/memoria. Nao executado nesta auditoria |
| R2 | P1 | Sem previa em baixa resolucao: `preview_only` so adiciona watermark em resolucao cheia — custo de rascunho = custo final. Unico material reduzido e o `contact_sheet` 480px pos-render | `produce.rs:342`; `render.rs:208-210` (`stamp_preview`); `render.rs:122-141`; sem escala/fps reduzido em `EncodeProfile` (`raster.rs:49-57`) |
| R3 | P1 | Sem timeout/cancelamento: nenhum `signal`/`AtomicBool`/cancel nos crates (busca sem hits); filhos FFmpeg via `wait`/`output` sem limite — FFmpeg/TTS travado trava o `produce` indefinidamente e mata-lo pode deixar filho orfao | `raster.rs:179`; `audio.rs:266-284`; motion `qa.rs:80-84` |
| R4 | P1 | QA motion roda 6 decodificacoes completas sequenciais do video + 1 processo FFmpeg por cena no `contact_sheet`; QA em 2 trilhas: `commands/qa.rs` usa `FfmpegQa` legacy de adapters, gate diferente do audit motion de `produce` | motion `qa.rs:447,471,502,528,579,600` (decode, blackdetect, freezedetect, ebur128, silencedetect, astats); `render.rs:122-141`; `commands/qa.rs:23-24`; `produce.rs:362-375` |
| R5 | P2 | Tolerancias de sync frouxas e mascaramento: mux com `-shortest` + `-use_editlist 0` corta divergencia; QA aceita duracao +-0,6s e fps +-0,6; captions fora ate +0,05s; soundtrack so estica (nao trunca) se a voz excede a duracao; sem trilhas de timestamp explicitas (rawvideo `-r fps` constante) | `render.rs:225-228,258-281`; motion `qa.rs:411,444,336`; restante do timing distribuido por silabas (`produce.rs:417`); `raster.rs:84-93` |
| R6 | P2 | FFmpeg sem perfil explicito: rawvideo rgba->yuv420p sem tags de cor (sem bt709/range); sem GOP/keyint/`-threads`; `-preset`/`-crf` passados cegos a qualquer codec (nvenc/amf mapeados, mas `-crf` nao e CQ de encoder HW — risco de erro/qualidade errada); faststart aplicado 2x (reescrita inutil no silencioso, sera stream-copy); intermediarios nunca limpos (`video_silent.mp4`, `voice_with_sfx.wav`, `mix.wav` PCM 48k estereo) | defaults `config.rs:140-153` (libx264/CRF20/veryfast/30fps); `raster.rs:78-109,106-107`; `produce.rs:615-622`; `render.rs:194,222,237,250,278-279` |
| R7 | P2 | Memoria/sequencial: PCM inteiro em memoria; `narrate` le cada WAV 2x e mistura cena a cena sequencial; loudnorm em 2 passagens completas; paralelismo so na rasterizacao (clamp 1..8); compose/narrate/loudness/mux/QA/thumbnail sequenciais; sem GPU (resvg/tiny-skia CPU, sem hwaccel); `write_all` nao-bufferizado frame a frame; `peak_memory_mb` Linux-only => manifest sempre `None` no Windows, plataforma alvo do operador | `audio.rs:17-20,113-196,338-380`; `narrate.rs:64,84-109`; `raster.rs:32,121-128,162`; `produce.rs:344,353-360`; `log.rs:23-28`; `render.rs:323` |
| R8 | P2 | Manifest nao reproduz o encode: guarda storyboard/fonts sha256 e `ffmpeg_version`, mas nao registra codec/CRF/preset/threads (so fps) — `video_sha256` nao e reproduzivel so pelo manifest | `render.rs:299-324`; `EncodeProfile` em `raster.rs:49-57` ausente do manifest |

### 2.4 Testes, exemplos e licencas (audit-4)

Contagens estaticas de corpos inspecionados (nenhum teste executado):
~239 testes Rust inline/integracao (core 119, adapters 65, motion
40, cli 15; unico `tests/` de integracao Rust e
`crates/framechester-cli/tests/cli.rs:11`); Python `tests/` 7
arquivos, 64 `def test_`; web `web/tests/` 46 arquivos, ~280
`test/it`. CI (`.github/workflows/ci.yml`): `cargo fmt --check` +
`clippy -D warnings` + `cargo test --workspace`, python unittest,
web npm ci/build/test (ubuntu+windows).

| # | Sev. | Achado | Evidencia |
|---|---|---|---|
| T1 | P0 | Zero golden/snapshot visual (busca `insta\|golden\|assert_snapshot\|proptest` so retornou `snapshot_id` de backup); zero proptest/quickcheck; sem teste E2E de render completo deterministico (hash de MP4) no CI | `cli.rs` testa plan/produce bloqueado e visuals PNG 1920px, nao `produce->final.mp4` feliz |
| T2 | P0 | 12/13 componentes sem teste unitario direto: so `character.rs:4` tem `#[test]` proprio; demais cobertos indiretamente por `compose.rs:10`/`scene.rs:5` e pelo exemplo manual `preview_components.rs` (sem assert automatizado, so println de issues); `render.rs:0` testes | `crates/framechester-motion/src/components/` (13 arquivos) |
| T3 | P2 | Exemplos incompletos: 9 `examples/*.json`; `skills-vs-agentes.roteiro.json` cobre 7/13 diretivas; faltam roteiros completos de `#arquitetura,#transformacao,#passos,#personagem,#grafico`; sem `storyboard.json` golden esperado para regressao do planner; `storyboard-vertical.json` na raiz solto, nao referenciado em teste | `docs/STORYBOARD.md:164-168` aponta so roteiro->plan |
| T4 | — | Docs conferem com o codigo: 13 `Composition`, 12 `Motion`, 6 `Easing`, cues word/segment/fraction/time/end, `deny_unknown_fields`, numero exibido deve ser falado; tokens/safe areas/QA documentados | `docs/STORYBOARD.md`; `docs/DESIGN_SYSTEM_VIDEO.md`; `docs/schemas/storyboard.schema.json` (ressalva A9) |
| T5 | — | Assets limpos: `assets/` so fontes Inter + Liberation Mono com `LICENSE-OFL-1.1.txt`; sem midia de terceiros no repo; 22 icones proprios em `icons.rs` | `LICENSE` Apache-2.0; `THIRD_PARTY_NOTICES.md` (ressalvas A11) |

## 3. Framechester x HyperFrames (capacidades verificadas)

Fontes HyperFrames (audit-4, inspecionadas):
`https://raw.githubusercontent.com/heygen-com/hyperframes/main/README.md`
e `/LICENSE` (Apache-2.0, badge + LICENSE conferidos).
Nenhum codigo do HyperFrames foi copiado. Claims alem de
README+LICENSE (docs detalhadas de API) nao foram verificados —
ver Secao 6. Sem promessa de equivalencia: sao stacks diferentes
(HTML/Chrome vs SVG/resvg) e a comparacao e de capacidades, nao de
paridade.

| Capacidade | Framechester (verificado) | HyperFrames (README/LICENCE) |
|---|---|---|
| Modelo de cena | Storyboard validado -> scene graph SVG, `Graph::svg(t)` (`scene.rs:368-378`) | HTML+CSS com `data-composition-id/data-start/data-duration/data-track-index` |
| Animacao | 12 `Motion` x 6 `Easing` + `Track`s escalares (9 props); seekable puro `t=index/fps` | GSAP timeline paused (`window.__timelines[id]`) + adapters CSS/Lottie/Three.js/Anime.js/WAAPI/custom, seekable |
| Render | resvg/tiny-skia CPU + FFmpeg; offline, sem Chrome/Node no render | Headless Chrome (seek por frame) + FFmpeg; requer Node>=22 + FFmpeg |
| Determinismo | `frame_svg(t)` puro, LCG seed fixa, fontes embutidas com SHA no manifest | README afirma "same input same video" |
| Catalogo | 13 composicoes + 22 icones fechados, sem registry/`add` | ~450 blocos via `npx hyperframes add` (transitions/overlays/charts/maps/3D) |
| Preview | Web Studio proprio + `preview_components` PNG estatico; sem scrub/seek da timeline no motor Rust | Preview browser live-reload, Studio/player embedavel, `frame.md` |
| Golden tests | Nenhum golden/snapshot de frame nem hash E2E (T1) | Golden baselines da producer via Git LFS (~240MB mp4) |
| Escala | Local single-operator (decisao `AGENTS.md`) | AWS Lambda distributed render + CLI `init/preview/render/lint` |
| Midia rica | Sem clip de video/imagem externa como objeto de cena; `resources[]` apenas declarativo com license | Compoe `<video>`/`<audio>`/imagens arbitrarias por track |
| Licenca | Apache-2.0 proprio; assets OFL-1.1 | Apache-2.0 |

Gaps priorizados (audit-4):

- **P0 Regressao visual** — adicionar render curto fixture (ex.:
  `skills-vs-agentes` cena 1) com SHA-256 de PNGs em `t` fixos via
  `compose->svg->resvg` (deterministico, sem FFmpeg/TTS) + 1 teste
  E2E `produce->final.mp4` ignorado/local com manifest hash.
  Custo baixo, maior valor.
- **P0 Cobertura de componentes** — testes de layout/QA issues por
  componente (overflow/safe-area) reusando o harness de
  `preview_components.rs` convertido em teste com asserts.
- **P1 Expressividade** — gap aceitavel dado determinismo
  offline/sem JS; registrar como limite. Avaliar `Track` de rotacao
  e cue com offset negativo antes de qualquer runtime JS.
- **P1 Ecossistema/blocos** — nao copiar blocos do HyperFrames
  (Apache permite com NOTICE, mas a restricao do projeto veda copia
  sem verificacao — manter autoral); mitigado pelas diretivas `#`
  do planner. Documentar as 13 composicoes como "catalogo" em
  `DESIGN_SYSTEM_VIDEO`.
- **P1 Preview interativo** — gap parcial: o Web Studio cobre a
  operacao; falta preview seekable da timeline do storyboard.
- **P2 Render distribuido** — NAO e gap acionavel: local
  single-operator por decisao (`AGENTS.md`). Fora de escopo
  deliberado.
- **P2 Midia rica** — coerente com "sem assets sem licenca", mas
  limita explainer com captura real; `visuals` (`cli.rs`) ja gera
  PNG explicativo para brief `[CAPTURA PENDENTE]`.
- **P2 Exemplos** — completar `examples/` com as 13 diretivas +
  `storyboard.json` golden gerado por `framechester plan`.

Vantagens do Framechester a preservar: semantica validada (numero
falado, claims, `deny_unknown_fields`), timing por palavra da
narracao, QA audiovisual bloqueante (loudness -14 LUFS, hook,
still), fontes embutidas com hash no manifest, offline sem
Chrome/Node no render (resvg puro). O exemplo oficial do
HyperFrames exige headless Chrome + CDN GSAP
(`cdn.jsdelivr.net`), o que violaria o determinismo offline se
copiado.

## 4. Decisoes tecnicas Fase 2-4

Criterio unico: cada candidato e avaliado contra a stack existente
(SVG + resvg + FFmpeg), licenca verificavel, custo operacional
local/single-operator e as restricoes da Secao 1 (offline
deterministico, sem IA/APIs pagas, sem SaaS/telemetria).

### 4.1 Implementar (sobre a stack atual)

| Decisao | Fase | Por que / ancora |
|---|---|---|
| Golden de frames PNG (SHA-256 em `t` fixos) + E2E `produce->final.mp4` local/ignorado | 2 | Fecha T1 sem FFmpeg/TTS no golden; maior valor/custo |
| Testes unitarios dos 12 componentes sem teste (overflow/safe-area) | 2 | Fecha T2 reusando `preview_components.rs` |
| Fonte unica de resolucao: remover `VideoFormat::dimensions` do caminho de render ou faze-lo derivar de `RenderProfile` | 2 | Fecha A2 (divergencia TOML reproduzivel) |
| `resvg` em `workspace.dependencies` | 2 | Fecha A5; 1 linha de causa, drift zero hoje |
| `cargo-deny` com licenses no CI + `deny.toml` | 2 | Fecha A11 no que e automatizavel; FFmpeg GPL e Piper/faber seguem bloqueados ate verificacao (nao redistribuir) |
| Previa low-res real (escala/fps reduzidos em `EncodeProfile`) | 3 | Fecha R2; rascunho barato sem mudar o render final |
| Cache de arvore SVG/fundo + reuso de `Pixmap` no raster | 3 | Fecha R1; medir com `bench_raster.rs:38-57` antes/depois |
| Timeout/cancelamento de processos filhos (FFmpeg/TTS) | 3 | Fecha R3; sem orfaos |
| Manifest com encode profile completo (codec/CRF/preset/threads/fps) + tags de cor bt709 + faststart unico | 3 | Fecha R8/R6; reproduzibilidade pelo manifest |
| `Track` de rotacao + cue com offset negativo (avaliar) | 4 | Unico gap de expressividade com valor editorial claro (M1); continua escalar/deterministico |
| Preview seekable da timeline do storyboard (reusar `frame_svg(t)`) | 4 | Fecha o gap P1 de preview sem browser no render; `t` ja e puro |
| Catalogo documentado das 13 composicoes + exemplos das 13 diretivas + golden do planner | 4 | Fecha T3 e o gap P1 de ecossistema sem registry novo |

### 4.2 Nao introduzir

| Candidato | Decisao | Motivo (evidencia) |
|---|---|---|
| GSAP / runtime JS (CDN ou embutido) | Nao | Exige JS seekable + rede/CDN no caminho de render; viola offline deterministico. O motor ja e seekable puro (`anim.rs:82-106`, `render.rs:202-207`) |
| Remotion / Motion Canvas (Node/React) | Nao no motor | Adiciona Node + ecossistema JS ao render que hoje e Rust puro (resvg sem Chrome/Node); custo operacional sem ganho de determinismo. Remotion tambem e source-available, nao livre: o caminho de anuncio (`anuncio/`, 2026-11-07) usa React + motor de quadros proprio + Playwright/Chromium + FFmpeg, sem tocar o motor |
| WebGL / shaders / GPU no render | Nao (reavaliar so com medicao) | Render atual e CPU (`raster.rs:32`, sem hwaccel); sem evidencia de que GPU seja o gargalo — R1 aponta re-parse/alocacao. Introduzir antes de medir troca determinismo por complexidade |
| Lottie/Three.js/WAAPI arbitrario | Nao | Superficie de animacao arbitraria nao validavel pelo `Storyboard` (`deny_unknown_fields`, numero falado); quebra a semantica validada que e vantagem preservada |
| Copiar blocos/codigo do HyperFrames | Nao | Licenca Apache-2.0 permite com NOTICE, mas a restricao do projeto veda copia sem verificacao de licenca; manter composicoes autorais |
| Render distribuido (Lambda) / SaaS / telemetria | Nao | Fora de escopo deliberado: single-operator local (`AGENTS.md`) |
| Clip de video/imagem externa como objeto de cena | Nao nesta fase | Conflita com "sem assets sem licenca"; `resources[]` declarativo com license e o limite atual |
| IA generativa / APIs pagas no render | Nao | Restricao do projeto; caminho motion auditado nao usa rede/IA e deve continuar assim |

## 5. Plano incremental priorizado

Ordem por severidade e dependencia. Cada passo preserva
funcionalidades e contratos existentes; escritores sempre
sequenciais (um agente por vez).

### Fase 2 — rede de seguranca e fonte unica (P0/P1 baratos)

1. **T1/T2 (P0):** golden PNG SHA-256 (fixture curta, `t` fixos,
   `compose->svg->resvg`) + teste E2E `produce->final.mp4`
   ignorado/local com manifest hash; testes dos 12 componentes.
   Gate: `cargo test -p framechester-motion` (e crate tocado).
2. **A2 (P1):** fonte unica de resolucao (derivar de
   `RenderProfile`); teste de regressao TOML customizado ->
   `produce`.
3. **A1 (P1):** unificar `produce` sobre `Pipeline` ou extrair
   servico motion compartilhado (prioridade 1 da audit-1).
4. **A3 (P1):** mover probe/process/sha para `core::probe` ou crate
   infra compartilhada; `sha256` em streaming na motion.
5. **A5:** `resvg` para `workspace.dependencies`.
6. **A11 (P1):** `cargo-deny` com licenses no CI (`deny.toml`);
   manter FFmpeg GPL e Piper/faber fora de distribuicao ate
   verificacao.

### Fase 3 — custo e robustez do render (P1)

7. **R2:** previa low-res (escala/fps em `EncodeProfile`).
8. **R1:** cache de SVG/fundo e reuso de `Pixmap`; benchmark com
   `bench_raster` antes/depois (fps e memoria observados).
9. **R3:** timeout/cancelamento de filhos FFmpeg/TTS.
10. **R4:** consolidar as 2 trilhas de QA em um gate unico;
    reduzir as 6 decodificacoes sequenciais.
11. **R6/R8:** encode profile no manifest, tags bt709, faststart
    unico, `-crf` vs CQ por encoder, limpeza de intermediarios.

### Fase 4 — expressividade contida e preview (P1/P2)

12. **M1:** avaliar e, se aprovado, `Track` de rotacao + cue com
    offset negativo (sem runtime JS).
13. Preview seekable da timeline reusando `frame_svg(t)` puro.
14. **T3:** exemplos das 13 diretivas + golden do planner;
    catalogo das 13 composicoes em `DESIGN_SYSTEM_VIDEO`.
15. **A4/A6/A7/A8/A9 (P2, oportunista):** encapsulamento gradual,
    crates autocontidas, defaults puros sem ambiente, `format`
    tipado na CLI, `deny_unknown_fields` em `Config` e cobertura
    de schema — sempre com teste do crate tocado.

Fora do plano (deliberado): render distribuido, midia externa como
objeto de cena, qualquer runtime JS/WebGL (Secao 4.2).

## 6. Lacunas de evidencia (nao verificadas)

- Licencas efetivas dos 217 pacotes do `Cargo.lock` nao verificadas
  pacote a pacote (lock nao traz `license`; sem cargo-deny/about no
  escopo) — `THIRD_PARTY_NOTICES.md:15,21` confirma a pendencia.
- Configuracao/GPL do binario FFmpeg efetivamente distribuido nao
  inspecionada (binario externo, `THIRD_PARTY_NOTICES.md:5-6`).
- Nenhum `cargo test`/`clippy` executado nas auditorias de origem;
  gargalos sao estaticos/reproduziveis por inspecao e pelo
  experimento de configuracao descrito (A2), nao por falha de
  teste observada. Contagens de testes sao contagens de
  `#[test]`/`def test_`/`test()`, nao execucao verde.
- Arquivos varridos por busca de ausencia, nao detalhados
  linha-a-linha (audit-2): `audio.rs`, `narrate.rs`, `qa.rs`,
  `log.rs`, `icons.rs` e demais `components/*.rs` alem dos citados
  — layout estatico `Vec<Node>` (`components/mod.rs:4-16`) ou
  audio/QA fora do nucleo de motion.
- `framechester-adapters/src/ffmpeg.rs` (`FfmpegQa`/`FfmpegRenderer`
  legacy de `commands/qa.rs`/`run.rs`) nao inspecionado na audit-3;
  comparacao fina entre os dois gates de QA pendente (R4 parcial).
- `synthesize_batch` do KokoroTts (adapters) nao inspecionado:
  paralelismo/timeout interno do TTS desconhecido; em `narrate.rs`
  e uma unica chamada bloqueante (`narrate.rs:79-81`).
- Determinismo bit-a-bit do libx264 multithread e fallback de
  fontes do `Typesetter` nao verificados executando (auditoria
  estatica); teste de reproducao indicado na Secao 1.4.
- Docs de API detalhada do HyperFrames alem de README+LICENSE
  publicos nao inspecionados (claims de blocos/GSAP/Lambda vem do
  README oficial citado na Secao 3).
- `storyboard-vertical.json` na raiz nao rastreado ate
  consumidor/teste.

## Metodo (auditorias de origem)

- audit-1: leitura integral de `Cargo.toml` dos 4 crates, `lib.rs`,
  config/domain/ports/pipeline, `cli.rs`/`main.rs`/commands
  run+produce, storyboard/planner (trechos), motion render/qa/text,
  adapters ffmpeg/anthropic, `framechester.toml`,
  `storyboard.schema.json`, `LICENSE`/`THIRD_PARTY_NOTICES`,
  workflows; `cargo metadata`/`tree` executados.
- audit-2: inspecao do nucleo de motion + busca regex de ausencia
  (`rotate/blur/mask/clip/cubic-bezier/tracking/parent`) em
  `framechester-motion/src` + storyboard/planner.
- audit-3: inspecao de render/raster/audio/qa/log e da cadeia de
  encode/mux/manifest.
- audit-4: contagem de corpos de teste, exemplos, docs, assets e
  README+LICENSE publicos do HyperFrames.
- Todas somente leitura, sem edicoes e sem testes executados.
