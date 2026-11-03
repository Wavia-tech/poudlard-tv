# Installation

Two ways to use Poudlard TV:

- **On a computer (web mock-up)**: to discover the interface, tweak it, modify it. Five minutes.
- **On the television (Android TV / Google TV)**: the launcher replaces the home screen. Reversible at any time.

The TV port follows the method of [Free My TV](https://github.com/simbasjungles/free-my-tv) (build without Gradle, install over ADB, launch apps through Leanback intents, list installed apps, HDMI inputs, safety net), which has proven itself on Chromecast with Google TV and on Android TV sets. What we keep and what we leave out, point by point: `docs/FREE-MY-TV.md`. The main difference: Poudlard TV never disables the Google home screen and does not use an internal adb client (which would require the network permission).

---

## 1. Web mock-up

### Requirements

- [Node.js](https://nodejs.org) 18 or newer (only for the small static server; the interface itself has no dependencies).
- A recent browser (Chrome, Edge, Firefox, Safari).

### Steps

```bash
git clone https://github.com/Wavia-tech/poudlard-tv.git
cd poudlard-tv

# The repo ships no app logos (trademarks). This empty file is enough:
cp app/assets/logos.example.js app/assets/logos.js

node tools/serve.mjs . 8765
```

Then open http://localhost:8765/app/index.html, click on the screen, and drive it from the keyboard:

| Key | Remote | Effect |
|---|---|---|
| ← → | D-pad | Pick an app on the Parapet (home) |
| ↓ | Down | Ollivanders (the film collection) |
| ↑ | Up | Top bar: Sound · Marauder's Map (Carte du Maraudeur) · Settings |
| Enter | OK | Lumos, then the app opens |
| Enter held | Long OK | Remembrall (Rappeltout, the context menu) |
| Esc | Back | Go back |
| Esc held 2 s | Long Back | « Nox ? »: switch to classic mode, and back |
| M | Menu | The Room of Requirement (Salle sur Demande, the settings) |

The first launch shows the Admission Letter (Lettre d'admission: house, apps, Hedwig). Settings are kept in the browser's `localStorage`; to start over, Settings → About → « Réinitialiser » (confirmed with three presses), or clear the site's storage.

Why a server rather than double-clicking `index.html`? Because the interface is built from ES modules, which browsers refuse to load from `file://`. The bundled server only listens on `127.0.0.1` and only serves the files of the repo.

### No logos, by design

With an empty `logos.js`, each app is shown as a monogram (its initial in a circle). For private use, `tools/README.md` explains how to assemble your own logos.

### Background music

By default the home screen plays an original celesta waltz, very quietly (Settings → Owl and sounds → Background music: Auto / Celesta / None). To use your own file, outside the repo: `docs/MUSIC.md`.

---

## 2. Android TV / Google TV

### State of the port

The Android app (`android/`, pure Java, no Gradle) embeds the web mock-up in a WebView and exposes a `window.Android` bridge to it. Two things to tell apart:

**What the mock-up calls today** (`app/js/platform.js`), four methods:

| Method | Role |
|---|---|
| `launch(pkg)` | Launches the app by package name, through `getLeanbackLaunchIntentForPackage` (falling back to `getLaunchIntentForPackage`). |
| `switchInput(input)` | Switches to an HDMI input (consoles, set-top boxes), through `TvInputManager`. |
| `openUrl(url, pkg)` | Opens a content link in the app that owns it. The URL must already have passed the allow-list in `platform.js`. |
| `installedPackages()` | Returns the list of installed packages (JSON array) so that missing apps can be greyed out. |

The first three return `{ ok, error }`: a failure shows a Howler (Beuglante) on screen, never a crash.

**What the Java bridge exposes on top** (`android/src/fr/wavia/poudlardtv/Bridge.java`), not yet called by the screens: `appIcon(pkg)` (the app's banner or icon as a data URI, or `null`; see `tools/README.md`), `setHome('poudlard' | 'original')` (`{ ok, error }`, the home switch described below), `homeMode()` (`"poudlard"` or `"original"`) and `version()`. The details of each return value are in `android/README.md`.

> **Current state of the Settings screen.** In this version, the About section of the mock-up does not yet have the two buttons **Home → Poudlard** and **Home → Original**: it shows a « Rendre l'accueil Google » button which, in the mock-up, only displays a note. Wiring it to `setHome()` is planned (see `app/CONTRACT.md`, "To do on the screens side"). Until then, the switch is done from the TV's settings or with `adb` (below); both paths are equivalent.

### What the APK does not ask for

- No network permission (`INTERNET` and `ACCESS_NETWORK_STATE` are absent from the manifest: the system itself forbids any connection). `build.sh` refuses to produce an APK that would declare a permission.
- No `QUERY_ALL_PACKAGES`: a `<queries>` block targeted at the `LEANBACK_LAUNCHER` category.
- No third-party library, no analytics, no accessibility service, no boot receiver outside the HOME category.

### Building the APK

Requirements: a JDK 17 or newer, the Android SDK command-line tools (`sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"`), and the `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) variable pointing at the SDK. Details, Windows variants (Git Bash) and troubleshooting in `android/README.md`.

```bash
cd android
./build.sh            # → android/PoudlardTV.apk, signed with android/poudlard.keystore
```

The `poudlard.keystore` file is created on the first build and ignored by Git. **Keep it**: an update must be signed with the same key, otherwise you have to uninstall before reinstalling. The script copies `app/` as is into the APK (without `*.md` or working files) and warns if `app/assets/fonts/` does not exist (see Troubleshooting, fonts).

### Preparing the television

1. Settings → System → About → press **seven times** on "Android TV OS build" to enable the developer options.
2. Settings → System → Developer options → enable **USB debugging** (and "Wireless debugging" on Android 14).
3. Note the TV's IP address (Settings → Network & Internet).
4. On the computer, install `adb` (Android platform-tools): `winget install Google.PlatformTools` on Windows, `brew install --cask android-platform-tools` on macOS, the `android-tools` package on Linux.

### Installing

```bash
adb connect 192.168.1.50:5555          # the TV's IP address
adb install -r android/PoudlardTV.apk
```

Accept the "Allow USB debugging?" prompt on the TV, ticking "Always allow". Install with `adb` rather than by opening the APK on the TV; on Android 14, Play Protect may still show a warning: "More details" → "Install anyway". On some TCL models, allow background execution: `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.

On **Chromecast with Google TV**, port 5555 closes again at every reboot. If `adb connect` fails, pair first and then reopen it, in this order (the two ports shown under "Wireless debugging" are different: a pairing port and a debugging port):

```bash
adb pair 192.168.1.50:37123 123456      # port and code shown by "Pair device with pairing code"
adb connect 192.168.1.50:41567          # port shown under "Wireless debugging"
adb tcpip 5555
adb connect 192.168.1.50:5555
```

### Setting it as home (Home → Poudlard)

The choice of home screen belongs to the system, not to the launcher; Poudlard TV only opens the chooser. Launch Poudlard TV from the app list (the Admission Letter plays), then:

- once the button exists in the mock-up: Settings → About → **Home → Poudlard** opens the TV's "Home app" chooser (`Settings.ACTION_HOME_SETTINGS`), where you pick Poudlard TV;
- otherwise: Settings → Apps → Home (or the "Open with" chooser → Poudlard TV → "Always"); from the command line, `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home` (the only command that touches the TV's settings, reversible below).

The remote's Home key now leads to the Parapet. Unlike Free My TV, nothing is disabled: the Google home screen stays installed, active and selectable in the same place.

Try it first on a Google TV dongle or a secondary device before the main television.

### Going back to the original home (Home → Original)

Four paths, from the gentlest to the most radical. None requires resetting the TV.

1. **Classic mode**, without leaving Poudlard TV: hold Back for 2 s from any screen → « Nox ? » → Yes. A sober home screen, same apps, no scenery. The same gesture lights Poudlard up again.
2. **Home → Original**: the launcher disables its own home entry (the `.Home` alias, an operation allowed without permission on its own components) and relaunches the original home. The system is left with a single candidate, the Google home, and the Home key goes back to it. Poudlard TV stays in the app list (`.Start` alias) to come back. From the mock-up (once the button exists): Settings → About → Home → Original; from the TV: Settings → Apps → Home → Google TV; from the command line: `adb shell pm disable-user --user 0 fr.wavia.poudlardtv/.Home` (and `enable` for the opposite).
3. **Uninstall**: Settings → Apps → Poudlard TV → Uninstall, or `adb uninstall fr.wavia.poudlardtv`. The configuration, stored in the app's private data, goes with it.
4. **Safety net**: if the launcher closes abnormally three times in five minutes (a dying WebView engine counts too), it hands control back to the original home by itself and shows a plain screen saying so (a principle taken from Free My TV, without adb). It does not try again until you redo Home → Poudlard. At worst, rebooting the TV (unplug for 10 s) is enough to get back a system that boots.

Nothing is modified in the system: no root, no partition touched, no app disabled. The Google launcher stays installed and up to date.

### Settings on the television

All settings are made in the interface (Menu button → the Room of Requirement), with the D-pad: apps on the Parapet and their order, hidden apps, house, Hedwig, sounds and background music, motion, sleep, classic mode, and the "About" section (network, version, reversibility, reset). There is no configuration file to edit and nothing to recompile to change a setting.

The configuration is a single JSON object, versioned and validated on read (see `app/README.md`). On TV it lives in the WebView's `localStorage` (origin `https://poudlard.tv`, served from the APK's assets), in the app's private data: never synced, never backed up to the cloud, erased on uninstall.

### Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `adb connect` refuses or times out | Debugging not enabled, or port 5555 closed (Chromecast) | Re-enable debugging; `adb pair` → `adb connect <ip:debug-port>` → `adb tcpip 5555` → `adb connect <ip>:5555` |
| "INSTALL_FAILED_…" on install | An APK with another signature is already installed | `adb uninstall fr.wavia.poudlardtv` then reinstall (and keep `poudlard.keystore` from now on) |
| An app does not launch (Howler « n'est plus installée ») | Package missing, or app without a Leanback activity | Check the package in Settings; launch the app once from the Google home |
| An HDMI input does not switch | The model does not expose `TvInputManager` to a third-party app | Use the remote for the source; remove the Passage from the Parapet |
| Black screen at startup | Missing backdrop image or old WebView | Classic mode is guaranteed to work without images: hold Back for 2 s; update "Android System WebView" |
| Default fonts (no Cinzel) | Normal state of this version: the mock-up loads fonts from Google Fonts, which the APK (no network) cannot do | Put the OFL files (Cinzel, Cinzel Decorative, EB Garamond, IM Fell English) and their licence in `app/assets/fonts/`, declare them with `@font-face` in `app/css/base.css`, rebuild |
| Nothing on screen after three crashes | The safety net handed control back | Fix the cause (`adb logcat -s PoudlardTV chromium`), then redo Home → Poudlard |
