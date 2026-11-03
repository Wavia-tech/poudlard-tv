# Poudlard TV — the web mock-up

A "Hogwarts" TV home screen, inspired by the reel "I vibecoded my TV to feel like Hogwarts" by @ikevinadams (Instagram).
This folder is the **web mock-up**: it is driven from the keyboard as if with a remote, and it serves as the interactive
specification for the Android TV port, which embeds it as is. For the general overview, installation and legal notes, see the
root `README.md`, `docs/` and `DISCLAIMER.md`.

## Running the mock-up

No dependencies. Serve the repository with any static server (the one provided is enough), from the repository root:

```bash
node tools/serve.mjs . 8765
```

Then open http://localhost:8765/app/index.html (test bench with an on-screen remote) or http://localhost:8765/app/tv.html
(the stage alone, full window: the page the APK loads). To see what the TV sees, emulate **960 × 540 CSS px with a device
pixel ratio of 2** (a 1080p Android TV at density 320); check 1920 × 1080 at ratio 1 too. Click the screen, then:

| Key | Action |
|---|---|
| ← → | pick an app (Hedwig takes flight to the chosen app); 8 apps at most, spread across the width |
| ↓ | Ollivanders (the film collection, with a direct link to the app that owns each title) |
| ↑ | the top-right bar: Sound (mute or unmute), the Marauder's Map (every app, add your own), Settings |
| Enter | OK: Lumos, then the app opens |
| Enter held | Remembrall (Rappeltout, the context menu) |
| Escape | Back |
| Escape held 2 s | "Nox?" → classic mode (plain launcher); same gesture to come back |
| M | the focused app's Remembrall (the Room of Requirement when the parapet is empty) |

On first launch, the Admission Letter (house, apps, Hedwig) takes under a minute; on the TV it only offers installed apps.
Sleep (Nox) is **off by default** (`idleSeconds: 0`); Settings → Sleep sets it from 1.5 to 10 minutes, or never.

## The screens

`home` the Parapet · `library` Ollivanders (file `ollivanders.js`) · `map` the Marauder's Map · `settings` the Room of
Requirement · `sorting` the Admission Letter · `classic` classic mode · plus Lumos, boot-up and Nox, which are states of
the home screen.

Art direction (typography, palette, materials, owl, signature moments) and the motion budget: `CONTRACT.md`.

## Architecture

```
app/
  index.html            test bench (TV frame + on-screen remote)
  tv.html               the stage alone, full window (loaded by the APK)
  css/                  base (tokens), fonts (embedded @font-face), shared (materials), focus, owl, rappeltout, beuglante, screens/<screen>.css
  js/main.js            start-up
  js/config.js          app catalog, collections, settings, hand-added apps, strict validation of stored data
  js/platform.js        the ONLY door to the outside (launch an app, switch an input, open a title, list installed apps)
  js/input.js           D-pad: actions, long presses, queue during Lumos
  js/router.js          one screen at a time, fade / up / down / iris transitions
  js/fx.js              the single scene clock, Lumos, sound cues and background music (through sound.js)
  js/sound.js           celesta synthesized in Web Audio (original cues, fallback waltz) + player for the music file
  js/owl.js             Hedwig: one sprite sheet, poses chosen according to flight progress
  js/monogram.js        fallback logo: the initial in a circle, same format as LOGOS
  js/crests.js          house crests: the crest pictures when present, original pen strokes otherwise
  js/rappeltout.js      shared context menu
  js/beuglante.js       shared error message
  js/screens/<screen>.js one file per screen: { mount, unmount, onKey }
  assets/               locally generated images (castle, mist, parchment, owl, Ollivanders and Beasts windows, rider)
  assets/fonts/         Cinzel, Cinzel Decorative, EB Garamond, IM Fell English, with their OFL licence
  assets/logos.js       the app logos, versioned at the maintainer's request (third-party, DISCLAIMER.md)
  assets/crest-*.webp   the four house crest pictures, versioned at the maintainer's request (third-party, DISCLAIMER.md)
  assets/music/         ambiance.ogg, the background music, versioned at the maintainer's request (see docs/MUSIC.md)
tools/                  static server, logo bundling, originality test for the waltz, owl cut-out, how the backdrops were generated
android/                Android TV port (plain Java, no Gradle): WebView + window.Android bridge
```

On Android, the mock-up is copied as is into the APK by `android/build.sh` and served to the WebView under
`https://poudlard.invalid/`; only `platform.js` behaves differently (the `window.Android` bridge).

## Configuration model

A single object, readable, versioned, validated on read (`sanitize()` drops anything it does not know):

