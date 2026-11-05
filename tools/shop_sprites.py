#!/usr/bin/env python3
"""Cuts the shop windows' sprites out of the owner's pictures, pixel for pixel (nothing is redrawn).

    python tools/shop_sprites.py            writes the rest pictures, the sprites and their table
    python tools/shop_sprites.py --check D  also writes contact sheets into the folder D, to be looked at

Sources: tools/shop-refs/ollivanders.webp and beasts.webp, the owner's two pictures, untouched. Results:
  app/assets/ollivanders.webp, app/assets/beasts.webp   the opaque rest pictures: his picture plus one soft scrim at
                                                        the top for the caption and one at the foot for the help line
  app/assets/shop/<collection><n>.webp                  one sprite per film, baked at the size it has once risen, so that
                                                        the settled focus maps 1:1 on the screen's pixels: the box or the
                                                        suitcase, its light up by a hair above the darks, and its shadow
  app/assets/shop/sprites.js                            their place on the screen once risen, the rise (generated, do not edit)

The wand boxes are straight wood: their silhouettes are polygons traced on zoomed crops, drawn antialiased. The
suitcases are leather: rounded outlines traced the same way, GrabCut in a very narrow band around them, regularised, then
a guided filter on the edge alone. A suitcase is opaque everywhere inside its outline, the opening of its handle
included: what shows through the handle is his own picture, at the same place. Only the pixels that the edge leaves more
than half transparent take their colour from inside (no halo); everything else is his pixels, Lanczos-resampled once.
The shadow lands on surfaces only: the shelf and the neighbouring boxes for a wand box, the sill for a suitcase. Never on
the out-of-focus background. Needs Pillow, numpy and opencv-python.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REFS = ROOT / 'tools' / 'shop-refs'
ASSETS = ROOT / 'app' / 'assets'
SHOP = ASSETS / 'shop'

# --- The silhouettes, in image pixels ---------------------------------------------------------------------------------
# Wand boxes: the outline clockwise from the top-left corner, and the brass pin on the top edge (x, y, radius).
WANDS = [
    {'poly': [(420, 330), (545.7, 329.5), (562, 385), (497, 925), (491.4, 972), (484.2, 987.5), (350.3, 987), (336.7, 945.7), (343, 922)], 'pin': (484, 327, 8.5)},
    {'poly': [(570.8, 328.5), (696.5, 328), (710, 380), (651, 950), (650.9, 975), (644.1, 990), (514.3, 988.5), (500, 940)], 'pin': (633, 326, 8.5)},
    {'poly': [(719, 326.5), (844.4, 326.5), (850, 377), (818, 905), (818.6, 977.5), (815.1, 991.5), (675.1, 991.5), (666.3, 941)], 'pin': (781, 325, 8.5)},
    {'poly': [(867.5, 328), (998, 328), (991, 945), (990.5, 991), (844.5, 990.5), (841.7, 940)], 'pin': (933, 327, 8.5)},
    {'poly': [(1018.5, 330), (1146.5, 330), (1165, 945), (1160.8, 992.5), (1018, 990.5), (1018.5, 945)], 'pin': (1083, 327, 8.5)},
    {'poly': [(1168, 330.5), (1296.5, 330), (1338.9, 946.4), (1328.1, 993.5), (1195, 994), (1187, 975), (1193, 943)], 'pin': (1231, 327, 8.5)},
    {'poly': [(1318, 330), (1445.9, 329), (1510.7, 942), (1498.8, 992.5), (1370, 993), (1352, 969), (1350, 945), (1342, 900), (1299.9, 391.5), (1305, 365)], 'pin': (1380, 326, 8.5)},
    {'poly': [(1470.4, 329), (1599.9, 329.5), (1681.3, 941.6), (1668.3, 995.5), (1534.9, 995.5), (1523.7, 980.9), (1536.6, 945), (1521, 899.8), (1459.4, 358.5)], 'pin': (1536, 325, 8.5)},
]
# Suitcases: the outline clockwise from the top-left (handle included) and the inside of the handle, traced on zoomed
# crops, then rounded. GrabCut only decides a few pixels on either side of them (the brass lumps, the handle's edge).
CASES = [
    {'poly': [(85, 580), (95, 555), (104, 546), (115, 542), (156, 541), (171, 545), (199, 545), (212, 545), (227.5, 542.5), (241, 539), (254, 534), (264, 529.5), (275, 531), (280, 540), (286, 539.5), (299, 532.5), (307.5, 529),
              (308, 515), (312.5, 502.5), (322.5, 491), (337.5, 482.5), (360, 477), (382.5, 474.5), (400, 474), (420, 476), (440, 480), (457.5, 487.5), (469, 499), (475, 515), (477.5, 522.5), (481, 532.5),
              (492.5, 533), (504, 531), (515, 527.5), (532.5, 529), (547.5, 534), (557.5, 540), (575, 541), (582.5, 539), (605, 539), (625, 541), (640, 546), (652.5, 555), (659, 568), (661, 580),
              (657, 611), (657, 648), (654, 656), (654, 665), (659, 677), (659, 816), (665, 862), (663, 874), (655, 884), (642, 898), (615, 899), (575, 905), (508, 910), (442, 918), (375, 923), (308, 932), (243, 938), (202, 940), (192, 940), (142, 935), (112, 917), (100, 903), (90, 898), (85, 879), (85, 863), (92, 848), (92, 721), (90, 609), (85, 596)],
     'hole': [(327.5, 541), (329, 527.5), (332.5, 514), (342.5, 504), (362.5, 502.5), (385, 504), (412.5, 504), (440, 502.5), (450, 509), (455, 522.5), (457.5, 532.5), (450, 543.5), (400, 544.5), (350, 544.5)]},
    {'poly': [(704, 592), (706.7, 566.7), (713, 555), (733, 547), (755, 541.7), (760, 547), (775, 547), (800, 543), (813, 533), (825, 529), (836.7, 535), (846.7, 540), (863, 541.7), (871.7, 534), (881.7, 533),
              (881.7, 520), (888, 501.7), (900, 488), (926.7, 480), (960, 476.7), (980, 475), (1006.7, 478), (1033, 485), (1050, 495), (1060, 508), (1062.7, 523), (1061.7, 535),
              (1076.7, 538), (1083, 543), (1103, 540), (1116.7, 531.7), (1126.7, 533), (1136.7, 541.7), (1163, 548), (1180, 547), (1203, 548), (1223, 556.7), (1233, 570), (1236.7, 593),
              (1239, 605), (1241, 612), (1237, 629), (1239, 708), (1237, 715), (1236, 860), (1240, 880), (1235, 905), (1222, 912), (1200, 925), (760, 925), (725, 922), (716.7, 916.7), (710, 900), (704, 897), (700, 873), (701, 858), (708, 846), (708, 634), (706, 624), (701, 616), (700, 604)],
     'hole': [(900, 548), (899, 526.7), (903, 513), (916.7, 505), (946.7, 503), (980, 502), (1016.7, 503), (1038, 510), (1046.7, 523), (1050, 541.7), (1046.7, 548), (980, 549)]},
    {'poly': [(1283, 601), (1288, 580), (1293, 563), (1306.7, 551.7), (1336.7, 544), (1360, 543), (1373, 548), (1386.7, 541.7), (1403, 538), (1413, 530.7), (1426.7, 534), (1440, 539), (1456.7, 538), (1471.7, 534),
              (1476.7, 531.7), (1476.7, 516.7), (1483, 498), (1500, 486.7), (1526.7, 480.7), (1556.7, 480), (1586.7, 485), (1610, 493), (1626.7, 505), (1635, 521.7), (1636, 538),
              (1653, 547), (1661.7, 538), (1686.7, 540), (1713, 543), (1718, 553), (1760, 551.7), (1780, 553), (1813, 553), (1830, 566.7), (1838, 581), (1841, 607), (1837, 618),
              (1836, 865), (1839, 874), (1839, 891), (1835, 903), (1822, 923), (1792, 935), (1742, 940), (1705, 940), (1688, 935), (1648, 930), (1608, 923), (1542, 915), (1475, 907), (1400, 902), (1332, 893), (1300, 890), (1289, 888), (1285, 879), (1286, 870), (1292, 859), (1288, 847), (1291, 834), (1293, 789), (1292, 740), (1287, 726), (1287, 658), (1294, 633)],
     'hole': [(1498, 543), (1496.7, 526.7), (1501.7, 513), (1513, 509), (1546.7, 510), (1580, 510), (1603, 510), (1613, 518), (1616.7, 536.7), (1615, 548), (1580, 550.7), (1500, 549)]},
]

# --- The light and the shadow, baked ------------------------------------------------------------------------------------
GAIN = 1.04           # the sprite's own light: a hair up above the darks (his blacks stay his blacks), a soft shoulder at the top
SHARPEN = (0.1, 0.8)  # unsharp amount and radius, after the one resampling: only what the resampling took away
# (blur sigma, drop in px, strength). Boxes: on the neighbours and the shelf, fading out on the upper half of the box.
BOX_SHADOW = [(9, 11, 0.42), (28, 22, 0.18)]
# Suitcases: stretched along the sill (sigma x, sigma y, drop, strength).
CASE_SHADOW = [(20, 7, 10, 0.60), (46, 12, 18, 0.26)]
CONTACT = (4, 8, 0.80)   # tight, under the foot only: it hides the strip of the picture's own foot that the lift uncovers
SILL = (872, 892)        # the sill starts here in the picture (y); nothing above it takes a suitcase's shadow
OPENING = (92, 1833)     # the window's opening (x): nothing outside it takes a shadow; the frame is in front of the case
BAND = 2                 # how far GrabCut may move a suitcase's traced outline, px
HANDLE_BAND = 1          # the same, along the handle (his picture's edge there is hard, GrabCut has nothing to add)
SMOOTH = 2.5             # the outline is regularised by this much (px, sigma): leather has no teeth

# --- The rise (ollivanders.css reads it from sprites.js): the scale, the lift in whole device px (at 1920 x 1080), and
# where a sprite grows from across its width: its middle, or for the outer suitcases near its outer edge, so that they
# grow toward the middle of the window and leave the frame's reveal alone.
RISE = {'hp': {'scale': 1.04, 'lift': 14}, 'fb': {'scale': 1.035, 'lift': 12}}
ANCHOR = {'fb1': 0.15, 'fb3': 0.85}

# --- The scrims, baked: a soft patch behind the caption (centre x, y and radii, strength), the rest of the picture
# untouched, and the foot of the window's frame, darkened only under the help line (from y0, full at y1, strength).
SCRIMS = {
    'ollivanders': {'patch': (960, 158, 640, 118, 0.30), 'foot': (1012, 1034, 0.40)},
    'beasts': {'patch': (960, 180, 620, 88, 0.40), 'foot': (1034, 1046, 0.35)},
}


def load(name):
    return np.asarray(Image.open(REFS / name).convert('RGB')).astype(np.float32) / 255.0


def raster(shape, poly, pin=None, ss=4):
    """An antialiased mask: drawn at 4x on just the part of the picture it covers, and brought down."""
    h, w = shape
    xs, ys = [p[0] for p in poly], [p[1] for p in poly]
    if pin:
        xs, ys = xs + [pin[0] - pin[2], pin[0] + pin[2]], ys + [pin[1] - pin[2], pin[1] + pin[2]]
    x0, y0 = max(0, int(min(xs)) - 2), max(0, int(min(ys)) - 2)
    x1, y1 = min(w, int(max(xs)) + 3), min(h, int(max(ys)) + 3)
    im = Image.new('L', ((x1 - x0) * ss, (y1 - y0) * ss), 0)
    d = ImageDraw.Draw(im)
    d.polygon([((x - x0) * ss, (y - y0) * ss) for x, y in poly], fill=255)
    if pin:
        x, y, r = pin
        d.ellipse([(x - r - x0) * ss, (y - r - y0) * ss, (x + r - x0) * ss, (y + r - y0) * ss], fill=255)
    out = np.zeros(shape, np.float32)
    out[y0:y1, x0:x1] = np.asarray(im.resize((x1 - x0, y1 - y0), Image.BOX)).astype(np.float32) / 255.0
    return out


def box_silhouette(shape, wand):
    """A wand box: its polygon, softened to the softness of the picture's own edges."""
    return cv2.GaussianBlur(raster(shape, wand['poly'], wand['pin']), (0, 0), 0.7)


