# Poudlard TV

A TV home screen inspired by the Harry Potter universe: a castle at night, an owl that takes flight when you switch apps, a parapet where the apps sit, and a remote control that does everything.

A fan-made, **unofficial** project, published by [Wavia](https://wav-ia.fr) under the MIT license, for Android TV / Google TV. It is not affiliated with Warner Bros. Discovery, Wizarding World or J.K. Rowling. See `DISCLAIMER.md`.

The web mock-up has no dependencies (ES modules) and is fully driven by the remote's D-pad. The Android port (plain Java, no Gradle) embeds it in a WebView behind an explicit `window.Android` bridge. No network permission, no data collected, no official assets, no film music, no app logos distributed. Fully reversible: the original launcher is never disabled, one settings row gives the Home key back to it, and a two-second Back press brings a plain mode back from anywhere. Install, app launching, the TV settings entries, the inputs listing and the crash watchdog follow the [Free My TV](https://github.com/simbasjungles/free-my-tv) method (`adb install`, Leanback intents, 3 crashes in 5 minutes → original home), without its internal adb. See `docs/INSTALLATION.md`.

> **Status.** The web mock-up is complete and tested in the browser. The Android port is written against the Android documentation and Free My TV's field reports and has **not yet been compiled or run on a television** by the maintainers: the home switch, the TV settings entries, the HDMI listing and the watchdog await a first device test. `android/README.md` keeps the test-status box up to date; try it on a Google TV dongle before the living-room set.

**Not affiliated.** Poudlard TV is not affiliated with, endorsed or sponsored by Warner Bros. Discovery, Wizarding World, Google, Amazon, Samsung, TCL, Sony, Hisense, Microsoft, Nintendo or any streaming service named in the interface; their names appear only to designate the devices and apps concerned. The code is MIT; the name, the theme and every reference to the works are used nominatively for a fan project and are not licensed by this repository (`DISCLAIMER.md`).

**Privacy.** Zero permission, verifiable in one line: `aapt dump permissions PoudlardTV.apk` prints nothing. No network, no account, no analytics, no crash reporting; the configuration lives in the app's private storage and leaves with it.

## Screens

Captured from the web mock-up (`app/tv.html`) on the maintainer's own installation, with the app logos they supplied themselves (the repository ships monograms instead, see below).

| The Parapet | Ollivanders |
|---|---|
| ![The Parapet: the clock, the castle, Hedwig on the chosen app](docs/screens/parapet.webp) | ![Ollivanders: the film collection as a wandmaker's window](docs/screens/ollivanders.webp) |

| The Fantastic Beasts window | The Remembrall |
|---|---|
| ![Les Animaux fantastiques: three suitcases, one film each](docs/screens/animaux-fantastiques.webp) | ![The Remembrall on an app: move, remove, hide, info](docs/screens/rappeltout.webp) |

| Nox, the fly-by | Nox, settled |
|---|---|
| ![A rider on a broom crosses the Parapet and puts the apps out as he passes](docs/screens/veille-vol.webp) | ![The screensaver: the clock wanders over the sleeping castle](docs/screens/veille.webp) |

| The Admission Letter |
|---|
| ![The Letter, page II: choosing the apps](docs/screens/lettre.webp) |

## What it is

- **The Parapet** (home): the time as a drop cap, up to eight apps spread across the width, Hedwig (Hedwige) landing on the one you pick. OK lights up (Lumos), then opens the app.
- **Ollivanders**: the film collection, presented as a wand shop window; OK opens the film in the app that owns it.
- **The Marauder's Map** (Carte du Maraudeur): every app, the Passages (HDMI inputs: consoles, set-top boxes), and adding an app by hand.
- **The Room of Requirement** (Salle sur Demande): the settings, all on the D-pad, starting with the Home key (Poudlard TV or the original home) and the TV's own settings (picture, sound, network, remotes…).
- **The Admission Letter** (Lettre d'admission): first launch (house, apps, Hedwig, the emergency exits), under a minute.
- **Plain mode**: a sober home screen, same apps, no scenery. Holding Back for two seconds gets there from any screen, and back again.

All of it in native ES modules, with no dependencies, no bundler and no network access at runtime.

## Demo

Keyboard-driven web mock-up (arrow keys, Enter, Escape, M):

```bash
git clone https://github.com/Wavia-tech/poudlard-tv.git
cd poudlard-tv
cp app/assets/logos.example.js app/assets/logos.js   # no official logos in the repo: monograms instead
node tools/serve.mjs . 8765
```

Then open http://localhost:8765/app/index.html. The test bench shows an on-screen remote and a ×3 slow motion for tuning the gestures.

## Installation

- **Web**: the four commands above; details in `docs/INSTALLATION.md`.
- **TV**: build the APK with `android/build.sh` (Java, no Gradle), install with `tools/tv.sh install`, let the Admission Letter ask for the Home key, and go back to the original home with a single settings row. Full procedure, Chromecast included, in `docs/INSTALLATION.md`; what is borrowed from Free My TV (and what is refused, with the cost of each) in `docs/FREE-MY-TV.md`.

## Reversibility

This is the project's most important rule: you must be able to put the TV back the way you found it, in under a minute, without a computer.

1. Hold Back for 2 s → plain mode (from any screen).
2. Settings → **Accueil de la télé** → Touche Home: **Accueil d'origine** (after a confirmation): the launcher disables its own home entry and relaunches the original one, which was never disabled. **Poudlard TV** goes the other way: the TV shows its own confirmation dialog (Android 10+); you make the choice.
3. Uninstalling the app puts everything back: only the launcher's own entry is ever disabled.
4. Three abnormal exits in five minutes: the launcher hands control back on its own and stays out of the way until you ask again (Free My TV method). Back held 6 s opens a native rescue screen whatever the page is doing.

## Security and data

- No network permission in the Android manifest. In the mock-up, the only remote request is loading the Google fonts; in the APK, with no network permission, the WebView falls back to the system fonts until the OFL fonts are placed in `app/assets/fonts/` with their license (see `docs/INSTALLATION.md`, troubleshooting).
- No third-party library, no analytics, no account, no history.
- Apps are launched by explicit intent only, on a package present in the configuration; content links are limited to a whitelist of hosts; no URL is ever typed on screen.
- Everything read from storage is validated (`sanitize()`): corrupted storage cannot inject anything.

## Repository layout

```
app/            the web mock-up (index.html, js/, css/, assets/); app/README.md and app/CONTRACT.md for the technical details
docs/           screens/ (the captures above), GUIDE.md (the approach, step by step, with the prompts), INSTALLATION.md (web + TV, step by step), FREE-MY-TV.md (what is borrowed from the reference project), MUSIC.md (sounds, background music, rights)
tools/          static server, tv.sh / tv.ps1 (every adb operation on the TV), the owl sprite sheet, assembling your own logos, the method for generating the scenery
android/        Android TV port (plain Java, build.sh, WebView + window.Android bridge)
DISCLAIMER.md, LICENSE (MIT), CONTRIBUTING.md
```

## What the user supplies themselves

The repository distributes no app logos (trademarks), no recorded music (rights) and no official assets. For private use, anyone can add their own logos (`tools/README.md`) and music (`docs/MUSIC.md`); these files are ignored by Git.

## License

The code and documentation are under the MIT license (`LICENSE`). This license does not cover what each user supplies themselves and what is not distributed here (app logos, background music), nor the trademarks mentioned, which remain the property of their owners. See `DISCLAIMER.md`.

## Credits

- Starting idea: the reel "I vibecoded my TV to feel like Hogwarts" by @ikevinadams (Instagram).
- Install, switch-over and roll-back method on Android TV: [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT).
- Fonts: Cinzel, Cinzel Decorative, EB Garamond, IM Fell English (SIL Open Font License).
- Scenery, owl, crests, glyphs: generated and drawn for this project (`tools/README.md`).
- Sounds and background music: celesta synthesized in Web Audio, original phrases and waltz (`app/js/sound.js`, `docs/MUSIC.md`).
- Design and development: Wavia, Nantes, 2026.

Harry Potter, Hogwarts and the associated names are trademarks of Warner Bros. Entertainment Inc.; the other trademarks mentioned belong to their owners. Fan-made, non-commercial, unofficial project.
