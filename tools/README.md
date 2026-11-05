# Tools

This folder holds what is needed to run the mock-up, to drive the TV from a computer and to rebuild at home what the repository ships. None of these tools is required to use the interface once it is served.

| File | Role |
|---|---|
| `serve.mjs` | Dependency-free static server for the web mock-up: `node tools/serve.mjs . 8765`, then http://localhost:8765/app/index.html. Listens on `127.0.0.1` only, serves only files under the given root, no caching. |
| `logos-build.mjs` | Bundles your own `app/assets/logos.js` from a folder of SVGs (below). |
| `tv.sh`, `tv.ps1` | Every adb operation on the TV, bash and PowerShell (below). |
| `test-sound.mjs` | Checks that the background waltz (`MELODY` in `app/js/sound.js`) does not quote the films' theme: `node tools/test-sound.mjs` (see `docs/MUSIC.md`). |
| `parapet_scene.py` | Cuts the Parapet's backdrop out of `castle.jpg`: the clouds that drift, the castle's silhouette, the strip below the skyline: `python -I tools/parapet_scene.py` (below). |
| `shop_sprites.py` | Cuts the sprites of the shop windows out of the owner's pictures and bakes the rest pictures: `python tools/shop_sprites.py` (see "The shop windows" below). |
| `cutout_owl.py` | Cuts out an owl generated on a black background (Pillow): `python -I tools/cutout_owl.py input.png output.png 640`. `--grade in out` grades a sheet for the Parapet's night, once (see its docstring). |

The generation scripts for the backdrops themselves (`tools/generer_*.ps1`) are not versioned (they depend on a local machine and model); the method is described below. `tools/tv.ps1` is the only PowerShell script in the repository.

## App logos (`app/assets/logos.js`)

The repository **carries** `app/assets/logos.js`, the maintainer's own set, versioned at his explicit request: the services' logos are trademarks of their owners and are not covered by the MIT license (see `DISCLAIMER.md`, section "Third-party material versioned at the maintainer's request"). Besides:

- `app/assets/logos.example.js` exports an empty `LOGOS` object: it only shows the shape of the file. **Do not copy it over `logos.js`**: that would erase the versioned logos (earlier versions of this README said to);
- every screen applies `const L = LOGOS[app.id] || monogram(app.name)`: an app without a logo (one added by hand from the Map, for instance) gets a monogram (its initial in a circle, `app/js/monogram.js`), in the same format.

### Rebuilding your own logos (private use)

