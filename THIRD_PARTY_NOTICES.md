# Third-party license and asset register (review before release)

| Component | Version/source | Usage | License status | Redistribute? |
|---|---|---|---|---|
| FFmpeg / ffprobe | 9.0.1-full_build (gyan.dev/MSYS2) | external renderer and QA | LGPL-2.1+ default; this build enables GPL components (libx264, libx265). Record binary/config per release. | Do not bundle until verified |
| libx264 | inside FFmpeg build | H.264 CPU encode | GPL-2.0+ (because of x264) | Same as FFmpeg build |
| h264_amf | inside FFmpeg build | AMD GPU encode (preview/candidate) | Follows FFmpeg build; runtime driver terms apply | Do not bundle |
| libvmaf | inside FFmpeg build | quality measurement | BSD-2-Clause + patent considerations | Same as FFmpeg build |
| Kokoro-82M v1.0 | hexgrad/Kokoro-82M; ONNX export model-files-v1.1 | Dora, Alex and Santa PT-BR narration | Apache-2.0; pinned model and voice hashes in [commercial voice register](docs/VOZES_COMERCIAIS.md) | Downloaded separately; licence and attribution accompany local files |
| kokoro-onnx | 0.6.1 | Local inference wrapper | MIT; notice in docker/licenses | Runtime bundled in local Docker build |
| `pt_BR-faber-medium.onnx` | `rhasspy/piper-voices` `pt/pt_BR/faber/medium`; 63,201,294 B; SHA-256 `858555E3A064209C57088FE6BD70C4C3DC54D03EAA00C45D5ECAF43A33F95AA7` | Local pilot voice | Faber dataset CC0, but its Lessac checkpoint ancestry has research-only source materials. Commercial authorization of this ONNX is not established; see evidence below. | Not bundled; do not treat as commercially cleared |
| `pt_BR-faber-medium.onnx.json` | same Piper voice directory | voice config | Same as voice model | Not bundled |
| whisper.cpp + `ggml-base.bin` | local `C:/whisper`; 147,951,465 B; SHA-256 `60ED5BC3DD14EEA856493D334349B405782DDCAF0028D4B5DF4088345FBA2EFE` | optional PT-BR ASR QA | whisper.cpp MIT; OpenAI Whisper base weights MIT | Not bundled |
| restic | 0.19.1 | encrypted backup/restore | BSD-2-Clause | User installs separately |
| Rust crates | see `Cargo.lock` | build/runtime | Mixed permissive (MIT/Apache-2.0/BSD/ISC); run `cargo deny`/license scan before release | After scanning |
| Blender | optional, not used by this slice | future 3D subprocess | GPL terms for software; assess bundling separately | External install |
| Images, video, music, fonts | operator-provided or synthetic | video content | Individual rights/provenance per asset | Never ship uncertain assets |

This file is a **release checklist**, not a completed legal audit. Re-run the dependency/license scan against the actual lockfile and FFmpeg build before any release or binary distribution.

## Pilot voice: commercial authorization unresolved

Primary sources checked on **2026-10-28**: the [Faber medium model card](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/faber/medium/MODEL_CARD) declares its own dataset CC0 and says it was finetuned from Lessac medium. The [Lessac medium model card](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD) says it was trained from scratch and links the [Blizzard 2013 source-material license](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html). Clauses 1.1 and 3.2 restrict those materials to research and exclude commercial purposes.

This establishes an unresolved licensing chain, not an automatic legal conclusion that the dataset's terms attach to every downstream weight or generated sound. The repository-wide MIT label and the final dataset's CC0 declaration do not resolve authorization for this specific ONNX. Obtain clarification for the weights/checkpoint chain or select a voice whose commercial permissions are documented before monetizing. No request for permission was sent to any third party.

Piper voices are now blocked by the production adapter. Legacy Studio voice settings migrate to Kokoro Dora while retaining channel identity and render settings. Only the reviewed Kokoro model, voice bundle and PT-BR voice IDs are accepted; see [VOZES_COMERCIAIS.md](docs/VOZES_COMERCIAIS.md). The old pilot remains historical technical evidence, not commercial approval.

## Framechester Studio web dependencies

The local explanatory-visual renderer uses `resvg` **0.49.0** and its locked
`usvg`/`tiny-skia` dependency graph. Installed crate metadata declares MIT OR
Apache-2.0 for resvg/usvg and BSD-3-Clause for tiny-skia/tiny-skia-path 0.12.0;
exact transitive packages are in `Cargo.lock`. These are Rust
runtime dependencies, without a browser CDN or remote image service. Review
the complete lockfile and retain applicable notices when distributing a
binary. System fonts are loaded from the installation; Windows font files
are not copied into the repository or redistributed by this feature. The
Docker image uses its existing DejaVu font package and distribution notices.

The Basecoat migration adds `basecoat-css` **1.1.0** (MIT) as a direct UI
dependency, with `tailwindcss` and `@tailwindcss/vite` **4.3.1** as build-only
dependencies. Basecoat styles compile into local assets; no component
autoloader, CDN or remote fonts are loaded by the Studio. MIT notices for
Basecoat (Copyright 2025 Ronan Berder) and Tailwind are preserved in
`web/public/licenses/` and copied to `web/dist/licenses/` by Vite. The lockfile
records exact packages. `happy-dom` **21.0.4** (MIT) is a development/test-only
dependency for native DOM component contracts and is not in the UI bundle.
These are additions to the earlier 22-package inventory below, not part of
that historical package count. See [the design system](docs/DESIGN_SYSTEM.md)
for the migrated API and verification scope.