def guided(guide, src, r, eps):
    """He's guided filter, gray guide: the mask's edge follows the picture's."""
    box = lambda a: cv2.blur(a, (2 * r + 1, 2 * r + 1))
    mean_i, mean_p = box(guide), box(src)
    a = (box(guide * src) - mean_i * mean_p) / (box(guide * guide) - mean_i * mean_i + eps)
    b = mean_p - a * mean_i
    return box(a) * guide + box(b)


def chaikin(poly, rounds=2):
    """Rounds an outline traced by hand: leather has no corners."""
    pts = [np.array(p, float) for p in poly]
    for _ in range(rounds):
        out = []
        for i, p in enumerate(pts):
            q = pts[(i + 1) % len(pts)]
            out += [p * 0.75 + q * 0.25, p * 0.25 + q * 0.75]
        pts = out
    return [(float(p[0]), float(p[1])) for p in pts]


def case_silhouette(img, case):
    """A suitcase: the whole outline, handle and its opening included (opaque: what shows through the handle is his picture
    at the same place). GrabCut decides only a pixel or two on either side of the traced outline, then the outline is
    regularised and only the edge itself takes the guided filter."""
    h, w = img.shape[:2]
    pts = np.array(case['poly'])
    x0, x1 = int(max(0, pts[:, 0].min() - 30)), int(min(w, pts[:, 0].max() + 30))
    y0, y1 = int(max(0, pts[:, 1].min() - 30)), int(min(h, pts[:, 1].max() + 30))
    crop = img[y0:y1, x0:x1]
    shift = lambda poly: [(x - x0, y - y0) for x, y in chaikin(poly)]
    u8 = (raster(crop.shape[:2], shift(case['poly'])) > 0.5).astype(np.uint8)
    ker = lambda n: cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * n + 1, 2 * n + 1))
    gc = np.full(crop.shape[:2], cv2.GC_BGD, np.uint8)
    gc[cv2.dilate(u8, ker(BAND)) > 0] = cv2.GC_PR_BGD
    gc[u8 > 0] = cv2.GC_PR_FGD
    gc[cv2.erode(u8, ker(BAND)) > 0] = cv2.GC_FGD
    # The handle: the traced outline holds, to within a pixel.
    hxs = [p[0] for p in case['hole']]
    hy1 = int(max(p[1] for p in case['hole'])) - y0
    hx0, hx1 = int(min(hxs)) - 45 - x0, int(max(hxs)) + 45 - x0
    zone = np.zeros_like(u8)
    zone[:hy1, max(0, hx0):hx1] = 1
    gc[(zone > 0) & (cv2.erode(u8, ker(HANDLE_BAND)) > 0)] = cv2.GC_FGD
    gc[(zone > 0) & (cv2.dilate(u8, ker(HANDLE_BAND)) == 0)] = cv2.GC_BGD
    bgr = cv2.cvtColor((crop * 255).astype(np.uint8), cv2.COLOR_RGB2BGR)
    cv2.grabCut(bgr, gc, None, np.zeros((1, 65)), np.zeros((1, 65)), 4, cv2.GC_INIT_WITH_MASK)
    fg = ((gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)).astype(np.uint8)
    # One piece, no crumbs, no teeth: the outline regularised.
    fg = cv2.morphologyEx(cv2.morphologyEx(fg, cv2.MORPH_OPEN, ker(1)), cv2.MORPH_CLOSE, ker(2))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if n > 2:
        fg = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    fg = (cv2.GaussianBlur(fg.astype(np.float32), (0, 0), SMOOTH) > 0.5).astype(np.uint8)
    soft = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.0)
    # The guided filter finishes the edge along the picture's own, and nowhere else: inside the silhouette, alpha is 1.
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
    alpha = np.clip(guided(gray, soft, 3, 4e-4), 0, 1)
    edge = (cv2.dilate(fg, ker(3)) > 0) & (cv2.erode(fg, ker(3)) == 0)
    alpha = np.where(edge, alpha, fg.astype(np.float32))
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.6)
    alpha = np.maximum(alpha, cv2.erode(fg, ker(2)).astype(np.float32))
    out = np.zeros((h, w), np.float32)
    out[y0:y1, x0:x1] = alpha
    return out


