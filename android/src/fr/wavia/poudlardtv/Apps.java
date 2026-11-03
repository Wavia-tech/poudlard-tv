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
 * Everything that touches the TV's other apps: list of installed apps, launching, content links,
 * banners, HDMI inputs.
 *
 * Taken from Free My TV's HomeApps.java — Copyright (c) 2026 Free My TV contributors, MIT license (full text
 * in android/README.md, section "Free My TV license"). Reduced to what requires no permission.
 *
 * Rules:
 *  - an app is launched by EXPLICIT intent (named package) only; a film link is opened in the named app
 *    (ACTION_VIEW + setPackage), or failing that on that app's home screen, never "in whatever app";
 *  - HDMI inputs go through the system's standard intent (ACTION_VIEW content://android.media.tv/…), the only
 *    case of an intent without a package: the system's TV app answers it;
 *  - a missing package or a failed launch returns a message, never an exception;
 *  - no URL outside the allow list; no network request (the manifest has no INTERNET anyway).
 *
 * The messages returned as strings are shown on the TV by the Howler (Beuglante), so they stay in French.
 */
final class Apps {
    /** Same shape as an Android package (PKG_RE in config.js): we never launch an odd-looking name. */
    private static final Pattern PKG = Pattern.compile("^[a-zA-Z][\\w]*(\\.[a-zA-Z][\\w]*)+$");
    /** Hosts allowed for openUrl: exact copy of URL_HOSTS in platform.js. Keep both lists identical. */
    static final Set<String> URL_HOSTS = new HashSet<>(Arrays.asList(
            "www.max.com", "play.max.com", "www.netflix.com", "www.primevideo.com", "www.disneyplus.com", "www.youtube.com"));
    /** Leanback banner size (320x180 dp) at xxxhdpi density, as in Free My TV: 384x216 is enough at 3 m. */
    private static final int BANNER_W = 384, BANNER_H = 216;

    private final Context app;
    private final Map<String, String> iconCache = new HashMap<>();

    Apps(Context context) {
        this.app = context.getApplicationContext();
    }

    static boolean validPackage(String pkg) {
        return pkg != null && pkg.length() <= 200 && PKG.matcher(pkg).matches();
    }

    // ---------------------------------------------------------------- installed apps

    /**
     * Packages that have an entry in the TV launcher, then those that only have a "phone" entry (side-loaded).
     * Deduplicated, Leanback first (Free My TV's launchable()). System "phone" apps are left out:
     * they are factory menus, not apps to launch.
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
            Log.w("queryIntentActivities " + category + ": " + e.getMessage());
            return new ArrayList<>();
        }
    }

    boolean isInstalled(String pkg) {
        return validPackage(pkg) && launchIntent(pkg) != null;
    }

    // ---------------------------------------------------------------- launching

    /** The Leanback intent first, the "phone" intent as a fallback (Free My TV's launchIntent()). */
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
     * Launches an app by its package. Returns null if all is well, otherwise a readable error message (for the Howler).
     * FLAG_ACTIVITY_RESET_TASK_IF_NEEDED: the app resumes where it was, like a real home screen.
     */
    String launch(String pkg) {
        if (!validPackage(pkg)) return "Nom de package invalide.";
        Intent intent = launchIntent(pkg);
        if (intent == null) return "Cette appli n'est pas installée sur la télé.";
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        return start(intent, pkg);
    }

    /**
     * Opens a content link (https, allow-listed host) in the app that owns it (ACTION_VIEW + setPackage),
     * otherwise on that same app's home screen (fallback of Free My TV's open(), without the Netflix case). Never in
     * another app: without a named package, we refuse, to keep the README's "explicit intents" promise.
     */
    String openUrl(String url, String pkg) {
        Uri uri = allowedUrl(url);
        if (uri == null) return "Lien refusé : hôte hors liste blanche.";
        if (!validPackage(pkg)) return "Ce lien n'a pas d'appli associée.";
        if (!isInstalled(pkg)) return "L'appli qui possède ce lien n'est pas installée sur la télé.";
        PackageManager pm = app.getPackageManager();
        Intent inApp = new Intent(Intent.ACTION_VIEW, uri).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (inApp.resolveActivity(pm) != null && start(inApp, pkg) == null) return null;
        // The app does not take the link: we open it anyway, on its home screen.
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
            Log.w("could not open " + what + ": " + e.getMessage());
            return "La télé n'a pas pu ouvrir " + what + ".";
        }
    }

    // ---------------------------------------------------------------- HDMI inputs

    /**
     * Switches to an HDMI input. `input`: "HDMI 1" (port number, as in CATALOG) or the full id
     * of a TvInputManager input. Standard passthrough intent (Free My TV's inputIntent()), without home-made players.
     *
     * We do not filter by resolveActivity(): on Android 11+, the visibility granted by the <queries> block may
     * not cover the system's TV app (it filters on the MIME type resolved by the TvProvider), and resolveActivity()
     * would answer null while startActivity() works. So we launch inside a try, as Free My TV does, and
     * ActivityNotFoundException becomes a readable message. TO BE TESTED on the target TV (the 4 CATALOG switches).
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
            // No readable number in the id: take the n-th HDMI port in the TV's order.
            if (match == null && port >= 1 && port <= hdmi.size()) match = hdmi.get(port - 1);
        }
        if (match == null) return "Entrée « " + wanted + " » introuvable.";
        Intent intent = new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(match.getId()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String err = start(intent, wanted);
        return err == null ? null : "Cette télé n'ouvre pas ses entrées HDMI depuis un launcher.";
    }

    /** "HDMI 2" → 2; "hdmi2" → 2; otherwise null. */
    private static Integer portNumber(String s) {
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isEmpty() || digits.length() > 2) return null;
        if (!s.toLowerCase(Locale.ROOT).startsWith("hdmi")) return null;
        return Integer.parseInt(digits);
    }

    /**
     * HDMI port number of an input, read from its id (e.g. "com.mediatek.tvinput/.hdmi.HDMIInputService/HW2",
     * "…/HDMI1"). TvInputInfo.getHdmiDeviceInfo() would give the exact port but is a system API, not compilable
     * against android.jar; Free My TV also reads the number from the id.
     *
     * Known limit: on some platforms (Amlogic), the ids …/HW5, /HW6, /HW7 stand for HDMI 1/2/3.
     * The number read then matches none of the requested ports (1 to 4) and switchInput falls back on the order of
     * getTvInputList(), which is the right one in that case. If a TV mixes both conventions, prefer the list
     * order (remove this parsing): to be verified on the device.
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

    // ---------------------------------------------------------------- banners

    /**
     * The app's Leanback banner (or its icon, failing that) as a PNG data URI, 384x216 at most (Free My TV's
     * bannerTile()/iconTile()). Returns null if the app is not installed or has no visual. In-memory cache per package.
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
            Log.w("banner of " + pkg + ": " + e.getMessage());
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
        // 1. the banner resource at the highest density (sharper than pm.getApplicationBanner)
        int res = ai.banner;
        if (res != 0) {
            try {
                d = pm.getResourcesForApplication(ai).getDrawableForDensity(res, DisplayMetrics.DENSITY_XXXHIGH, null);
            } catch (PackageManager.NameNotFoundException | RuntimeException ignored) {
                d = null;
            }
        }
        // 2. the banner as the system sees it
        if (d == null) {
            try { d = pm.getApplicationBanner(ai); } catch (RuntimeException ignored) { d = null; }
        }
        boolean isBanner = d != null;
        // 3. the (square) icon, centred on a night background
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
