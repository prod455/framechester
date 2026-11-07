"""Gera os personagens 3D com FLUX.1 [schnell] (Apache-2.0) e tira o fundo com BiRefNet (MIT).

Uso: python ia/personagens.py [--sobrescrever] [--passos 4]
Precisa de GPU com ~16 GB (ou Mac com 32 GB); em CPU funciona, mas leva vários minutos por imagem.
"""

import argparse
import sys

from comum import FLUX, PUBLICO, caixa_com_margem, ler_anuncio, licenca_confere, personagens, prompt_completo, semente


def dispositivo():
    import torch

    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    if torch.backends.mps.is_available():
        return "mps", torch.bfloat16
    return "cpu", torch.float32


def conferir_licenca(repo: str, esperada: str) -> None:
    from huggingface_hub import model_info

    declarada = (model_info(repo).card_data or {}).get("license")
    if not licenca_confere(declarada, esperada):
        sys.exit(f"{repo} declara licença {declarada!r}, não {esperada!r}: geração bloqueada.")


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--sobrescrever", action="store_true")
    p.add_argument("--passos", type=int, default=4)
    a = p.parse_args()

    pendentes = [c for c in personagens(ler_anuncio()) if a.sobrescrever or not (PUBLICO / c["imagem"]).exists()]
    if not pendentes:
        print("Todos os personagens já existem. Use --sobrescrever para gerar de novo.")
        return 0

    conferir_licenca(*FLUX)
    import torch
    from diffusers import FluxPipeline
    from rembg import new_session, remove

    disp, tipo = dispositivo()
    pipe = FluxPipeline.from_pretrained(FLUX[0], torch_dtype=tipo)
    if disp == "cuda":
        pipe.enable_model_cpu_offload()
    else:
        pipe.to(disp)
    recorte = new_session("birefnet-general")

    for cena in pendentes:
        prompt = prompt_completo(cena["prompt"])
        imagem = pipe(
            prompt,
            guidance_scale=0.0,
            num_inference_steps=a.passos,
            max_sequence_length=256,
            height=1024,
            width=1024,
            generator=torch.Generator("cpu").manual_seed(semente(prompt)),
        ).images[0]
        sem_fundo = remove(imagem, session=recorte)
        caixa = sem_fundo.getchannel("A").getbbox()
        if caixa is None:
            sys.exit(f"{cena['imagem']}: o recorte apagou a imagem inteira; mude o prompt.")
        quadrado = sem_fundo.crop(caixa_com_margem(caixa)).resize((1024, 1024))
        destino = PUBLICO / cena["imagem"]
        destino.parent.mkdir(parents=True, exist_ok=True)
        quadrado.save(destino)
        print(f"public/{cena['imagem']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