```json
{ "version": 3, "mode": "poudlard", "house": "gryffondor",
  "dock": ["netflix", "prime", "disney", "canal", "max", "appletv", "youtube", "ps5"],
  "hidden": [], "owl": "vive", "sounds": false, "motion": "auto",
  "music": "auto",
  "idleSeconds": 0,
  "lastApp": null, "firstRunDone": true,
  "library": { "hidden": [], "apps": {} },
  "custom": [{ "id": "c_1", "name": "Molotov", "pkg": "tv.molotov.app" }] }
```

- `music`: background music, `auto` (the music file, otherwise the celesta waltz) | `celesta` | `aucune` (none); see `docs/MUSIC.md`.
- `idleSeconds`: sleep, 0 = never; the interface offers 90, 180, 300, 600 or 0, `sanitize()` accepts 0 to 3600.

Mock-up: the browser's `localStorage`. Android: the WebView's `localStorage` (origin `https://poudlard.invalid`), in the app's
private data, never synced, wiped on uninstall. A configuration from an earlier version is migrated on read (sleep, 90 s
before version 3, becomes 0).

## Security (in order of importance)

1. **No network permission.** The Android manifest declares neither `INTERNET` nor `ACCESS_NETWORK_STATE`: the system itself forbids any connection, which can be checked in one line (`aapt dump permissions`). The fonts are embedded (`assets/fonts/`, `css/fonts.css`): no page makes a remote request, the test bench included.
2. **No third-party library**, no analytics, no crash reporter, no accessibility service, no boot receiver outside the HOME category. `QUERY_ALL_PACKAGES` replaced by a targeted `<queries>` block.
3. **Launch by explicit intent only** (`getLeanbackLaunchIntentForPackage`), on a package present in the config; deep links only from the config, allow-listed hosts (`platform.js`, identical in `Apps.java`, canalplus.com included), never a URL typed on screen. An intent that fails produces a Howler (Beuglante) that says what happened ("not installed" when the app is missing), never a crash.
4. **No data collection**: no history, no account. The launcher only knows the time and the list of installed apps.
5. **Fully reversible**: installing never takes the Home key; Salle sur Demande → Accueil de la télé → « Accueil d'origine » gives it back to the home that was the default before (a third-party launcher included); Back held 2 s brings back classic mode from any screen; uninstalling the APK restores everything; three abnormal exits within five minutes hand control back on their own (the Free My TV method).

## Images, sounds and rights

- Castle, parchment, mist, owl, Ollivanders and Beasts windows, rider: generated locally (method in `tools/README.md`), with no film stills, no Warner logo, no lightning-bolt lettering. Each is sized for the screen it appears on (no texture beyond what a TV GPU accepts).
- App logos: `assets/logos.js`, versioned at the maintainer's request (trademarks of their owners, `DISCLAIMER.md`). `LOGOS[id]` missing (a hand-added app) → `monogram(name)`. To rebuild your own file, `tools/README.md`; on Android, the bridge also exposes the icon each app provides (`appIcon(pkg)`).
- House crests: the four pictures `assets/crest-*.webp`, versioned at the maintainer's request (cut out from published artwork owned by Warner Bros., `DISCLAIMER.md`); `crests.js` falls back to original pen strokes when a picture is missing.
- Sounds: synthesized (`sound.js`), original phrases, no melody from the films. Background music: `assets/music/ambiance.ogg` (Ogg Opus, under 3 MB, the maintainer's file, versioned at his request), with an original synthesized celesta waltz as the fallback (`docs/MUSIC.md`).
- Fonts: Cinzel, Cinzel Decorative, EB Garamond, IM Fell English (SIL Open Font License), embedded in `assets/fonts/` with their licence.

## Android TV port

Reference method: [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT) — no Gradle, no library, installation through `adb`, Leanback intents with fallback, list of installed apps without `QUERY_ALL_PACKAGES`, HDMI inputs, safety net that hands control back to the original home after three crashes. What we keep and what we leave out (its built-in adb and the disabling of the Google home, incompatible with our rules): `docs/FREE-MY-TV.md`.

What exists in `android/` (plain Java, `build.sh`): `minSdk 26`, `HOME` category (alias `.Home`, disabled at install) + `LEANBACK_LAUNCHER` (alias `.Start`), a WebView that loads `app/tv.html` from the assets, the `Apps` module (discovery, banners, intents, allow-list, HDMI), `HomeMode` (records the previous home, asks for the HOME role, gives it back), `Watchdog` (safety net), `HomeActivity`, and the `Bridge` (`window.Android`, 16 methods, listed in `CONTRACT.md` under `js/platform.js`).

`platform.js` calls every bridge method on the bridge object (`b[method](...args)`): the WebView's Java bridge refuses a method called detached from it, which is why nothing opened on the first device test (3 November 2026). Step-by-step installation in `docs/INSTALLATION.md`, port details and test status in `android/README.md`.
