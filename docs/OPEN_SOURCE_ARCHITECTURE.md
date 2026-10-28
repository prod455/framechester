# Framechester — open-source architecture contract

## Deployment topology

1. Local worker (MVP): Rust CLI + FFmpeg external binary + Piper TTS; generates script, narration, render and QA. No VPS required (`NOT_REQUIRED` decision).
2. Future optional VPS: scheduler, PostgreSQL, dashboard and authenticated worker queue, only if multi-job orchestration is needed.
3. Object storage: encrypted backup with restic using S3-compatible provider; endpoint/keys belong to operator (opt-in, not enabled by default).
4. Platform adapters: official APIs when permitted. The current publisher is dry-run only; manual/export workflow until a real adapter is authorized and implemented.

No shared backend, centralized analytics collection or maintainer-controlled remote account is required.

## Rust traits/contracts (implemented in `framechester-core::ports`)

- `TrendSource`: `fetch(since, region) -> signals` (include dates and provenance)
- `FactEvidenceProvider`: `verify(claims) -> evidence` (unknown must remain unknown)
- `LlmProvider`: `generate(prompt, budget) -> structured_script`
- `TtsEngine`: `synthesize(script, voice) -> audio_with_metadata`
- `AssetProvider`: `resolve(scene) -> licensed_asset_manifest`
- `Renderer`: `render(timeline, assets, profile) -> validated_mp4`; optional `thumbnail(title, output) -> png`
- Publishing package: SRT captions, description, metadata JSON and sources/license markdown are generated from the script, timeline and QA reports before any publish call.
- Local operator report: `report.html` renders QA, render, package links and warnings with no external assets or network calls.
- Optional captions burn-in uses a local SRT with libass; the default path stays copy-only for speed.
- `Publisher`: `publish(media, account, policy) -> provider_result` (explicit account permission)
- `MetricsProvider`: `fetch(video_ids) -> raw_metrics` (platform-specific qualifiers)
- `BackupProvider`: `snapshot/restore/check` with encrypted storage and audit log.

Every adapter advertises declared capabilities, API terms, license, external network requirement, unit cost, secret requirements, supported content and failure modes. Plugins are **registered and compiled** by default; do not execute untrusted plugin binaries/scripts without a real sandbox.

## Contracts and boundaries

- `configs/` and `.env` local/private; `.env.example` sanitized.
- Each local installation has its own OAuth clients/accounts; release archives never include maintainer OAuth tokens.
- No telemetry or phone-home behavior by default. No scraping that violates ToS or requests for non-consenting data.
- No fictitious engagement, manufactured tests, ads, followers or purchases.
- Every asset records checksum, provenance, license, URL when applicable, time of retrieval, and use restrictions.
- Financial reporting separates revenue actually received, pending, model projections and extra cash spend.

## Release and compliance gates

`license-scan -> secret-scan -> fmt/lint -> unit/integration -> render QA -> safe install smoke -> vulnerability review -> maintainer approval -> publish`.

FFmpeg may be LGPL or GPL depending on configuration. Subprocess invocation limits coupling but **does not excuse redistribution duties** when shipping FFmpeg binaries. Never bundle uncertain pretrained model weights or footage.




