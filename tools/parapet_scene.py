#!/usr/bin/env python3
"""The Parapet's backdrop, cut from app/assets/castle.jpg: clouds that drift behind the castle's exact silhouette.

Run with `python -I tools/parapet_scene.py [outDir]` (Pillow, NumPy, SciPy; about three minutes). It reads castle.jpg and
scene/lake-mist-tile.webp and rewrites, in app/assets/scene/ by default (nothing is random: the same pictures every time):

  clouds.webp        2050 x 712, opaque, seamless left to right: the clouds, 1:1 on the screen's pixels, his own pixels wherever the
                     sky shows at rest but right against the moon (2 px of the loop's start at the right, so that two side by side overlap)
  castle-top.webp    1984 x 724, alpha, still: everything that does not drift: the moon's disc, its light on the sky (a function of the
                     distance to its centre, nothing else), the castle down to the split, its exact silhouette, the mountains (the faint one on the left, barely)
  castle-base.webp   1984 x 372, opaque, still: everything below the skyline (rock, lake, boathouse, mist, the night fade)
  fg-left.webp, fg-right.webp   the foreground trees, the night fade baked in
  scene.json         the geometry

So the sky is one opaque picture that moves and one blended picture that does not: on the TV's GPU each blended screen-sized layer holds
back every move of the Parapet. Put back together at rest the layers are close to castle.jpg, not equal to it: what lies against the moon, the veiled spire and the rims
of the castle would look frozen or leave a ghost at any other moment of the drift, and all his sky passes by the moon, so the soft parts of it carry fine wisps they do not have
in his picture (ENRICH). Below the skyline the lake mist and the night fade are baked in. The method, in order:

  1. Silhouette. The sky is estimated around the castle from the pixels outside a rough outline (ENV, hand-drawn, 10 to 20 px
     out into the sky). What differs from it is the castle, and here and there a bright cloud. A random walk sorts them: seeds
     in the thick bodies, down each thin spire (SPIRES, SURE_CASTLE) and in the sky (SKY_THREADS, NOT_CASTLE); walkers cross a
     soft cloud easily and a sharp silhouette hardly at all. On the edge, alpha is the difference over the contrast just
     inside, so a spire keeps its own antialiasing. What is thin and dark against the mist (THIN: chimneys, a finial, bare branches) is measured against the sky around it.
     What else stays still: the mountains (STILL), and of the faint one on the left, MOUNT_A: clouds pass through it, and its contour stays as faint as he drew it. Nothing else is
     frozen around a shape: an edge pixel takes its colour from just inside, what lies against an edge (a bead, a tower's spill on the sky) goes from the sheet and is simply not there at rest.
     The spire beside the moon is a straight shape of its own (SPIRE), a needle up to his tip: his mist veils it so that no difference can find its edge. Its colour is his, brought
     down where the mist pales it (SPIRE_TONE) and with his lit edge, so that it reads as a spire against any cloud, never as a pale streak. The mist around it goes with the clouds.
  2. The moon. The disc is his pixels, round, in one plane with the castle: no parallax can open anything between them. A little of what passes shows through it (T_DISC, more at the
     limb, little: a linear blend can only veil so bright a disc by dimming it), around the sheet's middle, so that over the loop it is his. What is too bright for that loses all channels alike: his colour stays.
  3. Light. out = clouds x T(r) + P(r), T and P in castle-top, functions of the distance r to the moon's centre and of nothing else, so no shape of a cloud stays behind at any scale.
     The light is measured on his sky: a low percentile of each ring (LIGHT_PCT: the median holds his bright clouds, and they must leave with the sheet), written as a sum of exponentials
     with positive weights, which can only fall, ever more slowly: no outline, no ring. Past LIGHT_FAR nothing changes with the distance. Most of that light is on the clouds and goes
     with them (LIGHT_ON_CLOUD: T rises towards the moon, so a thick cloud lights up and a gap stays dark), and the clouds show right up to the limb, as much as the 8 bits of a blended
     colour allow. So the glow is never the same twice, what stays still in it is smooth, and clouds near the moon have more contrast than far away, as in his picture. His sky lies on
     one colour line, near the moon and far from it, so the sheet is grey and the blue is in the still light: no colour leaves with a cloud.
  4. Cloud sheet. Wherever the sky shows at rest, clouds = (his pixel - P) / T: his pixels, at full resolution, no downscale and no blur. What
     the castle, the mountains and the trees hide, and the 128 px the picture lacks to close the loop, are filled at full resolution:
     broad shapes smoothly across, detail from the picture's own clouds, the crispest that match (the best patches, mirrored or not, joined along a seam where they agree, each band of the
     detail cross-faded at its own width), no crisper than what they continue for the first CRISP_RAMP px. Where a filled part meets the true sky it takes the sky's level. Under the moon and
     around it goes one piece of his sky, whole and mirrored, at his broad levels (BLOCK_LEVEL), into which his pixels fade close to the limb (HOLE_PX, HOLE_FINE): his crescents there carry
     the limb's curve and would leave as a ghost of its outline, but a cloud goes on right under the disc. Then the band of fine wisps: what is soft lifts its own band a little and takes
     the rest from his crispest clouds (ENRICH_*), through soft overlapping windows that leave no edge, each the patch that sat on the most similar broad shape.
  5. Still top. Its colours are solved against the sheet as it is really drawn: F = (I - (1 - a) U) / a, so the picture at rest is
     exact under a soft edge and a spire's edge pixels carry no old sky. Then the light goes under them, in the same picture.
  6. Below the split nothing shows the sky, so castle-base is opaque, and the compositor draws nothing behind it.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
import scipy.sparse as sp
from scipy import ndimage as nd
from scipy.optimize import nnls
from scipy.sparse.linalg import cg

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, '..', 'app', 'assets')
SRC = os.path.join(ASSETS, 'castle.jpg')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ASSETS, 'scene')
MIST = os.path.join(ASSETS, 'scene', 'lake-mist-tile.webp')

M = 32              # device px of margin on each side of a plane (the parallax never shows an edge)
SPLIT = 708         # device px: below it nothing shows the sky (castle-base, opaque); the sky layers stop there
LAP = 16            # castle-top runs this much further down and fades over castle-base (no line at the split)
LOOP = 2048         # device px of the clouds' loop
FH = 712            # device px of their height
DRIFT_S = 171       # seconds of a loop (home.js DRIFT_STEPS): 12 steps of one device px a second
T_FAR = .45         # how much of the clouds shows far from the moon (the sheet's dark is amplified by 1 / T at most)
T_NEAR = .80        # and at most, around it, where they are lit
T_DISC, T_DISC_MAX = .04, .10    # how much of the clouds shows through the disc, at its centre and at the limb
T_DISC_RIM = (44, 56)   # px from its centre: from one to the other
LIGHT_SCALES = (2, 4, 8, 16, 32, 64, 128, 256)   # device px: the glow is a sum of such exponentials, so it can only fall, ever more slowly: no shelf, no ring
LIGHT_ON_CLOUD = .7 # how much of the moon's light is on the clouds and goes with them (a dark gap passing gets less), the rest lies over whatever passes
LIGHT_PCT = 40      # the ring's percentile that is the light: its median holds his bright clouds around the moon, and they must leave with the sheet
LIGHT_FAR = (330, 470)   # px from the centre: from there on nothing changes with the distance: what is darker further off is a darker cloud, and it drifts
SOFT_MIN = 40       # how softly the still light goes from one limit to the next
SPILL = 16          # device px around them where a tower's light may lie on the sky
EDGE = 4            # device px around the castle and the ridges: not sky
SOFT_STILL = 40     # a still shape's edge at least this soft keeps the true clouds under its outer half
FILL_SPLIT = 32     # device px: broader than this, a hidden part is interpolated; finer, it takes patches of the clouds
CRISP = 2           # how strongly the crispest clouds are preferred, for what is hidden
CRISP_RAMP = 200     # device px over which it gets there
PATCH = 160         # device px of a patch
MEMBRANE = 60       # device px over which a filled part takes the level of the sky beside it
EDGE_FADE = 10      # and the last px, where it runs on from it
CHROMA_SIGMA = 14   # device px: in the sheet, colour broader than this is evened out, so nothing warm leaves with a cloud
SPECK_MAX, SPECK_RIGHT, SPECK_HIGH, SPECK_KEEP = 60, 1000, 470, 3   # right of the first x or above that y, what is that many px, further than the last from a ridge, and thick, is sky
SPECK_NEAR, SPECK_DARK, SPECK_BRIGHT = 40, 14, 30   # how near a mask, how far below or above its surroundings: not a cloud
HOLE_PX = (16, 64)  # px past the limb: closer than the first the sheet's broad shapes are all filled, past the second all his, between them the one fades into the other:
                    # his bright crescents hug the limb, and they would leave with the clouds as a ghost of the moon's outline
HOLE_FINE = (6, 20) # and his fine wisps, which do not: they stay nearly up to the limb
BLOCK_LEVEL = 24    # device px: how broad the levels are that the piece under the moon takes from his picture: too broad to hold the limb's curve
HOLE_SPLIT = 14     # device px: what is broad, what is fine, there
DARK_PCT, DARK_SOFT = 2, 10
SHEET_SPREAD = 110   # the spread (p25 to p75, luma) of the sheet's clouds at most: closer to the moon, his local contrast is not amplified past it
ENRICH_SPLIT = 24   # device px: the band of the clouds that the soft parts of the sky take from his crispest (finer than this: wisps; broader: his shapes, untouched)
ENRICH_PCT = 60     # the percentile of his crisp sky's energy in that band that every part of the sky should have
ENRICH_GAIN = 1.25   # first his own band is lifted, by this at most
ENRICH_DARK, ENRICH_LIT = .4, (45, 115)   # how much of it in the dark, and the sheet's levels between the dark and the lit
ENRICH_A = 1.0      # how much of what is missing is given
ENRICH_PATCH = 128  # device px of a patch
Q_CLOUDS = 100
Q_TOP = 95

# The rough outline of the castle plane: above the silhouette, kept 10 to 20 px out into the sky around every spire.
ENV = [(0, 705), (236, 705), (236, 630), (280, 615), (285, 455), (300, 446), (318, 450), (330, 440), (352, 345), (372, 298), (392, 345), (400, 385), (470, 372), (484, 250), (500, 182), (516, 250), (530, 362), (600, 348), (640, 333), (658, 300), (660, 60), (680, 48), (705, 52), (712, 88), (751, -20), (772, 0), (868, 285), (870, 300), (864, 500), (900, 503), (905, 490), (943, 308), (953, 308), (985, 440), (990, 413), (1000, 418), (1006, 470), (1006, 560), (1012, 628), (1045, 628), (1048, 590), (1087, 420), (1099, 420), (1140, 555), (1150, 550), (1165, 545), (1173, 428), (1183, 428), (1192, 545), (1198, 478), (1206, 478), (1206, 330), (1220, 272), (1235, 258), (1258, 248), (1272, 255), (1292, 283), (1300, 240), (1318, 188), (1330, 163), (1342, 188), (1360, 258), (1374, 298), (1374, 352), (1382, 352), (1404, 500), (1404, 545), (1500, 553), (1605, 568), (1621, 468), (1635, 468), (1662, 568), (1666, 598), (1720, 612), (1800, 622), (1920, 630), (1920, 1080), (0, 1080)]
# What stays still besides the castle (polygon, soft edge in px), in castle.jpg px.
STILL = [
    # The mountain in the gap between the towers.
    ([(985, 445), (1060, 462), (1100, 470), (1140, 442), (1170, 418), (1215, 400), (1215, 720), (985, 720)], 10),
    # The right mountains, along the ridges, everything below them, the tree line, the mist.
    ([(1372, 418), (1420, 398), (1465, 373), (1490, 376), (1515, 383), (1535, 392), (1545, 388), (1590, 368), (1620, 352), (1640, 318), (1658, 302), (1690, 292), (1728, 288), (1765, 303), (1800, 325), (1850, 342), (1900, 352), (1952, 372), (1952, 720), (1372, 720)], 8),
    # Low mist on the left: it meets the rock and the trees.
    ([(-32, 660), (260, 660), (290, 720), (-32, 720)], 46),
]
MOON = (1418.5, 223.5, 55.5)  # centre and radius in castle.jpg px
LIGHT_MAX = 253      # the brightest the still light's own colour may be, by channel
# The left mountain is barely there in his picture: a contour in the dark clouds. It stays at MOUNT_A: clouds go on passing through it, at nearly their whole strength. Solid, it would hang in the sky.
MOUNT = [(120, 345), (190, 222), (240, 180), (305, 215), (395, 285), (395, 400), (240, 425), (120, 405)]
MOUNT_A = .24
MOUNT_SOFT = 26
MOUNT_FADE = (270, 345)   # the heights over which it fades out: below it there is only cloud
MOUNT_LEVEL = 16    # device px: how broad the levels are that the sheet keeps of his, there
# Thin dark things against the sky, whose outline the walk cannot find in the mist (chimneys, a finial, bare branches): what stands below the sky around them, within the box. (x0, y0, x1, y1, how far they fade into the walk's matte at the bottom, the radius of the sky around them)
THIN = [(1218, 262, 1292, 312, 12, 11), (362, 292, 392, 330, 8, 9), (1872, 244, 1920, 380, 20, 9)]
THIN_FLOOR, THIN_MIN = 8, 16   # luma below that sky where it starts, and the least contrast taken as whole
# The spire beside the moon: his mist veils it, so no difference can find its edge, and it is a shape, its straight taper up to his tip. The mist around it goes with the
# clouds. Its colour up there is his, darker: what is still and pale would read as a streak when dark clouds pass behind.
SPIRE = [(1324.5, 186), (1357, 322), (1300, 322)]
SPIRE_PIN = [(1360, 297), (1363.5, 326), (1356.5, 326)]   # the thin pinnacle at its foot
SPIRE_X = (1282, 1373)   # what the walk left in the sky around them goes, from here to there, down to the hand-over

SPIRE_Y = (187, 290, 302, 320)      # SPIRE_A at the tip, whole at the second, and from the third to the fourth it hands over to the walk's matte
SPIRE_A = .62
SPIRE_HIDE = 7      # device px around it where the sheet does not take his pixels: his faint edge lines would leave with the clouds
SPIRE_TONE = 74     # the luma its broad still colour may have at most, up there: it reads as a spire against any cloud, and his colour for the rest
SPIRE_LIT = (288, 312)   # the heights from which that eases off
# A thread down the middle of each thin spire (the walk's seeds): they are too thin to survive the erosion of the bodies.
SPIRES = [((500, 195), (500, 350)), ((372, 325), (372, 400)), ((947, 340), (947, 480)), ((1093, 445), (1093, 560)), ((1178, 480), (1178, 570)), ((1330, 235), (1330, 320)), ((1375, 410), (1375, 530)), ((1630, 505), (1630, 570)), ((751, 10), (751, 60)), ((988, 432), (988, 470)), ((665, 290), (670, 330)), ((685, 80), (685, 180)), ((1262, 275), (1262, 310)), ((1238, 290), (1238, 320)), ((335, 445), (338, 480)), ((306, 475), (306, 510)), ((1214, 430), (1214, 480)), ((657, 274), (644, 296)), ((644, 300), (650, 345)), ((690, 150), (660, 262)), ((800, 150), (845, 280))]
# A thread of sure sky where a bright cloud touches a wall (the walk's other seeds): mist does not stick to the castle.
SKY_THREADS = [((1283, 265), (1283, 312)), ((1270, 262), (1278, 312)), ((1305, 190), (1300, 290)), ((1292, 275), (1298, 296)), ((1345, 190), (1365, 305)), ((1378, 340), (1384, 400)), ((1222, 290), (1190, 400)), ((860, 322), (862, 400)), ((640, 318), (648, 345)), ((1075, 440), (1075, 470)), ((1112, 440), (1112, 470)), ((262, 640), (262, 655)), ((250, 630), (285, 640)), ((400, 372), (440, 372)), ((353, 395), (353, 435)), ((346, 445), (346, 462)), ((321, 492), (321, 502)), ((395, 392), (425, 392))]
# Roofs and walls as dark as the sky behind them: sure castle, a little inside their edges.
SURE_CASTLE = [[(947, 352), (903, 516), (991, 516)], [(752, 40), (664, 278), (842, 290)], [(1204, 425), (1235, 425), (1235, 480), (1204, 480)], [(655, 272), (642, 292), (638, 306), (642, 318), (646, 352), (655, 352)]]
# Patches of bright mist against a wall, too wide for a thread: sky, whatever the difference says.
NOT_CASTLE = [[(240, 612), (292, 612), (292, 668), (252, 668), (240, 650)], [(388, 380), (440, 380), (440, 395), (395, 403), (388, 404)], [(1270, 270), (1310, 270), (1310, 288), (1300, 312), (1292, 326), (1270, 310)], [(1298, 200), (1322, 200), (1310, 285), (1298, 285)], [(1338, 200), (1385, 200), (1385, 300), (1358, 300)], [(1248, 250), (1258, 250), (1258, 279), (1255, 279), (1255, 300), (1248, 300)], [(1264, 250), (1290, 250), (1290, 275), (1270, 275), (1270, 312), (1267, 312), (1267, 279), (1264, 279)]]


def log(*a):
    print(*a, flush=True)


O = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32)
H, W = O.shape[:2]
LUMA = np.array([.299, .587, .114], np.float32)
L = O @ LUMA


def smooth(t):
    t = np.clip(t, 0, 1)
    return t * t * (3 - 2 * t)


def poly(pts, w=W, h=H, dx=0):
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).polygon([(float(x) + dx, float(y)) for x, y in pts], fill=1)
    return np.asarray(im).astype(bool)


def disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def close(b, r):
    return nd.binary_erosion(nd.binary_dilation(b, disk(r)), disk(r), border_value=1)


def edge_keep(b, side):
    lab, _ = nd.label(b)
    keep = np.zeros(lab.max() + 1, bool)
    keep[np.unique(lab[:, 0] if side == 'L' else lab[:, -1])] = True
    keep[0] = False
    return keep[lab]


def feather(mask, width):
    return smooth(1 - nd.distance_transform_edt(~mask) / width).astype(np.float32)


def fill_near(img, known, sigmas=(4, 8, 16, 32, 64)):
    """Normalised convolutions, the finest scale that has data wins: a soft estimate of what is unknown."""
    res, have, k = np.zeros_like(img), np.zeros(known.shape, np.float32), known.astype(np.float32)
    for s in sigmas:
        w = nd.gaussian_filter(k, s)
        est = np.stack([nd.gaussian_filter(img[..., i] * k, s) for i in range(img.shape[2])], -1) / np.maximum(w, 1e-4)[..., None]
        a = np.clip(w * 4, 0, 1) * (1 - have)
        res += est * a[..., None]
        have += a
    return res / np.maximum(have, 1e-4)[..., None]


def pad(x, P=72, blend=10):
    """The plane's margins repeat the texture found P px inside the edge (never a mirror), cross-faded from the edge."""
    out = np.concatenate([np.zeros_like(x[:, :M]), x, np.zeros_like(x[:, :M])], 1)
    for j in range(M):
        t = smooth(min(1.0, (j + 1) / blend))
        out[:, M - 1 - j] = (1 - t) * x[:, 0] + t * x[:, P - 1 - j]
        out[:, M + W + j] = (1 - t) * x[:, W - 1] + t * x[:, W - P + j]
    return out


