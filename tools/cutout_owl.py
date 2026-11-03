"""Owl tooling: cut-out and sprite sheet.

Cut out an owl generated on a black background (the background connected to the edges becomes transparent):
    python -I tools/cutout_owl.py <input.png> <output.png> [max_size]

Pack cut-out poses into one sprite sheet (one row, equal cells, bottom-centred, a 2 px ivory rim baked into
the alpha so the launcher needs no CSS filter), plus a small original feather:
    python -I tools/cutout_owl.py --sheet app/assets/owl-sheet.webp app/assets/owl-perch.png app/assets/owl-look.png ...
    python -I tools/cutout_owl.py --feather app/assets/feather.webp
The sheet order is the order of the arguments; owl.js reads the same order from its `cells` option.
"""
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter

IVORY = (0xF1, 0xEB, 0xDD)


def cut(src: str, dst: str, size: int = 640) -> None:
    img = Image.open(src).convert("RGB")
    lum = img.convert("L")
    # Dark pixels = background candidates; keep only those connected to the edges.
    dark = lum.point(lambda v: 255 if v < 34 else 0)
    w, h = dark.size
    seeds = [(x, 0) for x in range(0, w, 16)] + [(x, h - 1) for x in range(0, w, 16)]
    seeds += [(0, y) for y in range(0, h, 16)] + [(w - 1, y) for y in range(0, h, 16)]
    for s in seeds:
        if dark.getpixel(s) == 255:
            ImageDraw.floodfill(dark, s, 128)
    bg = dark.point(lambda v: 255 if v == 128 else 0)
    alpha = ImageChops.invert(bg).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.6))
    # Soft edge: a dark pixel on the rim stays partially transparent.
    soft = lum.point(lambda v: min(255, max(0, (v - 20) * 6)))
    edge = ImageChops.lighter(soft, alpha.filter(ImageFilter.MinFilter(5)))
    alpha = ImageChops.multiply(alpha, edge)
    out = img.convert("RGBA")
    # Border forced transparent: avoids a light fringe when the image is rotated.
    ImageDraw.Draw(alpha).rectangle((0, 0, w - 1, h - 1), outline=0, width=3)
    out.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    if bbox:
        pad = 8
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        out = out.crop(bbox)
    out.thumbnail((size, size), Image.LANCZOS)
    out.save(dst, optimize=True)
    print(dst, out.size)


def rim(img: Image.Image, px: int = 2, opacity: int = 110) -> Image.Image:
    """A soft ivory rim just outside the owl's alpha: replaces the CSS drop-shadow."""
    alpha = img.getchannel("A")
    grown = alpha.filter(ImageFilter.MaxFilter(px * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    ring = ImageChops.subtract(grown, alpha).point(lambda v: min(255, v * opacity // 255))
    halo = Image.new("RGBA", img.size, IVORY + (0,))
    halo.putalpha(ring)
    return Image.alpha_composite(halo, img)


def sheet(dst: str, srcs: list, cell_h: int = 640) -> None:
    poses = []
    for s in srcs:
        im = Image.open(s).convert("RGBA")
        scale = cell_h / im.height
        im = im.resize((max(1, round(im.width * scale)), cell_h), Image.LANCZOS)
        poses.append(rim(im))
    cell_w = max(p.width for p in poses) + 8
    out = Image.new("RGBA", (cell_w * len(poses), cell_h), (0, 0, 0, 0))
    for i, p in enumerate(poses):
        out.alpha_composite(p, (i * cell_w + (cell_w - p.width) // 2, cell_h - p.height))
    out.save(dst, "WEBP", quality=88, method=6)
    print(dst, out.size, "cells", len(poses), "cell", (cell_w, cell_h))


def feather(dst: str, w: int = 24, h: int = 48) -> None:
    """A small original feather: an ivory leaf shape with a darker shaft, soft alpha."""
    s = 8
    im = Image.new("RGBA", (w * s, h * s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((w * s * 0.18, 0, w * s * 0.82, h * s), fill=IVORY + (210,))
    d.line((w * s / 2, h * s * 0.05, w * s / 2, h * s * 0.98), fill=(0xC9, 0xA2, 0x4A, 230), width=s)
    for y in range(6, 44, 5):
        d.line((w * s / 2, y * s, w * s * 0.25, (y + 4) * s), fill=(0xE0, 0xD6, 0xC0, 120), width=max(1, s // 3))
        d.line((w * s / 2, y * s, w * s * 0.75, (y + 4) * s), fill=(0xE0, 0xD6, 0xC0, 120), width=max(1, s // 3))
    im = im.resize((w, h), Image.LANCZOS)
    im.save(dst, "WEBP", quality=90, method=6)
    print(dst, im.size)


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--sheet":
        sheet(args[1], args[2:])
    elif args and args[0] == "--feather":
        feather(args[1])
    else:
        cut(args[0], args[1], int(args[2]) if len(args) > 2 else 640)
