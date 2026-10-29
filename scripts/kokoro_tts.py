"""Offline commercial voice gate and Kokoro narrator, embedded by the Rust engine.

Only the reviewed model-files-v1.1 export and its original voice bundle are
accepted. Names, operator declarations and renamed files never grant approval.
"""
import argparse
import hashlib
import importlib.util
import os
import pathlib
import sys
import wave

VOICES = ("pf_dora", "pm_alex", "pm_santa")
FILES = {
    "model": (325505369, "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a"),
    "voices": (28214398, "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"),
}
RELEASE = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/"


def validate_file(path, kind):
    path = pathlib.Path(path)
    size, digest = FILES[kind]
    if not path.is_file() or path.stat().st_size != size:
        raise ValueError(f"Arquivo {kind} ausente ou fora do catálogo comercial; execute npm run voices:setup.")
    with path.open("rb") as stream:
        actual = hashlib.file_digest(stream, "sha256").hexdigest()
    if actual != digest:
        raise ValueError(f"Hash de {kind} divergente; voz comercial bloqueada.")


def validate(model, voices, voice):
    if voice not in VOICES:
        raise ValueError("Voz fora do catálogo comercial: escolha Dora, Alex ou Santa (Kokoro).")
    validate_file(model, "model")
    validate_file(voices, "voices")


def synthesize(model, voices, voice, text, output):
    validate(model, voices, voice)
    if not text.strip() or len(text) > 50_000:
        raise ValueError("Narração vazia ou maior que 50.000 caracteres.")
    # phonemizer loads a private copy of the reviewed eSpeak library. Keep /tmp
    # noexec and the root filesystem read-only: use the existing private data
    # volume for that short-lived library copy, not an executable tmpfs.
    if pathlib.Path("/.dockerenv").is_file():
        cache = pathlib.Path("/data/tts-tmp")
        cache.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.environ["TMPDIR"] = str(cache)
    # No downloader, remote code, pickle, user-selected model or network client.
    import numpy as np
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from kokoro_onnx import Kokoro

    samples, rate = Kokoro(str(model), str(voices)).create(text, voice=voice, lang="pt-br", speed=1.0)
    if rate != 24_000 or samples.size == 0 or not np.isfinite(samples).all():
        raise ValueError("O narrador não produziu áudio válido.")
    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    output = pathlib.Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm.tobytes())


def synthesize_batch(model, voices, voice, requests):
    """Narrates several texts with one model load. `requests` is a list of
    {"text": ..., "output": ...}; outputs are written as 24 kHz mono 16-bit WAV."""
    validate(model, voices, voice)
    if not requests or len(requests) > 512:
        raise ValueError("Lote de narração vazio ou com mais de 512 trechos.")
    import numpy as np
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from kokoro_onnx import Kokoro

    narrator = Kokoro(str(model), str(voices))
    for request in requests:
        text = str(request.get("text", ""))
        output = pathlib.Path(str(request.get("output", "")))
        if not text.strip() or len(text) > 50_000 or not request.get("output"):
            raise ValueError("Trecho de narração vazio, sem destino ou maior que 50.000 caracteres.")
        samples, rate = narrator.create(text, voice=voice, lang="pt-br", speed=1.0)
        if rate != 24_000 or samples.size == 0 or not np.isfinite(samples).all():
            raise ValueError("O narrador não produziu áudio válido.")
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
        output.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(rate)
            wav.writeframes(pcm.tobytes())


def main():
    parser = argparse.ArgumentParser(description="Kokoro PT-BR · catálogo comercial Apache-2.0")
    parser.add_argument("--model", required=True)
    parser.add_argument("--voices", required=True)
    parser.add_argument("--voice", required=True, choices=VOICES)
    parser.add_argument("--output")
    parser.add_argument("--batch", action="store_true", help="lê JSON [{text, output}] da entrada padrão")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        if args.check:
            validate(args.model, args.voices, args.voice)
            if importlib.util.find_spec("kokoro_onnx") is None:
                raise ValueError("Runtime Kokoro ausente; execute npm run voices:setup.")
            print("Kokoro PT-BR: arquivos conferidos; licença Apache-2.0.")
        elif args.batch:
            import json
            requests = json.loads(sys.stdin.buffer.read(4_000_000).decode("utf-8"))
            if not isinstance(requests, list):
                raise ValueError("O lote precisa ser uma lista JSON.")
            synthesize_batch(args.model, args.voices, args.voice, requests)
        elif args.output:
            text = sys.stdin.buffer.read(200_005).decode("utf-8")
            synthesize(args.model, args.voices, args.voice, text, args.output)
        else:
            parser.error("--output é obrigatório para narrar")
    except (ValueError, OSError, ImportError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
