# Espec: competir com o HyperFrames

Decisão do operador (2026-11-04): fechar os dois gaps que separam o Framechester do
HyperFrames (HeyGen, Apache 2.0, HTML/CSS/GSAP → MP4, distribuído como skill de agente),
sem abrir mão do diferencial — QA que reprova antes de publicar.

## O prompt

> Você é um agente de vídeo. Recebe um tema e entrega um MP4 aprovado pelo QA do
> Framechester, sem um humano no meio. Quando nenhum dos 13 layouts prontos expressa a
> ideia, você desenha a cena livre (`freeform`): cartões, círculos, textos, ícones e setas
> posicionados em porcentagem da área de conteúdo, cada um entrando na palavra narrada
> que o nomeia. Você nunca escreve pixel, SVG, HTML ou frame: o motor adapta a cena a
> vertical, horizontal e X, mede cada texto com as fontes embutidas e reprova o que não
> cabe, sai da área segura ou se sobrepõe. Você roda `plan`, lê o preflight e o
> `qa_report.json`, corrige e repete até passar. Nunca publica: o upload fica privado.

## Onde cada lado ganha (antes desta espec)

| | HyperFrames | Framechester |
|---|---|---|
| Liberdade visual | qualquer HTML/CSS | 13 layouts fixos → **gap** |
| Porta de entrada para agentes | `npx skills add heygen-com/hyperframes` | só skills internas → **gap** |
| Pipeline | só render | pauta → roteiro → TTS → render → QA → pacote |
| Sincronia com narração | tempo manual | animação na palavra falada |
| QA de layout | não | overflow, área segura, sobreposição |
| Multi-formato | um HTML por proporção | um storyboard, três formatos |

## Fatia 1 — cena `freeform`

- `Composition::Freeform { elements }`, até `MAX_OBJECTS` (24) elementos.
- Elemento: `id` + `shape` com `kind` ∈ `card | circle | text | icon | arrow`.
  - `area {x, y, w, h}` em % (0–100) da área de conteúdo do formato; `arrow` usa
    `from {x, y}` e `to {x, y}`.
  - `text` opcional em `card`/`circle` (≤ 60 caracteres) e obrigatório em `text`
    (≤ 120); `size` ∈ `title | heading | body | label | small` (padrão `body`);
    `role` da paleta; `icon` do catálogo fechado.
- Texto encaixado com `Ctx::fitted` (mesmo piso de legibilidade dos outros layouts):
  overflow, área segura e sobreposição passam pelo QA existente sem código novo de QA.
- Sem animação escrita, o planner revela os elementos na ordem, cada um na palavra
  narrada que corresponde ao seu texto (ou espalhado pelos segmentos), com destaque e
  `breathe` — igual aos outros layouts.
- Fronteira de segurança: só formas fechadas do motor; sem SVG/HTML, arquivo, URL ou
  script vindo do storyboard.

Aceite: storyboard `freeform` compõe nos três formatos sem issues; texto grande demais
reprova com `text_overflow`; textos sobrepostos reprovam com `text_intersection`; área
fora de 0–100 ou id duplicado é rejeitada por `validate`; schema JSON atualizado.

## Fatia 2 — skill pública `framechester-video`

- `skills/framechester-video/SKILL.md`, portátil (Claude Code, Codex, Cursor), em
  inglês (o público de agentes é internacional), instalável a partir do repositório.
- Conteúdo: quando usar layout pronto × `freeform`; limites que o validador cobra;
  ciclo `plan` → `produce` (preflight) → `qa` → corrigir; regras fixas (dry-run,
  upload privado, nada publicado com QA reprovado, nada de fato inventado).
- Exemplo verificável: `examples/freeform.storyboard.json` passa no `validate` e no
  preflight em vertical, horizontal e X (teste automatizado).

## Fora do escopo

Imagens/vídeos externos na cena livre (exigem proveniência e licença, ver
`anti-injection-and-provenance`), editor visual no Studio, publicação.
