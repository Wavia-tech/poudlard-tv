# Poudlard TV — the web mock-up

A "Hogwarts" TV home screen, inspired by the reel "I vibecoded my TV to feel like Hogwarts" by @ikevinadams (Instagram).
This folder is the **web mock-up**: it is driven from the keyboard as if with a remote, and it serves as the interactive
specification for the Android TV port, which embeds it as is. For the general overview, installation and legal notes, see the
root `README.md`, `docs/` and `DISCLAIMER.md`.

## Running the mock-up

No dependencies. App logos are not distributed (trademarks): copy the example file, then serve the repository with any
static server (the one provided is enough), from the repository root:

```bash
cp app/assets/logos.example.js app/assets/logos.js     # monograms instead of logos
node tools/serve.mjs . 8765
```

Then open http://localhost:8765/app/index.html. Click the screen, then:

| Key | Action |
|---|---|
| ← → | pick an app (Hedwig takes flight, the backdrop slides); 8 apps at most, spread across the width |
| ↓ | Ollivanders (the film collection, with a direct link to the app that owns each title) |
| ↑ | the top-right bar: Sound (mute or unmute), the Marauder's Map (every app, add your own), Settings |
| Enter | OK: Lumos, then the app opens |
| Enter held | Remembrall (Rappeltout, the context menu) |
| Escape | Back |
| Escape held 2 s | "Nox?" → classic mode (plain launcher); same gesture to come back |
| M | the Room of Requirement (settings) |

On first launch, the Admission Letter (house, apps, Hedwig) takes under a minute.
Sleep (Nox) is **off by default** (`idleSeconds: 0`); Settings → Sleep sets it from 1.5 to 10 minutes, or never.

## The screens

`home` the Parapet · `library` Ollivanders (file `ollivanders.js`) · `map` the Marauder's Map · `settings` the Room of
Requirement · `sorting` the Admission Letter · `classic` classic mode · plus Lumos, boot-up and Nox, which are states of
the home screen.

Art direction (typography, palette, materials, owl, signature moments): `CONTRACT.md`, section "Art direction".

## Architecture

```
app/
  index.html            test bench (TV frame + on-screen remote)
  css/                  base (tokens), shared (materials), owl, rappeltout, beuglante, screens/<screen>.css
  js/main.js            start-up
  js/config.js          app catalog, collections, settings, hand-added apps, strict validation of stored data
  js/platform.js        the ONLY door to the outside (launch an app, switch an input, open a title, list installed apps)
  js/input.js           D-pad: actions, long presses, queue during Lumos
  js/router.js          one screen at a time, fade / up / down / iris transitions
  js/fx.js              dust, Lumos, sound cues and background music (through sound.js)
  js/sound.js           celesta synthesized in Web Audio: original cues + original background waltz; player for the personal file
  js/owl.js             Hedwig: photo poses cross-faded according to flight progress
  js/monogram.js        fallback logo: the initial in a circle, same format as LOGOS
  js/crests.js          house crests, pen strokes, no official coat of arms
  js/rappeltout.js      shared context menu
  js/beuglante.js       shared error message
  js/screens/<screen>.js one file per screen: { mount, unmount, onKey }
  assets/               locally generated images (castle, mist, parchment, owl, Ollivanders shop window)
  assets/logos.example.js   empty LOGOS; the real logos.js stays out of the repo (see tools/README.md)
  assets/music/         personal background music (ambiance.ogg, .mp3 or .m4a), out of the repo (see docs/MUSIC.md)
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

- `music`: background music, `auto` (the personal file if present, otherwise the celesta waltz) | `celesta` | `aucune` (none); see `docs/MUSIC.md`.
- `idleSeconds`: sleep, 0 = never; the interface offers 90, 180, 300, 600 or 0, `sanitize()` accepts 0 to 3600.

Mock-up: the browser's `localStorage`. Android: the WebView's `localStorage` (origin `https://poudlard.invalid`), in the app's
private data, never synced, wiped on uninstall. A configuration from an earlier version is migrated on read (sleep, 90 s
before version 3, becomes 0).

