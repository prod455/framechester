#!/usr/bin/env python3
"""Generate original diagrams and moving clips for the offline vertical pilot.

Requires optional Pillow and an existing FFmpeg executable. No network, account,
real media or paid API is used. Output files are reproducible demonstration assets,
not evidence of editorial approval, platform publication or revenue.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/piloto-multicanal/media"))
    parser.add_argument("--ffmpeg", default="ffmpeg")
    args = parser.parse_args()
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as error:
        parser.error(f"Pillow is required only for this demonstration: {error}")

    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    background = "#0c1426"
    panel = "#16233a"
    white = "#f1f6ff"
    muted = "#acbbd3"
    cyan = "#5be2dd"
    amber = "#ffd07c"

    def font(size: int, bold: bool = False):
        candidates = [
            Path("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
            Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]
        for candidate in candidates:
            if candidate.is_file():
                return ImageFont.truetype(str(candidate), size)
        return ImageFont.load_default(size=size)

    def center(draw, text, y, size=38, color=white, bold=False, x=360):
        face = font(size, bold)
        box = draw.textbbox((0, 0), text, font=face)
        draw.text((x - (box[2] - box[0]) / 2, y), text, font=face, fill=color)

    def base(number, lines, subline):
        image = Image.new("RGB", (720, 1280), background)
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((54, 65, 245, 110), radius=15, fill=panel)
        draw.text((74, 74), "FRAMECHESTER", font=font(18, True), fill=cyan)
        draw.text((576, 77), f"0{number + 1} / 04", font=font(25), fill=muted)
        for index, line in enumerate(lines):
            center(draw, line, 155 + index * 65, 52, white, True)
        center(draw, subline, 310, 29, muted)
        draw.rounded_rectangle((54, 382, 666, 970), radius=28, fill=panel)
        draw.line((70, 1197, 650, 1197), fill="#273951", width=2)
        center(draw, "DIAGRAMA ORIGINAL · PILOTO REVISÁVEL", 1220, 21, muted)
        return image, draw

    def abstract_scene(draw, box, scale=1.0):
        left, top, right, bottom = box
        width, height = right - left, bottom - top
        draw.rectangle(box, fill="#1c4254")
        draw.line((left, top + height * .75, right, top + height * .75), fill="#426575", width=3)
        radius = min(width, height) * .21 * scale
        cx, cy = left + width / 2, top + height / 2
        draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), fill=cyan)
        for ratio in (.13, .87):
            cx = left + width * ratio
            draw.polygon(((cx, top + height*.32), (cx-width*.07, top+height*.65), (cx+width*.07, top+height*.65)), fill=amber)

    images = []
    image, draw = base(0, ["Vertical não significa", "mais pixels"], "Proporção e quantidade são coisas diferentes")
    center(draw, "LARGURA × ALTURA", 409, 25, muted)
    draw.rounded_rectangle((96, 510, 416, 690), radius=10, outline=cyan, width=5)
    for x in range(116, 416, 20):
        draw.line((x, 514, x, 686), fill="#315965", width=1)
    for y in range(530, 690, 20):
        draw.line((100, y, 412, y), fill="#315965", width=1)
    draw.rounded_rectangle((478, 470, 622, 726), radius=10, outline=amber, width=5)
    for x in range(494, 622, 16):
        draw.line((x, 474, x, 722), fill="#655838", width=1)
    for y in range(486, 726, 16):
        draw.line((482, y, 618, y), fill="#655838", width=1)
    center(draw, "1920 × 1080", 711, 29, cyan, x=255)
    center(draw, "1080 × 1920", 755, 27, amber, x=550)
    center(draw, "2.073.600", 824, 65, white, True)
    center(draw, "pixels em ambos", 906, 29, muted)
    images.append(image)

    image, draw = base(1, ["Recortar é escolher", "o que fica"], "CROP · RECORTAR")
    abstract_scene(draw, (83, 485, 637, 797))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shade = ImageDraw.Draw(overlay)
    shade.rectangle((83, 485, 271, 797), fill=(12, 20, 38, 160))
    shade.rectangle((449, 485, 637, 797), fill=(12, 20, 38, 160))
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image)
    draw.rectangle((272, 485, 448, 797), outline=cyan, width=6)
    center(draw, "9:16", 814, 39, cyan, True)
    center(draw, "áreas laterais fora do quadro", 894, 29, muted)
    images.append(image)

    image, draw = base(2, ["Bordas preservam", "a cena inteira"], "PAD · ADICIONAR BORDAS")
    draw.rounded_rectangle((216, 417, 504, 929), radius=12, fill="#23364c", outline=cyan, width=4)
    abstract_scene(draw, (220, 592, 500, 750))
    center(draw, "BORDA", 491, 28, muted)
    center(draw, "BORDA", 828, 28, muted)
    draw.line((96, 671, 198, 671), fill=amber, width=4)
    draw.polygon(((204,671),(190,662),(190,680)),fill=amber)
    center(draw, "conteúdo", 633, 22, amber, x=136)
    images.append(image)

    image, draw = base(3, ["Formato não é", "monetização"], "Antes de exportar, confira:")
    items = [("01", "Dimensões", "quadro quadrado ou vertical"),
             ("02", "Enquadramento", "o assunto continua visível?"),
             ("03", "Legendas", "leitura clara no celular"),
             ("04", "Monetização", "depende de outros requisitos")]
    for index, (number, title, subtitle) in enumerate(items):
        y=427+index*129
        draw.rounded_rectangle((83,y,147,y+60),radius=15,fill="#244757")
        center(draw,number,y+10,30,cyan,True,x=115)
        draw.text((174,y),title,font=font(38,True),fill=white)
        draw.text((174,y+55),subtitle,font=font(24),fill=muted)
    images.append(image)

    manifests=[]
    for index, image in enumerate(images):
        png=output_dir/f"cena-{index:02d}.png"
        clip=output_dir/f"cena-{index:02d}.mp4"
        image.save(png)
        motion=("scale=1440:2560,"
                "zoompan=z='1+0.04*on/719':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=360x640:fps=30,"
                "format=yuv420p")
        command=[args.ffmpeg,"-y","-hide_banner","-loglevel","error","-loop","1","-i",str(png),
                 "-vf",motion,"-frames:v","720","-an","-c:v","libx264","-preset","veryfast",
                 "-crf","18","-movflags","+faststart",str(clip)]
        subprocess.run(command,check=True)
        manifests.append({
            "scene_id":index,
            "kind":"video",
            "path":clip.name,
            "license":"arte original de demonstracao, Apache-2.0",
            "provenance":"Diagrama original Framechester gerado por scripts/gerar_assets_piloto.py; sem midia de terceiros; tipografia rasterizada, arquivo de fonte nao redistribuido.",
            "checksum":hashlib.sha256(clip.read_bytes()).hexdigest(),
            "restrictions":"Demonstracao revisavel com movimento ilustrativo; nao representa conta real, aprovacao editorial, publicacao nem receita. Conferir direitos da voz separadamente."
        })
        print(f"scene {index}: original PNG 720x1280; MP4 360x640, 24s, SHA256 {manifests[-1]['checksum']}")
    (output_dir/"assets.json").write_text(json.dumps(manifests,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("assets.json: four original local clips; no network used")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
