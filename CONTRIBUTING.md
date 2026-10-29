# Contributing to Framechester

Thanks for helping. Framechester is a self-hosted, single-operator media production engine: a Rust engine (`crates/`) and a local TypeScript Studio (`web/`). Contributions are reviewed on merit and on fit with the [principles in the README](README.md#principios).

## Before you start

- Open an issue first for anything beyond a small fix, so the design can be discussed before the code.
- Read [`CLAUDE.md`](CLAUDE.md) and [`AGENTS.md`](AGENTS.md): they hold the rules every change must respect, whether written by a person or with an AI assistant.
- Check the [architecture notes](docs/OPEN_SOURCE_ARCHITECTURE.md) and the [operational plan](docs/PLANO_OPERACIONAL_COMPLETO.md); they are the source of truth for scope.

## Setup

Requirements: Rust 1.85+, Node.js 22.12+, Python 3.11–3.13, FFmpeg/ffprobe on `PATH`.

```bash
git clone https://github.com/prod455/framechester
cd framechester
npm run setup          # installs the Studio dependencies and builds the engine
npm run voices:setup   # Kokoro PT-BR runtime and pinned commercial voices
npm start              # http://127.0.0.1:4317
```

`npm run dev` starts the backend in watch mode with Vite at `http://127.0.0.1:5173`. The CLI runs from the workspace: `cargo run -p framechester-cli -- doctor`.

## Checks

Run everything a pull request runs in CI before opening it:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
python -m unittest discover -s tests -v
npm --prefix web run check     # typecheck + Prettier
npm --prefix web test
npm --prefix web run build
npm run infra:test             # startup/shutdown helpers
```

`npm --prefix web run format` applies Prettier. Rust is formatted by `cargo fmt`.

## Conventions

- **Tests go with the implementation.** A behavior change without a test that fails before it is not complete. Studio tests use `node:test` (`web/tests/*.test.ts`); engine tests live next to the code; cross-language contracts share fixtures under `tests/fixtures/`.
- **One obvious way.** Do not add a second path for something that already works; replace it.
- **Errors are explicit.** Prefer a compile error to a runtime error, and a runtime error to silent wrong output. The Studio reports what the engine said; it never guesses.
- **Scope stays honest.** The engine never publishes, buys, or spends without an explicit operator action; `dry_run` stays `true`; the Studio stays on loopback with authentication, CSRF and the local vault. Do not weaken these to make a feature easier.
- **No real data in the repository.** No credentials, tokens, personal data, real media, private URLs, analytics screenshots or operator profiles. Fixtures are synthetic and say so.
- **Third-party material is registered.** A new dependency, model, voice, font or asset brings its license and origin to [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (and `docker/THIRD_PARTY.md` when it ships in the image).
- **Changelog.** Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md), written for the operator, not for the diff.
- **Commits** use a short imperative subject (`fix: …`, `feat: …`, `docs: …`); PRs are small and focused and follow the [template](.github/PULL_REQUEST_TEMPLATE.md).

Media and render changes include a local `run`/`qa` report in the PR description and identify synthetic versus real fixtures. Claims of better performance come with the measurement.

## Not accepted

Viewbots, engagement manipulation, scraping against platform terms, session-cookie automation, bypasses of the publishing or cost gates, and anything that fabricates sources, eligibility or revenue.

## Releasing a version

Maintainers only.

1. Move the `## [Unreleased]` entries in `CHANGELOG.md` to a new `## [X.Y.Z] - YYYY-MM-DD` section and bump the version in `Cargo.toml` (`[workspace.package]`), `package.json` and `web/package.json`.
2. Run the full check list above and `cargo build --locked --release -p framechester-cli`.
3. Review `THIRD_PARTY_NOTICES.md` against the lockfiles (`cargo audit`, `npm audit`).
4. Merge to `main`, then tag: `git tag -a vX.Y.Z -m "Framechester X.Y.Z" && git push origin vX.Y.Z`.
5. The `release` workflow builds the CLI for Linux, Windows and macOS, publishes the container image to `ghcr.io/prod455/framechester` and creates the GitHub Release with the changelog section as notes.

## License

By contributing you agree that your contribution is licensed under the [Apache License 2.0](LICENSE), like the rest of the project-owned code.
