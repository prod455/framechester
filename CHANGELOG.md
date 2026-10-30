# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/); before 1.0, minor versions may break
compatibility and say so here.

## [Unreleased]

### Added
- **Motion engine** (`crates/framechester-motion`): animated explanatory videos rendered from a semantic storyboard instead of one still image per scene. Eleven reusable components (title, flow diagram with loop, comparison, timeline, chart/counters, software architecture, code demonstration, transformation, annotated tree, infographic, cause and effect) with keyframes, easing and cues tied to narration words; dynamic captions with the spoken word highlighted; per-format layout for vertical 1080×1920, horizontal 1920×1080 and X 1280×720 with social-UI safe areas; push/fade/zoom transitions; bundled OFL fonts (Inter, Liberation Mono) for reproducible typography.
- **Semantic storyboard** (`framechester_core::storyboard`, `docs/schemas/storyboard.schema.json`, `docs/STORYBOARD.md`): renderer-independent plan validated in Rust (unknown fields rejected, numbers and emphasis words must be spoken), a deterministic planner from script directives (`#fluxo`, `#grafico`, `#arquitetura`, `#codigo`, `#transformacao`, `#anotacao`, `#infografico`, `#causa`, plus the existing ones) and narration segmentation by sentence with real audio timing.
- **Soundtrack**: narration synthesized per sentence (Kokoro batch mode, cache by text and voice), semantic pauses, procedural transition sounds, optional licensed music with ducking, two-pass `loudnorm` to configurable targets (`[audio]`, default −14 LUFS / −1.5 dBTP) and a true-peak limiter.
- **Extended QA** (`qa_report.json`): text overflow without ellipsis, text intersections, safe areas, semantic motion per scene, long stills, black frames, freezes, loudness, true peak, silence, clipping, codec/fps/resolution/duration, caption sync and storyboard–narration consistency; contact sheet; `render_manifest.json` with versions, hashes, loudness measurements, phase timings and peak memory; structured `render.log.jsonl`.
- CLI: `plan`, `produce` and `run --engine motion` (legacy stays the default; `[motion] enabled = true` switches it). Benchmark "Skills vs. Agentes de IA" in `examples/` and `docs/BENCHMARK_SKILLS_VS_AGENTES.md`; decisions and trade-offs in `docs/MOTOR_MOTION.md`; visual direction in `docs/DESIGN_SYSTEM_VIDEO.md`.

### Changed
- The still-image catalog and the Studio accept the motion directives as the default layout, so a script written for the motion engine still renders on the legacy path.
- `TtsEngine::synthesize_batch` lets engines load their model once per batch; Kokoro implements it.
- The Studio queue renders with the motion engine (`run --engine motion`); a job that binds an operator's own file falls back to the legacy path for the whole video. The job card names the engine. `engine:build` compiles `--release` and the Studio runs `target/release`.
- `produce --preview-only` stamps PRÉVIA · REVISÃO PENDENTE on every frame and writes no package; `produce` applies the legacy editorial gate (operator declaration, contradictions, unsafe sources) before narrating.
- A visual brief asking for a recording no longer blocks the final version: every scene gets the explanatory composition (renderer `framechester-editorial-v3`), an own file stays optional per scene, and the script assistant is told not to ask for recordings. `requires_capture`, `PreparedVisuals.pending` and the adapt-script shortcut are removed.

## [0.1.0] - 2026-10-29

First release: a complete local production path, from topic to a video approved for manual upload. Automatic publishing stays disabled.