def bleed(img, alpha):
    """Only the pixels the edge leaves mostly transparent take a colour from inside the silhouette: the background stays
    behind, and everything else is his pixels."""
    known = (alpha >= 0.5).astype(np.float32)
    rgb = img * known[..., None]
    for _ in range(2):
        s = cv2.blur(rgb * known[..., None], (3, 3))
        k = cv2.blur(known, (3, 3))
        grow = (known == 0) & (k > 0)
        rgb[grow] = s[grow] / k[grow][..., None]
        known[grow] = 1
    rgb[known == 0] = 0
    return rgb


def light_up(rgb):
    """The sprite's own light: a gain that starts above the darks (his blacks stay his), with a soft shoulder so that nothing
    clips. No tint, no sheen: the focus is carried by the size, the lift and the shadow."""
    y = rgb.max(-1, keepdims=True)
    gain = 1 + (GAIN - 1) * smooth((y - 0.06) / 0.16)
    out = rgb * gain
    knee = 0.88
    over = out > knee
    out[over] = knee + (1 - knee) * (1 - np.exp(-(out[over] - knee) / (1 - knee)))
    return np.clip(out, 0, 1)


def drop(alpha, sigma_x, sigma_y, dy):
    """A silhouette moved down and blurred."""
    h, w = alpha.shape
    m = np.float32([[1, 0, 0], [0, 1, dy]])
    return cv2.GaussianBlur(cv2.warpAffine(alpha, m, (w, h)), (0, 0), sigmaX=sigma_x, sigmaY=sigma_y)


