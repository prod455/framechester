---
name: framechester-video
description: Turn a topic or script into a narrated, animated explainer video (YouTube, Shorts/Reels, X) with the local Framechester engine, and iterate until its QA approves. Use when asked to make, render, fix or check an explainer video, a Short, or a storyboard for Framechester.
---

# Framechester video

Framechester renders explainer videos from a **semantic storyboard**: you say what each
scene means and when things appear (by the narrated word); the engine owns layout, type,
colour, motion, captions, voice (local Kokoro TTS) and QA. You never write pixels, SVG,
HTML or frame numbers.

## Rules that never bend

- Nothing is published. Output stays local; uploads, if any, are private and need the
  operator. Do not pass flags or edit config to change that.
- A video whose QA fails is not done. Fix the input and render again.
- Never invent facts or numbers. Every number shown on screen must be spoken in the
  narration of the same scene (the validator enforces it).
- Text is never truncated: if it does not fit, shorten it or give it more room.

## Pick the input

| You have | Write | Reference |
|---|---|---|
| A script in prose | a `roteiro` JSON with one `#directive` per scene | `docs/STORYBOARD.md`, "Diretivas de roteiro" |
| A visual idea no layout covers | a storyboard JSON with `freeform` scenes | `docs/STORYBOARD.md`, "Cena livre" |

Prefer a ready layout (`flow_diagram`, `comparison`, `timeline`, `chart`,
`architecture`, `code`, `transformation`, `annotation`, `infographic`, `cause_effect`,
`steps`, `character`, `title`): it is tuned for every format. Use `freeform` only when
the idea needs its own arrangement (a diagram of the Sun and the Earth, a map of parts).
A storyboard may mix both. Schema: `docs/schemas/storyboard.schema.json`; working
example: `examples/freeform.storyboard.json`.

## Limits the validator enforces

- Labels and card/circle texts ≤ 60 characters; details and `freeform` texts ≤ 120;
  comparison column titles ≤ 40; up to 24 objects or elements per scene.
- `freeform` areas are percent of the content area: `x + w ≤ 100`, `y + h ≤ 100`.
  Leave gaps between texts: overlapping text fails QA.
- Animation targets must exist; word cues must be words of that scene's narration.
- Leave `animations` empty unless you need a specific effect: the planner cues each
  element on the word that names it.

## The loop

Run from the repository root. Use `--release` for anything that renders.

1. **Check in seconds** (no TTS, no render). Exit code 2 means a layout problem, printed
   on stderr as `layout cena N: …`:

   ```bash
   cargo run -p framechester-cli -- plan --storyboard my.storyboard.json --format vertical --output artifacts/plan.json
   # or, from a script:
   cargo run -p framechester-cli -- plan --script my.roteiro.json --topic my.topico.json --format vertical --output artifacts/plan.json
   ```

   Check every format you will ship (`vertical`, `horizontal`, `x`): a text that fits
   the tall frame can overflow the short one.
2. **Fix** what it names: shorten the text, enlarge its `area`, use a smaller `size`, or
   switch to a layout with more room. Repeat step 1 until it exits 0 in every format.
3. **Render**:

   ```bash
   cargo run --release -p framechester-cli -- produce --storyboard my.storyboard.json --format vertical --workdir artifacts/my-video
   ```

   It repeats the layout check before the TTS and stops early if anything changed.
4. **Read the verdict** in `artifacts/my-video/qa_report.json`: `blocking` lists what
   failed. `contact_sheet` shows one frame per scene; look at it. Exit code 0 means
   technical QA passed; editorial review stays with the operator.
5. A Short from a finished video: `short --from artifacts/my-video/storyboard.json --part 1`.

## When something fails

| Message | Fix |
|---|---|
| `text_overflow` / `nao cabe` | shorter text, larger area, smaller `size` |
| `text_intersection` | move one element; texts must not share space |
| `outside_safe_area` | keep `freeform` areas inside 0–100; avoid the very edges |
| `o numero … precisa ser dito na narracao` | say the number in that scene's narration |
| `animacao aponta para objeto inexistente` | target an existing `id` |
| `long_still` / `semantic_motion` | more elements or cues spread across the narration |
| `doctor` reports a missing tool | `cargo run -p framechester-cli -- doctor` and follow it |
