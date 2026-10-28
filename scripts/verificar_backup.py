#!/usr/bin/env python3
"""Verifica o backup restic (B2/R2) sem publicar midia e sem exibir segredos.

Uso:
    python scripts/verificar_backup.py --check
    python scripts/verificar_backup.py --init --yes
    python scripts/verificar_backup.py --backup C:\\caminho\\amostra --yes
    python scripts/verificar_backup.py --restore-check --yes

B2/R2 sao pay-as-you-go: init/backup podem gerar custo. Sem --yes nada e escrito.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SECRET_VARS = (
    "RESTIC_PASSWORD",
    "B2_ACCOUNT_ID",
    "B2_ACCOUNT_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
)
TAG = "framechester-check"


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load_env_file(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            values[name.strip()] = value.strip().strip('"').strip("'")
    return values


def detect_provider(repository: str) -> str:
    if repository.startswith("b2:"):
        return "b2"
    if repository.startswith("s3:"):
        return "s3"
    if repository.startswith("rest:"):
        return "rest"
    if repository.startswith("local:"):
        return "local"
    if Path(repository).is_absolute():
        return "local"
    return "desconhecido"


def validate_repo_url(repository: str) -> tuple[bool, str]:
    provider = detect_provider(repository)
    if provider == "b2":
        parts = repository.split(":")
        if len(parts) < 3 or not parts[1]:
            return False, "use b2:<bucket>:<caminho>"
        return True, ""
    if provider == "s3":
        if len(repository) <= 5:
            return False, "use s3:<endpoint>/<bucket>"
        return True, ""
    if provider in ("rest", "local"):
        return True, ""
    return False, "esquema nao reconhecido; use b2:, s3:, rest: ou caminho absoluto"


def mask_repo_url(repository: str) -> str:
    if "@" in repository and "://" in repository:
        scheme, rest = repository.split("://", 1)
        _, host = rest.split("@", 1)
        return f"{scheme}://***@{host}"
    return repository


def redact(text: str, env: dict[str, str]) -> str:
    for name in SECRET_VARS:
        value = env.get(name, "")
        if value and len(value) >= 4:
            text = text.replace(value, "***")
    return text


def validate_env(env: dict[str, str]) -> tuple[dict, list[str]]:
    problems: list[str] = []
    repository = env.get("RESTIC_REPOSITORY", "")
    if not repository:
        problems.append("RESTIC_REPOSITORY ausente")
    elif detect_provider(repository) == "desconhecido":
        problems.append("RESTIC_REPOSITORY com esquema nao reconhecido")
    else:
        ok, message = validate_repo_url(repository)
        if not ok:
            problems.append(message)
    if not env.get("RESTIC_PASSWORD"):
        problems.append("RESTIC_PASSWORD ausente")
    provider = detect_provider(repository) if repository else "desconhecido"
    if provider == "b2":
        for name in ("B2_ACCOUNT_ID", "B2_ACCOUNT_KEY"):
            if not env.get(name):
                problems.append(f"{name} ausente para repositorio b2:")
    if provider == "s3":
        for name in ("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"):
            if not env.get(name):
                problems.append(f"{name} ausente para repositorio s3:")
    return {"provider": provider, "repository": repository}, problems


def run_restic(args: list[str], env: dict[str, str], timeout: int = 900) -> subprocess.CompletedProcess:
    executable = shutil.which("restic")
    if not executable:
        raise FileNotFoundError("restic nao encontrado no PATH")
    return subprocess.run(
        [executable, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=env,
        timeout=timeout,
    )


def explain_failure(proc: subprocess.CompletedProcess, env: dict[str, str]) -> str:
    text = (proc.stderr or proc.stdout or "").strip()
    return redact(text, env)[:800]


def parse_snapshot_id(output: str) -> str | None:
    for line in reversed(output.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        snapshot = payload.get("snapshot_id")
        if snapshot:
            return str(snapshot)
    return None


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def command_check(env: dict[str, str]) -> int:
    info, problems = validate_env(env)
    print(f"Provedor: {info['provider']}")
    print(f"Repositorio: {mask_repo_url(info['repository']) if info['repository'] else 'ausente'}")
    for problem in problems:
        print(f"FALHA: {problem}")
    if problems:
        return 2
    try:
        proc = run_restic(["cat", "config"], env)
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        print(f"FALHA: {error}")
        return 3
    if proc.returncode != 0:
        print("Repositorio inacessivel ou ainda nao inicializado.")
        print(explain_failure(proc, env))
        return 4
    print("Repositorio: acessivel para leitura (nenhum dado foi enviado).")
    return 0


def command_init(env: dict[str, str], confirmed: bool) -> int:
    if not confirmed:
        print("Recusado: init cria repositorio remoto e pode gerar custo. Use --yes.")
        return 5
    info, problems = validate_env(env)
    if problems:
        for problem in problems:
            print(f"FALHA: {problem}")
        return 2
    try:
        proc = run_restic(["init"], env)
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        print(f"FALHA: {error}")
        return 3
    if proc.returncode != 0:
        print("Falha ao inicializar:")
        print(explain_failure(proc, env))
        return 4
    print(f"Repositorio inicializado em {mask_repo_url(info['repository'])}.")
    return 0


def command_backup(env: dict[str, str], source: Path, confirmed: bool) -> int:
    if not confirmed:
        print("Recusado: backup remoto pode gerar custo. Use --yes.")
        return 5
    if not source.exists():
        print(f"FALHA: caminho inexistente: {source}")
        return 2
    info, problems = validate_env(env)
    if problems:
        for problem in problems:
            print(f"FALHA: {problem}")
        return 2
    print(f"Enviando {source} para {mask_repo_url(info['repository'])} (custo pay-as-you-go).")
    try:
        proc = run_restic(["backup", "--json", "--tag", TAG, str(source)], env)
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        print(f"FALHA: {error}")
        return 3
    if proc.returncode != 0:
        print("Falha no backup:")
        print(explain_failure(proc, env))
        return 4
    snapshot = parse_snapshot_id(proc.stdout)
    print(f"Backup: OK; snapshot {snapshot[:8] if snapshot else '(id nao lido)'}.")
    return 0


def command_restore_check(env: dict[str, str], confirmed: bool) -> int:
    if not confirmed:
        print("Recusado: o teste envia alguns KB ao provedor. Use --yes.")
        return 5
    _, problems = validate_env(env)
    if problems:
        for problem in problems:
            print(f"FALHA: {problem}")
        return 2
    source_dir = Path(tempfile.mkdtemp(prefix="fc-backup-src-"))
    restore_dir = Path(tempfile.mkdtemp(prefix="fc-backup-dst-"))
    try:
        text_file = source_dir / "verificacao.txt"
        text_file.write_text("framechester restore check\n", encoding="utf-8")
        blob_file = source_dir / "blob.bin"
        blob_file.write_bytes(os.urandom(4096))
        proc = run_restic(["backup", "--json", "--tag", TAG, str(source_dir)], env)
        if proc.returncode != 0:
            print("Falha no backup de teste:")
            print(explain_failure(proc, env))
            return 4
        snapshot = parse_snapshot_id(proc.stdout)
        if not snapshot:
            print("FALHA: snapshot id nao retornado.")
            return 4
        restore = run_restic(["restore", snapshot, "--target", str(restore_dir)], env)
        if restore.returncode != 0:
            print(f"Falha no restore (codigo {restore.returncode}); destino pode estar parcial.")
            print("Presenca ou hashes de dois arquivos nao validam metadados nem o snapshot completo.")
            print(explain_failure(restore, env))
            return 4
        restored = {path.name: path for path in restore_dir.rglob("*") if path.is_file()}
        for name in ("verificacao.txt", "blob.bin"):
            original = source_dir / name
            restored_path = restored.get(name)
            if restored_path is None:
                print(f"FALHA: {name} nao restaurado")
                return 4
            if sha256(original) != sha256(restored_path):
                print(f"FALHA: hash divergente em {name}")
                return 4
        print("Restore: OK; SHA-256 identico para os 2 arquivos sinteticos.")
        forget = run_restic(["forget", snapshot], env)
        if forget.returncode == 0:
            print("Snapshot de teste removido (dados ficam ate um prune).")
        return 0
    except (FileNotFoundError, subprocess.TimeoutExpired) as error:
        print(f"FALHA: {error}")
        return 3
    finally:
        shutil.rmtree(source_dir, ignore_errors=True)
        shutil.rmtree(restore_dir, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    configure_stdout()
    parser = argparse.ArgumentParser(description="Verifica backup restic B2/R2 sem expor segredos")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="somente leitura do repositorio")
    mode.add_argument("--init", action="store_true", help="cria o repositorio (custo)")
    mode.add_argument("--backup", metavar="CAMINHO", help="envia uma pasta (custo)")
    mode.add_argument("--restore-check", action="store_true", help="teste sintetico de ida e volta")
    parser.add_argument("--yes", action="store_true", help="confirma operacao que pode gerar custo")
    parser.add_argument("--env-file", help="arquivo .env local (nao versionado)")
    parser.add_argument("--repo", help="sobrescreve RESTIC_REPOSITORY")
    args = parser.parse_args(argv)

    env = dict(os.environ)
    if args.env_file:
        env.update(load_env_file(args.env_file))
    if args.repo:
        env["RESTIC_REPOSITORY"] = args.repo

    if args.init:
        return command_init(env, args.yes)
    if args.backup:
        return command_backup(env, Path(args.backup), args.yes)
    if args.restore_check:
        return command_restore_check(env, args.yes)
    return command_check(env)


if __name__ == "__main__":
    raise SystemExit(main())
