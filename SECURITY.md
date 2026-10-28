# Security policy

**Status:** pre-alpha specification; no supported production release currently.

For security findings, use GitHub private vulnerability reporting **if enabled** on the eventual repository. Do not post tokens, account identifiers, screenshots with private data or exploit details publicly. Until a secure reporting channel exists, do not disclose private credentials in public issues.

Security requirements for implementation: tokens scoped to least privilege, encryption in transit, secret scanning on commits, no user PII in logs, SSRF protection in media fetching, sandboxed file handling, safe subprocess invocation, dependency reviews, backup encryption, strict OAuth callback checks, no telemetry by default.
