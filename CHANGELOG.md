# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/); before 1.0, minor versions may break
compatibility and say so here.

## [Unreleased]

### Changed
- Dependencies: `toml` 1.1, `sha2` 0.11, Tailwind CSS 4.3.3, and the GitHub Actions majors (`checkout` v7, `setup-python` v7, `docker/setup-buildx-action` v4, `docker/login-action` v4, `docker/build-push-action` v7). `@types/node` stays on the Node 22 line the Studio runs on, and Dependabot no longer proposes its majors.

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

### Changed
- The operator's declaration **Conferi e cruzei as fontes e as alegações** is the editorial approval: the engine receives it (`cross_checked`) and passes the human-review and claims checks. Editorial QA fails only on machine-provable defects (a claim marked contradicted, a reference outside the script's sources, an unsafe URL, duplicated narration, prompt injection, missing asset rights, a Short over 180 s). One source is enough; missing sources, an off-target duration or the freeze detector on still-image scenes are noted for the operator, not treated as defects.
- A job with nothing pending ends as **Concluído** with the video approved; a job with pending checks names them on its card. Publishing stays manual.
- `npm start` and `npm run dev` reinstall dependencies when the lockfile changed and rebuild the Rust engine and the interface, so the Studio never runs against a stale engine; a stale engine is reported with the command that fixes it.
- Studio sources are formatted with Prettier (`npm run check`); `web/src/main.ts`, `web/server/app.ts` and the CLI `main.rs` were split into pages/editors, a route table and one module per command.

### Security
- Studio bound to loopback with authentication, CSRF and local vault; telemetry off; `dry_run` default; publishing disabled on every network; media integrity checked before production; subprocesses invoked without a shell.

[Unreleased]: https://github.com/prod455/framechester/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/prod455/framechester/releases/tag/v0.1.0
