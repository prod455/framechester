# Software contained in the locally built container

Checked on 2026-10-28. The image keeps each component's own licence. The
Framechester source remains Apache-2.0; this file does not relicense it.
No voice checkpoint, real media, API key or personal prompt is included.

| Component | Source/version | Licence and location |
|---|---|---|
| Framechester | Repository source and Cargo.lock used by the build | Apache-2.0; LICENSE and THIRD_PARTY_NOTICES.md copied here |
| Node.js | Official `node:22.23.4-bookworm-slim` image | Node.js and bundled third-party notices supplied by the base image; `/usr/local/LICENSE` |
| Piper | `piper-tts==1.8.0`, wheel SHA-256 locked | GPL-3.0-or-later; licence files in `/opt/piper/lib/python3.11/site-packages/piper_tts-1.8.0.dist-info/`; exact upstream source tag below |
| ONNX Runtime | `onnxruntime==1.31.1` | MIT and included third-party notices in its installed dist-info package |
| Python dependencies | Versions and SHA-256 in `docker/piper-requirements.txt` | Licences in their installed dist-info directories; runtime inventory `python-packages.txt` |
| FFmpeg and Debian libraries | Debian Bookworm packages selected by apt | Build-dependent licences, copyright and source references in `/usr/share/doc/*/copyright`; exact binary package inventory `debian-packages.txt` |

Sources: [Node official image](https://hub.docker.com/_/node),
[Piper v1.8.0](https://github.com/OHF-Voice/piper1-gpl/tree/v1.8.0),
[Piper source distribution](https://pypi.org/project/piper-tts/1.8.0/#files),
[ONNX Runtime](https://github.com/microsoft/onnxruntime),
[Debian FFmpeg](https://packages.debian.org/bookworm/ffmpeg).

Piper is a separate executable and is called through a subprocess. Its GPL
and those of included multimedia libraries still matter when distributing
an image. A local build does not publish an image. Before distributing the
image, supply the corresponding sources/build information and notices
required by the exact included packages and audit any modifications.
This inventory does not certify that every redistribution condition has
been fulfilled. The workflow only builds/tests; it never pushes a release.

No voice is downloaded automatically. The licence of a model and its base
data must be checked separately, then its files mounted at `/models`.
The Faber example's commercial-rights caveat in the repository notices
continues to apply. ASR remains optional and is not bundled here.
