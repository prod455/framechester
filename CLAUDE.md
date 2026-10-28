# CLAUDE.md — Framechester (Claude Code)

## Project
Framechester V4: open-source, self-hosted, single-operator media production engine (YouTube faceless, tech/IA/ciencia).

Current operator decision (2026-10-27): multiple channels under one local operator. For engineering/marketing work, read `docs/EQUIPES_E_SKILLS.md` and load relevant local `.agents/skills/*/SKILL.md`; prioritize working code and verifiable artifacts.

The local Studio uses TypeScript/Vite and Node.js; Rust remains the production engine. For web operation/configuration read `docs/WEB_STUDIO.md`; for social connections and API capabilities read `docs/REDES_SOCIAIS_WEB.md`; for video visuals, scene layouts and script styles read `docs/GUIA_VISUAL.md`.

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
- Demo pipeline: `cargo run -p framechester-cli -- run --workdir artifacts/demo-short`
- QA video: `cargo run -p framechester-cli -- qa --format short --video artifacts/demo-short/render/final.mp4`
- Simular custos: `python scripts/calculadora_monetizacao.py --storage-gb 50 --provider b2`
- FFmpeg: `ffmpeg -version`, `ffmpeg -encoders`, `ffmpeg -hwaccels`
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
- Keep the Studio bound to loopback, preserve authentication/CSRF and channel identity, and keep credentials in the local vault rather than frontend/config JSON. Web publication remains disabled.

## Testing
- Tests must be added with implementation (TDD) when slices start.

---