def save_rgba(path, rgb, a, q=90):
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).round().astype(np.uint8)
    Image.fromarray(arr, 'RGBA').save(path, 'WEBP', quality=q, method=6, alpha_quality=100, exact=False)


def save_rgb(path, rgb, q=90):
    Image.fromarray(np.clip(rgb, 0, 255).round().astype(np.uint8)).save(path, 'WEBP', quality=q, method=6)


def load(path):
    return np.asarray(Image.open(path)).astype(np.float32)


os.makedirs(OUT, exist_ok=True)

# ---- 1. The foreground trees (as they always were) -------------------------------------------------------------------
m = nd.minimum_filter(nd.gaussian_filter(L, 1), 7)
zoneL = poly([(0, 60), (150, 60), (240, 560), (242, 720), (262, 760), (262, 1080), (0, 1080)])
pinesL = edge_keep(nd.binary_fill_holes(close((m < 20) & zoneL, 9)), 'L')
zoneT = poly([(232, 770), (300, 770), (520, 780), (640, 990), (640, 1080), (232, 1080)])
treeT = nd.binary_fill_holes(close((m < 38) & zoneT, 22))
lab, _ = nd.label(treeT)
treeT = (nd.sum(np.ones_like(lab), lab, range(lab.max() + 1)) > 1500)[lab] & treeT
treeT = nd.binary_dilation(treeT, disk(14)) & poly([(225, 740), (700, 740), (700, 1080), (225, 1080)])
CL = edge_keep(nd.binary_fill_holes(close(pinesL | treeT, 15)), 'L')
zoneR = poly([(1850, 530), (1862, 560), (1880, 600), (1895, 560), (1905, 500), (1920, 485), (1920, 1013), (1790, 1013), (1772, 1000), (1800, 972), (1800, 862), (1768, 850), (1768, 740), (1800, 660), (1835, 585)])
pinesR = edge_keep(nd.binary_fill_holes(close((m < 30) & zoneR, 10) & zoneR), 'R')
bank = poly([(1795, 975), (1850, 948), (1920, 935), (1920, 1013), (1800, 1013), (1780, 1000)])
CR = nd.binary_fill_holes(close(pinesR | bank, 12))
C_fg = CL | CR
Af = feather(C_fg, 6.0)
log('foreground done')