## Security (in order of importance)

1. **No network permission.** The Android manifest declares neither `INTERNET` nor `ACCESS_NETWORK_STATE`: the system itself forbids any connection, which can be checked in one line (`aapt dump permissions`). In the mock-up, the only remote request is for Google Fonts; in the APK it fails cleanly and the WebView falls back to system fonts as long as `app/assets/fonts/` does not exist.
2. **No third-party library**, no analytics, no crash reporter, no accessibility service, no boot receiver outside the HOME category. `QUERY_ALL_PACKAGES` replaced by a `<queries>` block targeting `LEANBACK_LAUNCHER`.
3. **Launch by explicit intent only** (`getLeanbackLaunchIntentForPackage`), on a package present in the config; deep links only from the config, allow-listed hosts (`platform.js`, identical in `Apps.java`), never a URL typed on screen. An intent that fails produces a Howler (Beuglante), never a crash.
4. **No data collection**: no history, no account. The launcher only knows the time and the list of installed apps.
5. **Fully reversible**: the Google launcher stays installed; Home → Original in Settings → About (button still to be wired, see below); Back held 2 s brings back classic mode from any screen; uninstalling the APK restores everything; three abnormal exits within five minutes hand control back on their own (the Free My TV method).

## Images, sounds and rights

- Castle, parchment, mist, owl, shop window: generated locally (method in `tools/README.md`), with no film stills, no Warner logo, no lightning-bolt lettering.
- App logos: **not distributed**. `LOGOS[id]` missing → `monogram(name)`. For private use, `tools/README.md` explains how to bundle your own `logos.js`; on Android, the bridge exposes the icon each app provides (`appIcon(pkg)`), not yet called by the screens.
- Sounds: synthesized (`sound.js`), original phrases, no melody from the films. Background music: an original celesta waltz, also synthesized, or a personal file kept out of the repo (`docs/MUSIC.md`).
- Fonts: Cinzel, Cinzel Decorative, EB Garamond, IM Fell English (OFL licence), loaded from Google Fonts in the mock-up; to be bundled in `app/assets/fonts/` with their licence for the APK.

## Android TV port

Reference method: [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT) — no Gradle, no library, installation through `adb`, Leanback intents with fallback, list of installed apps without `QUERY_ALL_PACKAGES`, HDMI inputs, safety net that hands control back to the original home after three crashes. What we keep and what we leave out (its built-in adb and the disabling of the Google home, incompatible with our rules): `docs/FREE-MY-TV.md`.

What exists in `android/` (plain Java, `build.sh`): `minSdk 26`, `HOME` category (alias `.Home`, can be disabled) + `LEANBACK_LAUNCHER` (alias `.Start`), a WebView that loads `app/` from the assets, the `Apps` module (discovery, banners, intents, allow-list, HDMI), `HomeMode` (system picker / hand the home back), `Watchdog` (safety net), `HomeActivity`, and the `Bridge`:

| `window.Android` method | Called by `platform.js`? | Returns |
|---|---|---|
| `launch(pkg)` | yes | `{ ok, error }` |
| `switchInput(input)` | yes | `{ ok, error }` |
| `openUrl(url, pkg)` | yes | `{ ok, error }` |
| `installedPackages()` | yes | JSON array of packages |
| `appIcon(pkg)` | not yet | PNG data URI, or `null` |
| `setHome('poudlard' \| 'original')` | not yet | `{ ok, error }` |
| `homeMode()` | not yet | `"poudlard"` or `"original"` |
| `version()` | not yet | string |

Still to do on the mock-up side: `Platform.setHome(mode)` and `Platform.homeMode()` in `platform.js`, the two buttons
**Home → Poudlard** / **Home → Original** in Settings → About (replacing "Hand the home back to Google"), `appIcon`
in classic mode, the fonts in `app/assets/fonts/` (`@font-face` in `base.css`), a `tv.html` without the test bench.
Step-by-step installation in `docs/INSTALLATION.md`, port details in `android/README.md`.
