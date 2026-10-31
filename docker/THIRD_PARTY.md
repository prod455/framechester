# Software incluído no container construído localmente

Conferido em 2026-10-28. Cada componente mantém a própria licença; o código do
Framechester continua sob Apache-2.0. Nenhum checkpoint de voz, mídia real, chave
de API ou prompt pessoal vai na imagem.

| Componente | Origem/versão | Licença e localização |
|---|---|---|
| Framechester | Código do repositório e Cargo.lock | Apache-2.0; LICENSE e THIRD_PARTY_NOTICES.md copiados aqui |
| Node.js | node:22.23.4-bookworm-slim | Avisos da imagem base em /usr/local/LICENSE |
| kokoro-onnx | 0.6.1, hashes exatos do wheel no PyPI | MIT; kokoro-onnx-MIT.txt e dist-info instalado |
| ONNX Runtime | 1.31.1 | MIT e avisos de terceiros instalados |
| phonemizer | 3.4.0 | GPL-3.0-or-later; dist-info instalado |
| espeakng-loader / eSpeak NG | wheel 0.2.4 | MIT no loader / GPL-3.0-or-later no eSpeak NG; arquivos de licença do wheel |
| Dependências Python | docker/tts-requirements.txt | Versões e hashes exatos dos pacotes; licenças no dist-info e inventário em python-packages.txt |
| FFmpeg / bibliotecas Debian | Pacotes do Bookworm | Termos que dependem do build em /usr/share/doc/*/copyright e debian-packages.txt |
| Pesos do Kokoro e vozes PT-BR | Baixados à parte em /models/kokoro | Apache-2.0; kokoro-LICENSE.txt e kokoro-NOTICE.txt fornecidos com os downloads |

Fontes: [modelo Kokoro](https://huggingface.co/hexgrad/Kokoro-82M),
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx),
[phonemizer](https://github.com/bootphon/phonemizer),
[eSpeak loader](https://github.com/thewh1teagle/espeakng-loader),
[eSpeak NG](https://github.com/espeak-ng/espeak-ng),
[ONNX Runtime](https://github.com/microsoft/onnxruntime),
[FFmpeg no Debian](https://packages.debian.org/bookworm/ffmpeg).

Os componentes GPL mantêm suas obrigações de redistribuição mesmo quando chamados
como subprocesso. Antes de distribuir uma imagem, forneça os fontes/informações de
build correspondentes e os avisos exigidos pelos pacotes e modificações exatos. O
workflow constrói e testa localmente e não publica uma release.

Rode npm run voices:models no host para baixar o export revisado do Kokoro e o
pacote original de vozes. O SHA-256 é conferido antes da síntese, e só Dora, Alex
e Santa são aceitas. Piper e checkpoints arbitrários ficam bloqueados. Veja
[o registro de vozes comerciais](../docs/VOZES_COMERCIAIS.md). O ASR é opcional e
não vai incluído.
