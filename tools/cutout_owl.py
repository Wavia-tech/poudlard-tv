"""Owl tooling: cut-out and sprite sheet.

Cut out an owl generated on a black background (the background connected to the edges becomes transparent):
    python -I tools/cutout_owl.py <input.png> <output.png> [max_size]

Pack cut-out poses into one sprite sheet (a grid of 4 columns, equal cells of 320 x 248, bottom-centred, an ivory
rim baked into the alpha so the launcher needs no CSS filter), plus a small original feather:
    python -I tools/cutout_owl.py --sheet app/assets/owl-sheet.webp app/assets/owl-perch.png app/assets/owl-look.png ...
    python -I tools/cutout_owl.py --feather app/assets/feather.webp
The cells are read left to right, then top to bottom, in the order of the arguments (perch, look, sleep, up, down,
glide, land); owl.js reads the same order from its `cells` option and the grid from its `cols` option (4).
Cell size: twice the owl's largest box on screen at 960 x 540 CSS px (owl.css: 1.9 x 1.47 x 8.2 cqw = 150 x 116 px),
so 320 x 248 with a little margin for the flight's 1.045 scale; the sheet stays 1280 x 496, far below the 2048 px
texture limit of weak TV GPUs (the former one-row sheet of 825 x 640 cells was 5775 px wide, 15 MB decoded).

Repack an existing one-row sheet (cells of equal width, in order) into the grid, without the source poses:
    python -I tools/cutout_owl.py --regrid old-sheet.webp app/assets/owl-sheet.webp 7
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


CELL = (320, 248)   # cell size in the sheet (see the docstring)
COLS = 4


def grid(dst: str, cells: list) -> None:
    """Lays RGBA cells (already CELL-sized) out left to right, top to bottom, COLS per row."""
    rows = (len(cells) + COLS - 1) // COLS
    out = Image.new("RGBA", (CELL[0] * COLS, CELL[1] * rows), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.alpha_composite(c, ((i % COLS) * CELL[0], (i // COLS) * CELL[1]))
    out.save(dst, "WEBP", quality=90, method=6)
    print(dst, out.size, "cells", len(cells), "cell", CELL, "cols", COLS)


def sheet(dst: str, srcs: list) -> None:
    # The poses are packed at 640 px high first (rim of 2 px, as designed), then each cell is scaled down to CELL.
    cell_h = 640
    poses = []
    for s in srcs:
        im = Image.open(s).convert("RGBA")
        scale = cell_h / im.height
        im = im.resize((max(1, round(im.width * scale)), cell_h), Image.LANCZOS)
        poses.append(im)  # no rim: the sheet is defringed afterwards (alpha choked 1 px, edge colours pulled toward the night)
    cell_w = max(round(cell_h * CELL[0] / CELL[1]), max(p.width for p in poses) + 8)
    cells = []
    for p in poses:
        big = Image.new("RGBA", (cell_w, cell_h), (0, 0, 0, 0))
        big.alpha_composite(p, ((cell_w - p.width) // 2, cell_h - p.height))
        cells.append(fit(big))
    grid(dst, cells)


def fit(big: Image.Image) -> Image.Image:
    """Scales a cell down to CELL, bottom-centred, keeping its proportions (premultiplied, so no dark fringe)."""
    scale = min(CELL[0] / big.width, CELL[1] / big.height)
    w, h = max(1, round(big.width * scale)), max(1, round(big.height * scale))
    small = big.convert("RGBa").resize((w, h), Image.LANCZOS).convert("RGBA")
    out = Image.new("RGBA", CELL, (0, 0, 0, 0))
    out.alpha_composite(small, ((CELL[0] - w) // 2, CELL[1] - h))
    return out


def regrid(src: str, dst: str, n: int) -> None:
    old = Image.open(src).convert("RGBA")
    cw = old.width // n
    grid(dst, [fit(old.crop((i * cw, 0, (i + 1) * cw, old.height))) for i in range(n)])


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
    elif args and args[0] == "--regrid":
        regrid(args[1], args[2], int(args[3]))
    elif args and args[0] == "--feather":
        feather(args[1])
    else:
        cut(args[0], args[1], int(args[2]) if len(args) > 2 else 640)
