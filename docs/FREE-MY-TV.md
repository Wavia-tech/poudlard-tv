# What we take from Free My TV

A study of the [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) repository (MIT, read on 2 November 2026,
branch `main`, version 1.3) for everything TV-related in Poudlard TV: launching apps, listing installed apps,
banners, HDMI inputs, choosing the home screen, going back to the original home, the crash guard,
building without Gradle. This document says what we keep, what we leave out, and why.

Free My TV is pure Java, with no Gradle and no library (`build.sh`: aapt2 → javac → d8 → zipalign → apksigner),
`minSdk 26`, `targetSdk 33`. That is exactly the constraint of Poudlard TV, so we copy the method, and for two
files (`Apps.java`, `Watchdog.java`) a good part of the code: Free My TV is under the MIT licence
("Copyright (c) 2026 Free My TV contributors"), whose notice is reproduced in `android/README.md` (section
"Free My TV license") and quoted at the top of each file concerned.

## 1. The files that matter (and where things are)

| Free My TV file | Role | What we do with it |
|---|---|---|
| `build.sh` | Finds the SDK, compiles without Gradle, signs | Taken over in spirit (`android/build.sh`) |
| `app/AndroidManifest.xml` | HOME + LEANBACK, `<queries>`, `:home` process | Taken over in a reduced version, with no permission at all |
| `app/src/io/freemytv/HomeApps.java` | App list, launching, banners, HDMI inputs | Taken over: `Apps.java` |
| `app/src/io/freemytv/HomeMode.java` | Free My TV / Original switch through internal adb | **Not taken over** (requires INTERNET and disables system apps); replaced by a reversible `HomeMode.java` without adb |
| `app/src/io/freemytv/Watchdog.java` | 3 crashes in 5 min → original home | Taken over: `Watchdog.java` |
| `app/src/io/freemytv/HomeActivity.java` | Home activity, Home key, `onNewIntent` | Taken over: `HomeActivity.java` |
| `app/src/io/freemytv/HomeReceiver.java` | `BOOT_COMPLETED` and `MY_PACKAGE_REPLACED` | **Not taken over** (rule: no boot receiver outside the HOME category) |
| `app/src/io/freemytv/Prefs.java` | TV settings > `config.properties` | Taken over as a principle: the config lives in the launcher (DataStore on the Kotlin side later, the WebView's `localStorage` today) |
| `config.example.properties` | `shelf_apps`, `hide_apps`, `hide_services`… | Mapped onto our `config.js` (section 7) |
| `app/src/io/freemytv/Adb.java` | Home-made adb client to `127.0.0.1:5555` | **Not taken over**: a socket, even a local one, requires `android.permission.INTERNET` |

## 2. Launching an app without bugs

Free My TV, `HomeApps.launchIntent`: the Leanback intent first, the "phone" intent as fallback.

```java
Intent intent = pm.getLeanbackLaunchIntentForPackage(pkg);
return intent != null ? intent : pm.getLaunchIntentForPackage(pkg);
```

Then in `open(...)`: `FLAG_ACTIVITY_NEW_TASK`, an attempt inside a `try`, and **a failure never crashes the home screen**:

```java
intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
try {
    a.startActivity(intent, options);
    return true;
} catch (ActivityNotFoundException | SecurityException e) {
    AppLog.w("couldn't open " + it.label + ": " + e.getMessage());
    ...
}
```

Two details we also keep:
- `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED` on the app's "plain" intent: the app comes back where the user left it instead of starting from scratch.
- When opening **content** (`ACTION_VIEW` + `setPackage(pkg)`) fails, we fall back to the plain intent of the same app. Netflix sometimes ignores the address: Free My TV then forces its activity and `FLAG_ACTIVITY_CLEAR_TASK`. We keep the generic fallback, without the Netflix special case (our film links go to Canal+, Netflix, Max and others, each only when its app is installed). And we stop there: no third fallback to "any app that answers" (a browser, for instance), so that the README's "explicit intents" promise stays true.

On our side: `Apps.launch(pkg)` and `Apps.openUrl(url, pkg)` in `android/src/fr/wavia/poudlardtv/Apps.java`, which return a JSON `{ok, error}` to JavaScript instead of a boolean. The Howler (Beuglante, the mock-up's error message) displays `error`.

## 3. The list of installed apps (without QUERY_ALL_PACKAGES)

Free My TV queries both categories and de-duplicates by package, Leanback first (`HomeApps.launchable`):

```java
Intent tv = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
...
if (seen.add(pkg)) out.add(new String[] {pkg, String.valueOf(ri.loadLabel(pm))});
```

System apps coming from the "phone" query are dropped (except named exceptions), which avoids listing the
factory menus. For `queryIntentActivities` to see anything on Android 11+, the manifest declares a
`<queries>` block with these intents (and some fifty named packages). We take over the **intents** of the `<queries>` block
(`MAIN` + `LEANBACK_LAUNCHER`, `MAIN` + `LAUNCHER`, `MAIN` + `HOME`), not the package list: the packages of our
`CATALOG` (config.js) are all Leanback apps, hence visible to the query. `QUERY_ALL_PACKAGES` stays forbidden.

On our side: `Apps.installedApps()` returns a JSON array of `{pkg, label, system}` with the label each app gives the
system (`ri.loadLabel(pm)`), minus our own package, Free My TV's `FACTORY` pattern (factory, hotel and burn-in
menus that pass the LAUNCHER query on some sets) and its `HIDDEN` list (Google TV service entries). `platform.js`
caches it once per screen (`Platform.apps()`, `Platform.installed()`); `installedPackages()` is kept for compatibility.
The Map's "Ajouter une appli" offers these labels, eight per page.

## 4. Banners and icons

Free My TV uses neither `loadBanner` nor `loadIcon`: it fetches the banner **resource** at the highest density,
then falls back to `getApplicationBanner`, then to the icon (adaptive, drawn in a rounded rectangle):

```java
int res = ai.getBannerResource();
Drawable d = pm.getResourcesForApplication(ai).getDrawableForDensity(res, DisplayMetrics.DENSITY_XXXHIGH, null);
```

The result is scaled down to 384 × 216 and cached (memory + disk, with `lastUpdateTime` in the file name so that
it refreshes when the app is updated). On our side: `Apps.appIcon(pkg)` returns the banner (or the icon) as
`data:image/png;base64,…`, 384 × 216 at most, in-memory cache per package. This is what classic mode will show instead
of the SVG logos (private use) once the repo is public.

## 5. HDMI inputs

Free My TV reads `TvInputManager.getTvInputList()`, keeps `TYPE_HDMI`, attaches CEC devices (those with a
`getParentId()`) to their port, and only shows an input when it is connected:

```java
boolean connected = state == TvInputManager.INPUT_STATE_CONNECTED
        || (allwinner && state == TvInputManager.INPUT_STATE_CONNECTED_STANDBY);
```

To switch to it, the standard intent, except on vendor-specific players (Allwinner, Xiaomi, Fire TV):

```java
return new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(it.inputId));
```

On our side, `Apps.inputs()` is a port of that method: one entry per physical HDMI port (`getParentId() == null`),
the CEC children attached to their port, `connected` from `getInputState()` with the Allwinner
`CONNECTED_STANDBY` exception, and the label in this order: the custom label the person set in the TV's settings,
else the CEC name when connected, else « HDMI n ». One difference: Free My TV reads the port number from the
port's label, we read it from the input id (`…/HW2`, `…/HDMI1`) and fall back on the list position, because
`TvInputInfo.getHdmiDeviceInfo()` is a system API, unreachable with `android.jar`. Known quirks, all inherited
from Free My TV's field reports: Allwinner sets report a sleeping console as `CONNECTED_STANDBY`; Xiaomi ids
number the ports 1-3 in their own order; Amlogic ids `/HW5`, `/HW6`, `/HW7` stand for HDMI 1/2/3 (the digit
then matches no port and the list order is used, which is the right result).

The Map lists these ports under the ids `in<port>` (pale and refused when nothing is plugged in, as Free My TV
only shows connected inputs), plus « Télé » when the set has a tuner (`TvContract.buildChannelsUriForInput`) or
one of Free My TV's `LIVE_TV_APPS`. The person can rename a port (`config.passages`), which Free My TV does not
offer. To switch, `Apps.switchInput(id)` takes the exact input id first, else « HDMI n » by number, and sends the
standard passthrough intent inside a `try`, like Free My TV (without `resolveActivity()`, which package visibility
on Android 11+ can make lie). No vendor-specific player: if the TV does not respond, we return a readable error
(« Cette télé n'ouvre pas ses entrées HDMI depuis un launcher »), never a crash. **To test on the target TV**: the
port list, the CEC names, and one switch per port.

## 6. Home: Free My TV / Original, and why we do not do the same

This is the heart of Free My TV and it is what we **do not copy**. `HomeMode.applyFree`:

1. refuses some platforms (Fire TV, Kalley `R3_GTV`, Huawei, phones);
2. remembers the current home (`cmd role get-role-holders android.app.role.HOME`);
3. makes its own activity the home: `cmd package set-home-activity io.freemytv/.HomeActivity`;
4. **disables** (`pm disable-user --user 0`) the Google TV setup app, the manufacturer's home, the Google TV
   launcher, the screensaver, a list of bloatware; with a `PROTECTED` list (picture, sound, inputs, store, Google
   services) and a `dumpsys wifi` check so as never to turn off the app that owns the saved Wi-Fi networks.

Everything goes through a **home-made adb client** (`Adb.java`) that connects to `127.0.0.1:5555` and triggers the
"Allow USB debugging?" prompt. Going back: `applyOriginal` re-enables everything in reverse order (manufacturer's home
first, setup app last); `revertHomeNow` does the same after 3 crashes.

Why not on our side:
- a socket to `127.0.0.1` requires `android.permission.INTERNET`, which our manifest does not declare (rule no. 1);
- disabling the Google home is precisely what the specification forbids ("never disables the Google home");
- Free My TV's PROTECTED list took months of field feedback per brand; we do not have that feedback.

What we keep of the idea, in a reversible version. The home chooser is the one exception to "same method":
- **Installing takes nothing.** The `.Home` alias ships **disabled** (`android:enabled="false"` in the manifest):
  right after `adb install`, the TV has the same home candidates as before, so the Home key keeps going to its
  current home and no "which home app?" chooser appears. (Before 0.3 the alias shipped enabled; on the first
  device test, a TV whose home was Free My TV showed the chooser right after the install.)
- **On the TV, Poudlard asks for the HOME role**, only when the person chooses « Faire de Poudlard l'accueil »:
  `setHome('poudlard')` first **records the home that is the default at that moment** (the HOME role holder, or
  what the HOME intent resolves to), whether it is the Google TV launcher, the manufacturer's or a third-party
  launcher such as Free My TV; then it enables our HOME door (the `.Home` alias), clears the crash guard's
  counter, and calls `RoleManager.createRequestRoleIntent(ROLE_HOME)` from the
  activity (Android 10+, no permission). The system shows its own confirmation dialog; the person presses OK. The
  hint returned to the mock-up says what happened: `held` (already ours), `role` (the dialog is on screen; the
  activity's `onActivityResult` then fires the `poudlard:home` document event so the row repaints), `fire` (Fire
  TV never hands the key over). On Android 8/9, without the role API, the launcher tries the system's "Home app"
  screen (`ACTION_HOME_SETTINGS`, then `ACTION_MANAGE_DEFAULT_APPS_SETTINGS`; `hint: 'settings'`) and otherwise
  says "press Home, choose Poudlard TV, then Always" (`hint: 'press-home'`). An absent screen is never a failure.
- **From the computer**, `tools/tv.sh home poudlard` runs `pm enable` on our alias then `cmd package
  set-home-activity`; Free My TV runs the same command through its on-TV adb client. Same command, two places:
  ours never runs from the app. Nothing of anyone else's is disabled on either path. The way back by hand is the
  same command naming the other home (`cmd package set-home-activity io.freemytv/.HomeActivity`, or the TV's own
  launcher as listed by `cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME`).
  `pm disable-user` on our alias, documented before 0.3, is refused by Android 11.
- **Going back to the original without going through the settings**: `setHome('original')` (« Accueil d'origine »,
  also offered by the rescue screen and the crash guard's fallback screen) disables the `.Home` alias with
  `PackageManager.setComponentEnabledSetting` (allowed without permission on its own components) and opens the
  home it recorded. The system is left with the homes that were there before Poudlard, and the Home key goes back
  to the default one. The Poudlard launcher stays installed and visible in the app list (`.Start` alias,
  `LEANBACK_LAUNCHER`) to come back. Uninstalling the APK puts everything back. Since Android 10 the home is a role
  (`RoleManager` HOME): the system reassigns it when the component disappears; the app cannot hand the role to
  another app itself, so on a TV that still has two homes (a third-party launcher next to an enabled Google TV
  launcher) the system may ask once which one to use. To be confirmed on a device (the "Test status"
  box in `android/README.md`).
- Free My TV's `stockHome()` (list the system HOME activities, exclude itself and `FallbackHome`, do not guess
  when there are two candidates) is taken over in `HomeMode.originalHome()`, now as the **fallback** when no
  previous home was recorded. Before 0.3 it was the only lookup, and it missed a third-party launcher: on the first
  device test, with Free My TV as the home, « Accueil d'origine » and the rescue screen led nowhere.

## 7. The crash guard (Watchdog)

A small file, taken over almost unchanged (hence Free My TV's MIT notice at the top of `Watchdog.java`):

- `install(Context)` sets an `UncaughtExceptionHandler` once, keeps the previous one and calls it afterwards;
- each crash writes a timestamp on a line of `files/home-crashes.txt` (reads capped at 4096 bytes,
  malformed lines ignored);
- `LIMIT = 3`, `WINDOW = 5 * 60_000L`: on the third crash within the window, `HomeMode.requestRevertHome`;
- `crashedTooOften()` stops the home from trying again while the original is restored; `HomeActivity.onCreate` tests it
  **before** building the interface and shows a plain `TextView` otherwise;
- `clear()` when Free My TV is put back.

On our side, the rollback is `HomeMode.giveBackHome()` (disabling the `.Home` alias + launching the recorded
original home, third-party launchers included) instead of adb commands. And since our interface is a WebView, the guard also watches the **rendering**
(`onRenderProcessGone`): a dying WebView engine counts as a crash; the dead WebView is then detached
and destroyed before the fallback screen is shown (the Android contract when returning `true`). The fallback screen has two
buttons: « Ouvrir l'accueil d'origine » and « Réessayer Poudlard TV » (`Watchdog.clear` + `recreate()`, the HOME door
staying closed until « Touche Home : Poudlard TV » is set again).

Free My TV's revert is **sticky** (`homeReverted` in its preferences): once the guard has fired, the launcher
stays out of the way across reboots until the person re-enables it. Ours is sticky the same way: the guard writes
`files/home-reverted` (tmp + rename), `HomeMode.mode()` answers `reverted`, the HOME intent shows the fallback
screen while the flag exists (opening from the app list still shows the interface), and only « Touche Home :
Poudlard TV » clears it. Three identical page errors within a minute count as a crash too (`Bridge.fatal`), and
Back held 6 s opens a native rescue screen over the WebView.

## Brand quirks we inherit, and the ones we do not

From Free My TV's field reports: TCL Android 11+ needs `setTranslucent(false)` on resume (done) and the AUTO_START
allowance at install (`tools/tv.sh install`); Samsung 2017-2018 sets freeze when the settings menu opens from an app
(the section becomes a note); Allwinner reports a sleeping console as `CONNECTED_STANDBY` (handled in
`Apps.inputs`); Hisense and the Google TV Streamer send their branded Home button to the original home (Free My TV
catches it with an accessibility service, we do not); Hikeen sets waking from standby and MediaTek sets starting
live TV at boot keep their quirks (no wake watch, no boot receiver); Fire TV never hands the Home key over (we say
so instead of asking). `Bridge.device()` tells the page which case it is in.

## 8. HomeActivity: what we take over

- `launchMode="singleTask"`, `taskAffinity=""`, `stateNotNeeded`, `clearTaskOnLaunch`, `excludeFromRecents`,
  `screenOrientation="landscape"`, a wide `configChanges`: the home is not recreated on every return.
- The Home key arrives in `onNewIntent`, not in a key handler; Free My TV tells apart a double press
  (< 700 ms) to open the recents. On our side, a Home press puts the home screen back in its entry state (the `home` action of
  `input.js`).
- `onResume` on TCL Android 11+: `setTranslucent(false)`, otherwise the previous app stays visible on top. Taken over.
- At startup: Watchdog, then the "too many crashes" test, then the interface. Taken over in that order.
- `android:banner` is required to appear in the Leanback list; `uses-feature leanback required=false`.
- Free My TV has two activities, `.Start` (its settings) and `.HomeActivity` (the home); its "TV Settings" entry
  and its Settings-key handling live in `SettingsActivity`. On our side the settings are a screen of the same
  WebView (the Room of Requirement), and `HomeActivity.dispatchKeyEvent` maps `KEYCODE_SETTINGS` to
  `Apps.openSystem("settings")`, the TV's own settings, except on Hisense and TCL where the TV keeps that key
  (Free My TV's field report: their system menu answers it already). `Apps.SYSTEM` holds Free My TV's intent
  table for the eleven entries of « Réglages de la télé » (Android TV Settings component first, generic action
  as fallback, each tried inside a `try`, no `resolveActivity()` pre-filter).

## 9. build.sh: the recipe

Taken over line by line in spirit:

```sh
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"            # then the usual paths
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
aapt2 compile --dir app/res -o out/res.zip
aapt2 link -o out/base.apk -I android.jar --manifest AndroidManifest.xml --java out/gen out/res.zip \
      --min-sdk-version 26 --target-sdk-version 33 -A assets -0 ttf
javac -source 8 -target 8 -bootclasspath "android.jar:core-lambda-stubs.jar" -encoding UTF-8 -d out/classes …
d8 --release --min-api 26 --lib android.jar --output out out/classes/**/*.class
zip -qj base.apk classes.dex          # or `jar -u -M -f` if zip is missing
zipalign -f -p 4 out/base.apk out/aligned.apk
apksigner sign --ks poudlard.keystore --ks-pass pass:… --out PoudlardTV.apk out/aligned.apk
keytool -genkeypair -keystore poudlard.keystore -alias poudlard -keyalg RSA -keysize 2048 -validity 20000 …
```

What we add: copying the web mock-up (`app/` → `assets/web/`) before `aapt2 link`. What we change: the
assets do not go through `aapt2 link -A` but through `jar -u -M -0` afterwards (stored uncompressed, paths
always with `/`), which avoids the aapt2 backslash bug on Windows that Free My TV fixes with a
`FixAssets.java` generated on the fly. What we remove: the generation of `Config.java` and of
`network_security_config.xml` (nothing to configure at compile time, no network).

## 10. Mapping our configuration onto theirs

| Poudlard TV (`config.js`) | Free My TV | Comment |
|---|---|---|
| `dock` (8 max, ordered) | `shelf_apps` / `Prefs.shelf()` (comma-separated list of packages; `null` = built-in list) | Same idea: display order = list order. They have no cap except on low-RAM TVs (8). Our ids (`netflix`) translate into packages through `CATALOG`. |
| `hidden` | `hide_apps` (LG/Samsung) and `HIDDEN` in `HomeApps` (Google TV) | For them, hidden = removed from the shelf, from "All apps" and from suggestions. For us, hidden = removed from the Map only, never lost. |
| `mode` (`poudlard` / `classique`) | `Home Screen` → `Free My TV` / `Original` | **Not the same thing**: their "Original" gives the Google home back; our `classique` is another screen of the same launcher. The equivalent of their "Original" is `setHome('original')` (section 6). |
| `custom` (`{id:'c_n', name, pkg}`) | `shelf_apps` with a full id (Samsung) | No direct equivalent: for them every installed app is already listed. For us, `custom` is used to add an app that is not in `CATALOG`. With `Apps.installedPackages()`, the Map will eventually be able to offer installed apps without typing. |
| `sounds` | `Prefs.sounds` (true by default) | Same role (navigation cues). For us, false by default. |
| `idleSeconds` (Nox) | `screensaver` (replaces the TV's screensaver) + `SleepTimer` | They provide a real `DreamService`; Nox is only a state of the home screen, the TV keeps its screensaver. |
| `house`, `owl`, `motion` | none | Specific to Poudlard TV. |
| `library` | `watchmode_key` (open a title on its page) | For them, deep link through Watchmode; for us, allow-listed URL in `config.js`, opened by `openUrl`. |
| `lastApp` | none (they have "Recent Apps", optional) | |
| `firstRunDone` | — | Free My TV has no first-run step: its `KeyPage` is a page for entering a TMDB key, not an onboarding. The Admission Letter (four pages, the last one listing the ways out) is an addition. |
| `passages` (`{ in2: { name } }`) | — | Free My TV shows the CEC name or « HDMI n »; renaming a port is an addition. |
| — | `disable_assistant`, `hide_services`, `tmdb_key`, `latitude`… | Network or app disabling: out of scope. |

## 11. What we will never do from the app (and that Free My TV does, rightly in its context)

- No internal adb: the app never runs `pm disable-user` or `cmd package set-home-activity`.
  (`cmd package set-home-activity` remains a tool for the person, typed from the computer, documented in
  `android/README.md` and wrapped by `tools/tv.sh`; the APK itself has no means to run it, and that is intended.
  `pm disable-user` is not even a tool for the person any more: Android 11 refuses it on our alias.)
- No `RECEIVE_BOOT_COMPLETED`, no accessibility service (`RemoteKeyService`), no `NotificationListener`
  (`NowPlaying`), no `SYSTEM_ALERT_WINDOW` (`SleepOverlay`), no `REQUEST_INSTALL_PACKAGES` (updates).
- No `INTERNET`: no weather, no TMDB, no crypto, no update check.
- No exported ContentProvider (`Secrets`, `PhotoInbox`).
- No asset of theirs: Free My TV bundles brand logos (`web/icons`, `assets/logos`) that a public repository must
  not copy; its reusable third-party assets (Material Symbols, Apache-2.0; Inter, OFL) are clean but unused here
  (our glyphs are pen strokes, our fonts Cinzel, EB Garamond and IM Fell).

The result is a launcher less capable than Free My TV, but whose verification fits in one line
(`aapt dump permissions PoudlardTV.apk`: no permission) and whose rollback depends on no tool.

## 12. What Free My TV does that we deliberately do not, and what it costs

Each line: the mechanism, then what the person at the remote loses with Poudlard TV.

1. **Internal adb client** (`Adb.java`, `INTERNET`): Free My TV runs shell commands on the TV from the app. Ours
   cannot; the one command that matters (`set-home-activity`) is typed from the computer when the role dialog
   is not enough.
2. **`pm disable-user` of the original home, the setup app, the screensaver and a bloatware list**: Free My TV
   makes its home the only one. Ours leaves the original home installed and able to take the key back; the TV's
   own ads live on in that home, not in ours.
3. **`BOOT_COMPLETED` + `MY_PACKAGE_REPLACED` verify loop** (`HomeReceiver`): Free My TV checks after every boot
   and update that it still holds the home. Ours has no receiver: after a system update (OTA) that resets the
   role, Poudlard may lose the Home key until the row is set again (batch 4 reads the state at each start instead).
4. **Accessibility `RemoteKeyService`**: Free My TV catches the remote's brand buttons (Netflix, YouTube…) and
   the Home key on Hisense and Google TV Streamer. Ours does not: brand buttons keep their OEM behaviour, and on
   those two devices the branded Home button opens the original home.
5. **Screensaver replacement** (`DreamService`): the TV keeps its own screensaver; Nox is only a state of the
   home screen.
6. **Sleep timer** (`SleepOverlay`, `SYSTEM_ALERT_WINDOW`): no overlay, no timer; the TV's own sleep settings apply.
7. **Self-update** (`REQUEST_INSTALL_PACKAGES`, network): updates are an `adb install` from the computer.
8. **Hikeen wake watch**: Free My TV detects a Hikeen set waking from standby and refreshes itself. Ours relies on
   `onResume`.
9. **TCL stall detection**: Free My TV restarts its WebView when TCL firmware freezes it. Ours keeps the
   `setTranslucent(false)` workaround only; a stall is caught by the crash guard, not prevented.
10. **Wi-Fi owner check** (`dumpsys wifi`): needed only because Free My TV disables apps; we disable none.
11. **Assistant disabling**: the Google Assistant stays as the TV ships it.

## 13. Why uninstalling is always safe here

Poudlard TV only ever disables **its own** `.Home` alias and asks the HOME role through the system's dialog. It
never calls `pm disable` on anything, never touches another app, the screensaver, picture, sound, network or
accounts. So `adb uninstall fr.wavia.poudlardtv` (or Settings → Apps → Poudlard TV → Uninstall) leaves the TV
with the homes it had before, already enabled (the Google TV launcher, or a third-party one such as Free My TV):
the Home key goes back to the default one on the spot.
Free My TV, uninstalled while in "Free" mode, strands the TV with its original home still disabled (its README
says to switch back to "Original" first); that is the trade-off of its method, and the reason ours stops short.
