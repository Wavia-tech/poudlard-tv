# Installation

Two ways to use Poudlard TV:

- **On a computer (web mock-up)**: to discover the interface, tweak it, modify it. Five minutes.
- **On the television (Android TV / Google TV)**: the launcher replaces the home screen once you ask it to. Reversible at any time.

The TV port follows the method of [Free My TV](https://github.com/simbasjungles/free-my-tv) (build without Gradle, install over ADB, launch apps through Leanback intents, list installed apps, HDMI inputs, safety net), which has proven itself on Chromecast with Google TV and on Android TV sets. What we keep and what we leave out, point by point: `docs/FREE-MY-TV.md`. The main difference: Poudlard TV never disables the original home (Google TV's, the manufacturer's or a third-party launcher) and does not use an internal adb client (which would require the network permission).

> **Tested on a device.** The APK first ran on a real TV on 3 November 2026 (Android TV 11, 1080p, 1.3 GB of RAM, Free My TV as the home). What that test found, and what version 0.3 changes, is summarised in the README's status box and in `CHANGELOG.md`; the rounds measured on the TV since, and what still fails there, are in the test-status box of `android/README.md`. The steps below describe version 0.3.

---

## 1. Web mock-up

### Requirements

- [Node.js](https://nodejs.org) 18 or newer (only for the small static server; the interface itself has no dependencies).
- A recent browser (Chrome, Edge, Firefox, Safari).

### Steps

```bash
git clone https://github.com/Wavia-tech/poudlard-tv.git
cd poudlard-tv
node tools/serve.mjs . 8765
```

Then open http://localhost:8765/app/index.html (the test bench, with an on-screen remote) or http://localhost:8765/app/tv.html (full screen, the page the APK loads), click on the screen, and drive it from the keyboard:

| Key | Remote | Effect |
|---|---|---|
| ← → | D-pad | Pick an app on the Parapet (home) |
| ↓ | Down | Ollivanders (the film collection) |
| ↑ | Up | Top bar: Sound · Marauder's Map (Carte du Maraudeur) · Settings |
| Enter | OK | Lumos, then the app opens |
| Enter held | Long OK | Remembrall (Rappeltout, the context menu) |
| Esc | Back | Go back |
| Esc held 2 s | Long Back | « Nox ? »: switch to classic mode, and back |
| M | Menu | The focused app's Remembrall (the Room of Requirement, the settings, when the parapet is empty) |

The first launch shows the Admission Letter (Lettre d'admission: house, apps, Hedwig). Settings are kept in the browser's `localStorage`; to start over, Settings → About → « Réinitialiser » (confirmed with three presses), or clear the site's storage.

To see the page as a 1080p TV lays it out, use the browser's device emulation at **960 × 540 with a device pixel ratio of 2** (in Chrome: DevTools → device toolbar → custom device). That is the size every screen is checked at.

Why a server rather than double-clicking `index.html`? Because the interface is built from ES modules, which browsers refuse to load from `file://`. The bundled server only listens on `127.0.0.1` and only serves the files of the repo.

### Logos

The repository carries the maintainer's app logos (`app/assets/logos.js`, versioned at his request, see `DISCLAIMER.md`). An app without an entry, such as one added by hand from the Map, is shown as a monogram (its initial in a circle). To use logos of your own, `tools/README.md` explains how to rebuild the file; it overwrites the versioned one, so keep it out of your commits.

### Background music

The home screen plays `app/assets/music/ambiance.ogg`, the music file versioned at the maintainer's request (Ogg Opus, 19 MB), with an original celesta waltz as the fallback (Settings → Owl and sounds → Background music: Auto / Celesta / None). A desktop browser may wait for the first key press before playing it (its autoplay policy); the TV does not. To use your own file instead: `docs/MUSIC.md`.

### Fonts

Cinzel, Cinzel Decorative, EB Garamond and IM Fell English are embedded in `app/assets/fonts/` with their SIL Open Font License and declared in `app/css/fonts.css`: no page needs a network to show them, the test bench included.

---

## 2. Android TV / Google TV

### State of the port

The Android app (`android/`, pure Java, no Gradle) embeds the web mock-up in a WebView and exposes a `window.Android` bridge to it. `app/js/platform.js` is the only file that calls it, and it calls every method **on the bridge object** (`b[method](...args)`): the WebView's Java bridge refuses a method called detached from its object, which is why nothing opened on the first device test.

The four core methods:

| Method | Role |
|---|---|
| `launch(pkg)` | Launches the app by package name, through `getLeanbackLaunchIntentForPackage` (falling back to `getLaunchIntentForPackage`). |
| `switchInput(input)` | Switches to an HDMI input (consoles, set-top boxes), through the TV's passthrough intent. |
| `openUrl(url, pkg)` | Opens a content link in the app that owns it. The URL must already have passed the allow-list in `platform.js` (the same list as `Apps.java`; canalplus.com included). |
| `installedPackages()` | Returns the list of installed packages (JSON array), so that the Admission Letter and Ollivanders only offer what the TV has. |

The actions return `{ ok, error }`: a failure shows a Howler (Beuglante) on screen that says what happened in plain French, "not installed" when the app is missing, never a crash.

**What the Java bridge exposes on top** (`android/src/fr/wavia/poudlardtv/Bridge.java`): `installedApps()` (packages with the labels the TV gives them), `appIcon(pkg)` (the app's banner or icon as a data URI, or `null`), `setHome('poudlard' | 'original')` (the home switch described below), `homeMode()`, `openSystem(key, arg)` (the TV's own settings screens, and an app's system page), `inputs()` (the HDMI ports with their CEC names), `hasLiveTv()` / `liveTv()`, `store()`, `fatal()`, `device()` and `version()`. The details of each return value are in `android/README.md`.

> **The Settings screen.** The mock-up's first section, « Accueil de la télé », holds the « Touche Home » row (Poudlard TV / Accueil d'origine) wired to `setHome()`; the second, « Réglages de la télé », opens the TV's own screens. In a desktop browser both only write a note: there is no TV behind it.

### What the APK does not ask for

- No network permission (`INTERNET` and `ACCESS_NETWORK_STATE` are absent from the manifest: the system itself forbids any connection). `build.sh` refuses to produce an APK that would declare a permission.
- No `QUERY_ALL_PACKAGES`: a `<queries>` block targeted at the intents it needs.
- No third-party library, no analytics, no accessibility service, no boot receiver outside the HOME category.

### Building the APK

Requirements: a JDK 17 or newer, the Android SDK command-line tools (`sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"`), and the `ANDROID_HOME` (or `ANDROID_SDK_ROOT`) variable pointing at the SDK. Details, Windows variants (Git Bash) and troubleshooting in `android/README.md`.

```bash
cd android
./build.sh            # → android/PoudlardTV.apk, signed with android/poudlard.keystore
```

The `poudlard.keystore` file is created on the first build and ignored by Git. **Keep it**: an update must be signed with the same key, otherwise you have to uninstall before reinstalling. The script copies `app/` as is into the APK (without `*.md` or working files), embedded fonts, logos, crest pictures and music included.

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

Or, with the scripts: `tools/tv.sh connect 192.168.1.50` then `tools/tv.sh install android/PoudlardTV.apk` (`tools/tv.ps1` in PowerShell, same commands).

Accept the "Allow USB debugging?" prompt on the TV, ticking "Always allow". Install with `adb` rather than by opening the APK on the TV; on Android 14, Play Protect may still show a warning: "More details" → "Install anyway". On some TCL models, allow background execution: `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.

**Installing does not take the Home key.** Poudlard's HOME entry (the `.Home` alias) ships disabled: right after the install, the Home key still leads to the TV's current home, and no "which home app?" chooser appears. Poudlard TV is in the app list (`.Start` alias), nothing more, until you ask for it below. (Earlier versions shipped the alias enabled; on the first device test, Home showed the chooser right after the install.)

On **Chromecast with Google TV**, port 5555 closes again at every reboot. If `adb connect` fails, pair first and then reopen it, in this order (the two ports shown under "Wireless debugging" are different: a pairing port and a debugging port):

```bash
adb pair 192.168.1.50:37123 123456      # port and code shown by "Pair device with pairing code"
adb connect 192.168.1.50:41567          # port shown under "Wireless debugging"
adb tcpip 5555
adb connect 192.168.1.50:5555
```

### Setting it as home (Home → Poudlard)

The choice of home screen belongs to the system; Poudlard TV asks for it, the TV confirms. Launch Poudlard TV from the app list (the Admission Letter plays), then:

- on the Letter's last page, « Les issues de secours », choose **« Faire de Poudlard l'accueil »**; later, the same thing lives in Salle sur Demande → **Accueil de la télé** → Touche Home : **« Poudlard TV »**;
- Poudlard first **notes which home is the default at that moment** (Google TV's, the manufacturer's, or a third-party launcher such as Free My TV), enables its HOME entry, then asks the system for the HOME role: on Android 10+ the TV shows its own confirmation dialog, OK on "Poudlard TV". On Android 8/9, press Home and pick Poudlard TV, then "Always";
- from the command line instead: `tools/tv.sh home poudlard`, which runs `adb shell pm enable fr.wavia.poudlardtv/.Home` then `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home`.

The remote's Home key now leads to the Parapet. Unlike Free My TV, nothing is disabled: the previous home stays installed, active and selectable.

Try it first on a Google TV dongle or a secondary device before the main television.

### Going back to the original home (Home → Original)

Five paths, from the gentlest to the most radical. None requires resetting the TV.

1. **Classic mode**, without leaving Poudlard TV: hold Back for 2 s from any screen → « Nox ? » → Yes. A sober home screen, same apps, no scenery. The same gesture lights Poudlard up again.
2. **« Accueil d'origine »**: Salle sur Demande → Accueil de la télé → Touche Home → « Accueil d'origine » (or plain mode's « Touche Home » tile, or the rescue screen). The launcher disables its own home entry (the `.Home` alias, allowed without permission on its own components) and gives the Home key back to the home it remembered, **including a third-party launcher** such as Free My TV, then opens it. Poudlard TV stays in the app list (`.Start` alias) to come back.
3. **From the computer**, without the remote: name the home you want.
   ```bash
   # the candidates (Poudlard, the TV's own launcher, any third-party launcher):
   adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME
   # give Home to one of them, for example Free My TV:
   adb shell cmd package set-home-activity io.freemytv/.HomeActivity
   ```
   `tools/tv.sh home original` (or `tools/tv.ps1 home original`) does the same, with the home it finds. Do **not** use `adb shell pm disable-user --user 0 fr.wavia.poudlardtv/.Home`: Android 11 refuses it, as the first device test showed.
4. **Uninstall**: Settings → Apps → Poudlard TV → Uninstall, or `adb uninstall fr.wavia.poudlardtv`. Home goes back to the remaining home; the configuration, stored in the app's private data, goes with it.
5. **Safety net**: if the launcher closes abnormally three times in five minutes (a dying WebView engine counts too), it hands control back to the original home by itself and shows a plain screen saying so (a principle taken from Free My TV, without adb). It does not try again until you set « Touche Home : Poudlard TV » again. At worst, rebooting the TV (unplug for 10 s) is enough to get back a system that boots.

Nothing is modified in the system: no root, no partition touched, no other app disabled. The original launcher stays installed and up to date.

### Settings on the television

All settings are made in the interface (↑ → the quill at the top right → the Room of Requirement), with the D-pad: apps on the Parapet and their order, hidden apps, house, Hedwig, sounds and background music, motion, sleep, classic mode, and the "About" section (network, version, reversibility, reset). There is no configuration file to edit and nothing to recompile to change a setting.

The configuration is a single JSON object, versioned and validated on read (see `app/README.md`). On TV it lives in the WebView's `localStorage` (origin `https://poudlard.invalid`, served from the APK's assets), in the app's private data: never synced, never backed up to the cloud, erased on uninstall.

### Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `adb connect` refuses or times out | Debugging not enabled, or port 5555 closed (Chromecast) | Re-enable debugging; `adb pair` → `adb connect <ip:debug-port>` → `adb tcpip 5555` → `adb connect <ip>:5555` |
| "INSTALL_FAILED_…" on install | An APK with another signature is already installed | `adb uninstall fr.wavia.poudlardtv` then reinstall (and keep `poudlard.keystore` from now on) |
| Right after an install, Home shows a "which home app?" chooser | A build older than 0.3, whose HOME entry was enabled at install | Pick your usual home and "Always", or `adb shell cmd package set-home-activity <package>/<activity>`; then install 0.3 |
| Nothing opens (apps, films, inputs, TV settings) | A build older than 0.3 (bridge called detached from its object) | Install 0.3 |
| An app does not launch (Howler: not installed) | Package missing, or app without a Leanback activity | Check the package in Settings; launch the app once from the original home |
| A film link is refused | Its host is not on the allow-list (`platform.js` and `Apps.java`) | Use the film's page on the streaming service's own domain (`canalplus.com`, `netflix.com`…); a new host must be added to both lists |
| An HDMI input does not switch | The model does not expose its inputs to a third-party app | Use the remote for the source; remove the Passage from the Parapet |
| The app restarts by itself while in use | Android ended it for memory (small TVs: 1.3 GB of RAM) | Check that you run 0.3; `adb logcat -s PoudlardTV chromium` and `adb shell dumpsys meminfo fr.wavia.poudlardtv` to see what it used |
| Black screen at startup | Missing backdrop image or old WebView | Classic mode is guaranteed to work without images: hold Back for 2 s; update "Android System WebView" |
| Default fonts (no Cinzel) | `app/assets/fonts/` missing from the build | Build from an up-to-date clone: the OFL fonts are versioned in `app/assets/fonts/` and declared in `app/css/fonts.css` |
| No music, or very quiet | Sound off, music set to None, or a build older than 0.3 | Settings → Owl and sounds; 0.3 ships `ambiance.ogg`, starts it by itself and plays it louder |
| Nothing on screen after three crashes | The safety net handed control back | Fix the cause (`adb logcat -s PoudlardTV chromium`), then redo Home → Poudlard |

## Known limits

Inherited from the method, by design (the launcher asks for no permission and runs no service):

- **Fire TV** keeps the Home key for Amazon's home: Poudlard TV opens from the app list there.
- **Hisense** and **Google TV Streamer**: the branded Home button opens the original home (Free My TV catches it with an accessibility service; we do not).
- **Assistant results** and some voice actions open the original home.
- **Hikeen** sets waking from standby may show the previous app for a second.
- **Samsung 2017-2018** (Android 8/9): the TV's settings menu freezes when opened from an app; use the remote's Settings key.

## After a TV update

A system update can reset the HOME role. The launcher has no boot receiver (rule), so it checks each time it comes back: if the key was lost while its entry is still enabled, the Parapet offers to ask it back ("La télé a repris la touche Home", once a day at most). Accept, or from the computer: `tools/tv.sh home poudlard`.
