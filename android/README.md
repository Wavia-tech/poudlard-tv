# Poudlard TV, the Android side

The Android TV launcher that displays the web mock-up (`../app/`) in a full-screen WebView and lends it
four powers over the TV: launch an app, switch HDMI input, open a film link in its own app, and list the installed
apps. Nothing else.

Plain Java, no Gradle and no library, built by `build.sh`: the method of [Free My TV](https://github.com/simbasjungles/free-my-tv)
(MIT), from which we took what concerns the TV (see `../docs/FREE-MY-TV.md` and the "Free My TV license" section
below), leaving aside anything that requires a permission or touches the TV's own apps.

> **Test status.** This code was written from the Android documentation and the Free My TV repository; it compiles
> (`javac` against `android.jar`) but **has not run on a device yet**. Verified on: *(none so far)*.
> Check first on a Google TV dongle, before the living-room TV: installation, switching home in both directions,
> the four HDMI switches in the CATALOG, the fallback screen. Update this box after every test.

## What the APK never does

- **No permission.** No `INTERNET`, no `ACCESS_NETWORK_STATE`, no `RECEIVE_BOOT_COMPLETED`, no
  `QUERY_ALL_PACKAGES`. `build.sh` stops if a permission shows up. Check it yourself:
  `aapt dump permissions PoudlardTV.apk` must list nothing.
- **Never disables the Google home** or any other app. No internal adb, no `pm disable`.
- **Collects nothing.** No account, no history, no log sent anywhere. The only log is `logcat`.
- **Launches apps by explicit intent** (named package, present in the list of installed apps). A film link
  is opened in the app that owns it, or failing that on that app's home screen, never in another app; the
  hosts are limited to `URL_HOSTS` (`Apps.java`, identical to `platform.js`). HDMI inputs go through the
  system's standard intent (`content://android.media.tv/…`), which only the TV's own TV app answers.
- **Does not survive its own uninstall**: `adb uninstall fr.wavia.poudlardtv` puts the TV back exactly as it was.

## File tree

```
android/
  AndroidManifest.xml            HOME (alias .Home, can be disabled) + LEANBACK_LAUNCHER (alias .Start), targeted <queries>, zero permissions
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
cd tv-home/android
./build.sh
```

Result: `PoudlardTV.apk` in this folder, signed with `poudlard.keystore` (created on the first build, ignored by git).
**Keep this file**: an update must be signed with the same key, otherwise you have to uninstall before reinstalling.

The script copies `../app/` as is into `assets/web/` (without the `.md` files). If `app/tv.html` exists (the full-screen
version without the test bench), that is the page loaded; otherwise `index.html`. Assets are added to the APK with `jar`
rather than `aapt2 -A`, which avoids aapt2's backslash bug on Windows. If `app/assets/logos.js` (private
logos) or `app/assets/music/` (personal music) are present, they go into the APK and the script says so:
an APK meant for other people is built from a clean clone.

## Installing on the TV (first time)

1. On the TV: Settings → System → About → press "Android Build" 7 times → the developer options
   appear. Enable **USB debugging** there (and "Wireless debugging" on Android 14). Note the IP address
   (Settings → Network).
