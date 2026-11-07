"""Narração base com a Kokoro do projeto (Apache-2.0, hashes conferidos pelo scripts/kokoro_tts.py).

Rode com o Python do Kokoro (npm run voices:setup na raiz do repositório):
  python ia/voz_base.py [--voz pf_dora]
Sai em out/voz-base.wav; o ia/voz_clonada.py troca o timbre pelo da sua referência.
"""

import argparse
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "scripts"))
import kokoro_tts  # noqa: E402

from comum import RAIZ, SAIDA, ler_anuncio, narracao  # noqa: E402

REPO = RAIZ.parent


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--voz", default="pf_dora", choices=[v for v, lang in kokoro_tts.LANGUAGES.items() if lang == "pt-br"])
    p.add_argument("--modelo", default=str(REPO / "models" / "kokoro" / "kokoro-v1.0.onnx"))
    p.add_argument("--vozes", default=str(REPO / "models" / "kokoro" / "voices-v1.0.bin"))
    p.add_argument("--saida", default=str(SAIDA / "voz-base.wav"))
    a = p.parse_args()
    kokoro_tts.synthesize(a.modelo, a.vozes, a.voz, narracao(ler_anuncio()), a.saida)
    print(a.saida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
