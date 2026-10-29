# Benchmark: "Skills vs. Agentes de IA"

Prova de qualidade do motor motion contra o pipeline anterior, com o mesmo roteiro
autoral (`examples/skills-vs-agentes.roteiro.json`, 7 cenas, 3 fontes citadas) e a
mesma voz (Kokoro PT-BR `pf_dora`). Executado em 29/10/2026 num contêiner Linux com 4
vCPUs, FFmpeg 6.1.1, build `--release`. Os MP4 não são versionados (`.gitignore`); os
artefatos de evidência estão em `docs/benchmarks/skills-vs-agentes/`.

## Comandos

```bash
# motor motion (A: vertical, B: horizontal, versão X)
framechester produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format vertical   --workdir artifacts/bench/vertical
framechester produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format horizontal --workdir artifacts/bench/horizontal
framechester produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format x          --workdir artifacts/bench/x
# pipeline anterior: um PNG por cena (framechester visuals) + loop da imagem + legendas estimadas
framechester visuals --input artifacts/bench/legacy-assets/plan.json --output artifacts/bench/legacy-assets/visuals
framechester run --engine legacy --script … --topic … --assets artifacts/bench/legacy-assets/assets.json --format short --max-scenes 7 --burn-subtitles --workdir artifacts/bench/legacy
```

## Entregas

| Item | Onde |
|---|---|
| A. Vídeo vertical 1080×1920 | `artifacts/bench/vertical/render/final.mp4` (64,3 s; a faixa pedida era 45–75 s) |
| B. Versão horizontal 1920×1080 com composição própria | `artifacts/bench/horizontal/render/final.mp4` |
| Versão X 1280×720 | `artifacts/bench/x/render/final.mp4` |
| C. Storyboard estruturado | `docs/benchmarks/skills-vs-agentes/storyboard-vertical.json` (schema `docs/schemas/storyboard.schema.json`) |
| D. Legendas SRT por palavra | `docs/benchmarks/skills-vs-agentes/captions-vertical.srt` |
| E. Contact sheets | `docs/benchmarks/skills-vs-agentes/contact-sheet-{vertical,horizontal,x}.png` |
| F. Relatórios de QA | `docs/benchmarks/skills-vs-agentes/qa-{vertical,horizontal,x}.json` |
| G. Comparação objetiva | esta página; manifestos em `render-manifest-*.json` |

## O que o vídeo mostra

| Cena | Conceito pedido | Composição | Como aparece |
|---|---|---|---|
| 1 | gancho | `title` | pergunta grande, régua acento que se desenha |
| 2 | **a decisão do agente** | `flow_diagram` em loop | Objetivo → Decidir → Agir → Observar → volta; cada nó entra e acende quando é dito |
| 3 | **a estrutura de uma skill** | `annotation` | árvore `revisar-pr/` com `SKILL.md`, `scripts`, `recursos` e notas laterais |
| 4 | estrutura, por dentro | `code` | `SKILL.md` digitado linha a linha (frontmatter + passos) |
| 5 | **a utilização da skill pelo agente** | `cause_effect` | Tarefa chega → lê nomes e descrições → combina → carrega a skill inteira → segue as instruções |
| 6 | **a diferença prática** | `comparison` | Agente (decide, executa, observa) × Skill (empacota, versiona, reutiliza) |
| 7 | fechamento | `infographic` | três cartões; a última fala retoma o gancho |

Nenhum conceito depende só de um parágrafo na tela: os quatro conceitos centrais têm
um diagrama próprio, e as legendas por palavra permitem acompanhar sem áudio.

## Comparação objetiva (vertical, mesmo roteiro e voz)

| Métrica | Pipeline anterior | Motor motion | Como foi medido |
|---|---|---|---|
| Visual por cena | 1 PNG parado por cena (7 imagens) | 7 composições animadas; **288 mudanças visuais**, maior intervalo parado **1,1 s** | `qa_report.json` → `scenes[].visual_changes`, `longest_still_secs` |
| Congelamentos ≥ 2 s (`freezedetect n=0.0005`) | **13** (um por cena e mais) | **0** | FFmpeg sobre `final.mp4` |
| Congelamentos ≥ 5 s | 0 (o QA antigo reclassificava o freeze como "esperado") | 0 | idem |
| Diretivas do roteiro honradas | 2 de 7 (`#pergunta`, `#comparacao`); `#fluxo`, `#anotacao`, `#codigo`, `#causa`, `#infografico` caíram no layout padrão (título + parágrafo da narração) | 7 de 7 | `visuals-report.json` × `storyboard.json` |
| Legendas | 25 blocos, tempo distribuído por contagem de caracteres | 42 blocos, palavra falada destacada, blocos sem sobreposição | `publish/final.srt` × `render/captions.srt` |
| Loudness integrada | **−26,9 LUFS**, pico −7,4 dBFS (sem normalização) | **−14,5 LUFS**, true peak −1,5 dBTP, sem clipping (`astats` flat factor 0) | `ebur128`, `astats` |
| Duração | 56,1 s (áudio por cena + 0 pausa) | 64,3 s (frases + pausas semânticas de 0,28 s e 0,45 s) | `ffprobe` |
| Layout por formato | vertical = horizontal em pé (mesmas regras) | três geometrias com áreas seguras próprias | `format.rs`, contact sheets |
| QA | 10 checagens de arquivo; freeze "contextualizado" como pass | 25 checagens, inclusive overflow, interseção, áreas seguras, movimento semântico, loudness, true peak, silêncio, clipping, sincronia de legendas e consistência roteiro↔cena; falha crítica bloqueia | `qa_report.json` |
| Tamanho do MP4 | 1,9 MB (quadros parados comprimem bem) | 7,4 MB | `ls` |
| Tempo de produção | ~15 s (TTS por cena + loop de imagem) | ~80 s (TTS por frase 17 segmentos ≈ 35 s; frames 34 s; loudness 5 s; mux 2 s) | `render_manifest.json → timings`, `time` |

Frames do pipeline anterior (cenas 3 e 6) e do motor motion estão lado a lado em
`docs/benchmarks/skills-vs-agentes/legacy-frames.png` e nos contact sheets.

## Resultados por formato (motor motion)

| Formato | Frames | QA | Loudness / TP | Rasterização | Pico de memória |
|---|---|---|---|---|---|
| vertical 1080×1920 | 1930 @ 30 fps | pass (25/25) | −14,5 LUFS / −1,5 dBTP | 33,8 s (57 fps) | 84 MB |
| horizontal 1920×1080 | 1930 | pass (25/25) | −14,5 / −1,5 | 30,8 s | 86 MB |
| X 1280×720 | 1930 | pass (25/25) | −14,5 / −1,5 | 18,4 s | 59 MB |

A primeira versão X reprovou em `layout_text_overflow` (cinco passos em colunas de
180 px); a correção faz a cadeia serpentear em duas linhas quando os cartões ficariam
mais estreitos que nove ems. É exatamente o que o gate deve fazer: bloquear em vez de
cortar texto com reticências.

## O que isto não prova

- Não houve teste com espectadores nem medição de retenção; a qualidade perceptual foi
  conferida por contact sheets e quadros extraídos.
- O timing por palavra é estimado dentro de cada frase (a duração da frase é real);
  `segments[].aligned = false` no storyboard registra isso.
- Os alvos de loudness (−14 LUFS / −1,5 dBTP) são configuração inicial, não
  normalização igual à das plataformas.
- As fontes citadas foram registradas como referência documental; a revisão editorial
  humana (`cross_checked`) continua sendo a aprovação.