# ---- 2. The castle's silhouette ---------------------------------------------------------------------------------------
E = poly(ENV)
yy0, xx0 = np.mgrid[0:H, 0:W].astype(np.float32)
B = fill_near(O, ~E)
d = O - B
D = np.sqrt((d * d * np.array([.3, .59, .11], np.float32)).sum(-1))
D_s = nd.gaussian_filter(D, .6)
# Everything that differs from the estimated sky: the castle, and here and there a bright cloud.
rough = (D_s > 6.0) & E
rough[SPLIT:] = E[SPLIT:]
rough = nd.binary_fill_holes(close(rough, 2))
# A random walk (Grady) sorts them: from the thick bodies of the castle, the strong differences and a thread down each
# spire on one side, the sky on the other, walkers cross a soft cloud easily and a sharp silhouette hardly at all.
threads = Image.new('L', (W, H), 0)
sure_sky = Image.new('L', (W, H), 0)
for a_, b_ in SPIRES:
    ImageDraw.Draw(threads).line([a_, b_], fill=1, width=1)
for a_, b_ in SKY_THREADS:
    ImageDraw.Draw(sure_sky).line([a_, b_], fill=1, width=3)
for pts in NOT_CASTLE:
    ImageDraw.Draw(sure_sky).polygon(pts, fill=1)
for pts in SURE_CASTLE:
    ImageDraw.Draw(threads).polygon(pts, fill=1)
fg = nd.binary_erosion(rough, disk(9)) | nd.binary_opening((D_s > 26) & E, disk(1)) | np.asarray(threads).astype(bool)
bg = (~E | ((nd.gaussian_filter(D, 1.2) < 2.2) & ~nd.binary_dilation(nd.binary_erosion(rough, disk(9)), disk(2)))) & ~fg
bg |= np.asarray(sure_sky).astype(bool)
fg &= ~np.asarray(sure_sky).astype(bool)
labels = np.zeros((H, W), np.int32)
labels[fg] = 1
labels[bg] = 2
band = nd.binary_dilation(rough, disk(10)) & ~nd.binary_erosion(rough, disk(14))
labels[~band & (labels == 0)] = 2


def walk(data, lab_, beta):
    """The walkers' probability of reaching the castle first: a sparse Laplacian solve on the unknown pixels."""
    h, w_ = lab_.shape
    unk = lab_ == 0
    idx = -np.ones((h, w_), np.int64)
    idx[unk] = np.arange(unk.sum())
    n_ = int(unk.sum())
    rows, cols, vals, diag, rhs = [], [], [], np.zeros(n_), np.zeros(n_)
    yy_, xx_ = np.mgrid[0:h, 0:w_]
    for dy, dx in ((0, 1), (1, 0)):
        pa, pb = (yy_[:h - dy, :w_ - dx], xx_[:h - dy, :w_ - dx]), (yy_[dy:, dx:], xx_[dy:, dx:])
        wt = np.exp(-beta * ((data[pa] - data[pb]) ** 2).sum(-1)) + 1e-5
        ua, ub = unk[pa], unk[pb]
        both = ua & ub
        ia, ib, v = idx[pa][both], idx[pb][both], wt[both]
        rows += [ia, ib]
        cols += [ib, ia]
        vals += [-v, -v]
        np.add.at(diag, ia, v)
        np.add.at(diag, ib, v)
        for uu, ii, ll in ((ua & ~ub, idx[pa], lab_[pb]), (ub & ~ua, idx[pb], lab_[pa])):
            np.add.at(diag, ii[uu], wt[uu])
            np.add.at(rhs, ii[uu], wt[uu] * (ll[uu] == 1))
    Lp = sp.coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(n_, n_)).tocsr() + sp.diags(diag)
    x, _ = cg(Lp, rhs, M=sp.diags(1 / np.maximum(diag, 1e-6)), rtol=1e-3, maxiter=800)
    P_ = (lab_ == 1).astype(np.float32)
    P_[unk] = x
    return P_


Pw = walk(nd.gaussian_filter(O[:SPLIT + 12] / 255, (.5, .5, 0)), labels[:SPLIT + 12], 2500)
P = np.zeros((H, W), np.float32)
P[:SPLIT + 12] = Pw
P[SPLIT + 12:] = E[SPLIT + 12:]
core = nd.binary_fill_holes(P > .5)
lab, n = nd.label(core)
sizes = nd.sum(np.ones_like(lab), lab, range(n + 1))
sizes[0] = 0
core = (sizes > 40)[lab]
log('core', int(core.sum()))
# The edge. Where the castle stands out from the sky, alpha is the difference over the contrast just inside: a spire keeps
# its own antialiasing, and a pixel half sky reads half transparent. Elsewhere (a roof as dark as the cloud behind it) the
# walk's own soft probability.
inner = nd.grey_dilation(D_s * core, footprint=disk(4))
ring = nd.binary_dilation(core, disk(3)) & ~nd.binary_erosion(core, disk(2))
ratio = np.clip((D_s - 1.5) / np.maximum(inner * .8 - 1.5, 1e-3), 0, 1) * nd.binary_dilation(core, disk(2))
walked = smooth((nd.gaussian_filter(P, .5) - .25) / .5)
Ac = np.where(ring, np.where(inner > 9, ratio, walked), core.astype(np.float32))
Ac = np.where(nd.binary_erosion(core, disk(2)), 1, Ac)
Ac = nd.gaussian_filter(Ac, .45)
Ac[SPLIT - 2:] = np.maximum(Ac[SPLIT - 2:], E[SPLIT - 2:])
# The spire beside the moon, in the bright mist: its own shape, whole only low down (SPIRE). The mist goes with the sheet.
sp_big = Image.new('L', (W * 2, H * 2), 0)   # no stairs on its long straight edges
for pts in (SPIRE, SPIRE_PIN):
    ImageDraw.Draw(sp_big).polygon([(2 * x_, 2 * y_) for x_, y_ in pts], fill=255)
sp_shape = nd.gaussian_filter(np.asarray(sp_big.resize((W, H), Image.BOX)).astype(np.float32) / 255, .5)
sp_w = (1 - smooth((yy0 - SPIRE_Y[2]) / (SPIRE_Y[3] - SPIRE_Y[2]))) * ((xx0 > SPIRE_X[0]) & (xx0 < SPIRE_X[1]))
sp_ramp = SPIRE_A + (1 - SPIRE_A) * smooth((yy0 - SPIRE_Y[0]) / (SPIRE_Y[1] - SPIRE_Y[0]))
Ac = Ac * (1 - sp_w) + sp_shape * sp_ramp * sp_w
core = np.where(sp_w > .5, sp_shape > .5, core)
for x0_, y0_, x1_, y1_, fade_, rad_ in THIN:
    sky_l = nd.gaussian_filter(nd.grey_closing(L[y0_ - 20:y1_ + 20, x0_ - 20:min(x1_ + 20, W)], footprint=disk(rad_)), 2)
    in_l = nd.grey_erosion(L[y0_ - 20:y1_ + 20, x0_ - 20:min(x1_ + 20, W)], footprint=disk(3))     # how dark what is near is: an edge pixel is that part of it, and that part sky
    a_t = np.clip((sky_l - L[y0_ - 20:y1_ + 20, x0_ - 20:min(x1_ + 20, W)] - THIN_FLOOR) / np.maximum(sky_l - in_l - THIN_FLOOR, THIN_MIN), 0, 1)[20:20 + y1_ - y0_, 20:20 + x1_ - x0_]
    w_t = 1 - smooth((np.arange(y1_ - y0_, dtype=np.float32) - (y1_ - y0_ - fade_)) / fade_)[:, None]
    lab_t, n_t = nd.label(a_t > .1)
    a_t = a_t * (nd.sum(np.ones_like(lab_t), lab_t, range(n_t + 1)) >= 16)[lab_t]     # a grain of the mist is not a thing
    a_box = Ac[y0_:y1_, x0_:x1_]
    Ac[y0_:y1_, x0_:x1_] = a_t * w_t + a_box * (1 - w_t)
    core[y0_:y1_, x0_:x1_] = np.where(w_t > .5, a_t > .4, core[y0_:y1_, x0_:x1_])
