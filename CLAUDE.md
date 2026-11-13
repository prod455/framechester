# CLAUDE.md — Framechester (Claude Code)

## Project
Framechester V4: open-source, self-hosted, single-operator media production engine (YouTube faceless, tech/IA/ciencia).

Current operator decision (2026-10-27): multiple channels under one local operator. For engineering/marketing work, read `docs/EQUIPES_E_SKILLS.md` and load relevant local `.agents/skills/*/SKILL.md`; prioritize working code and verifiable artifacts.

The local Studio uses TypeScript/Vite and Node.js; Rust remains the production engine. The motion engine (`crates/framechester-motion`, storyboard schema in `docs/STORYBOARD.md`, design system in `docs/DESIGN_SYSTEM_VIDEO.md`, decisions in `docs/MOTOR_MOTION.md`) renders every video from a semantic storyboard; `run` is the name the Studio calls for the same path. Operator decision 2026-11-13: new formats render with HyperFrames (`hyperframes/`, decision and usage in `docs/HYPERFRAMES.md`), starting with the sports statistics/history channel; the Rust motion engine keeps the existing narrated explainers until each is ported. For web operation/configuration read `docs/WEB_STUDIO.md`; for social connections and API capabilities read `docs/REDES_SOCIAIS_WEB.md`; for video visuals, scene layouts and script styles read `docs/GUIA_VISUAL.md`.

## Source of truth
- `docs/PLANO_OPERACIONAL_COMPLETO.md`
- `docs/OPEN_SOURCE_ARCHITECTURE.md`
- `docs/00-inventario-e-viabilidade.md`
- `docs/04-arquitetura-e-adr.md`

## Commands
- Build: `cargo build --workspace`
- Test: `cargo test --workspace`
- Lint: `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
- Python verifiers: `python -m unittest discover -s tests -v`
- Doctor: `cargo run -p framechester-cli -- doctor`
- Motion engine (animated storyboard; use `--release`, debug is 5-8x slower): `cargo run --release -p framechester-cli -- produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format vertical --workdir artifacts/motion-vertical`
- Plan only (no TTS/render): `cargo run -p framechester-cli -- plan --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format horizontal --output storyboard.json`
- QA video: `cargo run -p framechester-cli -- qa --format short --video artifacts/demo-short/render/final.mp4`
- FFmpeg: `ffmpeg -version`, `ffmpeg -encoders`, `ffmpeg -hwaccels`
- HyperFrames renderer: `npm --prefix hyperframes ci`, `npm --prefix hyperframes test`, `npm --prefix hyperframes run check`
- Confronto video (needs `cargo build --release -p framechester-cli` for QA): `npm --prefix hyperframes run fc -- confronto --dados examples/esporte/brasil-argentina.confronto.json --saida artifacts/bra-arg`
- Web install: `npm --prefix web ci`
- Web engine build: `npm --prefix web run engine:build`
- Web check/test/build: `npm --prefix web run check`, `npm --prefix web test`, `npm --prefix web run build`
- Web start: `npm --prefix web start` (http://127.0.0.1:4317)

## Rules
- No real credentials, tokens, PII, real media or private URLs in commits/CI/issues/releases.
- No real publishing, no real purchases, no real backup spend without explicit authorization.
- Telemetry off by default; secrets only via local secret manager.
- No publishing if QA fails; dry_run default true; publish opt-in per network.
- No fabricating facts, revenue, eligibility or verification.
- Affiliate links (operator decision 2026-11-08) live per channel (`[[channels.affiliates]]`, Studio channel form); the description lists only links whose terms the video says, under an affiliate disclosure at the top. Scripts stay editorial, never ad copy.
- Keep the Studio bound to loopback, preserve authentication/CSRF and channel identity, and keep credentials in the local vault rather than frontend/config JSON. Web publication remains disabled.

## Testing
- Tests must be added with implementation (TDD) when slices start.

Uploads from the Studio stay non-public (YouTube private, TikTok SELF_ONLY, Facebook Reel draft); the one exception, decided by the operator on 2026-10-31, is Instagram, whose API has no non-public mode: it publishes publicly only a QA-approved final version, by a confirmed click or the channel’s per-network opt-in.
---

