"""Cuts out an owl generated on a black background: the background connected to the edges becomes transparent.

Usage: python -I tools/cutout_owl.py <input.png> <output.png> [max_size]
"""
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter


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
    from PIL import ImageDraw as _D
    _D.Draw(alpha).rectangle((0, 0, w - 1, h - 1), outline=0, width=3)
    out.putalpha(alpha)
    bbox = alpha.point(lambda v: 255 if v > 20 else 0).getbbox()
    if bbox:
        pad = 8
        bbox = (max(0, bbox[0] - pad), max(0, bbox[1] - pad), min(w, bbox[2] + pad), min(h, bbox[3] + pad))
        out = out.crop(bbox)
    out.thumbnail((size, size), Image.LANCZOS)
    out.save(dst, optimize=True)
    print(dst, out.size)


if __name__ == "__main__":
    cut(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 640)