log('matte done')

# ---- 3. What stays still ----------------------------------------------------------------------------------------------
PW = W + 2 * M
At = pad(Ac[..., None])[..., 0]
coreP = pad(core[..., None].astype(np.float32))[..., 0] > .5
hide = nd.binary_dilation(coreP, disk(EDGE))           # what the castle's light spills on the sky, a few px: never sky
hide |= nd.binary_dilation(pad(((sp_shape > .5) & (yy0 < SPIRE_Y[3]))[..., None].astype(np.float32))[..., 0] > .5, disk(SPIRE_HIDE))
for pts, soft_px in STILL:
    p = poly(pts, PW, H, dx=M)
    a_ = smooth(nd.distance_transform_edt(p) / soft_px)
    At = np.maximum(At, a_)
    # A broad soft edge keeps the true clouds under its outer half (they go on drifting there, his pixels at rest). A ridge does not:
    # what lies against it is not sky.
    hide |= (a_ >= .5) if soft_px >= SOFT_STILL else nd.binary_dilation(p, disk(EDGE))
yyp, xxp = np.mgrid[0:H, 0:PW].astype(np.float32)
dm = np.hypot(xxp - (MOON[0] + M), yyp - MOON[1])
# Left and right of the castle, the sky meets the rock, the trees and the mist below the outline: everything under it is still.
low = smooth((yyp - (SPLIT - 60)) / 56) * ((xxp < M + 300) | (xxp > M + 1640))
At = np.maximum(At, low)
hide |= low >= .5
At_solid = At.astype(np.float32)                       # what is solved exactly, below
m_p = poly(MOUNT, PW, H, dx=M)
mount_a = (smooth(nd.distance_transform_edt(m_p) / MOUNT_SOFT) * (1 - smooth((yyp - MOUNT_FADE[0]) / (MOUNT_FADE[1] - MOUNT_FADE[0])))).astype(np.float32)
At = np.maximum(At, MOUNT_A * mount_a)
At[SPLIT:] = 1
At_solid[SPLIT:] = 1
# The moon. Only the disc itself is his, here: its rim taken from just inside the limb and carried outward, so that it is round whatever
# lies beside it. All the light around it is built in section 5, from the distance to its centre alone: nothing of a cloud can stay behind.
disc_a = (1 - smooth((dm - (MOON[2] - 1)) / 2)).astype(np.float32)
ux_, uy_ = (xxp - (MOON[0] + M)) / np.maximum(dm, 1), (yyp - MOON[1]) / np.maximum(dm, 1)
r_in = np.minimum(dm, MOON[2] - 2)
disc_c = np.stack([nd.map_coordinates(Op_c, [MOON[1] + uy_ * r_in, MOON[0] + M + ux_ * r_in], order=1) for Op_c in pad(O).transpose(2, 0, 1)], -1).astype(np.float32)
hole = dm < MOON[2] + HOLE_PX[1]                       # what the fill sees as unknown
not_sky = hide.copy()                                  # the castle, the ridges
At = At.astype(np.float32)

# ---- 4. What is not sky ------------------------------------------------------------------------------------------------
AfP = pad(Af[..., None])[..., 0]
Op = pad(O)
hide |= AfP > .01
# What is not a cloud and lies just outside the masks: a bead of edge, the tip of a pine, a lit speck, and along a tower the light it spills on the
# sky. It stays with the castle, in the still picture, or it would drift across the sky. It stands out from what is around it, and clouds are broader.
d_ns = nd.distance_transform_edt(~(not_sky | (AfP > .01))).astype(np.float32)
kk_ = (~hide & (d_ns > SPILL)).astype(np.float32)
Yp = Op @ LUMA
near_y = nd.gaussian_filter(Yp * kk_, 9) / np.maximum(nd.gaussian_filter(kk_, 9), 1e-3)
dev_ = Yp - near_y
close_ = d_ns <= SPILL
RBp = nd.gaussian_filter(Op[..., 0], 1.5) / np.maximum(nd.gaussian_filter(Op[..., 2], 1.5), 1)
near_rb = nd.gaussian_filter(RBp * kk_, 9) / np.maximum(nd.gaussian_filter(kk_, 9), 1e-3)
speckP = ~hide & (dm > MOON[2] + 150) & ((d_ns <= SPECK_NEAR) & ((dev_ < np.where(close_, -6, -SPECK_DARK)) | (dev_ > np.where(close_, 8, SPECK_BRIGHT)) | (close_ & (RBp - near_rb > .05))) | (Op[..., 0] / np.maximum(Op[..., 2], 1) > 1.1))
speckP[FH:] = False
# A broad patch of his sky against a ridge is not still either, or the clouds would never cross it. Nor is it in the sheet, where it would leave as a stain: the fill goes there.
lab_s, n_s = nd.label(speckP)
big_s = nd.sum(np.ones_like(lab_s), lab_s, range(n_s + 1)) > SPECK_MAX
big_s[0] = False
sky_patch = big_s[lab_s] & ((xxp > M + SPECK_RIGHT) | (yyp < SPECK_HIGH)) & (d_ns > SPECK_KEEP) & nd.binary_opening(speckP, disk(3))
speckP &= ~sky_patch
sky_patch = nd.binary_dilation(sky_patch, disk(3))
speckP = nd.binary_dilation(speckP, disk(2))
log('specks: %d px' % int(speckP.sum()))
# It goes from the sheet. It does not stay still either: frozen, it would show when the sky behind it changes. At rest it is simply not there.
# A crumb of the matte on its own, away from everything: not the castle. It would sit there on any sky.
lab_c, n_c = nd.label(At_solid > .25)
big_c = nd.sum(np.ones_like(lab_c), lab_c, range(n_c + 1)) >= SPECK_MAX
for x0_, y0_, x1_, y1_, *_ in THIN[1:]:              # a finial, branches: small and meant
    big_c[np.unique(lab_c[y0_:y1_, M + x0_:M + x1_])] = True
big_c[0] = True
crumb = nd.binary_dilation(~big_c[lab_c], disk(2))
At = np.where(crumb & (AfP <= .01), MOUNT_A * mount_a, At)
At_solid = np.where(crumb & (AfP <= .01), 0, At_solid)
hide |= speckP | sky_patch
hide = nd.binary_dilation(hide, disk(1))
hide[:, :M] = True
hide[:, M + W:] = True
log('hide done')


def strip(a, fill=0.0):
    """Device px of the padded plane -> the periodic strip of the clouds (the plane is 1984 wide, the loop 2048)."""
    out_ = np.full((FH, LOOP) + a.shape[2:], fill, np.float32)
    out_[:, :PW] = a[:FH]
    return out_


def gauss_wrap(a, s_):
    return nd.gaussian_filter(a, s_, mode=('nearest', 'wrap'))


def norm_blur(a, kk, sigma):
    return gauss_wrap(a * kk, sigma) / np.maximum(gauss_wrap(kk, sigma), 1e-4)


K_his = strip((~hide).astype(np.float32)) > .5           # all the sky that shows at rest
K0 = K_his & ~(strip(hole.astype(np.float32)) > .5)      # less what is around the moon: this is what the fill takes as known
r_sheet = strip(dm)
K0 = np.where(r_sheet < MOON[2] + 200, nd.binary_opening(K0, disk(4)), K0)   # no thin sliver left between the moon's zone and the spire
S = strip(Op)
log('sky known in the strip: %.1f %%' % (K0.mean() * 100))

# ---- 5. The sky's still light -----------------------------------------------------------------------------------------------
# What stays still in the sky is a function of the distance to the moon's centre and of nothing else: out = clouds x T(r) + P(r). So no shape of a cloud,
# at any scale, can stay behind, and there is no outline where it ends. It is measured on his sky: a low percentile of each ring, each channel, written as a sum
# of exponentials with positive weights, a curve that can only fall and ever more slowly: a shelf in it would read as a ring around the moon. Past LIGHT_FAR it is flat.
# T is how much of the clouds shows. It rises towards the moon with the light itself (LIGHT_ON_CLOUD), so P is that same curve, smaller, with no kink where it runs out:
# the glow keeps its shape on a dark sky, and it is stronger on a thick cloud than in a gap. Towards the limb T falls only as much as the blended colour's 8 bits ask of it.
r1_ = dm[:FH].astype(np.float64)
sky_ = (~hide[:FH]) & (r1_ > MOON[2] + 2)
edges = MOON[2] + 2 + np.geomspace(1, 1600, 110) - 1
bin_ = np.digitize(r1_[sky_], edges)
pix_, lum_, rad_ = Op[:FH][sky_], (Op[:FH][sky_] @ LUMA), r1_[sky_]
rows_ = [(float(np.median(rad_[bin_ == b])), np.percentile(pix_[bin_ == b], LIGHT_PCT, axis=0), *np.percentile(lum_[bin_ == b], [25, 75])) for b in np.unique(bin_) if (bin_ == b).sum() >= 40]
r_m = np.array([a_[0] for a_ in rows_])
med_m = np.array([a_[1] for a_ in rows_])
iqr_m = np.array([a_[3] - a_[2] for a_ in rows_])
far_m = med_m[(r_m > LIGHT_FAR[0]) & (r_m < LIGHT_FAR[1])].mean(0)
med_m = np.where((r_m > LIGHT_FAR[0])[:, None], far_m, np.maximum(med_m, far_m))


