# Tools

This folder holds what is needed to run the mock-up, to drive the TV from a computer and to rebuild at home what the repository ships. None of these tools is required to use the interface once it is served.

| File | Role |
|---|---|
| `serve.mjs` | Dependency-free static server for the web mock-up: `node tools/serve.mjs . 8765`, then http://localhost:8765/app/index.html. Listens on `127.0.0.1` only, serves only files under the given root, no caching. |
| `logos-build.mjs` | Bundles your own `app/assets/logos.js` from a folder of SVGs (below). |
| `tv.sh`, `tv.ps1` | Every adb operation on the TV, bash and PowerShell (below). |
| `test-sound.mjs` | Checks that the background waltz (`MELODY` in `app/js/sound.js`) does not quote the films' theme: `node tools/test-sound.mjs` (see `docs/MUSIC.md`). |
| `cutout_owl.py` | Cuts out an owl generated on a black background (Pillow): `python -I tools/cutout_owl.py input.png output.png 640`. |

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

- `src`: a **white** SVG (`fill="#ffffff"`) on a transparent background, base64-encoded in a data URI. It serves as a CSS mask: `shared.css` renders it as engraved ivory at rest and embossed gold in focus.
- `ratio`: width divided by height of the view box (`viewBox`). The screens fix the height and derive the width; 1 for a square pictogram.
- `luma`: `true` if the SVG is a solid fill (a logo on a colored background, for example) and must be masked by luminance rather than by alpha. In the original mock-up: `canal`, `max`, `tf1`, `m6`.

Procedure, with Node alone (no dependencies), from any directory, under bash, PowerShell or cmd:

```bash
# 1. Put one white SVG per id in a working folder, named <id>.svg (netflix.svg, prime.svg, …).
#    The available ids are those of CATALOG: netflix prime disney canal max appletv paramount youtube
#    francetv tf1 m6 arte crunchyroll dazn twitch spotify deezer plex ps5 ps4 xbox switch
# 2. Bundle them (optional second argument: the ids to mask by luminance):
node tools/logos-build.mjs ./my-logos canal,max,tf1,m6
```

The script always writes to `app/assets/logos.js` (path resolved from the script, not from the current directory), replacing the versioned file. Do not commit your version; `git checkout app/assets/logos.js` brings the versioned one back.

## On Android TV: `appIcon(pkg)` instead of logos

The Android launcher does not need this file. Every installed app already provides the system with a Leanback banner (320 × 180 dp) and an icon. The `window.Android` bridge (`android/src/fr/wavia/poudlardtv/Bridge.java`) exposes an `appIcon(pkg)` method that returns this image as a data URI (PNG), or `null` if the app provides nothing. **In this version, the screens do not call it yet** (`app/js/platform.js` only exposes `launch`, `openContent`, `installed`): they display `LOGOS[id]` or the monogram. The planned wiring: the screen uses `appIcon(pkg)` the way it uses `LOGOS[id].src`, and the monogram remains the fallback.

On the Java side (`Apps.java`), the image is looked up in this order: 1) the app's banner resource at xxxhdpi density (384 × 216, sharper), 2) `getApplicationBanner`, 3) `getApplicationIcon`, centered on a night background. It is converted to PNG and cached in memory on first display. Nothing is downloaded and nothing leaves the device.

## How the backdrops were produced

The scenery in `app/assets/` (castle, parapet, parchment, mist, the owl in her poses, the Ollivanders and Beasts windows, the rider) was generated locally, with no image from the films, then retouched by hand. The four house crest pictures are the exception: they are cut out from published artwork owned by Warner Bros. and versioned at the maintainer's request (`DISCLAIMER.md`). The generation scripts (`tools/generer_*.ps1`) are not versioned (machine-specific paths); here is the method, reproducible with any local generation tool.

Whatever the tool, export each image at the size it is displayed (a 1080p TV at most, often less) and never wider than 4096 px: some TV GPUs refuse larger textures, and every decoded pixel costs memory on a 1.3 GB TV.

- **Model**: Z-Image Turbo (Apache 2.0 licence) as a Q4_K-quantized GGUF, run by `sd-cli` (stable-diffusion.cpp), VAE on CPU, 8 steps, `cfg-scale 1.0`, quantized Qwen3-4B-Instruct text encoder. Each image is produced with a fixed seed, noted below, so that it can be regenerated identically.
- **Castle** (`castle.jpg`, 1920 × 1088, seed 777): "cinematic film still of a vast gothic wizard school castle at night, closer view, towers rising above the camera, perched on dramatic cliffs above a black mirror lake, dozens of slender towers and spires with conical slate roofs, great hall with tall arched stained glass windows glowing warm amber, lit astronomy tower, moonlight through dramatic clouds, thin mist over the water, small lanterns of rowing boats, misty highlands, 35mm anamorphic, volumetric light, deep blue and warm gold palette, no text, no people". The word "Hogwarts" serves only as visual direction for the model; no image from the films enters the process.
- **Parapet** (1536 × 448, seed 21): a grey stone parapet seen from slightly above, three brass candlesticks with lit candles, isolated on a pure black background.
- **Parchment** (`parchment.jpg`, 1536 × 864, seed 33): blank old parchment, folds and burnt edges, a wax stain, seen from above.
- **Mist** (`mist.png`, 1536 × 320, seed 44): horizontal wisps of white mist, isolated on a pure black background, then converted to alpha.
- **Owl** (1024 × 1024, seed 11 for every pose, to keep the same animal): a snowy owl, white plumage with a few dark flecks, yellow eyes, wildlife photo, isolated on a pure black background, full body; one variant per pose (perched, looking over the shoulder, asleep, take-off, gliding, landing). Then cut out with `cutout_owl.py`.
- **Ollivanders shop window** (`ollivanders.webp`): the interior of an old shop, shelves of long boxes, candlelight, no text.

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
| `config pull` / `push` | the launcher's configuration file, through `run-as` (debuggable builds only) |

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

### The Fantastic Beasts window (`app/assets/beasts.webp`)

Generated locally (Z-Image Turbo, `generate.ps1 -Format paysage -Seed 7`, 1024×576) with a generic prompt, no
franchise term: *cinematic shop window at night, three worn leather suitcases with brass clasps displayed side by
side on a wooden counter, evenly spaced, each suitcase slightly open with a faint golden glow escaping, 1920s New
York apothecary shelves with glass jars behind, warm lamplight, rain on the glass, moody, highly detailed, no text,
no letters*. The three selection boxes are measured on the image (`scene.boxes` in `app/js/config.js`).

### The broom rider (`app/assets/rider.webp`)

The Nox fly-by silhouette. Generated locally (Z-Image Turbo, `generate.ps1 -Format paysage -Seed 11`, 1024×576)
with a generic prompt (*a single clean silhouette of a young wizard flying fast on a broomstick, side view facing
right, crouched forward, long cape streaming behind, round glasses, one arm reaching forward, broom bristles
trailing, high contrast, no text*), then cut out by luminance and given a baked golden rim with PIL (no CSS
filter at runtime). Original drawing: no likeness, no film frame.
