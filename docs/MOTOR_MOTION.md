# Motor motion: arquitetura, decisões e limites

Data: 29/10/2026. Esta nota registra por que o Framechester gerava apresentações
estáticas, o que mudou, as alternativas avaliadas e o que ainda não está resolvido.

## Diagnóstico (auditoria)

| Camada | Antes | Consequência |
|---|---|---|
| Roteiro | `Scene { heading, narration, visual_brief, duration_hint }`; `visual_brief` era texto livre com, no máximo, uma diretiva de layout estático | o modelo não tinha como descrever objetos, relações ou eventos |
| Visuais | `editorial_visuals.rs` gerava **um PNG por cena** (resvg) a partir de 7 layouts | a cena inteira era uma imagem parada |
| Render | `ffmpeg.rs` fazia `-loop 1` da imagem pela duração do áudio e concatenava | vídeo = slides narrados; o QA chegava a reclassificar o `freezedetect` como esperado |
| Timing | duração por cena vinda do WAV inteiro; legendas distribuídas por peso de caracteres | nenhuma sincronia entre fala e imagem; nada por palavra |
| Áudio | AAC direto da narração; sem mixagem, loudness ou limitação | níveis variáveis entre renders |
| Formatos | mesmo layout com largura/altura trocadas | vertical era o horizontal em pé |
| QA | black/freeze/volume do arquivo inteiro | nada media overflow, zonas seguras, sincronia ou loudness |

## O que foi construído

```text
roteiro (diretivas) ─► planner ─► Storyboard (schema) ─► narrate (TTS por frase, timing real)
      ─► compose (componentes por formato, cues → keyframes, legendas por palavra)
      ─► raster (SVG por frame → resvg → RGBA → FFmpeg) ─► audio (SFX, música, loudnorm 2×)
      ─► mux ─► contact sheet + manifesto ─► qa (JSON; falhas críticas bloqueiam)
```

- `framechester-core::storyboard`, `narration`, `planner`: schema tipado e validado,
  segmentação por frase, planejamento de cues sem coordenadas.
- `framechester-motion` (novo crate): tokens, formatos e áreas seguras, keyframes e
  easing, scene graph com SVG por instante, tipografia com fontes embutidas, 11
  componentes, legendas karaokê, rasterização paralela, soundtrack, QA, logs e manifesto.
- CLI: `plan`, `produce`, `run --engine motion`. O pipeline antigo (`run`, padrão
  `--engine legacy`) continua intacto; `[motion] enabled = true` troca o padrão.
- Diretivas novas são aceitas pelo catálogo antigo e pelo Studio como `destaque`, então
  um roteiro escrito para o motor motion ainda renderiza no caminho legado.

## ADR-0002: motor de animação próprio em Rust (resvg) em vez de Motion Canvas ou Manim

**Status:** aceita. **Decisão:** implementar o motor de animação como crate Rust sobre
`resvg`/`tiny-skia`, com o storyboard como contrato independente de renderizador.

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Rust + resvg (escolhida)** | zero dependências novas (resvg já estava no projeto); roda no CI, no Docker e no Windows do operador sem navegador; determinístico (fontes embutidas, seeds fixos); 46 fps de rasterização em 1080×1920 com 4 núcleos | sem editor visual; efeitos complexos (partículas, 3D) ficam fora; texto por frame custa shaping | base de produção |
| Motion Canvas (TypeScript) | editor e timeline; ecossistema web | exige Chromium/Playwright para renderizar quadros, Node no caminho crítico, cenas em código TS geradas por modelo (superfície de injeção), reprodutibilidade dependente de versão do navegador | **não agora**; o storyboard permite um adaptador futuro (`compose` recebe o mesmo JSON) |
| Manim (Python) | excelente para matemática | runtime Python + LaTeX + Cairo pesado; estética de quadro-negro distante do canal; renderização lenta | reservado para cenas matemáticas quando houver demanda; não entra como dependência obrigatória |

O storyboard é a fronteira: qualquer motor que leia `docs/schemas/storyboard.schema.json`
pode substituir ou complementar o `compose` atual sem tocar no planner, na narração ou
no QA.

## Trade-offs registrados

- **Timing por palavra é estimado.** A duração de cada frase é real (um WAV por frase e
  silêncios medidos), mas dentro da frase as palavras são distribuídas por peso. Para
  legendas e cues isso fica dentro de ~150 ms em frases curtas; para precisão de
  alinhador forçado, preencha `segments[].words` com `aligned = true`.
- **SVG por frame.** Simples e sem estado; custa shaping de texto a cada quadro. Em
  release, 1800 quadros 1080×1920 levam ~35 s em 4 núcleos; em `debug` é 5–8× mais
  lento — rode `cargo run --release` para produção.
- **Áudio.** Kokoro não dá timestamps; a mixagem usa FFmpeg (`loudnorm` em duas
  passagens, `alimiter`, `sidechaincompress`). Música só entra se o operador apontar um
  arquivo licenciado; o efeito de transição é sintetizado localmente.
- **Planner determinístico.** O modelo (ou a pessoa) escreve diretivas; o planner casa
  rótulos com a narração por radical. Rótulos sem palavra correspondente são
  distribuídos pelas frases — bom o bastante para explicações, mas um modelo pode
  entregar o storyboard completo com cues explícitos quando quiser controle total.
- **Transições e `breathe`.** Movimento contínuo evita o `freezedetect`, mas o QA
  semântico (`semantic_motion`, `long_still`) é o que mede explicação, não o detector
  de pixels.

## Limitações conhecidas

- Sem alinhador forçado, sem ASR no caminho motion (o `--asr` do pipeline legado
  continua disponível).
- Sem imagens ou vídeos externos nas composições: o motor é vetorial e original por
  decisão; `resources[]` registra necessidades externas e o QA bloqueia se faltarem.
- O Studio web ainda produz pelo caminho legado; aceita as diretivas novas, mas não
  chama `produce` (próxima fatia: opção de motor na fila de produção).
- `preview-only` não existe no motor motion.
- Qualidade perceptual foi conferida por contact sheets e quadros extraídos, não por
  teste com espectadores; os alvos de loudness exigem validação auditiva por plataforma.

## Reprodutibilidade e custos

- Sem APIs pagas: TTS Kokoro local, FFmpeg local, fontes OFL embutidas.
- `render_manifest.json`: versão do motor e do FFmpeg, SHA-256 do storyboard, das fontes
  e do MP4, medições de loudness das duas passagens, tempos por fase e pico de memória.
- `render.log.jsonl`: eventos estruturados por fase.
- Cache de narração por `sha256(motor, voz, texto)` em `artifacts/cache/tts/`; o render
  é determinístico a partir do storyboard narrado.
- Medições do benchmark em `docs/BENCHMARK_SKILLS_VS_AGENTES.md`.
