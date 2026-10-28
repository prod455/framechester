#!/usr/bin/env python3
"""Configura e valida OAuth do YouTube com isolamento opcional por canal.

Uso:
    python scripts/verificar_youtube.py --config
    python scripts/verificar_youtube.py --auth
    python scripts/verificar_youtube.py --check
    python scripts/verificar_youtube.py --config --channel ciencia
    python scripts/verificar_youtube.py --check --channel ciencia --expected-channel-id <id>

Seguranca: tokens ficam em ~/.framechester, nunca no repositorio; nada e publicado.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels"
SCOPES = (
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
)
DEFAULT_PORT = 8765
CALLBACK_PATH = "/"


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def home_dir() -> Path:
    base = os.environ.get("FRAMECHESTER_HOME")
    return Path(base) if base else Path.home() / ".framechester"


def channel_home(channel: str) -> Path:
    reserved = {"con", "prn", "aux", "nul"}
    reserved.update(f"{prefix}{number}" for prefix in ("com", "lpt") for number in range(1, 10))
    if (not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?", channel)
            or len(channel) > 64 or channel in reserved):
        raise ValueError("--channel deve ser um slug de ate 64 caracteres minusculos, numeros e hifens")
    root = (home_dir() / "channels").resolve()
    directory = (root / channel).resolve()
    if directory.parent != root or directory.name != channel:
        raise ValueError("diretorio do canal redireciona para outro local")
    return directory


def scoped_path(explicit: str | None, channel: str, filename: str) -> Path:
    root = channel_home(channel)
    path = (Path(explicit) if explicit else root / filename).resolve()
    if not path.is_relative_to(root):
        raise ValueError("caminho de credencial deve permanecer no diretorio do canal")
    return path


def client_secret_path(explicit: str | None, channel: str | None = None) -> Path:
    if channel is not None:
        return scoped_path(explicit, channel, "client_secret.json")
    if explicit:
        return Path(explicit)
    from_env = os.environ.get("YOUTUBE_CLIENT_SECRET")
    return Path(from_env) if from_env else home_dir() / "client_secret.json"


def token_path(explicit: str | None, channel: str | None = None) -> Path:
    if channel is not None:
        return scoped_path(explicit, channel, "youtube_token.json")
    if explicit:
        return Path(explicit)
    from_env = os.environ.get("YOUTUBE_TOKEN_FILE")
    return Path(from_env) if from_env else home_dir() / "youtube_token.json"


def parse_client_secret(data: dict) -> tuple[str, dict]:
    if not isinstance(data, dict):
        raise ValueError("client_secret.json invalido: raiz nao e um objeto JSON")
    for kind in ("installed", "web"):
        block = data.get(kind)
        if isinstance(block, dict) and block.get("client_id") and block.get("client_secret"):
            return kind, block
    raise ValueError("client_secret.json invalido: falta bloco installed/web com client_id e client_secret")


def load_client_secret(path: Path) -> tuple[str, dict]:
    if not path.exists():
        raise FileNotFoundError(f"client_secret.json nao encontrado em {path}")
    with path.open(encoding="utf-8") as handle:
        return parse_client_secret(json.load(handle))


def build_auth_url(client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{AUTH_URL}?{urllib.parse.urlencode(params)}"


def missing_scopes(granted: str) -> list[str]:
    have = set(granted.split())
    return [scope for scope in SCOPES if scope not in have]


def token_is_expired(token: dict, margin: int = 60) -> bool:
    expires_at = token.get("expires_at")
    if not isinstance(expires_at, (int, float)):
        return True
    return time.time() >= float(expires_at) - margin


def post_form(url: str, data: dict) -> tuple[int, dict]:
    request = urllib.request.Request(
        url,
        data=urllib.parse.urlencode(data).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded", "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload


def exchange_code(client: dict, code: str, redirect_uri: str) -> dict:
    status, payload = post_form(
        TOKEN_URL,
        {
            "code": code,
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
    )
    if status != 200:
        raise RuntimeError(f"falha ao trocar codigo por token (HTTP {status})")
    payload["expires_at"] = int(time.time()) + int(payload.get("expires_in", 3600))
    return payload


def refresh_token(client: dict, token: dict) -> dict:
    refresh = token.get("refresh_token")
    if not refresh:
        raise RuntimeError("token salvo nao tem refresh_token; rode --auth novamente")
    status, payload = post_form(
        TOKEN_URL,
        {
            "client_id": client["client_id"],
            "client_secret": client["client_secret"],
            "refresh_token": refresh,
            "grant_type": "refresh_token",
        },
    )
    if status != 200:
        raise RuntimeError(f"falha ao renovar token (HTTP {status})")
    token.update(payload)
    token["expires_at"] = int(time.time()) + int(payload.get("expires_in", 3600))
    return token


def write_private_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass


class CallbackHandler(BaseHTTPRequestHandler):
    outcome: dict = {}

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != CALLBACK_PATH:
            self.send_response(404)
            self.end_headers()
            return
        params = urllib.parse.parse_qs(parsed.query)
        if "code" not in params and "error" not in params:
            self.send_response(400)
            self.end_headers()
            return
        type(self).outcome = {name: values[0] for name, values in params.items()}
        body = "<html><body><p>Autorizacao recebida. Pode fechar esta aba.</p></body></html>"
        encoded = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, *args: object) -> None:
        return


def run_oauth_flow(client: dict, port: int, timeout_seconds: int = 300) -> dict:
    state = secrets.token_urlsafe(24)
    redirect_uri = f"http://127.0.0.1:{port}{CALLBACK_PATH}"
    url = build_auth_url(client["client_id"], redirect_uri, state)
    CallbackHandler.outcome = {}
    server = HTTPServer(("127.0.0.1", port), CallbackHandler)
    server.timeout = 5
    print("Abrindo o navegador para consentimento. Se nao abrir, use a URL:")
    print(url)
    webbrowser.open(url)
    deadline = time.time() + timeout_seconds
    while time.time() < deadline and not CallbackHandler.outcome:
        server.handle_request()
    server.server_close()
    outcome = CallbackHandler.outcome
    if not outcome:
        raise TimeoutError("tempo esgotado aguardando o callback do Google")
    if outcome.get("error"):
        raise RuntimeError(f"consentimento negado: {outcome['error']}")
    if outcome.get("state") != state:
        raise RuntimeError("state do callback nao confere; refaca --auth")
    return exchange_code(client, outcome["code"], redirect_uri)


def fetch_channel(access_token: str) -> tuple[int, dict]:
    request = urllib.request.Request(
        f"{CHANNELS_URL}?part=snippet&mine=true",
        headers={"Authorization": f"Bearer {access_token}", "accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            payload = json.loads(error.read().decode("utf-8", errors="replace"))
        except json.JSONDecodeError:
            payload = {}
        return error.code, payload


def report_channel(payload: dict) -> None:
    items = payload.get("items")
    if not items:
        print("Canal: nenhum canal encontrado nesta conta Google.")
        print("Crie o canal no YouTube (1 canal, 3 series) e rode --check novamente.")
        return
    snippet = items[0].get("snippet", {})
    print(f"Canal: {snippet.get('title', '(sem titulo)')}")
    print(f"Channel ID: {items[0].get('id', '(desconhecido)')}")


def command_config(client_path: Path, token_file: Path) -> int:
    print(f"client_secret: {client_path}")
    print(f"token: {token_file}")
    try:
        kind, client = load_client_secret(client_path)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"FALHA: {error}")
        print("Checklist no Google Cloud Console:")
        print("  1. Ative YouTube Data API v3 e YouTube Analytics API.")
        print("  2. OAuth consent screen: External/Testing; escopos youtube.upload, youtube.readonly, yt-analytics.readonly.")
        print("  3. Credencial OAuth tipo Desktop app; baixe o JSON e salve como client_secret.json.")
        return 2
    print(f"Tipo de cliente: {kind}")
    redirect = client.get("redirect_uris", [])
    if kind == "web":
        print("AVISO: cliente Web exige registrar http://127.0.0.1:8765/ nos redirect URIs.")
        print(f"Redirects registrados: {redirect or '(nenhum)'}")
    print(f"Client ID presente ({len(client['client_id'])} chars); secret nao exibido.")
    print("Proximo passo: --auth")
    return 0


def validate_token_binding(token: dict, expected_channel_id: str | None) -> None:
    if expected_channel_id and token.get("youtube_channel_id") not in (None, expected_channel_id):
        raise ValueError("token vinculado a outro canal; credenciais nao foram alteradas")


def validate_channel_identity(payload: dict, expected_channel_id: str | None) -> None:
    if not expected_channel_id:
        return
    items = payload.get("items") if isinstance(payload, dict) else None
    if (not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict)
            or items[0].get("id") != expected_channel_id):
        raise ValueError("canal autenticado ausente, ambiguo ou diferente do esperado; token nao salvo")


def command_auth(client_path: Path, token_file: Path, port: int,
                 expected_channel_id: str | None = None) -> int:
    try:
        _, client = load_client_secret(client_path)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"FALHA: {error}")
        return 2
    try:
        token = run_oauth_flow(client, port)
    except (OSError, RuntimeError, TimeoutError) as error:
        print(f"FALHA: {error}")
        return 3
    if not isinstance(token, dict) or not isinstance(token.get("access_token"), str) or not token["access_token"]:
        print("FALHA: resposta OAuth sem access_token valido; token nao salvo.")
        return 3
    scopes = missing_scopes(token.get("scope", ""))
    if scopes:
        print("AVISO: escopos nao concedidos: " + ", ".join(scopes))
    try:
        status, payload = fetch_channel(token["access_token"])
        if status != 200:
            print(f"FALHA ao consultar o canal (HTTP {status}). Token nao salvo.")
            return 4
        validate_channel_identity(payload, expected_channel_id)
    except (OSError, ValueError) as error:
        print(f"FALHA: {error}")
        return 4
    if expected_channel_id:
        token["youtube_channel_id"] = expected_channel_id
    write_private_json(token_file, token)
    print(f"Token salvo em {token_file} (fora do repositorio).")
    if expected_channel_id:
        print("Canal esperado verificado e vinculado ao token.")
    else:
        report_channel(payload)
    return 0


def command_check(client_path: Path, token_file: Path,
                  expected_channel_id: str | None = None) -> int:
    try:
        _, client = load_client_secret(client_path)
    except (FileNotFoundError, ValueError, json.JSONDecodeError) as error:
        print(f"FALHA: {error}")
        return 2
    if not token_file.exists():
        print(f"FALHA: token nao encontrado em {token_file}; rode --auth")
        return 2
    try:
        token = json.loads(token_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("FALHA: token.json invalido; rode --auth novamente")
        return 2
    if not isinstance(token, dict):
        print("FALHA: token.json invalido; rode --auth novamente")
        return 2
    if not isinstance(token.get("access_token"), str) or not token["access_token"]:
        print("FALHA: token sem access_token valido; rode --auth novamente")
        return 2
    refreshed = False
    needs_binding = expected_channel_id and token.get("youtube_channel_id") is None
    try:
        validate_token_binding(token, expected_channel_id)
        if token_is_expired(token):
            token = refresh_token(client, token)
            refreshed = True
    except (RuntimeError, ValueError, OSError) as error:
        print(f"FALHA: {error}")
        return 3
    scopes = missing_scopes(token.get("scope", ""))
    if scopes:
        print("AVISO: escopos ausentes: " + ", ".join(scopes))
    try:
        status, payload = fetch_channel(token["access_token"])
        if status != 200:
            print(f"FALHA ao consultar o canal (HTTP {status}). Rode --auth se o token expirou.")
            return 4
        validate_channel_identity(payload, expected_channel_id)
    except (ValueError, OSError) as error:
        print(f"FALHA: {error}")
        return 4
    if expected_channel_id:
        token["youtube_channel_id"] = expected_channel_id
    if refreshed or needs_binding:
        write_private_json(token_file, token)
    if refreshed:
        print("Token renovado e canal verificado.")
    if expected_channel_id:
        print("Canal esperado verificado.")
    else:
        report_channel(payload)
    print("OAuth: OK (somente leitura; nada foi publicado).")
    return 0


def main(argv: list[str] | None = None) -> int:
    configure_stdout()
    parser = argparse.ArgumentParser(description="Configura/valida OAuth do YouTube por canal")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--config", action="store_true", help="valida o client_secret.json")
    mode.add_argument("--auth", action="store_true", help="abre o consentimento OAuth")
    mode.add_argument("--check", action="store_true", help="valida token e canal")
    parser.add_argument("--client-secret", help="caminho do client_secret.json")
    parser.add_argument("--token-file", help="caminho do token.json")
    parser.add_argument("--channel", help="slug local; isola credenciais em FRAMECHESTER_HOME/channels/<slug>")
    parser.add_argument("--expected-channel-id", help="ID YouTube esperado; obrigatorio com --channel em auth/check")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="porta local do callback")
    args = parser.parse_args(argv)

    try:
        secret_path = client_secret_path(args.client_secret, args.channel)
        token_file = token_path(args.token_file, args.channel)
        if secret_path.resolve() == token_file.resolve():
            raise ValueError("client_secret e token devem usar arquivos diferentes; nenhuma credencial foi alterada")
    except ValueError as error:
        parser.error(str(error))

    checking = args.check or (not args.auth and not args.config and token_file.exists())
    if args.channel is not None and (args.auth or checking) and not args.expected_channel_id:
        parser.error("--expected-channel-id e obrigatorio para autenticar ou verificar um --channel")
    if args.expected_channel_id is not None and not re.fullmatch(r"UC[A-Za-z0-9_-]{22}", args.expected_channel_id):
        parser.error("--expected-channel-id deve ser um ID de canal YouTube valido")

    if args.auth:
        return command_auth(secret_path, token_file, args.port, args.expected_channel_id)
    if args.check:
        return command_check(secret_path, token_file, args.expected_channel_id)
    if args.config or not token_file.exists():
        return command_config(secret_path, token_file)
    return command_check(secret_path, token_file, args.expected_channel_id)


if __name__ == "__main__":
    raise SystemExit(main())
