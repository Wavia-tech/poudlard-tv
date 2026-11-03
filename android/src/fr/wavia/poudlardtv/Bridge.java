package fr.wavia.poudlardtv;

import android.content.Context;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * The `window.Android` JavaScript bridge, as platform.js expects it. It is the ONLY door between the web mock-up and
 * the TV. Every method is explicit, takes strings, returns JSON (never an exception: a failure is a
 * `{ok:false, error:"…"}` that the Howler (Beuglante) displays).
 *
 * The @JavascriptInterface methods run on a WebView thread, not on the main thread:
 * startActivity and PackageManager cope with that; nothing here touches a view.
 *
 * Contract (platform.js):
 *   launch(pkg)            → launches the app
 *   switchInput(input)     → "HDMI 1" or an input id
 *   openUrl(url, pkg)      → allow-listed https link, in the app `pkg` (otherwise on its home screen)
 *   installedPackages()    → JSON array of packages
 *   appIcon(pkg)           → PNG data URI or null
 *   setHome(mode)          → "poudlard" | "original"; for "poudlard", the response carries `hint`:
 *                            "press-home" (press Home, the TV will offer both home screens, choose "Always")
 *                            or "settings" (the system's chooser screen has opened)
 *   homeMode()             → "poudlard" | "original" (current state, for the settings)
 *   version()              → APK version (for the settings screen)
 *
 * The error messages returned to JavaScript are shown on the TV by the Howler, so they stay in French.
 */
final class Bridge {
    private final Context app;
    private final Apps apps;

    Bridge(Context context, Apps apps) {
        this.app = context.getApplicationContext();
        this.apps = apps;
    }

    private static String ok() {
        return "{\"ok\":true}";
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
                String hint = HomeMode.takeHome(app);
                if (hint == null) return fail("La porte d'accueil de Poudlard TV n'a pas pu être réactivée.");
                try {
                    return new JSONObject().put("ok", true).put("hint", hint).toString();
                } catch (JSONException e) {
                    return ok();
                }
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
    public String version() {
        try {
            return app.getPackageManager().getPackageInfo(app.getPackageName(), 0).versionName;
        } catch (Throwable t) {
            return "?";
        }
    }
}
