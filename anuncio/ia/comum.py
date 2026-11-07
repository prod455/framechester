"""Partes puras dos scripts de IA local (sem torch): testadas por tests/test_ia.py."""

import hashlib
import json
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PUBLICO = RAIZ / "public"
SAIDA = RAIZ / "out"

# Modelos com licença comercial conferida. O script confere a licença declarada no
# Hugging Face antes de baixar: se o autor mudar a licença, a geração para.
FLUX = ("black-forest-labs/FLUX.1-schnell", "apache-2.0")
OPENVOICE = ("myshell-ai/OpenVoiceV2", "mit")
OPENVOICE_COMMIT = "74a1d147b17a8c3092dd5430504bd83ef6c7eb23"

# Mesmo começo em todos os personagens, para sair tudo no mesmo estilo. O FLUX não gera
# transparência: o fundo liso é removido depois pelo BiRefNet (rembg).
ESTILO = (
    "Premium 3D character render in the style of a glossy soft-touch vinyl toy: smooth rounded shapes, "
    "cute face with big glossy black eyes, pink blush cheeks, soft studio lighting, pastel colors, "
    "centered, full body, isolated on a plain flat light gray background, no text, no shadow on the floor. "
    "SUBJECT: "
)


def arquivo_do_anuncio(raiz: pathlib.Path = RAIZ) -> pathlib.Path:
    proprio = raiz / "anuncio.json"
    return proprio if proprio.exists() else raiz / "anuncio.exemplo.json"


def ler_anuncio(raiz: pathlib.Path = RAIZ) -> dict:
    return json.loads(arquivo_do_anuncio(raiz).read_text(encoding="utf-8"))


def personagens(anuncio: dict) -> list[dict]:
    return [c for c in anuncio["cenas"] if c["tipo"] == "personagem"]


def narracao(anuncio: dict) -> str:
    return " ".join(c["frase"] for c in anuncio["cenas"])


def prompt_completo(subject: str) -> str:
    return ESTILO + subject.strip()


def semente(texto: str) -> int:
    """Semente fixa por prompt: o mesmo roteiro gera o mesmo personagem."""
    return int.from_bytes(hashlib.sha256(texto.encode("utf-8")).digest()[:4], "big")


def licenca_confere(declarada: object, esperada: str) -> bool:
    return isinstance(declarada, str) and declarada.strip().lower() == esperada


def trechos(total: int, taxa: int, segundos: float = 6.0, minimo: float = 2.0) -> list[tuple[int, int]]:
    """Divide um áudio em trechos de ~`segundos` para extrair o timbre; descarta sobra curta."""
    if total <= 0 or taxa <= 0:
        raise ValueError("áudio vazio")
    passo = int(segundos * taxa)
    partes = [(i, min(i + passo, total)) for i in range(0, total, passo)]
    partes = [p for p in partes if p[1] - p[0] >= int(minimo * taxa)]
    if not partes:
        raise ValueError(f"áudio com menos de {minimo:.0f} s")
    return partes


def caixa_com_margem(caixa: tuple[int, int, int, int], margem: float = 0.08) -> tuple[int, int, int, int]:
    """Quadrado centrado na figura, com margem: o personagem ocupa o PNG sem cortar."""
    x0, y0, x1, y1 = caixa
    lado = max(x1 - x0, y1 - y0)
    lado = int(round(lado * (1 + 2 * margem)))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    esquerda = int(round(cx - lado / 2))
    topo = int(round(cy - lado / 2))
    return esquerda, topo, esquerda + lado, topo + lado
