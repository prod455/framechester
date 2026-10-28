# Software contained in the locally built container

Checked on 2026-10-28. Components retain their own licences; Framechester
source remains Apache-2.0. No voice checkpoint, real media, API key or
personal prompt is included in the image.

| Component | Source/version | Licence and location |
|---|---|---|
| Framechester | Repository source and Cargo.lock | Apache-2.0; LICENSE and THIRD_PARTY_NOTICES.md copied here |
| Node.js | node:22.23.4-bookworm-slim | Base-image notices in /usr/local/LICENSE |
| kokoro-onnx | 0.6.1, exact PyPI wheel hashes | MIT; kokoro-onnx-MIT.txt and installed dist-info |
| ONNX Runtime | 1.31.1 | MIT and installed third-party notices |
| phonemizer | 3.4.0 | GPL-3.0-or-later; installed dist-info |
| espeakng-loader / eSpeak NG | 0.2.4 wheel | MIT loader / GPL-3.0-or-later eSpeak NG; wheel licence files |
| Python dependencies | docker/tts-requirements.txt | Exact package versions/hashes; dist-info licences and python-packages.txt inventory |
| FFmpeg / Debian libraries | Bookworm packages | Build-dependent terms in /usr/share/doc/*/copyright and debian-packages.txt |
| Kokoro weights and PT-BR voices | Downloaded separately to /models/kokoro | Apache-2.0; kokoro-LICENSE.txt and kokoro-NOTICE.txt supplied with downloads |

Sources: [Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M),
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx),
[phonemizer](https://github.com/bootphon/phonemizer),
[eSpeak loader](https://github.com/thewh1teagle/espeakng-loader),
[eSpeak NG](https://github.com/espeak-ng/espeak-ng),
[ONNX Runtime](https://github.com/microsoft/onnxruntime),
[Debian FFmpeg](https://packages.debian.org/bookworm/ffmpeg).

The GPL components retain their redistribution obligations even when invoked
through a subprocess. Before distributing an image, supply the corresponding
sources/build information and notices required by the exact packages and
modifications. The workflow builds/tests locally and does not push a release.

Use npm run voices:models on the host to download the reviewed Kokoro export
and original voice bundle. SHA-256 is verified before synthesis, and only
Dora, Alex and Santa are accepted. Piper and arbitrary checkpoints are blocked.
See [the commercial voice register](../docs/VOZES_COMERCIAIS.md). ASR is optional
and not bundled.
