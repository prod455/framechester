"""Transcreve a narração com o tempo de cada palavra (faster-whisper) para public/palavras.json.

Uso: python scripts/transcrever.py [--audio public/narracao.wav] [--modelo small]

Instale antes: pip install faster-whisper==1.1.1
O modelo é baixado do Hugging Face na primeira vez e fica no cache local.
O roteiro entra como initial_prompt: ajuda a acertar nomes e a grafia das palavras.
"""

import argparse
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def roteiro() -> str:
    proprio = RAIZ / "anuncio.json"
    arquivo = proprio if proprio.exists() else RAIZ / "anuncio.exemplo.json"
    anuncio = json.loads(arquivo.read_text(encoding="utf-8"))
    return " ".join(cena["frase"] for cena in anuncio["cenas"])


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--audio", default=str(RAIZ / "public" / "narracao.wav"))
    p.add_argument("--saida", default=str(RAIZ / "public" / "palavras.json"))
    p.add_argument("--modelo", default="small")
    p.add_argument("--idioma", default="pt")
    a = p.parse_args()

    from faster_whisper import WhisperModel

    modelo = WhisperModel(a.modelo, device="auto", compute_type="default")
    trechos, _ = modelo.transcribe(
        a.audio,
        language=a.idioma,
        word_timestamps=True,
        initial_prompt=roteiro(),
        beam_size=5,
    )
    palavras = [
        {"texto": w.word.strip(), "inicio": round(w.start, 3), "fim": round(w.end, 3)}
        for trecho in trechos
        for w in (trecho.words or [])
        if w.word.strip()
    ]
    if not palavras:
        print("Nenhuma palavra reconhecida: confira se o arquivo tem fala.", file=sys.stderr)
        return 1
    saida = pathlib.Path(a.saida)
    saida.write_text(
        json.dumps({"fonte": "faster-whisper", "palavras": palavras}, ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"{len(palavras)} palavras em {saida} ({palavras[-1]['fim']:.1f} s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
