# Contributing to Framechester

Contributions are welcome **once a public repository is established**. Propose feature/bug in an issue, describe platform policy impact, add tests and benchmarks when relevant, and submit focused PRs.

- Code of conduct and Apache-2.0 license apply to new project-owned contributions.
- Include license/source info for every third-party asset, package, dataset, model and weight.
- No personal credentials, copyrighted video samples without license, customer data or monetization screenshots.
- No viewbot, engagement manipulation, scraping against terms, session-cookie automation or bypass of publishing restrictions.
- Run before opening a PR:

  ```bash
  cargo fmt --all --check
  cargo clippy --workspace --all-targets -- -D warnings
  cargo test --workspace
  python -m unittest discover -s tests -v
  ```

  Media/render changes must include a local `run`/`qa` report and identify synthetic vs real fixtures.
- PRs should include behavior, tests, performance evidence (when claiming improvement), and rollback notes.
- Maintainer reviews and approval are necessary; no auto-merge of untrusted code.

