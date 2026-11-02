package fr.wavia.poudlardtv;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.drawable.Drawable;
import android.media.tv.TvContract;
import android.media.tv.TvInputInfo;
import android.media.tv.TvInputManager;
import android.net.Uri;
import android.util.Base64;
import android.util.DisplayMetrics;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Tout ce qui touche aux autres applis de la télé : liste des applis installées, lancement, liens de contenu,
 * bannières, entrées HDMI.
 *
 * Repris de HomeApps.java de Free My TV — Copyright (c) 2026 Free My TV contributors, licence MIT (texte complet
 * dans android/README.md, section « Licence de Free My TV »). Réduit à ce qui ne demande aucune permission.
 *
 * Règles :
 *  - lancement d'une appli par intent EXPLICITE (package nommé) uniquement ; un lien de film est ouvert dans l'appli
 *    nommée (ACTION_VIEW + setPackage), à défaut sur l'accueil de cette appli, jamais « dans n'importe quelle appli » ;
 *  - les entrées HDMI passent par l'intent standard du système (ACTION_VIEW content://android.media.tv/…), seul cas
 *    d'intent sans package : c'est l'appli TV du système qui y répond ;
 *  - un package absent ou un lancement qui échoue renvoie un message, jamais une exception ;
 *  - aucune URL hors liste blanche ; aucune requête réseau (le manifeste n'a de toute façon pas INTERNET).
 */
final class Apps {
    /** Même forme qu'un package Android (PKG_RE de config.js) : on ne lance jamais un nom bizarre. */
    private static final Pattern PKG = Pattern.compile("^[a-zA-Z][\\w]*(\\.[a-zA-Z][\\w]*)+$");
    /** Hôtes autorisés pour openUrl : copie exacte de URL_HOSTS dans platform.js. Tenir les deux listes identiques. */
    static final Set<String> URL_HOSTS = new HashSet<>(Arrays.asList(
            "www.max.com", "play.max.com", "www.netflix.com", "www.primevideo.com", "www.disneyplus.com", "www.youtube.com"));
    /** Taille de la bannière Leanback (320x180 dp) à la densité xxxhdpi, comme Free My TV : 384x216 suffit à 3 m. */
    private static final int BANNER_W = 384, BANNER_H = 216;

    private final Context app;
    private final Map<String, String> iconCache = new HashMap<>();

    Apps(Context context) {
        this.app = context.getApplicationContext();
    }

    static boolean validPackage(String pkg) {
        return pkg != null && pkg.length() <= 200 && PKG.matcher(pkg).matches();
    }

    // ---------------------------------------------------------------- applis installées

    /**
     * Packages qui ont une entrée dans le launcher TV, puis ceux qui n'ont qu'une entrée « téléphone » (side-load).
     * Dédoublonné, Leanback d'abord (launchable() de Free My TV). Les applis système « téléphone » sont écartées :
     * ce sont des menus d'usine, pas des applis à lancer.
     */
    List<String> installedPackages() {
        PackageManager pm = app.getPackageManager();
        LinkedHashSet<String> out = new LinkedHashSet<>();
        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
            if (ri.activityInfo != null) out.add(ri.activityInfo.packageName);
        }
        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LAUNCHER)) {
            if (ri.activityInfo == null) continue;
            boolean system = (ri.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            if (system) continue;
            out.add(ri.activityInfo.packageName);
        }
        out.remove(app.getPackageName());
        return new ArrayList<>(out);
    }

    private static List<ResolveInfo> query(PackageManager pm, String category) {
        try {
            List<ResolveInfo> list = pm.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(category), 0);
            return list == null ? new ArrayList<ResolveInfo>() : list;
        } catch (RuntimeException e) {
            Log.w("queryIntentActivities " + category + " : " + e.getMessage());
            return new ArrayList<>();
        }
    }

    boolean isInstalled(String pkg) {
        return validPackage(pkg) && launchIntent(pkg) != null;
    }

    // ---------------------------------------------------------------- lancement

    /** L'intent Leanback d'abord, l'intent « téléphone » en repli (launchIntent() de Free My TV). */
    private Intent launchIntent(String pkg) {
        PackageManager pm = app.getPackageManager();
        try {
            Intent intent = pm.getLeanbackLaunchIntentForPackage(pkg);
            return intent != null ? intent : pm.getLaunchIntentForPackage(pkg);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Lance une appli par son package. Renvoie null si tout va bien, sinon un message d'erreur lisible (pour la Beuglante).
     * FLAG_ACTIVITY_RESET_TASK_IF_NEEDED : l'appli reprend là où elle en était, comme un vrai accueil.
     */
    String launch(String pkg) {
        if (!validPackage(pkg)) return "Nom de package invalide.";
        Intent intent = launchIntent(pkg);
        if (intent == null) return "Cette appli n'est pas installée sur la télé.";
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return start(intent, pkg);
    }

    /**
     * Ouvre un lien de contenu (https, hôte en liste blanche) dans l'appli qui le possède (ACTION_VIEW + setPackage),
     * sinon sur l'accueil de cette même appli (repli de open() de Free My TV, sans le cas Netflix). Jamais dans une
     * autre appli : sans package nommé, on refuse, pour tenir la promesse « intents explicites » du README.
     */
    String openUrl(String url, String pkg) {
        Uri uri = allowedUrl(url);
        if (uri == null) return "Lien refusé : hôte hors liste blanche.";
        if (!validPackage(pkg)) return "Ce lien n'a pas d'appli associée.";
        if (!isInstalled(pkg)) return "L'appli qui possède ce lien n'est pas installée sur la télé.";
        PackageManager pm = app.getPackageManager();
        Intent inApp = new Intent(Intent.ACTION_VIEW, uri).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (inApp.resolveActivity(pm) != null && start(inApp, pkg) == null) return null;
        // L'appli ne prend pas le lien : on l'ouvre quand même, sur son accueil.
        return launch(pkg);
    }

    static Uri allowedUrl(String url) {
        if (url == null || url.length() > 2048) return null;
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (RuntimeException e) {
            return null;
        }
        if (!"https".equals(uri.getScheme())) return null;
        String host = uri.getHost();
        return host != null && URL_HOSTS.contains(host.toLowerCase(Locale.ROOT)) ? uri : null;
    }

    private String start(Intent intent, String what) {
        try {
            app.startActivity(intent);
            return null;
        } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
            Log.w("impossible d'ouvrir " + what + " : " + e.getMessage());
            return "La télé n'a pas pu ouvrir " + what + ".";
        }
    }

    // ---------------------------------------------------------------- entrées HDMI

    /**
     * Passe sur une entrée HDMI. `input` : "HDMI 1" (numéro de port, comme dans CATALOG) ou l'identifiant complet
     * d'une entrée TvInputManager. Intent standard de passage (inputIntent() de Free My TV), sans lecteurs maison.
     *
     * On ne filtre pas par resolveActivity() : sous Android 11+, la visibilité accordée par le bloc <queries> peut ne
     * pas couvrir l'appli TV du système (elle filtre sur le type MIME résolu par le TvProvider), et resolveActivity()
     * répondrait null alors que startActivity() marche. On lance donc dans un try, comme Free My TV, et
     * ActivityNotFoundException devient un message lisible. À TESTER sur la télé cible (les 4 passages du CATALOG).
     */
    String switchInput(String input) {
        if (input == null || input.length() > 200) return "Entrée invalide.";
        TvInputManager tim = (TvInputManager) app.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) return "Cette télé n'expose pas ses entrées.";
        List<TvInputInfo> inputs;
        try {
            inputs = tim.getTvInputList();
        } catch (RuntimeException e) {
            return "Impossible de lister les entrées.";
        }
        String wanted = input.trim();
        Integer port = portNumber(wanted);
        TvInputInfo match = null;
        List<TvInputInfo> hdmi = new ArrayList<>();
        for (TvInputInfo info : inputs) {
            if (wanted.equals(info.getId())) { match = info; break; }
            if (info.getType() == TvInputInfo.TYPE_HDMI && info.getParentId() == null) hdmi.add(info);
        }
        if (match == null && port != null) {
            for (TvInputInfo info : hdmi) {
                Integer p = hdmiPort(info);
                if (p != null && p.intValue() == port.intValue()) { match = info; break; }
            }
            // Pas de numéro lisible dans l'identifiant : on prend le n-ième port HDMI dans l'ordre de la télé.
            if (match == null && port >= 1 && port <= hdmi.size()) match = hdmi.get(port - 1);
        }
        if (match == null) return "Entrée « " + wanted + " » introuvable.";
        Intent intent = new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(match.getId()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String err = start(intent, wanted);
        return err == null ? null : "Cette télé n'ouvre pas ses entrées HDMI depuis un launcher.";
    }

    /** "HDMI 2" → 2 ; "hdmi2" → 2 ; sinon null. */
    private static Integer portNumber(String s) {
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isEmpty() || digits.length() > 2) return null;
        if (!s.toLowerCase(Locale.ROOT).startsWith("hdmi")) return null;
        return Integer.parseInt(digits);
    }

    /**
     * Numéro de port HDMI d'une entrée, lu dans son identifiant (ex. "com.mediatek.tvinput/.hdmi.HDMIInputService/HW2",
     * "…/HDMI1"). TvInputInfo.getHdmiDeviceInfo() donnerait le port exact mais est une API système, non compilable
     * avec android.jar ; Free My TV lit aussi le numéro dans l'identifiant.
     *
     * Limite connue : sur certaines plateformes (Amlogic), les identifiants …/HW5, /HW6, /HW7 désignent HDMI 1/2/3.
     * Le chiffre lu ne correspond alors à aucun port demandé (1 à 4) et switchInput retombe sur l'ordre de
     * getTvInputList(), qui est le bon dans ce cas. Si une télé mélange les deux conventions, préférer l'ordre de
     * la liste (supprimer cette lecture) : à vérifier sur l'appareil.
     */
    private static Integer hdmiPort(TvInputInfo info) {
        String id = info.getId();
        String upper = id.toUpperCase(Locale.ROOT);
        int i = upper.lastIndexOf("/HW");
        if (i < 0) i = upper.lastIndexOf("HDMI");
        if (i < 0) return null;
        String digits = id.substring(i).replaceAll("[^0-9]", "");
        if (digits.isEmpty() || digits.length() > 2) return null;
        return Integer.parseInt(digits);
    }

    // ---------------------------------------------------------------- bannières

    /**
     * Bannière Leanback de l'appli (ou son icône à défaut) en data URI PNG, 384x216 au plus (bannerTile()/iconTile()
     * de Free My TV). Renvoie null si l'appli n'est pas installée ou n'a aucun visuel. Cache mémoire par package.
     */
    String appIcon(String pkg) {
        if (!validPackage(pkg)) return null;
        synchronized (iconCache) {
            if (iconCache.containsKey(pkg)) return iconCache.get(pkg);
        }
        String uri = null;
        try {
            Bitmap bmp = bannerBitmap(pkg);
            if (bmp != null) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.PNG, 100, bytes);
                uri = "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP);
            }
        } catch (RuntimeException | OutOfMemoryError e) {
            Log.w("bannière de " + pkg + " : " + e.getMessage());
        }
        synchronized (iconCache) {
            iconCache.put(pkg, uri);
        }
        return uri;
    }

    private Bitmap bannerBitmap(String pkg) {
        PackageManager pm = app.getPackageManager();
        ApplicationInfo ai;
        try {
            ai = pm.getApplicationInfo(pkg, 0);
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
        Drawable d = null;
        // 1. la ressource de bannière à la plus haute densité (plus nette que pm.getApplicationBanner)
        int res = ai.banner;
        if (res != 0) {
            try {
                d = pm.getResourcesForApplication(ai).getDrawableForDensity(res, DisplayMetrics.DENSITY_XXXHIGH, null);
            } catch (PackageManager.NameNotFoundException | RuntimeException ignored) {
                d = null;
            }
        }
        // 2. la bannière telle que le système la voit
        if (d == null) {
            try { d = pm.getApplicationBanner(ai); } catch (RuntimeException ignored) { d = null; }
        }
        boolean isBanner = d != null;
        // 3. l'icône (carrée), centrée sur fond nuit
        if (d == null) {
            try { d = pm.getApplicationIcon(ai); } catch (RuntimeException ignored) { d = null; }
        }
        if (d == null) return null;
        Bitmap bmp = Bitmap.createBitmap(BANNER_W, BANNER_H, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.rgb(0x07, 0x0B, 0x14));
        if (isBanner) {
            d.setBounds(0, 0, BANNER_W, BANNER_H);
        } else {
            int size = BANNER_H * 2 / 3;
            int left = (BANNER_W - size) / 2, top = (BANNER_H - size) / 2;
            d.setBounds(left, top, left + size, top + size);
        }
        d.draw(canvas);
        return bmp;
    }
}
