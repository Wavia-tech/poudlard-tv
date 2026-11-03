# Poudlard TV, the Android side

The Android TV launcher that displays the web mock-up (`../app/`) in a full-screen WebView and lends it
four powers over the TV: launch an app, switch HDMI input, open a film link in its own app, and list the installed
apps. Nothing else.

Plain Java, no Gradle and no library, built by `build.sh`: the method of [Free My TV](https://github.com/simbasjungles/free-my-tv)
(MIT), from which we took what concerns the TV (see `../docs/FREE-MY-TV.md` and the "Free My TV license" section
below), leaving aside anything that requires a permission or touches the TV's own apps.

> **Test status.** Update this box after every test.
>
> **3 November 2026, first device test (version 0.2).** Android TV 11, 1920 × 1080 panel at density 320 (the
> WebView lays out at 960 × 540 CSS px, `devicePixelRatio` 2), 1.3 GB of RAM (about 550 MB available), four weak
> cores, WebView 142, Free My TV (`io.freemytv/.HomeActivity`) as the home. Built with `build.sh`, installed with
> `adb install`. Found:
> - nothing opened (apps, films, HDMI inputs, Home key, TV settings): `platform.js` called the bridge methods
>   detached from `window.Android`, which the WebView's Java bridge refuses;
> - canalplus.com missing from the URL allow-list on both sides: every Canal+ film refused;
> - installing took the Home key: right after the install, Home showed the "which home app?" chooser;
> - `pm disable-user --user 0 fr.wavia.poudlardtv/.Home`, the documented rollback, is refused on Android 11;
>   `cmd package set-home-activity <component>` works;
> - the original home was not found when it is a third-party launcher: « Accueil d'origine » and the rescue
>   screen led nowhere;
> - Android killed the app and its WebView renderer for memory (about 115 MB, 47 MB of it graphics);
> - the idle Parapet kept the WebView at 110-130 % CPU, with 35 % janky frames; cold start 2.7 s;
> - with no network, system fonts; a 28 MB music file that did not start on its own.
> With Netflix in front, Poudlard dropped to about 3 % CPU.
>
> **Version 0.3** addresses each point (`../CHANGELOG.md`). **A second test on the TV is still to be done** (paused while the TV is in everyday use); its
> results go here. Still to check on a device after it: the HDMI switches one port at a time, the role dialog on
> Android 10+, the fallback and rescue screens, a dongle (Chromecast with Google TV) as a second device.

## What the APK never does

- **No permission.** No `INTERNET`, no `ACCESS_NETWORK_STATE`, no `RECEIVE_BOOT_COMPLETED`, no
  `QUERY_ALL_PACKAGES`. `build.sh` stops if a permission shows up. Check it yourself:
  `aapt dump permissions PoudlardTV.apk` must list nothing.
- **Never disables the original home** (Google TV's, the manufacturer's or a third-party launcher) or any other app. No internal adb, no `pm disable`.
- **Does not take the Home key at install.** The HOME entry stays disabled until the person chooses « Faire de Poudlard l'accueil ».
- **Collects nothing.** No account, no history, no log sent anywhere. The only log is `logcat`.
- **Launches apps by explicit intent** (named package, present in the list of installed apps). A film link
  is opened in the app that owns it, or failing that on that app's home screen, never in another app; the
  hosts are limited to `URL_HOSTS` (`Apps.java`, identical to `platform.js`). HDMI inputs go through the
  system's standard intent (`content://android.media.tv/…`), which only the TV's own TV app answers.
- **Does not survive its own uninstall**: `adb uninstall fr.wavia.poudlardtv` puts the TV back exactly as it was.

## File tree

```
android/
  AndroidManifest.xml            HOME (alias .Home, disabled at install, enabled by setHome) + LEANBACK_LAUNCHER (alias .Start), targeted <queries>, zero permissions
  build.sh                       mock-up → assets/web/, aapt2, javac, d8, zipalign, apksigner, permission check
  .gitignore                     out/, *.apk, *.keystore
  res/values/strings.xml         the only native texts (fallback screen)
  res/values/styles.xml          full screen, night background
  res/values/colors.xml          the base.css palette for native views
  res/drawable/banner.xml        Leanback banner 320x180 (XML, to be replaced with an original PNG if desired)
  res/drawable/icon.xml          square icon, same motif
  src/fr/wavia/poudlardtv/
    HomeActivity.java            the WebView, keys, lifecycle, fallback screens
    Bridge.java                  window.Android: launch, switchInput, openUrl, installedPackages, appIcon, setHome, homeMode, version
    Apps.java                    launching, list of installed apps, banners, HDMI inputs (taken from Free My TV's HomeApps)
    HomeMode.java                Poudlard / original home, reversible, no adb
    Watchdog.java                3 crashes in 5 minutes → the original home takes over (taken from Free My TV)
    WebAssets.java               serves assets/web/ under https://poudlard.invalid/ (WebViewAssetLoader rewritten, no AndroidX)
    Log.java                     logcat, tag PoudlardTV
```

## Building

Prerequisites: JDK 17 or later, the Android SDK command-line tools, adb.

```bash
sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"
export ANDROID_HOME=~/Android/Sdk        # or ANDROID_SDK_ROOT; on Windows (Git Bash): /c/Users/<name>/AppData/Local/Android/Sdk
cd poudlard-tv/android
./build.sh
```

Result: `PoudlardTV.apk` in this folder, signed with `poudlard.keystore` (created on the first build, ignored by git).
**Keep this file**: an update must be signed with the same key, otherwise you have to uninstall before reinstalling.

The script copies `../app/` as is into `assets/web/` (without the `.md` files). If `app/tv.html` exists (the full-screen
version without the test bench), that is the page loaded; otherwise `index.html`. Assets are added to the APK with `jar`
rather than `aapt2 -A`, which avoids aapt2's backslash bug on Windows. The embedded fonts (`app/assets/fonts/`,
OFL) go in, so the TV needs no network to show them. So do the app logos, the four house crest pictures and the
music file (`app/assets/music/ambiance.ogg`, under 3 MB), which the repository versions at the maintainer's request
(`../DISCLAIMER.md`): they are third-party material, not covered by the MIT license, and an APK handed to someone
else carries them under the responsibility of whoever hands it over.