def shadow_of(alpha, foot, kind):
    """What the risen sprite casts, as an alpha, on surfaces only (all in screen pixels)."""
    h, w = alpha.shape
    ys, xs = np.where(alpha > 0.5)
    y0, y1 = ys.min(), ys.max()
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    sh = np.zeros_like(alpha)
    if kind == 'hp':
        # Neighbours and shelf; nothing on the upper half of the box's height.
        rise_in = smooth((yy - (y0 + (y1 - y0) * 0.45)) / ((y1 - y0) * 0.3))
        for sigma, dy, strength in BOX_SHADOW:
            sh = 1 - (1 - sh) * (1 - drop(alpha, sigma, sigma, dy) * strength * rise_in)
    else:
        floor = smooth((yy - SILL[0]) / (SILL[1] - SILL[0])) * smooth((xx - OPENING[0]) / 4) * smooth((OPENING[1] - xx) / 4)
        for sx, sy, dy, strength in CASE_SHADOW:
            sh = 1 - (1 - sh) * (1 - drop(alpha, sx, sy, dy) * strength * floor)
    # The contact: a tight dark line under the foot alone.
    sigma, dy, strength = CONTACT
    under = smooth((yy - (foot - 10)) / 6)
    sh = 1 - (1 - sh) * (1 - drop(alpha, sigma, sigma, dy) * strength * under)
    return sh


