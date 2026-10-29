# Changelog

## Unreleased — sources and review policy
- One documented source is enough to produce. A script without sources, or with claims not yet verified, is held for the operator's review instead of being marked as failed; only machine-provable defects fail editorial QA (contradicted claims, references outside the inventory, unsafe URLs, duplicated narration, prompt injection, missing asset rights).
- "Produzir com IA" looks up peer-reviewed sources (DOI, via Crossref's public API) when the generated script has none; the script editor gains a "Buscar fontes" button that does the same from the title, hook and claims. Suggestions are labelled as such and still need to be read before publishing.

## Unreleased — video production fixes
- `npm start` and `npm run dev` now reinstall dependencies when the lockfile changed and rebuild the Rust engine; `npm start` also rebuilds the interface. A stale engine previously surfaced as "O motor retornou um plano visual inválido."
- A stale engine is now reported as such, with the command that fixes it.
- Editorial QA no longer blocks delivery when a video misses the target duration; it asks for review. Only a Short over YouTube's 180 s limit fails.
- AI-produced previews show a frame of their own video instead of requesting a thumbnail file that previews never have (404 on every list render).

## Unreleased — Studio refactor
- Formatted the Studio sources with Prettier; `npm run check` now verifies formatting.
- Split the 782-line `web/src/main.ts` into `studio/` (state, shell, toast, platforms), `pages/` (one file per page) and `editors/` (sources, claims, scenes, assistant button). Application state lives in one explicit `studio` object; pages render from it and never import each other in cycles.
- Added a shell boot test that logs in against a stubbed API and draws every page.
- Split the Rust CLI's 1,199-line `main.rs` into `cli.rs` (arguments and dispatch) and `commands/` (one module per subcommand); behavior, flags and output are unchanged.
- Replaced the 800-line request handler in `web/server/app.ts` with a route table (`server/routes/`) and request helpers (`server/http.ts`); duplicate routes fail at startup. The creative quote and draft routes now forward the `style` field the Studio sends.

## Unreleased — visual guide and video styles
- Added a closed catalog of scene layouts (`#pergunta`, `#numero`, `#lista`, `#comparacao`, `#linha-do-tempo`, `#citacao`) declared on the first line of `visualBrief`, parsed in Rust and mirrored in the Studio with a shared fixture.
- Explanatory visuals now use one dark editorial theme (`framechester-editorial-v2`); numbers shrink to fit instead of being truncated.
- Numbers and quotes on screen must be spoken in the scene narration, so they reach the claims review.
- Invalid directives are rejected when a script is saved, when the AI returns a draft, when visuals are prepared and before rendering, naming the scene as the Studio shows it; stored scripts keep loading.
- Every layout shrinks or truncates text to stay above the caption band; a test renders each layout with fields at their limits in both formats.
- Added five video styles (explicador, mistério, ranking, linha do tempo, comparativo) with Short/long pacing rules, selectable in the assistant and in automatic production for Ollama, Claude and OpenAI.
- Documented the visual identity, layouts, styles and the decision against a custom LLM in `docs/GUIA_VISUAL.md`.

## Unreleased — first executable vertical slice
- Added Rust workspace: `framechester-core`, `framechester-adapters`, `framechester-cli`.
- Added domain, stage state machine, adapter traits, config validation, SSRF/injection guards, editorial scoring, integer-cent finance simulator, QA gate and pipeline orchestration.
- Added offline adapters: fixture trends/evidence, template LLM, synthetic assets, Piper TTS, FFmpeg renderer/QA, dry-run publisher, null/file metrics and restic backup.
- Added optional Anthropic LLM adapter with explicit cost budget and no secret logging.
- Added CLI: `doctor`, `config-check`, `trends`, `run`, `qa`, `backup-check`, `backup`, `restore`, `finance`.
- Added publish package: SRT captions, thumbnail PNG, description, metadata JSON and sources/license markdown.
- Added gated restic snapshot/restore CLI with local-only guard and Windows timestamp warning handling.
- Added optional local whisper ASR QA (`--asr`) with word-coverage check, transcript artifact and explicit needs-human threshold.
- Added offline `report.html` dashboard (auto-written by `run`, regenerable via `report`) with QA, package links and warnings.
- Added optional burned-in PT-BR subtitles (`--burn-subtitles`) re-encoded with libass and marked in metadata.
- Verified end-to-end locally: 78.3 s short and 427.5 s long at 1080p30, technical QA pass, editorial QA needs human, dry-run publish receipt.
- Added Python verifiers for Anthropic, YouTube OAuth and restic backup, with 19 unit tests.
- Documented environment inventory, FFmpeg benchmarks, installed model licenses/hashes and local-only deployment decision (no VPS).
- Real publishing, licensed footage, scheduler, database, dashboard and queue remain unimplemented.

## Unreleased — planning v4
- Project named Framechester and positioned as an Apache-2.0, single-operator, open-source self-hosted engine.
- Extracted open-source/public/private boundary and adapter interfaces.
- Added public repository policy, privacy, contribution, security, governance and licenses inventory.
- Preserved existing monetization-only business scope and backup-only incremental cost model.
- Updated Codex/Claude prompt with release safety gates.