## Installing on the TV (first time)

1. On the TV: Settings → System → About → press "Android Build" 7 times → the developer options
   appear. Enable **USB debugging** there (and "Wireless debugging" on Android 14). Note the IP address
   (Settings → Network).
2. On the computer:
   ```bash
   adb connect 192.168.1.50:5555        # the TV's IP
   adb install -r PoudlardTV.apk
   ```
   (or `../tools/tv.sh install PoudlardTV.apk`, `../tools/tv.ps1` in PowerShell). The TV asks "Allow USB debugging?":
   tick "Always allow", OK. On Android 14, Play Protect may block: "More details" → "Install anyway".
   On TCL, allow running in the background:
   `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.

   **Installing does not take the Home key.** The `.Home` alias ships disabled (`android:enabled="false"`): after
   the install the TV has exactly the home candidates it had before, Home keeps going to its current home and no
   "which home app?" chooser appears. Up to 0.2 the alias shipped enabled, and on the first device test Home showed
   that chooser right after the install.
3. On the TV: open **Poudlard TV** in the app list (that is the `.Start` alias). The Admission Letter (Lettre d'admission) plays.
4. The Admission Letter's last page, « Les issues de secours », offers **« Faire de Poudlard l'accueil »**; later, the
   same thing lives in Salle sur Demande → **Accueil de la télé** → Touche Home : **« Poudlard TV »**. The launcher
   first **records the home that is the default at that moment** (the HOME role holder, or what the HOME intent
   resolves to: the Google TV launcher, the manufacturer's, or a third-party launcher such as Free My TV), then
   enables its HOME entry point and asks the system for the HOME role (`RoleManager`, Android 10+): the TV shows its
   own confirmation dialog, OK on "Poudlard TV". From then on, the Home key leads to the Parapet (home). The row's
   note tells what the TV did (`hint`: `held`, `role`, `settings`, `press-home`, `fire`).
   On older sets (Android 8/9) there is no role dialog: press the **Home** key, the TV has two home screens
   and shows its chooser; pick Poudlard TV and **"Always"**. If no chooser appears (some models remember the
   original home without asking), the only other way is the command line:
   `adb shell pm enable fr.wavia.poudlardtv/.Home` then `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home`
   (`tools/tv.sh home poudlard` runs both). These are the only commands in this document that touch a TV setting,
   and they are reversible (see below). Fire TV never hands the Home key over: Poudlard TV opens from the app list there.

Advice taken from the project README: try on a Google TV dongle first, before the living-room TV.

## Going back

Three paths, from the gentlest to the most radical. None of them touches other apps. The labels are those of the
mock-up's Salle sur Demande → Accueil de la télé section.

1. **From Poudlard TV**: Salle sur Demande → Accueil de la télé → Touche Home : **« Accueil d'origine »** (a confirmation,
   focus on « Non »). The launcher disables its own HOME entry point (the `.Home` alias) and opens the home it recorded
   when it took the key, a third-party launcher included; the Home key goes back there. Poudlard TV stays in the app
   list to come back later (same row, « Poudlard TV »). Plain mode has the same choice on its « Touche Home » tile, and
   the rescue screen (Back held 6 s) its « Accueil d'origine » button.
   The app cannot hand the HOME role to another app itself: the system reassigns it when our alias disappears. On a
   TV that still has two other homes (a third-party launcher next to an enabled Google TV launcher), the system may
   ask once which one to use. *To be confirmed by the second device test (see the "Test status" box).*
2. **From the computer**, without a remote: give the home to the one you want. List the candidates first (the
   package varies by brand), then designate it:
   ```bash
   adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME
   adb shell cmd package set-home-activity <package>/<activity>      # one from the line above that is not fr.wavia.poudlardtv
   # for example, a TV whose home was Free My TV:
   adb shell cmd package set-home-activity io.freemytv/.HomeActivity
   ```
   `../tools/tv.sh home original` does the same with the home it finds. Do **not** use
   `pm disable-user --user 0 fr.wavia.poudlardtv/.Home`, documented here before 0.3: Android 11 refuses it.
   `set-home-activity` only changes which home the Home key opens; it disables nothing.
3. **Uninstall**: `adb uninstall fr.wavia.poudlardtv`. Home goes back to the homes the TV had before; there is nothing
   else to clean up.

And the safeguard: if the home crashes **three times in five minutes**, it hands over to the original home
on its own and shows a plain screen with two buttons: « Ouvrir l'accueil d'origine » (open the original home) and « Réessayer Poudlard TV » (retry Poudlard TV)
(which clears the counter and reopens the interface, without reopening the HOME entry point: you have to set « Touche Home :
Poudlard TV » again to get it back). Without that button, reopening Poudlard TV from the app list shows the fallback
screen again until the five minutes have elapsed.

## The `window.Android` bridge

Called by `../app/js/platform.js` only. Every method returns a JSON string and never throws. The page must call
each method **on the bridge object** (`window.Android.launch(pkg)`, or `b[method](...args)` as `platform.js` does): the
WebView's Java bridge refuses a method called detached from it (`const f = window.Android.launch; f(pkg)`), which is
why nothing opened on the first device test.

| Method | Returns | Note |
|---|---|---|
| `launch(pkg)` | `{"ok":true}` or `{"ok":false,"error":"…"}` | Leanback, then phone fallback; `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED`; the error says plainly when the app is not installed |
| `switchInput("HDMI 1")` | same | `TvContract.buildChannelUriForPassthroughInput`; readable error if the TV does not respond; **to test**: one switch per HDMI port on the target TV (the port number is read from the input id, otherwise the n-th port in the TV's order) |
| `openUrl(url, pkg)` | same | https and allow-listed host only (`Apps.URL_HOSTS`, identical to `platform.js`, canalplus.com included); in the app `pkg`; otherwise on `pkg`'s home screen; never anywhere else |
| `installedPackages()` | `["com.netflix.ninja", …]` | `LEANBACK_LAUNCHER` then `LAUNCHER` (without system apps), deduplicated |
| `appIcon(pkg)` | `"data:image/png;base64,…"` or `null` | Leanback banner (384x216), otherwise icon centred on a night background; in-memory cache |
| `setHome("poudlard")` | `{"ok":true,"hint":"…"}` | records the current default home, enables the HOME entry point and clears the safeguard; `hint` says which instruction to show: `held`, `role` (the TV's dialog is on screen), `settings` ("choose in the screen that opens"), `press-home` ("press Home and choose Poudlard TV, then Always"), `fire` |
| `setHome("original")` | `{"ok":true}` or `{"ok":false,"error":"…"}` | see "Going back" |
| `homeMode()` | `"poudlard"`, `"original"` or `"reverted"` | to show the state in the settings |
| `version()` | the `versionName`, e.g. `"0.3"` | |

The other methods (`installedApps`, `openSystem`, `inputs`, `hasLiveTv`, `liveTv`, `store`, `fatal`, `device`) are
listed in `../app/CONTRACT.md` and `../docs/FREE-MY-TV.md`.

Keys: arrows and OK reach the page natively (ArrowLeft…, Enter). Back and Menu are captured by
the activity and replayed as `KeyboardEvent`s (`Escape`, `ContextMenu`), key down and key up, so that the long press
in `input.js` works. The Home key replays `Home`.

Storage: the `config.js` configuration lives in the WebView's `localStorage`, tied to the origin
`https://poudlard.invalid/` (the app's private storage, never synced; `allowBackup="false"`).
Changing this host in `WebAssets.java` would lose the saved configuration.

