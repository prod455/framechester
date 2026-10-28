# Third-party license and asset register (review before release)

| Component | Version/source | Usage | License status | Redistribute? |
|---|---|---|---|---|
| FFmpeg / ffprobe | 9.0.1-full_build (gyan.dev/MSYS2) | external renderer and QA | LGPL-2.1+ default; this build enables GPL components (libx264, libx265). Record binary/config per release. | Do not bundle until verified |
| libx264 | inside FFmpeg build | H.264 CPU encode | GPL-2.0+ (because of x264) | Same as FFmpeg build |
| h264_amf | inside FFmpeg build | AMD GPU encode (preview/candidate) | Follows FFmpeg build; runtime driver terms apply | Do not bundle |
| libvmaf | inside FFmpeg build | quality measurement | BSD-2-Clause + patent considerations | Same as FFmpeg build |
| Piper | local CLI in `C:/piper` | offline PT-BR TTS | Piper MIT | No binary bundled |
| `pt_BR-faber-medium.onnx` | `rhasspy/piper-voices` `pt/pt_BR/faber/medium`; 63,201,294 B; SHA-256 `858555E3A064209C57088FE6BD70C4C3DC54D03EAA00C45D5ECAF43A33F95AA7` | PT-BR voice | Dataset declared CC0; finetuned checkpoint basis still needs model-card confirmation before redistribution | Not bundled; user installs locally |
| `pt_BR-faber-medium.onnx.json` | same Piper voice directory | voice config | Same as voice model | Not bundled |
| whisper.cpp + `ggml-base.bin` | local `C:/whisper`; 147,951,465 B; SHA-256 `60ED5BC3DD14EEA856493D334349B405782DDCAF0028D4B5DF4088345FBA2EFE` | optional PT-BR ASR QA | whisper.cpp MIT; OpenAI Whisper base weights MIT | Not bundled |
| restic | 0.19.1 | encrypted backup/restore | BSD-2-Clause | User installs separately |
| Rust crates | see `Cargo.lock` | build/runtime | Mixed permissive (MIT/Apache-2.0/BSD/ISC); run `cargo deny`/license scan before release | After scanning |
| Blender | optional, not used by this slice | future 3D subprocess | GPL terms for software; assess bundling separately | External install |
| Images, video, music, fonts | operator-provided or synthetic | video content | Individual rights/provenance per asset | Never ship uncertain assets |

This file is a **release checklist**, not a completed legal audit. Re-run the dependency/license scan against the actual lockfile and FFmpeg build before any release or binary distribution.
