# CLAUDE.md — Framechester (Claude Code)

## Project
Framechester V4: open-source, self-hosted, single-operator media production engine (YouTube faceless, tech/IA/ciencia).

## Source of truth
- `docs/PLANO_OPERACIONAL_COMPLETO.md`
- `docs/OPEN_SOURCE_ARCHITECTURE.md`
- `docs/00-inventario-e-viabilidade.md`
- `docs/04-arquitetura-e-adr.md`
- `PROMPT_CODEX_CLAUDE.txt`

## Commands
- Build: `cargo build --workspace`
- Test: `cargo test --workspace`
- Lint: `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings`
- Python verifiers: `python -m unittest discover -s tests -v`
- Doctor: `cargo run -p framechester-cli -- doctor`
- Demo pipeline: `cargo run -p framechester-cli -- run --workdir artifacts/demo-short`
- QA video: `cargo run -p framechester-cli -- qa --video artifacts/demo-short/render/final.mp4`
- Simular custos: `python scripts/calculadora_monetizacao.py --storage-gb 50 --provider b2`
- FFmpeg: `ffmpeg -version`, `ffmpeg -encoders`, `ffmpeg -hwaccels`## Rules
- No real credentials, tokens, PII, real media or private URLs in commits/CI/issues/releases.
- No real publishing, no real purchases, no real backup spend without explicit authorization.
- Telemetry off by default; secrets only via local secret manager.
- No publishing if QA fails; dry_run default true; publish opt-in per network.
- No fabricating facts, revenue, eligibility or verification.

## Testing
- Tests must be added with implementation (TDD) when slices start.

---


