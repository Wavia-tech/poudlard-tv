package fr.wavia.poudlardtv;

import android.app.Activity;
import android.content.Context;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * The `window.Android` JavaScript bridge, as platform.js expects it. It is the ONLY door between the web mock-up and
 * the TV. Every method is explicit, takes strings, returns JSON (never an exception: a failure is a
 * `{ok:false, error:"…"}` that the Howler (Beuglante) displays).
 *
 * The @JavascriptInterface methods run on a WebView thread, not on the main thread:
 * startActivity and PackageManager cope with that; nothing here touches a view. The one exception is the HOME
 * role request (setHome("poudlard")), which needs the activity: it is posted on the UI thread and this thread
 * waits for its hint (500 ms at most).
 *
 * Contract (platform.js):
 *   launch(pkg)            → launches the app
 *   switchInput(input)     → "HDMI 1" or an input id
 *   openUrl(url, pkg)      → allow-listed https link, in the app `pkg` (otherwise on its home screen)
 *   installedPackages()    → JSON array of packages (kept for compatibility)
 *   installedApps()        → JSON array of {pkg, label, system}
 *   appIcon(pkg)           → PNG data URI or null
 *   setHome(mode)          → "poudlard" | "original"; for "poudlard", the response carries `hint`:
 *                            "held" (Poudlard already answers the Home key), "role" (the system's confirmation
 *                            dialog is on screen), "settings" (the system's chooser screen has opened),
 *                            "press-home" (press Home, the TV will offer both home screens, choose "Always"),
 *                            "fire" (Fire TV: the Home key stays with Amazon)
 *   homeMode()             → "poudlard" | "original" (current state, for the settings)
 *   openSystem(key, arg)   → one of the TV's own settings screens (Apps.SYSTEM), or "appinfo" + package
 *   inputs()               → JSON array of {id, port, label, connected} (HDMI ports)
 *   hasLiveTv()            → "true" | "false"; liveTv() → opens live television
 *   store()                → the TV's app store
 *   version()              → APK version (for the settings screen)
 *
 * The error messages returned to JavaScript are shown on the TV by the Howler, so they stay in French.
 */
final class Bridge {
    private final Context app;
    private final Apps apps;
    private final WeakReference<HomeActivity> activity;

    Bridge(HomeActivity activity, Apps apps) {
        this.app = activity.getApplicationContext();
        this.apps = apps;
        this.activity = new WeakReference<>(activity);
    }

    private static String ok() {
        return "{\"ok\":true}";
    }

    private static String okHint(String hint) {
        try {
            return new JSONObject().put("ok", true).put("hint", hint).toString();
        } catch (JSONException e) {
            return ok();
        }
    }

    private static String fail(String error) {
        try {
            return new JSONObject().put("ok", false).put("error", error == null ? "Erreur inconnue." : error).toString();
        } catch (JSONException e) {
            return "{\"ok\":false,\"error\":\"Erreur inconnue.\"}";
        }
    }

    /** Turns "null = success, otherwise a message" (the Apps convention) into JSON. */
    private static String result(String error) {
        return error == null ? ok() : fail(error);
    }

    @JavascriptInterface
    public String launch(String pkg) {
        try {
            return result(apps.launch(pkg));
        } catch (Throwable t) {
            Log.w("launch", t);
            return fail("Lancement impossible.");
        }
    }

    @JavascriptInterface
    public String switchInput(String input) {
        try {
            return result(apps.switchInput(input));
        } catch (Throwable t) {
            Log.w("switchInput", t);
            return fail("Changement d'entrée impossible.");
        }
    }

    @JavascriptInterface
    public String openUrl(String url, String pkg) {
        try {
            return result(apps.openUrl(url, pkg));
        } catch (Throwable t) {
            Log.w("openUrl", t);
            return fail("Ouverture du lien impossible.");
        }
    }

    @JavascriptInterface
    public String installedPackages() {
        try {
            List<String> list = apps.installedPackages();
            JSONArray arr = new JSONArray();
            for (String p : list) arr.put(p);
            return arr.toString();
        } catch (Throwable t) {
            Log.w("installedPackages", t);
            return "[]";
        }
    }

    @JavascriptInterface
    public String installedApps() {
        try {
            return apps.installedApps().toString();
        } catch (Throwable t) {
            Log.w("installedApps", t);
            return "[]";
        }
    }

    @JavascriptInterface
    public String appIcon(String pkg) {
        try {
            return apps.appIcon(pkg);
        } catch (Throwable t) {
            Log.w("appIcon", t);
            return null;
        }
    }

    @JavascriptInterface
    public String setHome(String mode) {
        try {
            if (HomeMode.ORIGINAL.equals(mode)) {
                HomeMode.giveBackHome(app);
                return ok();
            }
            if (HomeMode.POUDLARD.equals(mode)) {
                final HomeActivity a = activity.get();
                if (a == null) {
                    String hint = HomeMode.takeHome(app);
                    return hint == null ? fail("La porte d'accueil de Poudlard TV n'a pas pu être réactivée.") : okHint(hint);
                }
                // The role request opens a system dialog: it must start from the activity, on the UI thread.
                final String[] hint = new String[1];
                final CountDownLatch done = new CountDownLatch(1);
                a.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            hint[0] = HomeMode.requestHome(a);
                        } catch (RuntimeException e) {
                            Log.w("requestHome", e);
                            hint[0] = null;
                        }
                        done.countDown();
                    }
                });
                boolean answered = done.await(500, TimeUnit.MILLISECONDS);
                if (!answered) return okHint(HomeMode.HINT_PRESS_HOME);
                return hint[0] == null ? fail("La porte d'accueil de Poudlard TV n'a pas pu être réactivée.") : okHint(hint[0]);
            }
            return fail("Mode inconnu.");
        } catch (Throwable t) {
            Log.w("setHome", t);
            return fail("Changement d'accueil impossible.");
        }
    }

    @JavascriptInterface
    public String homeMode() {
        try {
            return HomeMode.mode(app);
        } catch (Throwable t) {
            return HomeMode.ORIGINAL;
        }
    }

    @JavascriptInterface
    public String openSystem(String key, String arg) {
        try {
            return result(apps.openSystem(key, arg));
        } catch (Throwable t) {
            Log.w("openSystem", t);
            return fail("Cette télé n'a pas cet écran.");
        }
    }

    @JavascriptInterface
    public String inputs() {
        try {
            return apps.inputs().toString();
        } catch (Throwable t) {
            Log.w("inputs", t);
            return "[]";
        }
    }

    @JavascriptInterface
    public String hasLiveTv() {
        try {
            return apps.hasLiveTv() ? "true" : "false";
        } catch (Throwable t) {
            return "false";
        }
    }

    @JavascriptInterface
    public String liveTv() {
        try {
            return result(apps.liveTv());
        } catch (Throwable t) {
            Log.w("liveTv", t);
            return fail("Cette télé n'ouvre pas ses chaînes depuis un launcher.");
        }
    }

    @JavascriptInterface
    public String store() {
        try {
            return result(apps.store());
        } catch (Throwable t) {
            Log.w("store", t);
            return fail("Pas de boutique sur cette télé.");
        }
    }

    /**
     * A fatal error on the page side (main.js: the same error three times within a minute) counts as a crash for the
     * guard, so a broken page that keeps throwing without dying still hands the Home key back after three.
     */
    @JavascriptInterface
    public String fatal(String reason) {
        try {
            Log.w("page fatal: " + (reason == null ? "?" : reason.substring(0, Math.min(200, reason.length()))));
            if (Watchdog.record(app) >= Watchdog.LIMIT) HomeMode.giveBackHome(app, true);
            return ok();
        } catch (Throwable t) {
            return fail("Erreur non comptée.");
        }
    }

    /** What the TV is: the page tunes its defaults (low RAM → economy) and its wording (Fire TV, phone). */
    @JavascriptInterface
    public String device() {
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
            boolean lowRam = false;
            if (am != null) {
                android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                lowRam = am.isLowRamDevice() || mi.totalMem < 2L * 1024 * 1024 * 1024;
            }
            android.content.pm.PackageManager pm = app.getPackageManager();
            boolean leanback = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_LEANBACK);
            android.app.UiModeManager ui = (android.app.UiModeManager) app.getSystemService(Context.UI_MODE_SERVICE);
            boolean tv = ui != null && ui.getCurrentModeType() == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION;
            boolean phone = pm.hasSystemFeature(android.content.pm.PackageManager.FEATURE_TELEPHONY) && !leanback;
            return new JSONObject()
                    .put("manufacturer", String.valueOf(android.os.Build.MANUFACTURER))
                    .put("model", String.valueOf(android.os.Build.MODEL))
                    .put("sdk", android.os.Build.VERSION.SDK_INT)
                    .put("fireTv", HomeMode.fireTv() || "Amazon".equalsIgnoreCase(android.os.Build.BRAND))
                    .put("lowRam", lowRam).put("leanback", leanback).put("tv", tv).put("phone", phone)
                    .toString();
        } catch (Throwable t) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String version() {
        try {
            return app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
        } catch (Throwable t) {
            return "?";
        }
    }
}
