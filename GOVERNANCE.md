# Governance

## Roles

- **Maintainer** (currently [@prod455](https://github.com/prod455)): decides scope, reviews and merges, cuts releases, handles security reports and moderates the community. Listed in [`.github/CODEOWNERS`](.github/CODEOWNERS).
- **Contributor:** anyone who opens an issue or a pull request. Contributions are reviewed on merit and on fit with the project's principles; there is no auto-merge of untrusted code.

More maintainers can be added by the current maintainer after sustained, reviewed contributions.

## Decisions

Day-to-day decisions happen in issues and pull requests. Changes to architecture, licensing, the publishing/cost gates or the security model require a written decision record in `docs/04-arquitetura-e-adr.md` before the code is merged. Security, legal compliance and media rights outrank feature requests.

## What never changes unilaterally

- The license of existing contributions (Apache-2.0).
- The local-first, single-operator, no-telemetry defaults.
- The rule that publishing, purchases and backup spend need an explicit operator action.

## Ownership

The repository is open source; the installation data, channels, credentials and monetization accounts always belong to each operator. The code license grants no right to the project's name or brand.
