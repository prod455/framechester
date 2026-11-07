"""Troca o timbre da narração base pelo da sua voz com o conversor do OpenVoice V2 (MIT).

Uso: python ia/voz_clonada.py [--referencia public/referencia.wav] [--tau 0.3]
A referência são uns 20 s de você falando, sem música. Clone só a sua própria voz.
"""

import argparse
import pathlib
import sys
import tempfile
import types

from comum import OPENVOICE, PUBLICO, SAIDA, licenca_confere, trechos

MINIMO_REFERENCIA = 10.0


def dispositivo() -> str:
    import torch

    return "cuda:0" if torch.cuda.is_available() else "cpu"


def conversor(pasta: pathlib.Path, disp: str):
    # api.py importa o front-end de texto do OpenVoice (pypinyin, jieba, unidecode GPL...), que o
    # conversor de timbre não usa. Um módulo vazio no lugar evita instalar essa cadeia.
    sys.modules.setdefault("openvoice.text", types.ModuleType("openvoice.text"))
    sys.modules["openvoice.text"].text_to_sequence = None
    from openvoice.api import OpenVoiceBaseClass, ToneColorConverter

    conv = ToneColorConverter.__new__(ToneColorConverter)
    OpenVoiceBaseClass.__init__(conv, str(pasta / "converter" / "config.json"), device=disp)
    conv.watermark_model = None  # o vídeo declara o clone na narração
    conv.version = getattr(conv.hps, "_version_", "v1")
    conv.load_ckpt(str(pasta / "converter" / "checkpoint.pth"))
    return conv


def timbre(conv, audio: pathlib.Path, pasta: pathlib.Path, nome: str):
    import soundfile

    dados, taxa = soundfile.read(str(audio), always_2d=True)
    mono = dados.mean(axis=1)
    caminhos = []
    for i, (de, ate) in enumerate(trechos(len(mono), taxa)):
        caminho = pasta / f"{nome}-{i:02d}.wav"
        soundfile.write(str(caminho), mono[de:ate], taxa)
        caminhos.append(str(caminho))
    return conv.extract_se(caminhos)


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--base", default=str(SAIDA / "voz-base.wav"))
    p.add_argument("--referencia", default=str(PUBLICO / "referencia.wav"))
    p.add_argument("--saida", default=str(PUBLICO / "narracao.wav"))
    p.add_argument("--tau", type=float, default=0.3)
    a = p.parse_args()

    import soundfile

    for caminho in (a.base, a.referencia):
        if not pathlib.Path(caminho).is_file():
            sys.exit(f"{caminho} não existe.")
    duracao = soundfile.info(a.referencia).duration
    if duracao < MINIMO_REFERENCIA:
        sys.exit(f"A referência tem {duracao:.1f} s; grave pelo menos {MINIMO_REFERENCIA:.0f} s (o ideal é ~20 s).")

    from huggingface_hub import model_info, snapshot_download

    declarada = (model_info(OPENVOICE[0]).card_data or {}).get("license")
    if not licenca_confere(declarada, OPENVOICE[1]):
        sys.exit(f"{OPENVOICE[0]} declara licença {declarada!r}, não {OPENVOICE[1]!r}: clonagem bloqueada.")
    pasta = pathlib.Path(snapshot_download(OPENVOICE[0], allow_patterns=["converter/*"]))

    conv = conversor(pasta, dispositivo())
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        alvo = timbre(conv, pathlib.Path(a.referencia), tmp, "referencia")
        origem = timbre(conv, pathlib.Path(a.base), tmp, "base")
        conv.convert(audio_src_path=a.base, src_se=origem, tgt_se=alvo, output_path=a.saida, tau=a.tau)
    print(a.saida)
    return 0


if __name__ == "__main__":
    sys.exit(main())
