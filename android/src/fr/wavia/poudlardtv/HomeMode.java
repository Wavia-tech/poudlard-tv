package fr.wavia.poudlardtv;

import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.List;

/**
 * Quel accueil la télé utilise : Poudlard ou l'original. Version RÉVERSIBLE et SANS adb de HomeMode de Free My TV
 * (seule la méthode originalHome(), ci-dessous, est reprise de son stockHome() ; licence MIT dans android/README.md).
 *
 * Free My TV passe par un client adb interne pour `cmd package set-home-activity` et désactive l'accueil Google
 * (`pm disable-user`). On ne fait ni l'un ni l'autre : une socket exige la permission INTERNET et désactiver l'accueil
 * Google est interdit par le cahier des charges. À la place :
 *
 *  - setHome("poudlard") = takeHome() : réactive notre porte HOME (l'alias `.Home`) et efface le compteur du garde-fou.
 *    C'est tout ce qu'une appli sans permission peut faire ; le choix final appartient au SYSTÈME et à la personne :
 *    au prochain appui sur la touche Home, la télé a deux accueils candidats et affiche sa boîte de choix
 *    (« Google TV » ou « Poudlard TV », avec « Toujours » pour mémoriser). Sur un téléphone, il existe un écran
 *    « Application d'accueil » (Settings.ACTION_HOME_SETTINGS) ; les Paramètres d'Android TV / Google TV n'en ont
 *    PAS, en général. On tente donc cet écran, mais son absence n'est pas un échec : le JSON renvoyé dit à la maquette
 *    quelle consigne afficher (`hint` : "settings" si l'écran s'est ouvert, "press-home" sinon).
 *  - setHome("original") = giveBackHome() : désactive notre alias `.Home` (autorisé sans permission sur ses propres
 *    composants). Le système n'a plus qu'un candidat pour la touche Home : l'accueil d'origine. Puis on le lance.
 *    L'alias `.Start` (liste des applis) reste actif : Poudlard TV est toujours là pour revenir en arrière.
 *
 * Aucune autre appli n'est touchée, jamais. Désinstaller l'APK remet tout en place.
 * État : écrit d'après la documentation Android, NON TESTÉ sur appareil (voir android/README.md, « État des tests »).
 */
final class HomeMode {
    static final String POUDLARD = "poudlard";
    static final String ORIGINAL = "original";
    /** Consigne renvoyée par takeHome : l'écran de choix du système s'est ouvert. */
    static final String HINT_SETTINGS = "settings";
    /** Consigne renvoyée par takeHome : appuyer sur Home, la télé proposera les deux accueils. */
    static final String HINT_PRESS_HOME = "press-home";

    private HomeMode() {}

    private static ComponentName homeAlias(Context c) {
        return new ComponentName(c.getPackageName(), c.getPackageName() + ".Home");
    }

    /** Notre porte HOME est-elle active ? (État du composant, pas le choix de la personne dans les réglages.) */
    static boolean homeAliasEnabled(Context c) {
        int state = c.getPackageManager().getComponentEnabledSetting(homeAlias(c));
        // ENABLED par défaut dans le manifeste : DEFAULT vaut donc « activé ».
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
    }

    private static void setHomeAlias(Context c, boolean enabled) {
        c.getPackageManager().setComponentEnabledSetting(homeAlias(c),
                enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
    }

    /** Le package qui répond à la touche Home en ce moment (résolution système de MAIN + HOME). */
    static String currentHomePackage(Context c) {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = c.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            return ri == null || ri.activityInfo == null ? null : ri.activityInfo.packageName;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Ce que le JavaScript affiche dans les réglages : "poudlard" si on est l'accueil courant, "original" sinon. */
    static String mode(Context c) {
        return homeAliasEnabled(c) && c.getPackageName().equals(currentHomePackage(c)) ? POUDLARD : ORIGINAL;
    }

    /**
     * Rend l'accueil d'origine. Appelé par le garde-fou (3 plantages) et par setHome("original").
     * Ne lève jamais : en dernier recours, le système choisira lui-même au prochain appui sur Home.
     */
    static void giveBackHome(Context c) {
        try {
            setHomeAlias(c, false);
            Log.i("porte HOME désactivée : l'accueil d'origine reprend la touche Home");
        } catch (RuntimeException e) {
            Log.w("impossible de désactiver la porte HOME", e);
        }
        Intent original = originalHome(c);
        if (original == null) {
            Log.w("accueil d'origine introuvable ou ambigu : le système choisira au prochain appui sur Home");
            return;
        }
        try {
            c.startActivity(original.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w("impossible de lancer l'accueil d'origine", e);
        }
    }

    /**
     * Remet notre porte HOME et efface les plantages. Renvoie la consigne pour la personne (HINT_SETTINGS si l'écran
     * de choix du système a pu s'ouvrir, HINT_PRESS_HOME sinon), ou null si la porte HOME n'a pas pu être réactivée
     * (le seul vrai échec).
     */
    static String takeHome(Context c) {
        try {
            setHomeAlias(c, true);
        } catch (RuntimeException e) {
            Log.w("impossible de réactiver la porte HOME", e);
            return null;
        }
        Watchdog.clear(c);
        Log.i("porte HOME réactivée : la télé proposera Poudlard TV au prochain appui sur Home");
        return openHomeSettings(c) ? HINT_SETTINGS : HINT_PRESS_HOME;
    }

    /**
     * L'écran « Application d'accueil » du système, s'il existe (téléphones, quelques box). Sur Android TV / Google TV
     * il n'y a en général aucun destinataire : on renvoie false sans rien ouvrir d'autre (les réglages généraux ne
     * mèneraient nulle part).
     */
    static boolean openHomeSettings(Context c) {
        try {
            c.startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.i("pas d'écran « Application d'accueil » sur cette télé : consigne « appuyer sur Home »");
            return false;
        }
    }

    /**
     * L'accueil d'origine, à la manière de stockHome() dans Free My TV : les activités HOME des applis SYSTÈME,
     * sans nous, sans FallbackHome (l'écran « Android démarre »), et on ne devine pas s'il reste plusieurs candidats
     * (on prend alors celui que le système préfère, s'il n'est pas nous).
     */
    static Intent originalHome(Context c) {
        PackageManager pm = c.getPackageManager();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        List<ResolveInfo> all;
        try {
            all = pm.queryIntentActivities(home, 0);
        } catch (RuntimeException e) {
            return null;
        }
        List<ComponentName> candidates = new ArrayList<>();
        for (ResolveInfo ri : all) {
            if (ri.activityInfo == null) continue;
            String pkg = ri.activityInfo.packageName;
            String cls = ri.activityInfo.name;
            if (c.getPackageName().equals(pkg)) continue;
            if (cls != null && cls.endsWith("FallbackHome")) continue;
            boolean system = (ri.activityInfo.applicationInfo.flags & android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0;
            if (!system) continue;
            candidates.add(new ComponentName(pkg, cls));
        }
        ComponentName target = null;
        if (candidates.size() == 1) {
            target = candidates.get(0);
        } else if (candidates.size() > 1) {
            String preferred = currentHomePackage(c);
            for (ComponentName cn : candidates) if (cn.getPackageName().equals(preferred)) target = cn;
            if (target == null) Log.w(candidates.size() + " accueils système : on ne devine pas");
        }
        if (target == null) return null;
        return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setComponent(target);
    }
}