Sleep: the activity does not set `FLAG_KEEP_SCREEN_ON`. The TV keeps its screensaver and its standby.

Memory: the target TV has 1.3 GB of RAM and about 550 MB free; on the first test Android ended the app and its
WebView renderer at about 115 MB (47 MB of graphics). Keep decoded images small (no texture wider than the screen
needs, none above the GPU's texture limit) and nothing animating at idle. To measure:
`adb shell dumpsys meminfo fr.wavia.poudlardtv` and `adb shell top -n 1 | grep -i webview`.

## Debugging

```bash
adb logcat -s PoudlardTV chromium          # the launcher and the WebView's JS errors
```

To inspect the page as in Chrome: `chrome://inspect` on the computer (USB debugging enabled on the TV),
after adding `WebView.setWebContentsDebuggingEnabled(true)` in `HomeActivity.buildWebView` for the duration of the test
(do not leave it in a published release).

## What remains

- The second device test, and the "Test status" box updated with its results.
- `appIcon(pkg)` in classic mode, as an alternative to the versioned logos.
- An original PNG banner (320x180) instead of `banner.xml`.

## Free My TV license

`Apps.java`, `Watchdog.java` and the structure of `HomeActivity.java` (as well as `HomeMode.originalHome`) reuse
code from Free My TV, released under the MIT license. That license requires keeping the notice below in any
substantial copy; it is in addition to Wavia's MIT license (`../LICENSE`), which covers the rest of the repository.

```
MIT License

Copyright (c) 2026 Free My TV contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## From the computer: `tools/tv.sh` / `tools/tv.ps1`

The commands of this document are wrapped in two scripts (`connect`, `install`, `home poudlard|original`, `status`,
`logs`, `uninstall`, `config pull|push`); see `tools/README.md`. The install pitfalls (adb only, Play Protect,
Chromecast's port 5555, differently-signed builds) are listed there too.

## Sticky revert and lost role

- After three crashes in five minutes the guard writes `files/home-reverted` (atomically) besides disabling the
  `.Home` alias: even if an update re-enables the alias, opening the launcher through the HOME intent shows the
  fallback screen until « Touche Home : Poudlard TV » is set again (`Watchdog.clear`). Opening it from the app
  list still shows the interface.
- Three identical page errors within a minute count as one crash (`Bridge.fatal`).
- `HomeActivity.onResume` checks whether the HOME role was lost while the alias is enabled and tells the page
  (`poudlard:home` with `lost:true`); the Parapet offers to ask it back, once a day.