The UI workflow additionally includes the Anthropic `frontend-design` instruction skill under `.agents/skills/frontend-design`, with its Apache-2.0 `LICENSE.txt` preserved. Its fixed revision and file hashes are recorded in [docs/UI_SKILLS_SOURCES.md](docs/UI_SKILLS_SOURCES.md). The consulted Vercel guidelines are linked references and are not redistributed here. The installed skill is development guidance, not a JavaScript runtime dependency.

The subsequent UI refinement uses `pbakaus/impeccable`, fixed revision `8409a564d1baee90b2dde4f7a8f06288838e3921`, under `.agents/skills/impeccable`, with its Apache-2.0 license preserved. The checksum-verified engine is a separate development tool in the operator's external cache and is not bundled with the application. Sources and hashes are recorded in the same UI skills inventory.

Local review: **2026-10-28**. Versions and declared licenses below were reconciled between [web/package-lock.json](web/package-lock.json) (lockfile version 3) and the 22 package manifests installed under `web/node_modules` on Windows x64. License/notice files listed below were inspected locally. This inventory records the installed web stack; it is not a universal legal audit or authorization to distribute a binary bundle.

### Direct dependencies

| Package | Locked/installed version | Usage | Locally verified license evidence |
|---|---|---|---|
| `vite` | 8.3.5 | UI development server and production build | MIT core; `web/node_modules/vite/LICENSE.md` also contains bundled-dependency notices, including BSD-2-Clause, CC0-1.0, ISC and MIT |
| `typescript` | 7.0.2 | Type checking | Apache-2.0 in `web/node_modules/typescript/LICENSE`; preserve and review `NOTICE.txt`, which separately records incorporated third-party material |
| `tsx` | 4.23.15 | TypeScript launcher for backend/start, development and tests | MIT in `web/node_modules/tsx/LICENSE` |
| `@types/node` | 22.20.5 | Node.js type declarations | MIT in `web/node_modules/@types/node/LICENSE`; the manifest range is `^22.0.0`, while this exact version is locked |

All four currently appear under `devDependencies` in [web/package.json](web/package.json). That metadata does not mean they are absent from operational tooling: the current `start` command invokes `tsx`. Review the actual launcher and packaged files when preparing a release.

### Installed transitive tooling and native packages

| Package | Locked/installed version | Usage | Locally verified license evidence |
|---|---|---|---|
| `rolldown` | 1.2.15 | Vite bundler | MIT in `web/node_modules/rolldown/LICENSE`; additional incorporated notices in `THIRD-PARTY-LICENSE` |
| `@rolldown/binding-win32-x64-msvc` | 1.2.15 | Platform-specific Rolldown binary | MIT declared in its installed `package.json` and lock entry; this native package contains no separate license file, so retain/review the parent Rolldown notices if packaging it |
| `esbuild` | 0.28.2 | `tsx` transform/loader dependency | MIT in `web/node_modules/esbuild/LICENSE.md` |
| `@esbuild/win32-x64` | 0.28.2 | Platform-specific esbuild executable | MIT declared in its installed `package.json` and lock entry; no separate license file in this native package, so retain/review the parent esbuild license if packaging it |
| `@typescript/typescript-win32-x64` | 7.0.2 | Platform-specific TypeScript compiler | Apache-2.0 in its `LICENSE`, with its own `NOTICE.txt`; compiler notices include Go-related and other third-party components, not only the package's top-level license |
| `lightningcss` and `lightningcss-win32-x64-msvc` | 1.33.0 each | Vite CSS transformation and native implementation | **MPL-2.0**, confirmed in each installed package's `LICENSE`; assess the files actually shipped and applicable source/notice requirements before redistribution |
| `@oxc-project/types` | 0.155.0 | Rolldown types | MIT in `web/node_modules/@oxc-project/types/LICENSE` |
| `@rolldown/pluginutils` | 1.0.1 | Rolldown utilities | MIT in `web/node_modules/@rolldown/pluginutils/LICENSE` |
| `postcss` | 8.5.32 | CSS processing | MIT in `web/node_modules/postcss/LICENSE` |
| `picomatch` | 4.0.7 | Pattern matching | MIT in `web/node_modules/picomatch/LICENSE` |
| `tinyglobby` | 0.2.17 | File matching | MIT in `web/node_modules/tinyglobby/LICENSE` |
| `fdir` | 6.5.0 | File traversal | MIT in `web/node_modules/fdir/LICENSE` |
| `nanoid` | 3.3.20 | Transitive tooling utility | MIT in `web/node_modules/nanoid/LICENSE` |
| `undici-types` | 6.21.0 | Node.js HTTP type declarations | MIT in `web/node_modules/undici-types/LICENSE` |
| `detect-libc` | 2.1.2 | Native package platform detection | Apache-2.0 in `web/node_modules/detect-libc/LICENSE` |
| `picocolors` | 1.1.1 | Terminal colors | ISC in `web/node_modules/picocolors/LICENSE` |
| `source-map-js` | 1.2.2 | Source map tooling | BSD-3-Clause in `web/node_modules/source-map-js/LICENSE` |

The lockfile also enumerates optional native builds for other operating systems/architectures, including `fsevents` on macOS. Those uninstalled artifacts were not inspected here; their lockfile SPDX labels are metadata, not a complete review of the bytes eventually distributed. The TypeScript `NOTICE.txt` and Vite/Rolldown bundled notices also describe material that is not represented as a separate installed npm package.

No release step introduced by this web implementation automatically bundles `node_modules`, Node.js, PowerShell, compiler/bundler executables, FFmpeg, model weights or other external binaries. Node.js is an external runtime requirement; its distribution and incorporated notices are outside the npm lockfile inventory. If a later installer/archive includes any of these artifacts, preserve the relevant LICENSE/NOTICE files and review that concrete artifact and platform before distribution. The project's Apache-2.0 license does not replace third-party notices.