2. On the computer:
   ```bash
   adb connect 192.168.1.50:5555        # the TV's IP
   adb install -r PoudlardTV.apk
   ```
   The TV asks "Allow USB debugging?": tick "Always allow", OK.
   On Android 14, Play Protect may block: "More details" → "Install anyway".
   On TCL, allow running in the background:
   `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.
3. On the TV: open **Poudlard TV** in the app list (that is the `.Start` alias). The Admission Letter (Lettre d'admission) plays.
4. The Admission Letter's last page, « Les issues de secours », offers **« Faire de Poudlard l'accueil »**; later, the
   same thing lives in Salle sur Demande → **Accueil de la télé** → Touche Home : **« Poudlard TV »**. The launcher
   re-enables its HOME entry point (it already is on first install) and asks the system for the HOME role
   (`RoleManager`, Android 10+): the TV shows its own confirmation dialog, OK on "Poudlard TV". From then on,
   the Home key leads to the Parapet (home). The row's note tells what the TV did (`hint`: `held`, `role`,
   `settings`, `press-home`, `fire`).
   On older sets (Android 8/9) there is no role dialog: press the **Home** key, the TV has two home screens
   and shows its chooser; pick Poudlard TV and **"Always"**. If no chooser appears (some models remember the
   original home without asking), the only other way is the command line:
   `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home`. It is the only command in this document
   that touches a TV setting, and it is reversible (see below). Fire TV never hands the Home key over: Poudlard TV
   opens from the app list there.

Advice taken from the project README: try on a Google TV dongle first, before the living-room TV.

## Going back

Three paths, from the gentlest to the most radical. None of them touches other apps. The labels are those of the
mock-up's Salle sur Demande → Accueil de la télé section.

1. **From Poudlard TV**: Salle sur Demande → Accueil de la télé → Touche Home : **« Accueil d'origine »** (a confirmation,
   focus on « Non »). The launcher disables its own HOME entry point (the `.Home` alias) and relaunches the original home;
   the Home key goes back there. Poudlard TV stays in the app list to come back later (same row, « Poudlard TV »).
   Plain mode has the same choice on its « Touche Home » tile.
   *Expected from the documentation (the HOME role is reassigned when the component disappears), not yet verified on
   a device: see the "Test status" box.*
2. **From the computer**, without a remote: hand the home back to the TV's Google TV component. Find it first
   (the package varies by brand), then designate it:
   ```bash
   adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME
   adb shell cmd package set-home-activity <package>/<activity>      # the one from the line above that is not fr.wavia.poudlardtv
   ```
   To close Poudlard TV's HOME entry point without opening it: `adb shell pm disable-user --user 0 fr.wavia.poudlardtv/.Home`
   (and `pm enable` for the opposite). These commands only touch Poudlard TV.
3. **Uninstall**: `adb uninstall fr.wavia.poudlardtv`. The TV returns to its original state; there is nothing else to clean up.

And the safeguard: if the home crashes **three times in five minutes**, it hands over to the original home
on its own and shows a plain screen with two buttons: « Ouvrir l'accueil d'origine » (open the original home) and « Réessayer Poudlard TV » (retry Poudlard TV)
(which clears the counter and reopens the interface, without reopening the HOME entry point: you have to set « Touche Home :
Poudlard TV » again to get it back). Without that button, reopening Poudlard TV from the app list shows the fallback
screen again until the five minutes have elapsed.

## The `window.Android` bridge

Called by `../app/js/platform.js`. Every method returns a JSON string and never throws.

| Method | Returns | Note |
|---|---|---|
| `launch(pkg)` | `{"ok":true}` or `{"ok":false,"error":"…"}` | Leanback, then phone fallback; `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED` |
| `switchInput("HDMI 1")` | same | `TvContract.buildChannelUriForPassthroughInput`; readable error if the TV does not respond; **to test**: the 4 HDMI switches on the living-room TV (the port number is read from the input id, otherwise the n-th port in the TV's order) |
| `openUrl(url, pkg)` | same | https and allow-listed host only; in the app `pkg`; otherwise on `pkg`'s home screen; never anywhere else |
| `installedPackages()` | `["com.netflix.ninja", …]` | `LEANBACK_LAUNCHER` then `LAUNCHER` (without system apps), deduplicated |
| `appIcon(pkg)` | `"data:image/png;base64,…"` or `null` | Leanback banner (384x216), otherwise icon centred on a night background; in-memory cache |
| `setHome("poudlard")` | `{"ok":true,"hint":"press-home"}` or `{"ok":true,"hint":"settings"}` | reopens the HOME entry point and clears the safeguard; `hint` says which instruction to show: "press Home and choose Poudlard TV, then Always" (`press-home`, the normal case on Android TV) or "choose in the screen that opens" (`settings`) |
| `setHome("original")` | `{"ok":true}` | see "Going back" |
| `homeMode()` | `"poudlard"` or `"original"` | to show the state in the settings |
| `version()` | `"0.1"` | |

Keys: arrows and OK reach the page natively (ArrowLeft…, Enter). Back and Menu are captured by
the activity and replayed as `KeyboardEvent`s (`Escape`, `ContextMenu`), key down and key up, so that the long press
in `input.js` works. The Home key replays `Home`.

Storage: the `config.js` configuration lives in the WebView's `localStorage`, tied to the origin
`https://poudlard.invalid/` (the app's private storage, never synced; `allowBackup="false"`).
Changing this host in `WebAssets.java` would lose the saved configuration.

Sleep: the activity does not set `FLAG_KEEP_SCREEN_ON`. The TV keeps its screensaver and its standby.

## Debugging

```bash
adb logcat -s PoudlardTV chromium          # the launcher and the WebView's JS errors
```

To inspect the page as in Chrome: `chrome://inspect` on the computer (USB debugging enabled on the TV),
after adding `WebView.setWebContentsDebuggingEnabled(true)` in `HomeActivity.buildWebView` for the duration of the test
(do not leave it in a published release).

## What remains before a public repository

- Embed the fonts (Cinzel, EB Garamond, IM Fell English, OFL license) in `app/assets/fonts/` and declare them
  as `@font-face` in `base.css`: without a network, the TV otherwise shows its system fonts.
- Replace the mock-up's official SVG logos (private use) with `appIcon(pkg)` in classic mode, or with
  monograms.
- A `tv.html` without the test bench (the scene alone, 100% of the window).
- An original PNG banner (320x180) instead of `banner.xml`.
- A first run on a device, and the "Test status" box updated.

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