def exps(r_):
    x_ = np.maximum(r_ - MOON[2], 0)
    return np.stack([np.exp(-x_ / s_) for s_ in LIGHT_SCALES] + [np.ones_like(x_)], -1)


w_m = 1 / np.maximum(med_m, 8)                          # a ring's error, relative to its level: the far sky counts as much as the glow
coef = np.stack([nnls(exps(r_m) * w_m[:, i, None], med_m[:, i] * w_m[:, i])[0] for i in range(3)], -1)
far_ = exps(np.array([2000.0]))[0] @ coef
# His sky lies on one line, near the moon and far from it: a colour for each brightness, the same blue offset from the dark to the fairly bright. So the sheet is
# grey and its blue is still: the same clouds would otherwise come out too blue in the moon's light, or need an orange light over them, brown on a dark cloud.
C0 = np.full(3, far_[0] / T_FAR, np.float32)            # the clouds' middle level, in the sheet


def softmin(*vals):
    v_ = np.stack(vals, 0)
    return -np.log(np.exp(-SOFT_MIN * v_).sum(0)) / SOFT_MIN


# A table, every quarter px: the same for every pixel at that distance.
r_t = np.arange(0, 2400, .25)
M_t = exps(r_t) @ coef
T_t = softmin(T_NEAR + 0 * r_t, T_FAR + LIGHT_ON_CLOUD * (M_t[:, 0] - far_[0]) / C0[0], *[(LIGHT_MAX - M_t[:, i]) / (LIGHT_MAX - C0[i]) for i in range(3)])
T_t = np.clip(T_t, .02, 1)
P_t = np.clip(M_t - T_t[:, None] * C0, 0, None)
# Closer than this the sheet takes less than his whole contrast: amplified by 1 / T, a wisp by the limb would come out of it as a blotch.
iqr_t = np.interp(np.log(r_t + 1), np.log(r_m + 1), nd.gaussian_filter1d(iqr_m, 4))
Ts_t = np.maximum(T_t, iqr_t / SHEET_SPREAD)
log('still light: ' + ', '.join('r+%d T %.2f P %s' % (x_, T_t[int((MOON[2] + x_) * 4)], np.round(P_t[int((MOON[2] + x_) * 4)]).astype(int).tolist()) for x_ in (2, 6, 10, 15, 25, 50, 100, 200, 400, 800)))


def radial(tab, rr):
    return np.interp(rr, r_t, tab).astype(np.float32)


T_dev = radial(T_t, r1_)[..., None]
P_dev = np.stack([radial(P_t[:, i], r1_) for i in range(3)], -1)
M_dev = np.stack([radial(M_t[:, i], r1_) for i in range(3)], -1)
Ts_dev = radial(Ts_t, r1_)[..., None]

# ---- 6. The cloud sheet: his pixels, then what is hidden ---------------------------------------------------------------------
Cd = np.zeros((FH, LOOP, 3), np.float32)
Cd[:, :PW] = C0 + (S[:, :PW] - M_dev) / Ts_dev
# Under the left mountain the sheet keeps only his broad levels, too broad to hold its shape: they leave as a dark cloud.
m_s = strip(smooth(mount_a * 4))[..., None]
Cd = Cd * (1 - m_s) + m_s * np.stack([nd.gaussian_filter(Cd[..., i], MOUNT_LEVEL, mode='nearest') for i in range(3)], -1)
Cd = np.where(K_his[..., None], Cd, 0)
# The colour broader than a wisp that does not follow that line is evened out: warmth around the moon that is not in the rings, the blotches of the picture's
# compression, which the sheet's gain would show. Nothing warm leaves with a cloud.
far_k = K0 & (r_sheet > MOON[2] + 200)
y_d = Cd @ LUMA
y0_, y1_ = np.percentile(y_d[far_k], [1, 99])
off_ = np.stack([np.polyval(np.polyfit(y_d[far_k] / 255, Cd[..., i][far_k] - y_d[far_k], 1), np.clip(y_d, y0_, y1_) / 255) for i in range(3)], -1).astype(np.float32)
k_ = (K_his & (r_sheet > MOON[2] + HOLE_PX[0])).astype(np.float32)
res_ = np.stack([norm_blur((Cd - y_d[..., None] - off_)[..., i], k_, CHROMA_SIGMA) for i in range(3)], -1)
Cd = np.where(K_his[..., None], Cd - res_, 0)
# Beside the moon his dark clouds are darker than any far away, against a ring's light: nothing in the sheet goes below the far sky's dark, or it would leave as a black stain.
y_d = Cd @ LUMA
dark_ = float(np.percentile(y_d[far_k], DARK_PCT))
lift_ = (np.sqrt((y_d - dark_) ** 2 + DARK_SOFT ** 2) - (y_d - dark_)) / 2
lift_ = lift_ - (np.sqrt(((y_d * 0 + 255) - dark_) ** 2 + DARK_SOFT ** 2) - (255 - dark_)) / 2
Cd = Cd + lift_[..., None] * K_his[..., None]
Cd_his = np.clip(Cd, 0, 255)
Cd = np.where(K0[..., None], Cd, 0)
log('sheet: clipped %.3f %% of the known pixels above 255, %.3f %% below 0' % (float((Cd[K0] > 255).any(-1).mean() * 100), float((Cd[K0] < 0).any(-1).mean() * 100)))
Cd = np.clip(Cd, 0, 255)
k = K0.astype(np.float32)
# Broad shapes run smoothly across what is hidden.
wb = smooth((gauss_wrap(k, FILL_SPLIT) - .08) / .3)
Clow = np.stack([norm_blur(Cd[..., i], k, FILL_SPLIT) * wb + norm_blur(Cd[..., i], k, 3 * FILL_SPLIT) * (1 - wb) for i in range(3)], -1).astype(np.float32)
Clow = np.where(K0[..., None], Clow, np.maximum(Clow, dark_))    # a hidden part reaching over a few dark pixels never goes darker than the sky
detail = np.where(K0[..., None], Cd - Clow, 0).astype(np.float32)


def box_wrap(a, p):
    return nd.uniform_filter(a, p, mode=('nearest', 'wrap'))


def low_of(a, s_):
    return np.stack([nd.gaussian_filter(a[..., i], s_) for i in range(3)], -1)