### Added
- **Rust engine** (`framechester-core`, `framechester-adapters`, `framechester-cli`): domain and stage state machine, config validation, SSRF and prompt-injection guards, editorial scoring, integer-cent finance simulation, and the CLI commands `doctor`, `config-check`, `trends`, `run`, `qa`, `report`, `visuals`, `backup-check`, `backup`, `restore`, `finance` and `analytics`.
- **Local Studio** (`web/`): Vite frontend and loopback Node server with local password, CSRF protection and a per-installation vault; channels, niche research, scripts, storytelling, media import, production queue, results dashboard and read-only connections to YouTube, TikTok, Instagram and Facebook.
- **Produzir com IA**: one brief produces a script (Ollama, Claude or OpenAI, with cost authorization for paid providers), looks up peer-reviewed sources (DOI, via Crossref's public API), builds explanatory visuals, narrates, subtitles, renders and runs QA. The script editor has the same **Buscar fontes** button.
- **Visual catalog**: scene layouts declared on the first line of `visualBrief` (`#pergunta`, `#numero`, `#lista`, `#comparacao`, `#linha-do-tempo`, `#citacao`) rendered in one dark editorial theme (`framechester-editorial-v2`), parsed in Rust and mirrored in the Studio with a shared fixture; numbers and quotes on screen must be spoken in the narration. A malformed directive becomes a free note and the default layout, never an error.
- **Video styles**: explicador, mistério, ranking, linha do tempo and comparativo, with Short/long pacing rules, selectable in the assistant and in automatic production.
- **Narration**: Kokoro-82M PT-BR voices (Dora, Alex, Santa) with pinned model and voice hashes; `npm run voices:setup` installs the runtime.
- **QA and package**: technical QA (duration, resolution, fps, codecs, decode, black and frozen frames, audio level, optional whisper ASR coverage), editorial QA, SRT captions, optional burned-in subtitles, thumbnail, description, metadata and sources/license markdown, plus an offline `report.html`.
- **Operations**: restic snapshot/restore with a local-only guard, Docker image and Compose profile with hardened runtime checks, Python verifiers for Anthropic, YouTube OAuth and backup.
- **Open-source project files**: issue and pull request templates, `CODEOWNERS`, Dependabot for Cargo, npm, GitHub Actions and Docker, a weekly `cargo audit`/`npm audit` workflow, `.editorconfig`, `.gitattributes`, `SUPPORT.md`, a security policy with private reporting, a Contributor Covenant code of conduct, governance and contribution guides, and package metadata for the crates and the Studio.
- **Release workflow**: a `vX.Y.Z` tag builds the CLI for Linux, Windows and macOS, publishes `ghcr.io/prod455/framechester` and creates the GitHub Release with this changelog section as notes.
- Documentation: visual guide (`docs/GUIA_VISUAL.md`), Studio guide, social connections guide, Docker guide, architecture and operational plan.
- **Gerar versão final** on the card of a preview and in its review dialog: one dialog records the operator's declaration on the script and starts the final version with the preview's visuals. It names what would stop it (a contradiction, a foreign reference, a scene that needs a real recording) with the way out.

### Changed
- The operator's declaration **Conferi e cruzei as fontes e as alegações** is the editorial approval: the engine receives it (`cross_checked`) and passes the human-review and claims checks. Editorial QA fails only on machine-provable defects (a claim marked contradicted, a reference outside the script's sources, an unsafe URL, duplicated narration, prompt injection, missing asset rights, a Short over 180 s). One source is enough; missing sources, an off-target duration or the freeze detector on still-image scenes are noted for the operator, not treated as defects.
- A job with nothing pending ends as **Concluído** with the video approved; a job with pending checks names them on its card. Publishing stays manual.
- `npm start` and `npm run dev` reinstall dependencies when the lockfile changed and rebuild the Rust engine and the interface, so the Studio never runs against a stale engine; a stale engine is reported with the command that fixes it.
- Studio sources are formatted with Prettier (`npm run check`); `web/src/main.ts`, `web/server/app.ts` and the CLI `main.rs` were split into pages/editors, a route table and one module per command.
- A script without sources reaches the final version; the QA report and the job card ask for a source before publishing. The manual preparation dialog says exactly which requirement keeps its final button disabled.
- Dependencies: `toml` 1.1, `sha2` 0.11, Tailwind CSS 4.3.3, and the GitHub Actions majors (`checkout` v7, `setup-python` v7, `docker/setup-buildx-action` v4, `docker/login-action` v4, `docker/build-push-action` v7, `docker/metadata-action` v6, `upload-artifact` v7 with `download-artifact` v8, `softprops/action-gh-release` v3). Dependabot now opens one grouped pull request per ecosystem, and CI runs once per pull request (pushes only on `main`). `@types/node` stays on the Node 22 line the Studio runs on, and Dependabot no longer proposes its majors.

### Fixed
- The final version of an AI-produced script was always refused by the engine before rendering: its pre-render gate required at least one source and every claim checked with a URL, which "Produzir com IA" never produces (claims arrive to check, and Crossref rarely finds an article for a Portuguese title). The gate now refuses only what QA fails (contradictions, references outside the sources, unsafe sources, prompt injection) plus the missing operator declaration; missing sources and claims to check are named in the QA report.
- A blocked job now says why on its card, with the engine's reasons, instead of "O motor bloqueou a entrega".

### Security
- Studio bound to loopback with authentication, CSRF and local vault; telemetry off; `dry_run` default; publishing disabled on every network; media integrity checked before production; subprocesses invoked without a shell.

[Unreleased]: https://github.com/prod455/framechester/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/prod455/framechester/releases/tag/v0.1.0
