#!/usr/bin/env python3
"""Valida a API key da Anthropic sem gerar conteudo e sem expor o segredo.

Uso:
    python scripts/verificar_anthropic.py
    python scripts/verificar_anthropic.py --offline
    python scripts/verificar_anthropic.py --env-file .env.local

Saida: codigo 0 quando a chave responde; 1 para formato suspeito; 2 sem chave.
Nenhuma inferencia paga e executada: apenas listagem de modelos.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = "https://api.anthropic.com"
API_VERSION = "2023-06-01"
KEY_VARS = ("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def describe_secret(value: str) -> str:
    if not value:
        return "ausente"
    return f"presente ({len(value)} chars)"


def find_key(env: dict[str, str]) -> tuple[str | None, str | None]:
    for name in KEY_VARS:
        value = env.get(name)
        if value:
            return name, value
    return None, None


def validate_key_format(key: str) -> list[str]:
    problems: list[str] = []
    if key != key.strip():
        problems.append("a chave tem espacos no inicio/fim")
    if len(key) < 20:
        problems.append("a chave parece curta demais")
    if key.startswith("sk-ant-oat"):
        problems.append("isto parece token OAuth do Claude Code, nao API key do Console")
    if any(char in key for char in "\r\n"):
        problems.append("a chave contem quebra de linha")
    if key.startswith("sk-ant-api") is False and key.startswith("sk-ant-"):
        problems.append("prefixo de chave nao reconhecido; confirme se veio do Console")
    return problems


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


def list_models(key: str, base_url: str = API_BASE, timeout: float = 30.0) -> tuple[int, dict]:
    url = f"{base_url.rstrip('/')}/v1/models?limit=1000"
    request = urllib.request.Request(
        url,
        headers={
            "x-api-key": key,
            "anthropic-version": API_VERSION,
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload
    except urllib.error.URLError as error:
        return 0, {"error": {"message": f"falha de rede: {error.reason}"}}


def model_ids(payload: dict) -> list[str]:
    data = payload.get("data")
    if not isinstance(data, list):
        return []
    return sorted(str(item.get("id", "")) for item in data if item.get("id"))


def suggest_model(ids: list[str]) -> str | None:
    for needle in ("sonnet", "haiku", "opus"):
        for model in ids:
            if needle in model:
                return model
    return ids[0] if ids else None


def main(argv: list[str] | None = None) -> int:
    configure_stdout()
    parser = argparse.ArgumentParser(description="Verifica a API key da Anthropic sem expor o segredo")
    parser.add_argument("--env-file", help="arquivo .env local (nao versionado)")
    parser.add_argument("--offline", action="store_true", help="nao faz chamada de rede")
    args = parser.parse_args(argv)

    env = dict(os.environ)
    if args.env_file:
        env.update(load_env_file(args.env_file))

    name, key = find_key(env)
    print(f"Chave: {name or 'nao encontrada'} -> {describe_secret(key or '')}")
    if not key:
        print("Defina ANTHROPIC_API_KEY no cofre local; nunca no repositorio.")
        return 2

    problems = validate_key_format(key)
    for problem in problems:
        print(f"AVISO: {problem}")

    if args.offline:
        print("Offline: nenhuma chamada de rede executada.")
        return 1 if problems else 0

    status, payload = list_models(key)
    if status == 200:
        ids = model_ids(payload)
        print(f"API: OK (HTTP {status}); {len(ids)} modelo(s) visivel(is)")
        suggested = suggest_model(ids)
        if suggested:
            print(f"Modelo sugerido: defina ANTHROPIC_MODEL={suggested}")
        for model in ids[:10]:
            print(f"  - {model}")
        print("Custo: listagem de modelos nao consome inferencia.")
        return 0

    message = ""
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            message = str(error.get("message", ""))[:200]
    print(f"API: FALHOU (HTTP {status}) {message}".rstrip())
    if status in (401, 403):
        print("A chave foi recusada. Confirme que veio de console.anthropic.com e que ha credito/limite.")
    return 3


if __name__ == "__main__":
    raise SystemExit(main())
