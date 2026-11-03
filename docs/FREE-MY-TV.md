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
- When opening **content** (`ACTION_VIEW` + `setPackage(pkg)`) fails, we fall back to the plain intent of the same app. Netflix sometimes ignores the address: Free My TV then forces its activity and `FLAG_ACTIVITY_CLEAR_TASK`. We keep the generic fallback, without the Netflix special case (our Library targets Max). And we stop there: no third fallback to "any app that answers" (a browser, for instance), so that the README's "explicit intents" promise stays true.

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

On our side: `Apps.installedPackages()` returns a JSON array of packages; `platform.js` turns it into a `Set`.

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

On our side: `Apps.switchInput("HDMI 1")` looks for the HDMI input whose number, read from the input identifier
(`…/HW2`, `…/HDMI1`), matches; otherwise the n-th HDMI port in the order returned by `getTvInputList()`.
`TvInputInfo.getHdmiDeviceInfo()` would give the exact port but it is a system API, unreachable with `android.jar`.
Then we send that standard intent, launched inside a `try` like Free My TV (without going through `resolveActivity()`, which
package visibility on Android 11+ can make lie). No vendor-specific player: if the TV does not respond, we
return a readable error (« Cette télé n'ouvre pas ses entrées HDMI depuis un launcher »), never a crash. No
CEC in this version. Known limit: on some platforms (Amlogic), `/HW5`, `/HW6`, `/HW7` stand for
HDMI 1/2/3; the digit then matches no requested port and the list order is used instead, which is
the right result. **To test on the target TV**: the four HDMI passages of the CATALOG; if they differ, prefer
the order of `getTvInputList()` over reading the digit.

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

What we keep of the idea, in a reversible version:
- **The choice of home belongs to the system and to the person**: `setHome('poudlard')` merely re-enables
  our HOME door (the `.Home` alias) and clears the crash guard's counter. On the next press of the Home key, the
  TV has two candidate homes and shows its chooser ("Google TV" or "Poudlard TV", "Always" to
  remember). Nothing is disabled. Caution: the "Home app" screen of the Settings
  (`Settings.ACTION_HOME_SETTINGS`) is a phone screen; the Android TV / Google TV Settings generally do not have it.
  The launcher tries to open it and returns the appropriate instruction to the mock-up (`hint: 'settings'` if it
  opened, `hint: 'press-home'` otherwise), without ever counting its absence as a failure. It is in fact because
  this chooser does not exist on TV that Free My TV goes through `cmd package set-home-activity`; on our side, this
  command remains a fallback **from the computer** (`android/README.md`), never from the app.
- **Going back to the original without going through the settings**: `setHome('original')` disables the `.Home` alias with
  `PackageManager.setComponentEnabledSetting` (allowed without permission on its own components): the system is left
  with a single candidate home, the Google home, and the Home key goes back to it. The Poudlard launcher stays installed and
  visible in the app list (`.Start` alias, `LEANBACK_LAUNCHER`) to come back. Uninstalling the APK
  puts everything back. Since Android 10 the home is a role (`RoleManager` HOME): the system must reassign it
  when the component disappears. Expected, not yet verified on a device (the "Test status" box in `android/README.md`).
- Free My TV's `stockHome()` (list the system HOME activities, exclude itself and `FallbackHome`, do not guess
  when there are two candidates) is taken over as is in `HomeMode.originalHome()` to relaunch the original home
  right after the switch.

## 7. The crash guard (Watchdog)

A small file, taken over almost unchanged (hence Free My TV's MIT notice at the top of `Watchdog.java`):

- `install(Context)` sets an `UncaughtExceptionHandler` once, keeps the previous one and calls it afterwards;
- each crash writes a timestamp on a line of `files/home-crashes.txt` (reads capped at 4096 bytes,
  malformed lines ignored);
- `LIMIT = 3`, `WINDOW = 5 * 60_000L`: on the third crash within the window, `HomeMode.requestRevertHome`;
- `crashedTooOften()` stops the home from trying again while the original is restored; `HomeActivity.onCreate` tests it
  **before** building the interface and shows a plain `TextView` otherwise;
- `clear()` when Free My TV is put back.

On our side, the rollback is `HomeMode.giveBackHome()` (disabling the `.Home` alias + launching the original
home) instead of adb commands. And since our interface is a WebView, the guard also watches the **rendering**
(`onRenderProcessGone`): a dying WebView engine counts as a crash; the dead WebView is then detached
and destroyed before the fallback screen is shown (the Android contract when returning `true`). The fallback screen has two
buttons: « Ouvrir l'accueil d'origine » and « Réessayer Poudlard TV » (`Watchdog.clear` + `recreate()`, the HOME door
staying closed until « Faire de Poudlard l'accueil »).

## 8. HomeActivity: what we take over

- `launchMode="singleTask"`, `taskAffinity=""`, `stateNotNeeded`, `clearTaskOnLaunch`, `excludeFromRecents`,
  `screenOrientation="landscape"`, a wide `configChanges`: the home is not recreated on every return.
- The Home key arrives in `onNewIntent`, not in a key handler; Free My TV tells apart a double press
  (< 700 ms) to open the recents. On our side, a Home press puts the home screen back in its entry state (the `home` action of
  `input.js`).
- `onResume` on TCL Android 11+: `setTranslucent(false)`, otherwise the previous app stays visible on top. Taken over.
- At startup: Watchdog, then the "too many crashes" test, then the interface. Taken over in that order.
- `android:banner` is required to appear in the Leanback list; `uses-feature leanback required=false`.

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
| `firstRunDone` | `KeyPage` (single page for entering keys) | No keys for us: the Admission Letter is enough. |
| — | `disable_assistant`, `hide_services`, `tmdb_key`, `latitude`… | Network or app disabling: out of scope. |

## 11. What we will never do from the app (and that Free My TV does, rightly in its context)

- No internal adb: the app never runs `pm disable-user` or `cmd package set-home-activity`.
  (These commands remain tools for the person, typed from the computer, documented in `android/README.md`;
  the APK itself has no means to run them, and that is intended.)
- No `RECEIVE_BOOT_COMPLETED`, no accessibility service (`RemoteKeyService`), no `NotificationListener`
  (`NowPlaying`), no `SYSTEM_ALERT_WINDOW` (`SleepOverlay`), no `REQUEST_INSTALL_PACKAGES` (updates).
- No `INTERNET`: no weather, no TMDB, no crypto, no update check.
- No exported ContentProvider (`Secrets`, `PhotoInbox`).

The result is a launcher less capable than Free My TV, but whose verification fits in one line
(`aapt dump permissions PoudlardTV.apk`: no permission) and whose rollback depends on no tool.
