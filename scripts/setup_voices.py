"""Install only the fixed commercial narrator. No API, accounts or paid effects."""
import argparse
import os
import pathlib
import subprocess
import sys
import urllib.request
import uuid
import venv

from kokoro_tts import FILES, RELEASE, validate_file

ROOT = pathlib.Path(__file__).resolve().parents[1]


def download_models():
    folder = ROOT / "models/kokoro"
    folder.mkdir(parents=True, exist_ok=True)
    for name, kind in (("kokoro-v1.0.onnx", "model"), ("voices-v1.0.bin", "voices")):
        target = folder / name
        if target.exists():
            validate_file(target, kind)
            continue
        temporary = folder / (name + "." + uuid.uuid4().hex + ".partial")
        try:
            with urllib.request.urlopen(RELEASE + name, timeout=60) as source, temporary.open("xb") as output:
                remaining = FILES[kind][0]
                while chunk := source.read(min(1024 * 1024, remaining + 1)):
                    remaining -= len(chunk)
                    if remaining < 0:
                        raise ValueError("Download maior que o arquivo do catálogo.")
                    output.write(chunk)
            validate_file(temporary, kind)
            os.replace(temporary, target)
        finally:
            temporary.unlink(missing_ok=True)
    for name in ("LICENSE", "NOTICE"):
        # Model licence is supplied with the downloaded artefacts by this repo.
        source = ROOT / "docker/licenses" / ("kokoro-" + name + ".txt")
        (folder / name).write_bytes(source.read_bytes())
    print("Dora, Alex e Santa: modelos comerciais verificados por SHA-256.")


def environment_python(environment):
    return environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def runs(executable):
    """A venv keeps the absolute path of the Python that created it; reinstalling or
    moving that Python leaves an interpreter that no longer starts."""
    try:
        return subprocess.run([str(executable), "-c", "import sys"], capture_output=True, timeout=60).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-only", action="store_true", help="Baixar apenas os arquivos para o Docker")
    args = parser.parse_args()
    if not args.models_only:
        if not (3, 11) <= sys.version_info[:2] < (3, 14):
            raise ValueError("O narrador exige Python 3.11, 3.12 ou 3.13. Use npm run voices:models para o Docker.")
        environment = ROOT / ".framechester/tts-venv"
        executable = environment_python(environment)
        broken = executable.exists() and not runs(executable)
        if broken:
            print("Ambiente do narrador aponta para um Python que nao existe mais; recriando.")
        venv.create(environment, with_pip=True, clear=broken)
        subprocess.run([str(executable), "-m", "pip", "install", "--only-binary=:all:", "--require-hashes", "-r", str(ROOT / "docker/tts-requirements.txt")], check=True)
    download_models()


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
