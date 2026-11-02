package fr.wavia.poudlardtv;

import android.content.Context;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.List;

/**
 * Le pont JavaScript `window.Android`, tel que platform.js l'attend. C'est la SEULE porte entre la maquette web et
 * la télé. Chaque méthode est explicite, prend des chaînes, renvoie du JSON (jamais une exception : un échec est un
 * `{ok:false, error:"…"}` que la Beuglante affiche).
 *
 * Les méthodes @JavascriptInterface tournent sur un thread de la WebView, pas sur le thread principal :
 * startActivity et PackageManager s'en accommodent ; rien ici ne touche à une vue.
 *
 * Contrat (platform.js) :
 *   launch(pkg)            → lance l'appli
 *   switchInput(input)     → "HDMI 1" ou identifiant d'entrée
 *   openUrl(url, pkg)      → lien https en liste blanche, dans l'appli `pkg` (sinon sur son accueil)
 *   installedPackages()    → tableau JSON de packages
 *   appIcon(pkg)           → data URI PNG ou null
 *   setHome(mode)          → "poudlard" | "original" ; pour "poudlard", la réponse porte `hint` :
 *                            "press-home" (appuyer sur Home, la télé proposera les deux accueils, choisir « Toujours »)
 *                            ou "settings" (l'écran de choix du système s'est ouvert)
 *   homeMode()             → "poudlard" | "original" (état courant, pour les réglages)
 *   version()              → version de l'APK (pour l'écran des réglages)
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

    /** Transforme « null = succès, sinon message » (convention de Apps) en JSON. */
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