def quilt(img, known, P_=PATCH, ov=PATCH // 2, seed=7):
    """What is hidden takes the sky's own clouds at full resolution: the best matching patch, a mirror of one half the time (a wisp met twice
    is not recognised), joined along the seam where the two agree most (a watershed on their difference), never averaged, which would blur."""
    rng = np.random.default_rng(seed)
    h, w_ = known.shape
    co = 8
    fullk = box_wrap(known.astype(np.float32), P_) > .999
    src = np.array([(y, x) for y in range(P_ // 2, h - P_ // 2, 6) for x in range(0, w_, 6) if fullk[y, x]])
    # What is filled should be as crisp as his crispest clouds, not as soft as the haze beside the hole: the energy of the fine band favours a source.
    fine_e = box_wrap(np.abs(img - np.stack([gauss_wrap(img[..., i], 6) for i in range(3)], -1)).sum(-1), P_)
    log('sources', len(src))
    if len(src) > 6000:
        src = src[rng.choice(len(src), 6000, replace=False)]
    idx_y = lambda cy: np.arange(cy - P_ // 2, cy - P_ // 2 + P_)
    idx_x = lambda cx: np.arange(cx - P_ // 2, cx - P_ // 2 + P_) % w_
    crisp = (fine_e[src[:, 0], src[:, 1]] / np.median(fine_e[src[:, 0], src[:, 1]])) ** CRISP
    thumbs = np.stack([img[np.ix_(idx_y(y), idx_x(x))][::co, ::co].reshape(-1) for y, x in src]).astype(np.float32)
    thumbs_f = np.stack([img[np.ix_(idx_y(y), idx_x(x)[::-1])][::co, ::co].reshape(-1) for y, x in src]).astype(np.float32)
    out = img.copy()
    done = known.copy()
    last = []
    n_ = 0
    n2 = len(src)
    while not done.all():
        frac = box_wrap(done.astype(np.float32), P_)
        frac2 = np.where(done, -1, frac - np.arange(h)[:, None] * 1e-5)     # top rows first on a tie: the visible sky is up there
        y, x = np.unravel_index(np.argmax(frac2), frac2.shape)
        y = int(np.clip(y, P_ // 2, h - P_ // 2))
        ys, xs = idx_y(y), idx_x(x)
        ixs = np.ix_(ys, xs)
        cur, mask, kn = out[ixs], done[ixs], known[ixs]
        dmask = nd.distance_transform_edt(mask)
        dborder = np.minimum.outer(np.minimum(np.arange(P_), np.arange(P_)[::-1]), np.minimum(np.arange(P_), np.arange(P_)[::-1])).astype(np.float32)
        t = cur[::co, ::co].reshape(-1)
        band = mask & (dmask <= ov)                                         # only the overlap counts: that is where the two must agree
        mk = np.repeat(band[::co, ::co].reshape(-1, 1), 3, 1).reshape(-1).astype(np.float32)
        ssd = np.concatenate([((thumbs - t) ** 2 * mk).sum(1) / crisp, ((thumbs_f - t) ** 2 * mk).sum(1) / crisp]) / max(mk.sum(), 1) + 1e-3
        for ly, lx in last[-24:]:                                           # not the same place again soon
            near = (np.abs(src[:, 0] - ly) < P_ * .75) & (np.minimum(np.abs(src[:, 1] - lx), w_ - np.abs(src[:, 1] - lx)) < P_ * .75)
            ssd[:n2][near] *= 2.0
            ssd[n2:][near] *= 2.0
        # A place that shows on the screen at the same time reads as a copy if it is too close.
        dist_x = np.minimum(np.abs(src[:, 1] - x), w_ - np.abs(src[:, 1] - x))
        ssd[:n2][dist_x < P_ * 2] *= 1.5
        pick = np.argsort(ssd)[:4]
        c_ = int(pick[rng.integers(len(pick))])
        fl = c_ >= n2
        sy, sx = src[c_ - n2 if fl else c_]
        last.append((sy, sx))
        sxs = idx_x(sx)[::-1] if fl else idx_x(sx)
        new = img[np.ix_(idx_y(sy), sxs)]
        # What was filled earlier and is near the new part: the seam runs here, well inside it, along where the fine detail agrees most. Across
        # it each band of the detail is cross-faded at its own width (fine: 1.5 px, broad: 16): no square edge, and nothing goes soft.
        free = mask & ~kn & (dmask <= ov)
        lead = free & (dmask <= ov // 2) & (dborder > ov // 2)               # the window's own edge is no seam: there the old stays
        c1, c2, n1, n2_ = low_of(cur, 6), low_of(cur, 18), low_of(new, 6), low_of(new, 18)
        if free.any():
            err = (((new - n1) - (cur - c1)) ** 2).sum(-1)
            pri = (65535 * (1 - np.clip(err / max(float(np.percentile(err[free], 98)), 1), 0, 1))).astype(np.uint16)
            mk_ = np.zeros(mask.shape, np.int16)
            mk_[~mask | lead] = 2
            mk_[mask & (~free | (dborder <= 3))] = 1
            take = nd.watershed_ift(pri, mk_) == 2
        else:
            take = ~mask
        res = np.zeros_like(cur)
        for lo_c, hi_c, lo_n, hi_n, sg in ((c1, cur, n1, new, 1.5), (c2, c1, n2_, n1, 6), (0, c2, 0, n2_, 16)):
            m_ = nd.gaussian_filter(take.astype(np.float32), sg, mode='nearest') * smooth(dborder / (2.5 * sg))
            m_ = np.where(~mask, 1, np.where(kn, 0, m_))[..., None]
            res += (hi_c - lo_c) * (1 - m_) + (hi_n - lo_n) * m_
        out[ixs] = res
        done[ixs] = True
        n_ += 1
    log('patches', n_)
    return out


def wisps(fine, source, guide, P_=ENRICH_PATCH, seed=11):
    """A band of fine detail for the whole sheet, from where it is crisp: overlapping soft windows, each the patch that sat on the most similar broad shape, added so that the
    energy stays the same where they overlap. A band with no broad content needs no seam, and there is no edge to see."""
    rng = np.random.default_rng(seed)
    h, w_ = source.shape
    co = 16
    frac = box_wrap(source.astype(np.float32), P_)
    src = np.array([(y, x) for y in range(P_ // 2, h - P_ // 2, 8) for x in range(0, w_, 8) if frac[y, x] > .7])
    log('wisp sources', len(src))
    ids = lambda c: np.arange(c - P_ // 2, c - P_ // 2 + P_)
    unit = lambda a: (a - a.mean(-1, keepdims=True)) / np.maximum(a.std(-1, keepdims=True), 1)
    g_s = unit(np.stack([guide[np.ix_(ids(y), ids(x) % w_)][::co, ::co].reshape(-1) for y, x in src]).astype(np.float32))
    g_f = unit(np.stack([guide[np.ix_(ids(y), (ids(x) % w_)[::-1])][::co, ::co].reshape(-1) for y, x in src]).astype(np.float32))
    win = np.hanning(P_ + 2)[1:-1].astype(np.float32)
    win = np.outer(win, win)[..., None]
    acc, wsq = np.zeros_like(fine), np.zeros((h, w_, 1), np.float32)
    n_ = len(src)
    used = []
    step = P_ // 2
    for cy in range(P_ // 2, h - P_ // 2 + step, step):
        cy = min(cy, h - P_ // 2)
        for cx in range(0, w_, step):
            ixs = np.ix_(ids(cy), ids(cx) % w_)
            g_ = unit(guide[ixs][::co, ::co].reshape(-1)[None].astype(np.float32))
            sc = np.concatenate([((g_s - g_) ** 2).mean(1), ((g_f - g_) ** 2).mean(1)])
            for ly, lx in used[-48:]:                           # not the same place again soon
                near = (np.abs(src[:, 0] - ly) < P_) & (np.minimum(np.abs(src[:, 1] - lx), w_ - np.abs(src[:, 1] - lx)) < P_)
                sc[:n_][near] += 1
                sc[n_:][near] += 1
            c_ = int(np.argsort(sc)[:6][rng.integers(6)])
            sy, sx = src[c_ % n_]
            used.append((sy, sx))
            sxs = ids(sx) % w_
            patch = fine[np.ix_(ids(sy), sxs[::-1] if c_ >= n_ else sxs)]
            acc[ixs] += patch * win
            wsq[ixs] += win ** 2
    return acc / np.sqrt(np.maximum(wsq, 1e-3))


Df = quilt(detail, K0)
# Close to what it continues the fill is no crisper than that: his soft sky next to a crisp patch would show the hidden part's outline.
E_k = norm_blur(np.abs(detail).sum(-1), k, 24)
E_f = gauss_wrap(np.abs(Df).sum(-1), 24)
ratio_ = np.clip(E_k / np.maximum(E_f, 1e-3), 0, 1)
Df = Df * (ratio_ + (1 - ratio_) * smooth(nd.distance_transform_edt(~K0) / CRISP_RAMP))[..., None]
Cf = np.where(K0[..., None], Cd, Clow + Df)
# Where a filled part meets the true sky it takes the sky's level, broadly (a membrane), then its smooth continuation over the last few px:
# the outline of a tower never drifts out.
def join(img, known, seen):
    pw_ = 256
    wrap_ = lambda a: np.concatenate([a[:, -pw_:], a, a[:, :pw_]], 1)
    K_w = wrap_(known)
    dist_w, (iy_, ix_) = nd.distance_transform_edt(~K_w, return_indices=True)
    ring_ = (dist_w > 0) & (dist_w <= 2)
    Cw = wrap_(img)
    d0 = (Cw[iy_, ix_] - Cw) * ring_[..., None]
    wr = nd.gaussian_filter(ring_.astype(np.float32), 12)
    dl = np.stack([nd.gaussian_filter(d0[..., i], 12) for i in range(3)], -1) / np.maximum(wr, 1e-3)[..., None]
    dl = dl * (1 - smooth(dist_w / MEMBRANE))[..., None] * (~K_w)[..., None]
    Cw = Cw + dl
    near_c = fill_near(wrap_(np.where(known[..., None], seen, 0)), K_w, sigmas=(1.5, 3, 6, 12, 24))
    w_e = (1 - smooth(dist_w / EDGE_FADE))[..., None] * (~K_w)[..., None]
    return np.clip((Cw * (1 - w_e) + near_c * w_e)[:, pw_:-pw_], 0, 255).astype(np.float32)


Cf = join(Cf, K0, Cd)
# Under the moon and just around it: one piece of his sky, whole, mirrored or not, the one that continues best what lies around and is crisp all round.
R_z = MOON[2] + HOLE_PX[1]
half, half_k = int(R_z) + 40, int(R_z) + 8
cx_m, cy_m = int(round(MOON[0] + M)), int(round(MOON[1]))
yb, xb = np.mgrid[-half:half, -half:half].astype(np.float32)
rb = np.hypot(xb + .5, yb + .5)
ring_b = (rb > R_z) & (rb < R_z + 34) & K0[cy_m - half:cy_m + half, cx_m - half:cx_m + half]
low_c = np.stack([gauss_wrap(Cf[..., i], 14) for i in range(3)], -1)
full_b = box_wrap(K0.astype(np.float32), 2 * half_k) > .999
target = low_c[cy_m - half:cy_m + half, cx_m - half:cx_m + half]
hi_e = np.abs(Cf - low_c).sum(-1)
ang_b = ((np.arctan2(yb, xb) + np.pi) / (2 * np.pi) * 6).astype(np.int32).clip(0, 5)
sect = [(rb < R_z) & (rb > MOON[2]) & (ang_b == i_) for i_ in range(6)]
# Which also looks most like what he has there, at rest. And far from where it is taken, or the two would be recognised as one.
K_b = K_his[cy_m - half:cy_m + half, cx_m - half:cx_m + half]
his_low = np.stack([norm_blur(Cd_his[..., i], K_his.astype(np.float32) * (r_sheet > MOON[2] + 6), 14) for i in range(3)], -1)[cy_m - half:cy_m + half, cx_m - half:cx_m + half]
zone_b = (rb < R_z) & (rb > MOON[2] + 8) & K_b
best = None
for y in range(half, min(FH - half, 420), 8):
    for x in range(0, LOOP, 8):
        if not full_b[y, x] or min(abs(x - cx_m), LOOP - abs(x - cx_m)) < 2 * half_k:
            continue
        ix_b = np.arange(x - half, x + half) % LOOP
        blk = low_c[y - half:y + half][:, ix_b]
        en_ = hi_e[y - half:y + half][:, ix_b]
        for fy, fx in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            b_ = blk[::fy, ::fx]
            e_ = en_[::fy, ::fx]
            en = min(float(e_[m_].mean()) for m_ in sect)       # crisp all round, not only on one side
            dd_ = (b_ - target)[ring_b]
            dz_ = (b_ - his_low)[zone_b]
            sc = float(((dd_ - dd_.mean(0)) ** 2).mean() + (dd_.mean(0) ** 2).mean() + (dz_ ** 2).mean()) / max(en, 1)
            if best is None or sc < best[0]:
                best = (sc, y, x, fy, fx, en)
log('moon block', best)
_, y_b, x_b, fy_b, fx_b, _ = best
ix_b = np.arange(x_b - half, x_b + half) % LOOP
blk_full = Cf[y_b - half:y_b + half][:, ix_b][::fy_b, ::fx_b]
blk_low = low_c[y_b - half:y_b + half][:, ix_b][::fy_b, ::fx_b]
# Its broad level is his, all round: dark where he has a dark cloud against the limb, bright where he has a bright one. So broad, it has no curve of the limb in it.
aim_b = np.where((zone_b | (rb >= R_z))[..., None], np.where(zone_b[..., None], his_low, target), blk_low)
m_b = (zone_b | (rb >= R_z)).astype(np.float32)
d_b = np.stack([nd.gaussian_filter((aim_b - blk_low)[..., i] * m_b, BLOCK_LEVEL) for i in range(3)], -1) / np.maximum(nd.gaussian_filter(m_b, BLOCK_LEVEL), .05)[..., None]
blk_fit = blk_full + d_b
v_z = (1 - smooth((rb - R_z) / 34))[..., None]
Cf[cy_m - half:cy_m + half, cx_m - half:cx_m + half] = Cf[cy_m - half:cy_m + half, cx_m - half:cx_m + half] * (1 - v_z) + blk_fit * v_z
# Around the moon: from the fill to his pixels, and away from what hides them.
k_h = K_his.astype(np.float32)
low_h = np.stack([norm_blur(Cd_his[..., i], k_h, HOLE_SPLIT) for i in range(3)], -1).astype(np.float32)
fine_h = np.where(K_his[..., None], Cd_his - low_h, 0)
low_f = np.stack([gauss_wrap(Cf[..., i], HOLE_SPLIT) for i in range(3)], -1).astype(np.float32)
w_low = (smooth((r_sheet - (MOON[2] + HOLE_PX[0])) / (HOLE_PX[1] - HOLE_PX[0])) * K_his)[..., None].astype(np.float32)
w_fine = (smooth((r_sheet - (MOON[2] + HOLE_FINE[0])) / (HOLE_FINE[1] - HOLE_FINE[0])) * K_his)[..., None].astype(np.float32)
Cf = low_f * (1 - w_low) + low_h * w_low + (Cf - low_f) * (1 - w_fine) + fine_h * w_fine
# What is hidden beside his pixels there (the spire) takes their level: its outline does not leave with the clouds.
Cf = join(Cf, K_his & (r_sheet > MOON[2] + HOLE_PX[0] + 4), Cf)
# His sky is crisp only around the moon, soft elsewhere, and all of it passes by the moon. So the soft parts take a band of fine wisps from his crispest clouds, by as much as they lack: added
# to his pixels, his shapes untouched. Patches are chosen on the broad shape they sat on, so a wisp lands where a cloud's edge is.
low_e = np.stack([gauss_wrap(Cf[..., i], ENRICH_SPLIT) for i in range(3)], -1).astype(np.float32)
fine_e = Cf - low_e
e_map = gauss_wrap(np.abs(fine_e @ LUMA), 20)
e_aim = float(np.percentile(e_map[K0 & (r_sheet < MOON[2] + 320) & (strip(yyp) < 420)], ENRICH_PCT))
crisp_k = (e_map > .8 * e_aim) & K0
log('enrich: aim %.2f, crisp sources %.1f %%' % (e_aim, crisp_k.mean() * 100))
guide_e = gauss_wrap(Cf @ LUMA, 8) - gauss_wrap(Cf @ LUMA, 48)
q_e = wisps(fine_e, crisp_k, guide_e)
e_q = gauss_wrap(np.abs(q_e @ LUMA), 20)
gain_e = np.clip(e_aim / np.maximum(e_map, .3), 1, ENRICH_GAIN)
# Less of it in the darkest of the sky: wisps belong where there is light on a cloud, and his dark sky is calm.
lit_e = ENRICH_DARK + (1 - ENRICH_DARK) * smooth((low_e @ LUMA - ENRICH_LIT[0]) / (ENRICH_LIT[1] - ENRICH_LIT[0]))
add_e = (gain_e[..., None] - 1) * fine_e + q_e * (np.clip(np.maximum(e_aim - e_map * gain_e, 0) / np.maximum(e_q, .3), 0, 1.4) * ENRICH_A * lit_e)[..., None]
Cf = np.clip(Cf + add_e, 0, 255)
log('enrich: fine band rms before %.2f after %.2f' % (float((fine_e @ LUMA).std()), float(((fine_e + add_e) @ LUMA).std())))
save_rgb(os.path.join(OUT, 'clouds.webp'), np.concatenate([Cf, Cf[:, :2]], 1), q=Q_CLOUDS)
sheet = load(os.path.join(OUT, 'clouds.webp'))[..., :3][:, :LOOP]
log('sheet error rms %.2f' % float(np.sqrt(((sheet - Cf) ** 2).mean())))

# ---- 7. The still top, solved against what is really drawn under it ---------------------------------------------------------
U = sheet[:, :PW] * T_dev + P_dev
top_h = SPLIT + LAP
Ot = Op[:top_h]
Un = np.zeros_like(Ot)
Un[:FH] = U
Un[FH:] = Ot[FH:]
Atop = At[:top_h].copy()
# The fade over castle-base at the very bottom.
Atop[SPLIT:] *= (1 - smooth((np.arange(top_h - SPLIT) + .5) / LAP))[..., None]
Asolve = np.where(np.arange(top_h)[..., None] >= SPLIT, 1, Atop)               # at and below the split, the plain picture
# Under a soft edge, alpha rises just enough for the colour to stay in range: the picture at rest is exact.
Aneed = np.maximum((Ot - Un) / np.maximum(255 - Un, 1), (Un - Ot) / np.maximum(Un, 1)).max(-1)
# Only what is whole there may rise. A rim outside the outline stays out of the still picture: whatever is frozen around a shape comes and goes as the sky behind it changes.
major = At_solid[:top_h] > .92
# The spire's veiled part and the pinnacle beside it are what their shapes say, nothing more: so close to the moon, a rim of old sky would show.
no_rim = (xxp[:top_h] - M > SPIRE_X[0]) & (xxp[:top_h] - M < SPIRE_X[1] + 14) & (yyp[:top_h] < SPIRE_Y[3] + 25)
Asolve = np.where(major & ~no_rim, np.maximum(Asolve, Aneed), Asolve).astype(np.float32)
Atop = np.where(np.arange(top_h)[..., None] >= SPLIT, Atop, Asolve)
Un_m = Un.copy()
m_t = mount_a[:top_h, ..., None]
Un_m = Un * (m_t <= 0) + np.stack([nd.gaussian_filter(Un[..., i], MOUNT_LEVEL) for i in range(3)], -1) * (m_t > 0)    # the contour alone: not the negative of the sheet's clouds
F = np.where(Asolve[..., None] > .02, (Ot - (1 - Asolve[..., None]) * Un_m) / np.maximum(Asolve[..., None], .02), Ot)
F = np.where(m_t > 0, Un_m + ((Ot - Un_m) @ LUMA)[..., None] / np.maximum(Asolve[..., None], .02), F)    # and no colour of its own, which would tint the clouds passing
# Up there it may not be pale, whatever the picture at rest asks of it (SPIRE). Its colours are his pixels, carried out from just inside on its left, where his mist is against it, and
# as they are on its right, which is his lit edge. Only the broad colour is brought down: the lit edge, too thin for it, stays.
sp_top = (smooth((np.arange(top_h, dtype=np.float32) - SPIRE_LIT[0]) / (SPIRE_LIT[1] - SPIRE_LIT[0])))[:, None, None]
spW = pad((sp_w * sp_shape)[..., None])[:top_h, :, 0] > .001
sp_in = pad(sp_shape[..., None])[:top_h, :, 0] > .8
_, (iy_s, ix_s) = nd.distance_transform_edt(~sp_in, return_indices=True)
sp_axis = M + SPIRE[0][0] + (yyp[:top_h] - SPIRE[0][1]) * ((SPIRE[1][0] + SPIRE[2][0]) / 2 - SPIRE[0][0]) / (SPIRE[1][1] - SPIRE[0][1])
# An edge pixel's colour is what lies just inside it: solved against the sheet at rest, it would keep what his sky has more than the sheet there, a thin pale line around the castle at any other moment.
in_s = major & (Asolve >= .92)
in_d = nd.binary_erosion(in_s, disk(1))                 # a pixel deeper: the outermost whole one still holds a little sky
d_s, (iy_e, ix_e) = nd.distance_transform_edt(~in_d, return_indices=True)
edge_s = ~in_d & (d_s <= 5) & (At_solid[:top_h] > 0) & (m_t[..., 0] <= 0)
F = np.where(edge_s[..., None], Ot[iy_e, ix_e], F)
F_s = np.where((yyp[:top_h, :, None] < SPIRE_Y[2]), np.where((xxp[:top_h] < sp_axis)[..., None], Ot[iy_s, ix_s], Ot), F)
F = np.where(spW[..., None], F_s, F)
F_low = np.stack([nd.gaussian_filter(np.clip(F[..., i], 0, 255) * spW, 2) / np.maximum(nd.gaussian_filter(spW.astype(np.float32), 2), .02) for i in range(3)], -1)
gain_s = np.minimum(1, SPIRE_TONE / np.maximum(F_low @ LUMA, 1))[..., None] ** (1 - sp_top)
F = np.where(spW[..., None], F_low * gain_s + F - F_low, F)
# The disc, his pixels, opaque.
Dt = disc_a[:top_h, ..., None]
F = np.clip(F, 0, 255)
# The light of the sky goes under all that, in the same picture: one blended layer over the clouds, not two.
Va = np.zeros((top_h, PW, 1), np.float32)
Vp = np.zeros((top_h, PW, 3), np.float32)
Va[:FH] = 1 - T_dev
Vp[:FH] = P_dev
A3 = Atop[..., None]
Aall = A3 + Va * (1 - A3)
Fall = np.where(Aall > .002, (np.clip(F, 0, 255) * A3 + Vp * (1 - A3)) / np.maximum(Aall, .002), F)
# The disc: his pixels, but for what passes behind, which shows through it a little, around the sheet's own middle, so that over the loop the moon is his. As much as the 8 bits of each ring's
# brightest pixels leave: hardly anything at the centre, more towards the rim, so a cloud crossing the limb crosses it on both sides. A function of the distance alone, like the light outside.
s_mid = sheet[int(MOON[1] - MOON[2]):int(MOON[1] + MOON[2])].mean((0, 1))
dr_ = dm[:top_h]
T_d = (T_DISC + (T_DISC_MAX - T_DISC) * smooth((dr_ - T_DISC_RIM[0]) / (T_DISC_RIM[1] - T_DISC_RIM[0])))[..., None].astype(np.float32)
a_d = 1 - T_d
c_d = (disc_c[:top_h] - T_d * s_mid) / a_d
c_d = c_d * np.minimum(1, 255 / np.maximum(c_d.max(-1, keepdims=True), 1))    # what is too bright for that loses all channels alike: his colour stays
A_f = Aall * (1 - Dt) + a_d * Dt
Fall = np.where(A_f > .002, (Fall * Aall * (1 - Dt) + c_d * a_d * Dt) / np.maximum(A_f, .002), Fall)
Aall = A_f
save_rgba(os.path.join(OUT, 'castle-top.webp'), np.clip(Fall, 0, 255), Aall[..., 0], q=Q_TOP)

# ---- 8. castle-base and the trees: the lake mist and the night fade baked in (no screen-sized layer for them at rest) ----------
mist = load(MIST)
mist_h = int(round(H * .24))
mist_top = int(round(H * .70))
mist_up = np.asarray(Image.fromarray(mist.astype(np.uint8), 'RGBA').resize((W, mist_h), Image.BICUBIC)).astype(np.float32)
base = O.copy()
ma = mist_up[..., 3:] / 255 * .13
base[mist_top:mist_top + mist_h] = base[mist_top:mist_top + mist_h] * (1 - ma) + mist_up[..., :3] * ma
Hy = np.arange(H, dtype=np.float32) / H
fade = np.interp(Hy, [0, .66, .82, 1], [0, 0, .40, .78]).astype(np.float32)
NIGHT = np.array([9, 11, 18], np.float32)          # the fade's colour (.home-shade: --shade)
fade2 = fade[:, None, None]
graded_base = base * (1 - fade2) + NIGHT * fade2
graded_fg = O * (1 - fade2) + NIGHT * fade2
save_rgb(os.path.join(OUT, 'castle-base.webp'), pad(graded_base)[SPLIT:], q=90)
Fp = pad(graded_fg)
geo = {}
for name, sel in (('fg-left', slice(0, PW // 2)), ('fg-right', slice(PW // 2, PW))):
    a = AfP[:, sel]
    ys, xs = np.nonzero(a > .002)
    bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    bx0, by0, bx1, by1 = bx0 & ~1, by0 & ~1, bx1 + (bx1 & 1), by1 + (by1 & 1)    # whole CSS px: a half one is snapped, and resampled, on a screen laid out in CSS px
    off = sel.start
    save_rgba(os.path.join(OUT, name + '.webp'), Fp[by0:by1, off + bx0:off + bx1], a[by0:by1, bx0:bx1], q=90)
    geo[name] = {'x': int(off + bx0), 'y': int(by0), 'w': int(bx1 - bx0), 'h': int(by1 - by0)}

# ---- 9. How close: the layers put back together, against castle.jpg, and the geometry --------------------------------------
rec = np.zeros((H, PW, 3), np.float32)
rec[:FH] = sheet[:, :PW]
top = load(os.path.join(OUT, 'castle-top.webp'))
base_dec = load(os.path.join(OUT, 'castle-base.webp'))
rec[SPLIT:] = base_dec
ta = top[..., 3:] / 255
rec[:top_h] = top[..., :3] * ta + rec[:top_h] * (1 - ta)
for name, g in geo.items():
    f = load(os.path.join(OUT, name + '.webp'))
    fa = f[..., 3:] / 255
    rec[g['y']:g['y'] + g['h'], g['x']:g['x'] + g['w']] = f[..., :3] * fa + rec[g['y']:g['y'] + g['h'], g['x']:g['x'] + g['w']] * (1 - fa)
crop = rec[:SPLIT, M:M + W]
e = crop - O[:SPLIT]
psnr = 10 * np.log10(255 ** 2 / float((e ** 2).mean()))
log('rest vs castle.jpg above the split: %.1f dB, worst %.0f' % (psnr, float(np.abs(e).max())))


def box(x, y, w_, h_):
    return {'x': x / 2, 'y': y / 2, 'w': w_ / 2, 'h': h_ / 2}


old = {}
scene_json = os.path.join(ASSETS, 'scene', 'scene.json')
if os.path.exists(scene_json):
    old = json.load(open(scene_json, encoding='utf8'))
scene = {
    'note': 'Parapet backdrop cut from assets/castle.jpg by tools/parapet_scene.py. Device px = image px of castle.jpg (1920x1080 on a 960x540 CSS screen at DPR 2). Every plane is 16 CSS px wider than the screen on each side: place each plane container at left:-16px, top:0, 992x540 CSS, and translate it horizontally only. All numbers below are CSS px inside the plane. Stacking (back to front): clouds, castle-base, castle-top, lit-windows, lake-shimmer, fg-left + fg-right.',
    'screenCss': [960, 540], 'planeCss': {'left': -16, 'top': 0, 'w': 992, 'h': 540}, 'marginCss': 16,
    'parallaxCssPerStep': {'sky': 3, 'castle': 3, 'fg': 7}, 'maxShiftCss': {'sky': 5, 'castle': 5, 'fg': 10},
    'clouds': {'loopCss': LOOP // 2, 'note': 'Two copies of the picture side by side in a wrapper that slides translateX(0 -> -loopCss) and repeats, by whole device px.', 'seconds': DRIFT_S, 'stepsPerSecond': round(LOOP / DRIFT_S, 2)},
    'planes': [
        {'name': 'clouds', 'parent': 'sky', 'src': 'clouds.webp', 'css': {'x': 0, 'y': 0, 'w': LOOP // 2 + 1, 'h': FH // 2}, 'note': 'opaque, 2 pixels per CSS px: 1:1 on a DPR 2 screen; the second copy overlaps the first by 1 CSS px'},
        {'name': 'castle-base', 'parent': 'castle', 'src': 'castle-base.webp', 'css': box(0, SPLIT, PW, H - SPLIT), 'note': 'opaque; the lake mist and the night fade are baked in'},
        {'name': 'castle-top', 'parent': 'castle', 'src': 'castle-top.webp', 'css': box(0, 0, PW, top_h), 'note': "alpha: the light of the sky, the moon's disc and glow, the silhouette, the mountains; its last 8 CSS px fade over castle-base"},
        {'name': 'lit-windows', 'parent': 'castle', 'src': 'lit-windows.webp', 'css': {'x': 173.0, 'y': 164.5, 'w': 517.5, 'h': 251.5}, 'note': 'opacity 0 at rest; windows.json for the wave'},
        {'name': 'lake-shimmer', 'parent': 'castle', 'src': ['lake-shimmer-a.webp', 'lake-shimmer-b.webp'], 'css': {'x': 536.0, 'y': 484.0, 'w': 360.0, 'h': 56.0}, 'note': 'Ambiance vivante only; not in the DOM when it is off'},
        {'name': 'fg-left', 'parent': 'fg', 'src': 'fg-left.webp', 'css': box(geo['fg-left']['x'], geo['fg-left']['y'], geo['fg-left']['w'], geo['fg-left']['h'])},
        {'name': 'fg-right', 'parent': 'fg', 'src': 'fg-right.webp', 'css': box(geo['fg-right']['x'], geo['fg-right']['y'], geo['fg-right']['w'], geo['fg-right']['h'])},
    ],
    'moon': {'cxCss': MOON[0] / 2, 'cyCss': MOON[1] / 2, 'rCss': MOON[2] / 2, 'note': 'screen CSS px at rest (plane offset already removed); it is in castle-top'},
    'sprites': old.get('sprites', {}),
}
json.dump(scene, open(os.path.join(OUT, 'scene.json'), 'w', encoding='utf8', newline=chr(10)), indent=2)
sizes = {f: Image.open(os.path.join(OUT, f)).size for f in ('clouds.webp', 'castle-top.webp', 'castle-base.webp', 'fg-left.webp', 'fg-right.webp')}
log(json.dumps(sizes))