def make_sprite(img, alpha, key, name):
    """The risen sprite. Everything is resampled once, from his picture to the screen pixels of the risen place: box over
    shadow, trimmed to an even rectangle of the screen, so that the settled focus is 1:1 on whole device pixels."""
    ys, xs = np.where(alpha > 0.5)
    sx0, sx1, sy0, sy1 = int(xs.min()), int(xs.max()) + 1, int(ys.min()), int(ys.max()) + 1
    h, w = alpha.shape
    scale, lift = RISE[key]['scale'], RISE[key]['lift']
    # The foot stays under the middle (or the anchor) of the silhouette; the top grows up from it.
    ox, oy = sx0 + (sx1 - sx0) * ANCHOR.get(name, 0.5), float(sy1)
    m = np.float32([[scale, 0, ox - scale * ox], [0, scale, oy - scale * oy - lift]])
    rgb = light_up(bleed(img, alpha))
    pre = np.dstack([rgb * alpha[..., None], alpha])
    warped = np.clip(cv2.warpAffine(pre, m, (w, h), flags=cv2.INTER_LANCZOS4), 0, 1)
    a = warped[..., 3]
    rgb = np.where(a[..., None] > 1e-3, warped[..., :3] / np.maximum(a[..., None], 1e-3), 0)
    rgb = np.clip(rgb, 0, 1)
    if SHARPEN[0]:
        amount, radius = SHARPEN
        rgb = np.clip(rgb + amount * (rgb - cv2.GaussianBlur(rgb, (0, 0), radius)), 0, 1)
    sh = shadow_of(a, oy - lift, key)
    a_out = a + sh * (1 - a)
    rgb_out = np.where(a_out[..., None] > 1e-4, rgb * a[..., None] / np.maximum(a_out[..., None], 1e-4), 0)
    ys, xs = np.where(a_out > 1.5 / 255)
    x0, x1 = int(xs.min()) // 2 * 2, (int(xs.max()) + 2) // 2 * 2
    y0, y1 = int(ys.min()) // 2 * 2, min(h, (int(ys.max()) + 2) // 2 * 2)
    rgba = np.dstack([rgb_out, a_out])[y0:y1, x0:x1]
    info = {'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0,
            # The point it rises from, in the risen picture (% of the sprite); the middle of the silhouette (screen px at rest).
            'ox': round((ox - x0) / (x1 - x0) * 100, 3), 'oy': round((oy - lift - y0) / (y1 - y0) * 100, 3),
            'cx': (sx0 + sx1) // 2, 'cy': (sy0 + sy1) // 2}
    return rgba, info


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def save_rest(img, name, cfg):
    """His picture and the scrims. Still opaque, and nowhere else darker than his picture."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy, rx, ry, a = cfg['patch']
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    keep = 1 - a * (1 - smooth((d - 0.45) / 0.75))
    y0, y1, a = cfg['foot']
    keep = keep * (1 - a * smooth((yy - y0) / (y1 - y0)))
    rest = img * keep[..., None]
    Image.fromarray((rest * 255 + 0.5).astype(np.uint8)).save(ASSETS / f'{name}.webp', quality=93, method=6)


def save_sprite(rgba, path):
    Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA').save(path, quality=92, alpha_quality=100, method=6)


def sheets(folder, name, cuts):
    """What must be looked at: every sprite on a loud background and on a white one."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for bgname, bg in (('magenta', (255, 0, 255)), ('white', (255, 255, 255))):
        W, H = sum(c.shape[1] for c in cuts), max(c.shape[0] for c in cuts)
        sheet = Image.new('RGB', (W, H), bg)
        x = 0
        for rgba in cuts:
            im = Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
            sheet.paste(im, (x, 0), im)
            x += rgba.shape[1]
        sheet.save(folder / f'{name}-{bgname}.png')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', help='folder for the contact sheets')
    args = ap.parse_args()
    cv2.setRNGSeed(7)   # GrabCut seeds its models at random: the same sprites at every run
    SHOP.mkdir(parents=True, exist_ok=True)
    table = {}
    for name, key, items in (('ollivanders', 'hp', WANDS), ('beasts', 'fb', CASES)):
        img = load(f'{name}.webp')
        save_rest(img, name, SCRIMS[name])
        rows, cuts = [], []
        for n, item in enumerate(items, 1):
            if key == 'hp':
                rgba, info = make_sprite(img, box_silhouette(img.shape[:2], item), key, f'{key}{n}')
            else:
                rgba, info = make_sprite(img, case_silhouette(img, item), key, f'{key}{n}')
            save_sprite(rgba, SHOP / f'{key}{n}.webp')
            rows.append({'src': f'assets/shop/{key}{n}.webp', **info})
            cuts.append(rgba)
            print(f'{key}{n}', info['w'], 'x', info['h'], (SHOP / f'{key}{n}.webp').stat().st_size // 1024, 'KB')
        table[key] = rows
        if args.check:
            sheets(args.check, key, cuts)
    head = '// Generated by tools/shop_sprites.py, do not edit: where each sprite sits once risen, 1:1 on the picture (image pixels), the\n'
    head += '// point it rises from (ox, oy, % of the sprite), the middle of its silhouette at rest (cx, cy, image pixels), and the rise\n'
    head += '// of each window: the sprite is its risen size; at rest it is drawn at 1 / scale, `lift` image pixels lower.\n'
    body = f'export const RISE = {json.dumps(RISE)};\n' + 'export const SPRITES = {\n' + ''.join(f'  {k}: [\n' + ''.join(f'    {json.dumps(r)},\n' for r in v) + '  ],\n' for k, v in table.items()) + '};\n'
    (SHOP / 'sprites.js').write_bytes((head + body).encode('utf-8'))


if __name__ == '__main__':
    main()