For strictly personal use, you can bundle a `logos.js` of your own from monochrome SVGs. The original mock-up used the pictograms from [Simple Icons](https://simpleicons.org) (CC0 licence for the files; the trademarks themselves remain the property of their owners, and Simple Icons reminds you that their use is subject to each brand's terms). Check those terms before any use other than private.

Expected format, one record per `CATALOG` `id` from `app/js/config.js`:

```js
export const LOGOS = {
  netflix: { src: 'data:image/svg+xml;base64,…', ratio: 1, luma: false },
  // …
};
```

- `src`: a **white** SVG (`fill="#ffffff"`) on a transparent background, base64-encoded in a data URI. It serves as a CSS mask: `shared.css` renders it as ivory with a dark rim, at rest and in focus. Never gold.
- `ratio`: width divided by height of the view box (`viewBox`). The screens fix the height and derive the width; 1 for a square pictogram.
- `luma`: `true` if the SVG is a solid fill (a logo on a colored background, for example) and must be masked by luminance rather than by alpha. In the versioned file: `canal`, `m6`.

Procedure, with Node alone (no dependencies), from any directory, under bash, PowerShell or cmd:

```bash
# 1. Put one white SVG per id in a working folder, named <id>.svg (netflix.svg, prime.svg, …).
#    The available ids are those of CATALOG: netflix prime disney canal max appletv paramount youtube
#    francetv tf1 m6 arte molotov crunchyroll dazn twitch spotify deezer plex
# 2. Bundle them (optional second argument: the ids to mask by luminance):
node tools/logos-build.mjs ./my-logos canal,m6
```

The script always writes to `app/assets/logos.js` (path resolved from the script, not from the current directory), replacing the versioned file and carrying over the `OPTICAL` table at its end (each logo's optical scale, measured by hand: your own logos may need other values). Do not commit your version; `git checkout app/assets/logos.js` brings the versioned one back.

## On Android TV: `appIcon(pkg)` instead of logos

The Android launcher does not need this file. Every installed app already provides the system with a Leanback banner (320 × 180 dp) and an icon. The `window.Android` bridge (`android/src/fr/wavia/poudlardtv/Bridge.java`) exposes an `appIcon(pkg)` method that returns this image as a data URI (PNG), or `null` if the app provides nothing. **In this version, the screens do not call it yet** (`app/js/platform.js` only exposes `launch`, `openContent`, `installed`): they display `LOGOS[id]` or the monogram. The planned wiring: the screen uses `appIcon(pkg)` the way it uses `LOGOS[id].src`, and the monogram remains the fallback.

On the Java side (`Apps.java`), the image is looked up in this order: 1) the app's banner resource at xxxhdpi density (384 × 216, sharper), 2) `getApplicationBanner`, 3) `getApplicationIcon`, centered on a night background. It is converted to PNG and cached in memory on first display. Nothing is downloaded and nothing leaves the device.

## How the backdrops were produced

The scenery in `app/assets/` (castle, parchment, mist, the owl in her poses, the Ollivanders and Beasts windows, the rider) was generated locally, with no image from the films, then retouched by hand. The four house crest pictures are the exception: they are cut out from published artwork owned by Warner Bros. and versioned at the maintainer's request (`DISCLAIMER.md`). The generation scripts (`tools/generer_*.ps1`) are not versioned (machine-specific paths); here is the method, reproducible with any local generation tool.

Whatever the tool, export each image at the size it is displayed (a 1080p TV at most, often less) and never wider than 4096 px: some TV GPUs refuse larger textures, and every decoded pixel costs memory on a 1.3 GB TV.

- **Model**: Z-Image Turbo (Apache 2.0 licence) as a Q4_K-quantized GGUF, run by `sd-cli` (stable-diffusion.cpp), VAE on CPU, 8 steps, `cfg-scale 1.0`, quantized Qwen3-4B-Instruct text encoder. Each image is produced with a fixed seed, noted below, so that it can be regenerated identically.
- **Castle** (`castle.jpg`, 1920 × 1080, seed 777): "cinematic film still of a vast gothic wizard school castle at night, closer view, towers rising above the camera, perched on dramatic cliffs above a black mirror lake, dozens of slender towers and spires with conical slate roofs, great hall with tall arched stained glass windows glowing warm amber, lit astronomy tower, moonlight through dramatic clouds, thin mist over the water, small lanterns of rowing boats, misty highlands, 35mm anamorphic, volumetric light, deep blue and warm gold palette, no text, no people". The word "Hogwarts" serves only as visual direction for the model; no image from the films enters the process.
- **Parchment** (`parchment.jpg`, 1536 × 864, seed 33): blank old parchment, folds and burnt edges, a wax stain, seen from above.
- **Mist** (`scene/lake-mist-tile.webp`, seed 44): horizontal wisps of white mist, isolated on a pure black background, then converted to alpha and made seamless.
- **Owl** (1024 × 1024, seed 11 for every pose, to keep the same animal): a snowy owl, white plumage with a few dark flecks, yellow eyes, wildlife photo, isolated on a pure black background, full body; one variant per pose (perched, looking over the shoulder, asleep, take-off, gliding, landing). Then cut out with `cutout_owl.py`.
- **Ollivanders shop window** (`tools/shop-refs/ollivanders.webp`): the interior of an old shop, shelves of long boxes, candlelight, no text.

Every prompt is in English, ends with "no text" and excludes people and flying figures. Raw outputs and intermediate renders stay out of the repository (`.gitignore`).

## The television, from the computer: `tools/tv.sh` and `tools/tv.ps1`

Two equivalent scripts (bash, PowerShell) wrap every adb operation on the TV, with `PKG=fr.wavia.poudlardtv` and
nothing that touches another app. Every command prints what it runs first; `ADB=echo tools/tv.sh …` shows the
commands without running them.

| Command | Does |
|---|---|
| `connect <ip>` | `adb connect <ip>:5555` |
| `install [apk]` | `adb install -r PoudlardTV.apk`, then the TCL auto-start allowance (ignored elsewhere) |
| `home poudlard` | re-enables our `.Home` entry and runs `cmd package set-home-activity` on it (what the role dialog does on the TV) |
| `home original` | finds the other home (HOME activities minus ours and FallbackHome, third-party launchers such as Free My TV included; `tools/tv.sh home original <package>/<activity>` names it), gives it the Home key with `cmd package set-home-activity`. It does not run `pm disable-user`, which Android 11 refuses |
| `status` | HOME role holders, our component state, installed version |
| `logs` | `adb logcat -s PoudlardTV chromium` |
| `uninstall` | `home original`, then `adb uninstall` (uninstalling alone also gives Home back) |
| `config pull` / `push` | the launcher's configuration file, through `run-as` (debuggable builds only: `POUDLARD_DEBUG=1 bash android/build.sh`) |

Install pitfalls, inherited from Free My TV's field reports: install over adb only (never open the APK on the TV);
Play Protect's "Risky app blocked" → More details → Install anyway; Chromecast with Google TV (Android 14) closes
port 5555 at each restart (`adb pair` then `adb tcpip 5555`); uninstall a build signed with another key first;
an update is `adb install -r`.

By hand, the way back on Android 11+ is one command: list the homes with
`adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME`, then
`adb shell cmd package set-home-activity <package>/<activity>` (for example `io.freemytv/.HomeActivity`). Installing
never takes the Home key: Poudlard's HOME entry stays disabled until the person chooses « Faire de Poudlard l'accueil ».

Kept outside the tree on purpose (gitignored): `_ecarte/` (working files), the `tools/generer_*.ps1` generation
scripts with personal paths, `app/artifact.html`, `__pycache__/`, the build clone `repo/`. The app logos, the crest
pictures and the music are versioned (`DISCLAIMER.md`).

### The Fantastic Beasts window (`tools/shop-refs/beasts.webp`)

Generated locally (Z-Image Turbo, `generate.ps1 -Format paysage -Seed 7`, 1024×576; the reference kept here is 1920×1080, the size `LIBRARY` and the sprites use) with a generic prompt, no
franchise term: *cinematic shop window at night, three worn leather suitcases with brass clasps displayed side by
side on a wooden counter, evenly spaced, each suitcase slightly open with a faint golden glow escaping, 1920s New
York apothecary shelves with glass jars behind, warm lamplight, rain on the glass, moody, highly detailed, no text,
no letters*. Its three suitcases are cut out by `tools/shop_sprites.py` (below).

### The shop windows: `tools/shop_sprites.py`

`tools/shop-refs/` holds the owner's two pictures, untouched: they are the reference, and the only input.

```bash
python tools/shop_sprites.py                 # needs Pillow, numpy and opencv-python; about a minute
python tools/shop_sprites.py --check folder  # the same, plus every sprite on magenta and on white, to look at
```

It writes `app/assets/ollivanders.webp` and `beasts.webp` (his picture and two scrims, nothing else: a soft patch behind the caption, the foot of the frame under the help strip; everywhere else the picture is not darker than his), `app/assets/shop/<collection><n>.webp` (one sprite per film) and `app/assets/shop/sprites.js` (their place, read by `LIBRARY` in `app/js/config.js`).

- **Silhouettes.** The wand boxes are straight wood: polygons traced on zoomed crops (`WANDS`), drawn antialiased and softened to the softness of the picture's own edges. The suitcases are leather: rounded outlines traced the same way, the inside of the handle apart (`CASES`), then GrabCut in a 4 px band around them for the brass lumps, then a guided filter. Colours next to an edge are bled from inside the silhouette, so that no background comes along.
- **What is baked.** The sprite at its risen size, resampled once from his picture (Lanczos, then a light unsharp, `SHARPEN`, tuned so that the focused item stays within 10 % of his picture's Laplacian), so that the settled focus is 1:1 on the screen; its light (`GAIN`, a hair up above the darks, so that his blacks stay his; no tint, no sheen); and its shadow, on surfaces only: the shelf and the neighbours for a box (`BOX_SHADOW`, fading out on its upper half), the sill for a suitcase (`CASE_SHADOW`, `SILL`, `OPENING`), a tight contact under the foot for both (`CONTACT`). There is no CSS filter on screen.
- **The opening of the handle** is opaque, his own pixels at the same place: no shift, no blur. A parallax error on out-of-focus bokeh seen through a handle does not show; a painted plate does. `bleed` only touches the pixels the edge leaves more than half transparent.
- **The rise.** `RISE` (scale, lift in whole device px) and `ANCHOR` (the outer suitcases grow toward the middle, leaving the frame's reveal alone) go into `sprites.js`; `ollivanders.js` and `ollivanders.css` read them from there. The scrims (`SCRIMS`) are as light as the caption allows.
- **Look at it.** A zoomed crop of each sprite on magenta and in place, before anything else: no halo, no stair-steps, no bites. Each sprite's rectangle is even in image pixels, so it lands on whole device pixels at 1080p.

To change a shop: replace the picture in `tools/shop-refs/`, trace its silhouettes, run the tool.

### The broom rider (`app/assets/rider.webp`)

The Nox fly-by rider: Harry on his broom, cut out (rembg u2net, stray alpha removed, bottom edge feathered) from a
photo supplied by the maintainer, then night-graded with PIL (399×216). He faces left in the picture; the Parapet mirrors
him in CSS so he flies left to right; a few warm motes fade behind the bristles (no streak). Third-party image,
versioned at the maintainer's request (DISCLAIMER.md).

## Scenery: the Parapet (`app/assets/scene/`)

The Parapet's backdrop and the pictures of its effects are cut from `app/assets/castle.jpg` itself: no new generation, nothing redrawn. At rest the layers put back together are close to the castle as it is (37 dB PSNR against `castle.jpg` above the skyline), not equal to it, because what is right for one frame looks frozen, or leaves a ghost, in all the others. What gives way: what lies against the moon, within about 64 px of its limb, where his broad levels stay but the clouds are a piece of his own sky; the mist on the spire beside it, a darker needle up to his tip that the clouds veil a little; the few pixels of his sky around the castle, which the sheet takes over; his sky where it is soft, which gets fine wisps from his crispest clouds, because all of it passes by the moon (`ENRICH_*`); the faint mountain on the left, its contour as he drew it and clouds passing through it (`MOUNT`). Below the skyline, the lake mist and the night fade are baked in. Then the clouds drift, behind the castle's exact silhouette. `castle.jpg` stays in place as the fallback. `python -I tools/parapet_scene.py` rewrites the backdrop's pictures and `scene.json` (Pillow, NumPy, SciPy, about three minutes, the same pictures every time); its header gives the method step by step. The windows for the Lumos wave are in `windows.json`.

| File | Pixels | Decoded | Role |
|---|---|---|---|
| `clouds.webp` | 2050 × 712, opaque | 5.8 MB | The clouds, in grey: his pixels at full resolution wherever the sky shows at rest (over the still light), but against the moon where they fade into one piece of his own sky that goes on under the disc, patches of the picture's own clouds where they do not show, and over his soft sky a band of fine wisps from his crispest clouds, seamless left to right (2 px of the loop's start at the right). 1:1 on the screen's pixels. |
| `castle-top.webp` | 1984 × 724, alpha | 5.7 MB | Everything still above the skyline, flattened in one picture: the light of the sky and its blue, a function of the distance to the moon's centre and of nothing else (a low percentile of each ring of his sky, as a curve that can only fall, flat past 400 px: most of that light lies on the clouds, so a thick cloud lights up near the moon and dims as it leaves, a gap stays dark, and no shape of a cloud stays behind), the moon's disc, which lets 4 % of what passes show through at its centre and 10 % at its limb, the castle's silhouette and nothing around it, the mountains, the faint one on the left at a quarter. |
| `castle-base.webp` | 1984 × 372, opaque | 2.8 MB | Below the skyline: rock, lake, boathouse, with the lake mist and the night fade baked in. Nothing is ever drawn behind it. |
| `fg-left.webp`, `fg-right.webp` | 692 × 994, 190 × 532, alpha | 2.7 + 0.4 MB | The dark pines and the bare tree on the left, the pines and the snow bank on the right, the night fade baked in. |
| `lit-windows.webp` | 1035 × 503, alpha | 2.0 MB | Only the lit windows (94 of them), brighter and a little warmer; transparent elsewhere. Child of the castle plane. |
| `mist-wake.webp` | 320 × 72, alpha | 0.1 MB | A wisp of mist for the rider's wake. |
| `logo-shadow.webp` | 256 × 64, alpha | 0.1 MB | Soft dark ellipse under the focused logo (stretch it to the logo width). |
| `lake-shimmer-a.webp`, `-b.webp` | 720 × 112, alpha | 0.3 MB each | Two states of the window reflections in the lake, for "Ambiance vivante" only. |
| `lake-mist-tile.webp` | 960 × 130, alpha | 0.5 MB | The lake mist, seamless left to right: baked into `castle-base`, and the one slow mist drift of "Ambiance vivante". |

Everything decoded is about 20 MB, without the "Ambiance vivante" pictures, which only load when it is on.

**Geometry.** Every plane is the screen plus 32 device px (16 CSS px) on each side: 1984 px wide, laid at `left: -16px` as 992 CSS px, so it is drawn 1:1 (the castle, never scaled, never soft) and can slide 16 CSS px either way before an edge shows. The margins repeat the texture found a little further inside the picture (a translated copy cross-faded from the edge, not a mirror, which reads as a symmetrical blot). The clouds loop every 1024 CSS px.

**Why so few layers.** On the TV (Mali-470), three blended sky layers gave a 21.7 ms median frame on the dock and held every Parapet move back. The sky is one opaque picture that moves and one blended picture that does not: the clouds pass behind the moon's disc and its glow and show through them, far more outside the limb than on the disc, which a linear blend can only veil by dimming it; both are in the still picture, in one plane with the castle, so that no parallax can open anything between them. The opaque ones must be known to be: a WebP is not, when its layer is made, so `clouds.webp` and `castle-base.webp` stand on a solid background in home.css (the compositor's trace: `contents_opaque` true, nothing blended, the screen behind them no longer drawn). Each step of the drift is a timer in home.js, 12 a second, by whole device px, one loop in about 170 s. The sky's tint by the hour (dusk, deep night, dawn) is no layer either: it is painted into the tiles of each still picture, once.

**Stacking, back to front:** clouds (the sky plane); castle-base, castle-top, lit-windows, (lake-shimmer) (the castle plane); fg-left and fg-right. Parallax: 3 CSS px per focus step for the sky and the castle together, so that the moon, in the castle's picture, never slides over its clouds, and 7 for the foreground, held within ±10 CSS px (the others ±5).

**Checking it by eye.** At rest it must read as `castle.jpg`: side by side, the sky on the left a little livelier, what lies against the moon and the spire's mist changed, nothing else. Then move the clouds by hand (`document.getAnimations()`, `currentTime`, for instance 100000 and 300000 ms): as crisp as his clouds at 1:1, no seam, no ghost of the moon or of a tower in the sky (look at `clouds.webp` itself with its contrast doubled), no warm stain, no halo around the towers, no ring, arc or frozen wisp around the moon, clouds that reach its limb at their full contrast instead of dying on a circle, the spire a needle up to its tip with its lit edge, no outline or pale rim around a chimney or a tower when the sky behind it darkens, the left mountain a faint contour with clouds passing through it and never a shape hanging there, no block or patch that the clouds never cross on the mountains, and nothing between the disc and its glow at either end of the dock. What stays frozen shows at once in the mean of many offsets: around the moon it must be a smooth round glow and nothing else.

**How the rest was cut** (Python with Pillow, NumPy and SciPy, run with `python -I`):

- *Foreground* (`parapet_scene.py`): the trees are the near-black pixels (a 7 px minimum filter under 20 to 30 of luminance) inside a zone
  at each side, closed and hole-filled; the bare tree on the left is taken as a whole blob with the mist between its
  branches, so no twig is left behind on the plane behind it.
- *Lit windows*: warm pixels (R > 92, R − B > 46, G > B), kept only in small compact blobs (windows), which drops the
  uplit stone of the towers; brightened by a screen (`255 − (255 − c) × 0.40`), blue × 0.70, green × 0.955; alpha is
  the warmth of the pixel, with no halo around the window.
- *Wake, logo shadow*: drawn as numeric gradients (Gaussian profiles, tapering towards the tail), blur in the
  pixels, so nothing is blurred at runtime.
- *Lake shimmer*: the reflection streaks of the windows, with each row catching the light differently (a smoothed
  random field of brightness and sub-pixel shift), in two independent states to cross-fade.

`windows.json` lists every window (box, centre, weight, `t` from 0 for the leftmost to 1 for the rightmost) in
`castle.jpg` pixels (half that in CSS px), the placement of the layer, and six vertical bands cut in empty columns of
the layer, for a wave made of a few clipped copies of the same picture.


## Other cut pictures

- `app/assets/map-parchment.webp`: the Map's parchment, the same paper cut out along its edge and curls, studio background and shadows removed, nothing redrawn.
- `app/assets/settings/parapet-mini.webp`: castle.jpg cropped to the dock band (0, 680, 1920, 920), 1000×125; `owl-mini.webp`: the owl sheet's first cell trimmed, 57×66. Both feed the Room of Requirement's Parapet preview.
- `app/assets/owl-sheet.webp` is defringed after `cutout_owl.py`: alpha choked by 1 px and edge colours pulled toward the night, so no pale ring shows against the trees.
