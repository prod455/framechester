# Security policy

## Reporting a vulnerability

Report privately through [GitHub private vulnerability reporting](https://github.com/prod455/framechester/security/advisories/new). Do not open a public issue, and do not include tokens, account identifiers, private media or data from a real installation in the report.

Please include the version (tag or commit), the component (Studio web, Rust engine, Docker image, scripts), steps to reproduce and the impact you observed. You will get an acknowledgement within 7 days and a status update within 30 days. Fixes ship as a patch release and a note in `CHANGELOG.md`; credit is given if you want it.

## Supported versions

| Version | Supported |
|---|---|
| latest `0.x` release | security fixes |
| older releases | upgrade to the latest release |

Framechester is pre-1.0: breaking changes can happen between minor versions and are listed in the changelog.

## Scope

Framechester runs on the operator's own machine. The security model assumes:

- The Studio listens on loopback only, behind a local password, with CSRF protection and a per-installation vault for tokens. Exposing it to a network is not supported.
- Publishing, purchases and backup spend are disabled unless the operator turns them on explicitly; `dry_run` is the default.
- Telemetry is off. No data leaves the machine except the calls the operator configures (LLM providers, Crossref source lookup, platform APIs with the operator's own credentials).
- Media the operator imports is checked for type, size and integrity; subprocesses (FFmpeg, Kokoro, restic) are invoked with explicit arguments, never through a shell.

In scope: anything that breaks those assumptions, such as authentication or CSRF bypasses, secrets leaking to logs, reports or the frontend, path traversal in uploads or job files, server-side request forgery in source or media fetching, command injection in subprocess calls, and supply-chain issues in the pinned dependencies or model downloads.

Out of scope: vulnerabilities that require physical access to the operator's machine or a modified installation, and issues in third-party services the operator connects.

## Hardening checklist for operators

- Keep the Studio on `127.0.0.1` (the default) and use the local password.
- Keep the vault key outside the repository and the data directory backed up with restic encryption.
- Run `cargo run -p framechester-cli -- doctor` after upgrading; it reports the versions of FFmpeg, Python and the voice models.
- Review `pipeline_report.json` before publishing anything manually.
