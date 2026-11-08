package fr.wavia.poudlardtv;

import android.app.Activity;
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
import android.os.Build;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.util.DisplayMetrics;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
 *    (ACTION_VIEW + setPackage), else in the app that owns the link's site (LINK_APPS), else on that app's home
 *    screen, and only as a last resort in whatever the TV opens https links with (a browser);
 *  - HDMI inputs go through the system's standard intent (ACTION_VIEW content://android.media.tv/…), the only
 *    case of an intent without a package: the system's TV app answers it;
 *  - a missing package or a failed launch returns a precise message, never an exception. A missing app ALWAYS
 *    says "... n'est pas installée sur cette télé." (platform.js reads the word "install" as "missing"); no other
 *    message may contain "install";
 *  - no URL outside the allow list; no network request (the manifest has no INTERNET anyway).
 *
 * The messages returned as strings are shown on the TV by the Howler (Beuglante), so they stay in French.
 */
final class Apps {
    /** Same shape as an Android package (PKG_RE in config.js): we never launch an odd-looking name. */
    private static final Pattern PKG = Pattern.compile("^[a-zA-Z][\\w]*(\\.[a-zA-Z][\\w]*)+$");
    /** Hosts allowed for openUrl: exact copy of URL_HOSTS in platform.js. Keep both lists identical. */
    static final Set<String> URL_HOSTS = new HashSet<>(Arrays.asList(
            "www.max.com", "play.max.com", "play.hbomax.com", "app.primevideo.com", "www.netflix.com", "www.primevideo.com", "www.disneyplus.com", "www.youtube.com",
            "canalplus.com", "www.canalplus.com"));
    /**
     * The apps that own each allow-listed site, TV build first: openUrl hands the link to the first one installed
     * when the named app is missing or refuses it (e.g. a Canal+ link with no package named).
     */
    private static final Map<String, String[]> LINK_APPS = new HashMap<>();
    static {
        LINK_APPS.put("www.netflix.com", new String[] { "com.netflix.ninja", "com.netflix.mediaclient" });
        String[] max = { "com.wbd.stream", "com.hbo.hbonow" };
        LINK_APPS.put("www.max.com", max);
        LINK_APPS.put("play.max.com", max);
        LINK_APPS.put("play.hbomax.com", max);
        String[] canal = { "com.canal.android.canal", "com.canal.android.canalplus" };
        LINK_APPS.put("canalplus.com", canal);
        LINK_APPS.put("www.canalplus.com", canal);
        String[] prime = { "com.amazon.amazonvideo.livingroom", "com.amazon.avod.thirdpartyclient" };
        LINK_APPS.put("www.primevideo.com", prime);
        LINK_APPS.put("app.primevideo.com", prime);
        LINK_APPS.put("www.disneyplus.com", new String[] { "com.disney.disneyplus" });
        LINK_APPS.put("www.youtube.com", new String[] { "com.google.android.youtube.tv", "com.google.android.youtube" });
    }
    /** Names for messages about apps that are NOT installed (an installed app gives its own label). */
    private static final Map<String, String> KNOWN_NAMES = new HashMap<>();
    static {
        String[][] names = {
                { "com.netflix.ninja", "Netflix" }, { "com.netflix.mediaclient", "Netflix" },
                { "com.amazon.amazonvideo.livingroom", "Prime Video" }, { "com.amazon.avod.thirdpartyclient", "Prime Video" },
                { "com.disney.disneyplus", "Disney+" }, { "com.canal.android.canal", "Canal+" }, { "com.canal.android.canalplus", "Canal+" },
                { "com.wbd.stream", "Max" }, { "com.hbo.hbonow", "Max" }, { "com.apple.atve.androidtv.appletv", "Apple TV" },
                { "com.cbs.ott", "Paramount+" }, { "com.google.android.youtube.tv", "YouTube" }, { "com.google.android.youtube", "YouTube" },
                { "fr.francetv.pluzz", "france.tv" }, { "fr.tf1.mytf1", "TF1+" }, { "fr.tf1.player", "TF1+" },
                { "fr.m6.m6replay", "M6+" }, { "tv.arte.plus7", "Arte" }, { "tv.molotov.app", "Molotov" },
                { "com.crunchyroll.crunchyroid", "Crunchyroll" }, { "com.dazn", "DAZN" }, { "tv.twitch.android.app", "Twitch" },
                { "com.spotify.tv.android", "Spotify" }, { "deezer.android.tv", "Deezer" }, { "com.plexapp.android", "Plex" },
                { "com.android.vending", "Play Store" }, { "com.amazon.venezia", "Amazon Appstore" },
        };
        for (String[] n : names) KNOWN_NAMES.put(n[0], n[1]);
    }
    /** Leanback banner size (320x180 dp) at xxxhdpi density, as in Free My TV: 384x216 is enough at 3 m. */
    private static final int BANNER_W = 384, BANNER_H = 216;
    /** Factory and hotel menus that pass the LAUNCHER query on some sets (Free My TV's FACTORY filter): never offered. */
    private static final Pattern FACTORY = Pattern.compile("(?i)factory|fac_|hotel|mfg|aging|burn.?in|engineer|demo");
    /** Google TV services that have a launcher entry but are not apps a person opens (Free My TV's HIDDEN). */
    private static final Set<String> HIDDEN = new HashSet<>(Arrays.asList(
            "com.google.android.play.games", "com.google.android.videos", "com.xiaomi.mitv.manualhelp", "com.Smartdevice.emanual"));
    /** The TV's own "live TV" apps, when the set has no tuner input to open through TvContract (Free My TV's list). */
    private static final String[] LIVE_TV_APPS = {
            "com.google.android.tv", "com.tcl.tv", "com.mediatek.wwtv.tvcenter", "com.sony.dtv.tvx", "com.smartdevice.livetv", "com.amazon.tv.livetv"};
    private static final String TV_SETTINGS = "com.android.tv.settings";
    private static final String CONNECT_INPUT = "com.google.android.intent.action.CONNECT_INPUT";

    /**
     * The TV's own settings screens, keyed as platform.js names them, each with its fallbacks in order. Field-tested
     * by Free My TV (its SettingsActivity): the Android TV Settings component first, then the generic action.
     * Every intent is tried inside a try/catch (openSystem): no resolveActivity() pre-filter, which package
     * visibility makes lie on Android 11+.
     */
    static final Map<String, Intent[]> SYSTEM;
    static {
        Map<String, Intent[]> m = new LinkedHashMap<>();
        m.put("settings", new Intent[] {
                new Intent(Settings.ACTION_SETTINGS),
                new Intent().setComponent(new android.content.ComponentName(TV_SETTINGS, TV_SETTINGS + ".MainSettings")) });
        m.put("wifi", new Intent[] {
                new Intent(Settings.ACTION_WIFI_SETTINGS).setPackage(TV_SETTINGS),
                new Intent(Settings.ACTION_WIFI_SETTINGS), new Intent(Settings.ACTION_WIRELESS_SETTINGS) });
        m.put("bluetooth", new Intent[] {
                new Intent(CONNECT_INPUT).setPackage(TV_SETTINGS), new Intent(Settings.ACTION_BLUETOOTH_SETTINGS) });
        m.put("picture", new Intent[] {
                new Intent(Settings.ACTION_DISPLAY_SETTINGS).setPackage(TV_SETTINGS), new Intent(Settings.ACTION_DISPLAY_SETTINGS) });
        m.put("sound", new Intent[] {
                new Intent().setComponent(new android.content.ComponentName(TV_SETTINGS, TV_SETTINGS + ".device.sound.SoundActivity")),
                new Intent(Settings.ACTION_SOUND_SETTINGS) });
        m.put("apps", new Intent[] {
                new Intent(Settings.ACTION_MANAGE_ALL_APPLICATIONS_SETTINGS), new Intent(Settings.ACTION_MANAGE_APPLICATIONS_SETTINGS) });
        m.put("date", new Intent[] { new Intent(Settings.ACTION_DATE_SETTINGS) });
        m.put("language", new Intent[] { new Intent(Settings.ACTION_LOCALE_SETTINGS) });
        m.put("accessibility", new Intent[] { new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS) });
        m.put("update", new Intent[] {
                new Intent("android.settings.SYSTEM_UPDATE_SETTINGS"), new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS) });
        m.put("about", new Intent[] { new Intent(Settings.ACTION_DEVICE_INFO_SETTINGS) });
        SYSTEM = Collections.unmodifiableMap(m);
    }

    private final Context app;
    /** The home screen, the source of app launches made on the main thread (starter()). Weak: never keeps a destroyed activity alive. */
    private final WeakReference<Activity> home;
    private final Map<String, String> iconCache = new HashMap<>();

    Apps(Activity activity) {
        this.app = activity.getApplicationContext();
        this.home = new WeakReference<>(activity);
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

    /**
     * The same list with the label each app gives the system (Free My TV's launchable(): Leanback first, then
     * side-loaded "phone" apps), without us, without factory menus (FACTORY) and without Google TV's service
     * entries (HIDDEN). One JSON array [{pkg, label, system}]: the Map reads it once per screen.
     */
    JSONArray installedApps() {
        PackageManager pm = app.getPackageManager();
        LinkedHashMap<String, ResolveInfo> seen = new LinkedHashMap<>();
        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LEANBACK_LAUNCHER)) {
            if (ri.activityInfo != null && !seen.containsKey(ri.activityInfo.packageName)) seen.put(ri.activityInfo.packageName, ri);
        }
        for (ResolveInfo ri : query(pm, Intent.CATEGORY_LAUNCHER)) {
            if (ri.activityInfo == null || seen.containsKey(ri.activityInfo.packageName)) continue;
            if ((ri.activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0) continue;
            seen.put(ri.activityInfo.packageName, ri);
        }
        JSONArray out = new JSONArray();
        for (Map.Entry<String, ResolveInfo> e : seen.entrySet()) {
            String pkg = e.getKey();
            if (pkg.equals(app.getPackageName()) || HIDDEN.contains(pkg)) continue;
            String label;
            try {
                CharSequence l = e.getValue().loadLabel(pm);
                label = l == null ? "" : l.toString().trim();
            } catch (RuntimeException ex) {
                label = "";
            }
            if (FACTORY.matcher(pkg).find() || FACTORY.matcher(label).find()) continue;
            boolean system = (e.getValue().activityInfo.applicationInfo.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
            try {
                out.put(new JSONObject().put("pkg", pkg).put("label", label).put("system", system));
            } catch (JSONException ignored) {
                // an unencodable label: the app is simply left out
            }
        }
        return out;
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
        String[] why = new String[1];
        Intent intent = launchable(pkg, why);
        return intent == null ? why[0] : startApp(intent, pkg);
    }

    /**
     * The first half of launch(), cheap (PackageManager only): the intent ready to start, or null with the message in
     * why[0] (same wording as launch()). Bridge.launch() answers JavaScript with it, then starts the intent later.
     */
    Intent launchable(String pkg, String[] why) {
        if (!validPackage(pkg)) { why[0] = "Nom d'appli invalide : « " + shorten(pkg) + " »."; return null; }
        Intent intent = launchIntent(pkg);
        if (intent == null) { why[0] = missing(pkg); return null; }
        return intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
    }

    /** The second half of launch(): starts an intent from launchable(). Null if all is well, else the message. */
    String startApp(Intent intent, String pkg) {
        return start(intent, name(pkg));
    }

    /**
     * What an app is started from: the home activity when it is alive and the call is on the main thread (Bridge.launch
     * posts there), as a launcher does (Launcher3 starts apps from its activity); the system then records Poudlard's
     * activity as the launch's source. Otherwise the application context: bridge calls run on a WebView thread, and
     * Activity.startActivity touches the window's views. Either way the app gets its own task (FLAG_ACTIVITY_NEW_TASK).
     */
    private Context starter() {
        Activity a = home.get();
        if (a == null || a.isFinishing() || a.isDestroyed() || Looper.myLooper() != Looper.getMainLooper()) return app;
        return a;
    }

    /**
     * The name to show for a package: the label the TV gives it if installed, else a known name, else the package
     * itself (« L'appli com.example.tv »). Never empty.
     */
    String name(String pkg) {
        if (pkg == null || pkg.isEmpty()) return "Cette appli";
        try {
            PackageManager pm = app.getPackageManager();
            CharSequence l = pm.getApplicationInfo(pkg, 0).loadLabel(pm);
            if (l != null && l.toString().trim().length() > 0) return l.toString().trim();
        } catch (PackageManager.NameNotFoundException | RuntimeException ignored) {
            // not installed (or not visible): the known names below
        }
        String known = KNOWN_NAMES.get(pkg);
        return known != null ? known : "L'appli " + pkg;
    }

    /** THE message for a missing app: keep the word "installée" (platform.js marks the result `missing`). */
    String missing(String pkg) {
        return name(pkg) + " n'est pas installée sur cette télé.";
    }

    private static String shorten(String s) {
        if (s == null) return "";
        return s.length() > 60 ? s.substring(0, 60) + "…" : s;
    }

    /**
     * Opens a content link (https, allow-listed host). In order, the first that starts wins:
     *  1. the link in the named app `pkg` (ACTION_VIEW + setPackage);
     *  2. the link in the app that owns the site (LINK_APPS: Netflix, Max, Canal+...), if installed;
     *  3. the named app (or the site's app) on its home screen: the person is at least in the right app;
     *  4. the link in whatever the TV opens https links with (a browser, or the site's app through its app links).
     * Errors: the app is missing and nothing else took the link: "<app> n'est pas installée sur cette télé.";
     * nothing on the TV can open it: "Aucune appli de cette télé ne sait ouvrir ce lien."
     */
    String openUrl(String url, String pkg) {
        Uri uri = allowedUrl(url);
        if (uri == null) {
            String host = hostOf(url);
            return host == null ? "Lien refusé : ce n'est pas une adresse https valide."
                    : "Lien refusé : le site « " + shorten(host) + " » n'est pas dans la liste autorisée de Poudlard TV.";
        }
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        LinkedHashSet<String> owners = new LinkedHashSet<>();
        boolean named = validPackage(pkg);
        if (named) owners.add(pkg);
        String[] siteApps = LINK_APPS.get(host);
        if (siteApps != null) owners.addAll(Arrays.asList(siteApps));
        List<String> installed = new ArrayList<>();
        for (String p : owners) if (isInstalled(p)) installed.add(p);
        // 1 + 2: the link inside an app that owns it.
        for (String p : installed) {
            Intent inApp = new Intent(Intent.ACTION_VIEW, uri).setPackage(p).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (tryStart(inApp, "link in " + p)) return null;
        }
        // 3: that app on its home screen.
        for (String p : installed) {
            if (launch(p) == null) return null;
        }
        // 4: whatever handles https links on this TV.
        Intent any = new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (tryStart(any, "link in the default handler")) return null;
        if (named && !isInstalled(pkg)) return missing(pkg);
        if (installed.isEmpty() && siteApps != null) return missing(siteApps[0]);
        return "Aucune appli de cette télé ne sait ouvrir ce lien.";
    }

    private static String hostOf(String url) {
        try {
            Uri u = Uri.parse(url == null ? "" : url);
            return u.getHost();
        } catch (RuntimeException e) {
            return null;
        }
    }

    private boolean tryStart(Intent intent, String what) {
        try {
            starter().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
            Log.i("could not open " + what + ": " + e.getClass().getSimpleName());
            return false;
        }
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

    /** Starts an intent; `what` is the name shown to the person (« Netflix », « la Télé »...). */
    private String start(Intent intent, String what) {
        try {
            starter().startActivity(intent);
            return null;
        } catch (ActivityNotFoundException e) {
            Log.w("could not open " + what + ": " + e.getMessage());
            return what + " ne se laisse pas ouvrir depuis Poudlard TV (aucun écran de démarrage).";
        } catch (SecurityException e) {
            Log.w("could not open " + what + ": " + e.getMessage());
            return "La télé interdit d'ouvrir " + what + " depuis Poudlard TV.";
        } catch (IllegalStateException e) {
            Log.w("could not open " + what + ": " + e.getMessage());
            return "La télé n'a pas pu ouvrir " + what + " (elle est occupée) : réessayez.";
        }
    }

    // ---------------------------------------------------------------- the TV's own screens

    /**
     * Opens one of the TV's settings screens (SYSTEM keys), or the system page of an app ("appinfo" + package:
     * uninstall, force stop, permissions). Each candidate intent is tried in order; the first that starts wins.
     * Returns null when a screen opened, otherwise a readable message. Changes nothing itself.
     */
    String openSystem(String key, String arg) {
        if (key == null) return "Écran de réglages inconnu.";
        Intent[] candidates;
        if ("appinfo".equals(key)) {
            if (!validPackage(arg)) return "Nom d'appli invalide : « " + shorten(arg) + " ».";
            candidates = new Intent[] { new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + arg)) };
        } else {
            candidates = SYSTEM.get(key);
            if (candidates == null) return "Écran de réglages inconnu : « " + shorten(key) + " ».";
        }
        for (Intent candidate : candidates) {
            Intent intent = new Intent(candidate).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                starter().startActivity(intent);
                return null;
            } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
                Log.i("settings screen " + key + ": " + e.getClass().getSimpleName() + ", next candidate");
            }
        }
        String label = SYSTEM_LABELS.get(key);
        return label == null ? "Cette télé n'a pas cet écran de réglages."
                : "Cette télé n'a pas d'écran « " + label + " » accessible depuis Poudlard TV.";
    }

    /** French names of the SYSTEM screens, for the error messages. */
    private static final Map<String, String> SYSTEM_LABELS = new HashMap<>();
    static {
        String[][] l = {
                { "settings", "Paramètres" }, { "wifi", "Réseau et Wi-Fi" }, { "bluetooth", "Télécommandes et accessoires" },
                { "picture", "Image" }, { "sound", "Son" }, { "apps", "Applications" }, { "date", "Date et heure" },
                { "language", "Langue" }, { "accessibility", "Accessibilité" }, { "update", "Mise à jour du système" },
                { "about", "À propos" }, { "appinfo", "Infos sur l'appli" } };
        for (String[] e : l) SYSTEM_LABELS.put(e[0], e[1]);
    }

    /** The TV's store: Amazon's on Fire TV, the Play Store elsewhere. */
    String store() {
        String pkg = "Amazon".equalsIgnoreCase(Build.MANUFACTURER) ? "com.amazon.venezia" : "com.android.vending";
        if (launchIntent(pkg) == null) return "Cette télé n'a pas de boutique d'applis (" + name(pkg) + " absent).";
        return launch(pkg);
    }

    // ---------------------------------------------------------------- HDMI inputs

    /**
     * The TV's HDMI ports (port of Free My TV's HomeApps.inputs()): one entry per physical port, with the name the
     * person gave it in the TV's settings (custom label), else the CEC name of the device plugged in, else "HDMI n";
     * `connected` follows the input state (Allwinner sets report CONNECTED_STANDBY for a sleeping device).
     * Returns a JSON array [{id, port, label, connected}] sorted by port; empty when the TV exposes nothing.
     */
    JSONArray inputs() {
        JSONArray out = new JSONArray();
        TvInputManager tim = (TvInputManager) app.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) return out;
        List<TvInputInfo> all;
        try {
            all = tim.getTvInputList();
        } catch (RuntimeException e) {
            return out;
        }
        if (all == null) return out;
        boolean allwinner = Build.MANUFACTURER != null && Build.MANUFACTURER.toLowerCase(Locale.ROOT).contains("allwinner");
        // Physical ports first, in the TV's order; CEC devices (children) are attached to their port afterwards.
        List<TvInputInfo> ports = new ArrayList<>();
        Map<String, String> cec = new HashMap<>();
        for (TvInputInfo info : all) {
            if (info.getType() != TvInputInfo.TYPE_HDMI) continue;
            if (info.getParentId() == null) {
                ports.add(info);
            } else {
                CharSequence l = null;
                try { l = info.loadLabel(app); } catch (RuntimeException ignored) { l = null; }
                if (l != null && l.length() > 0 && !cec.containsKey(info.getParentId())) cec.put(info.getParentId(), l.toString().trim());
            }
        }
        List<JSONObject> rows = new ArrayList<>();
        for (int i = 0; i < ports.size(); i++) {
            TvInputInfo info = ports.get(i);
            Integer port = hdmiPort(info);
            int number = port != null && port >= 1 && port <= 12 ? port : i + 1;
            int state;
            try { state = tim.getInputState(info.getId()); } catch (RuntimeException e) { state = TvInputManager.INPUT_STATE_DISCONNECTED; }
            boolean connected = state == TvInputManager.INPUT_STATE_CONNECTED
                    || (allwinner && state == TvInputManager.INPUT_STATE_CONNECTED_STANDBY);
            String label = null;
            try {
                CharSequence custom = info.loadCustomLabel(app);
                if (custom != null && custom.length() > 0) label = custom.toString().trim();
            } catch (RuntimeException ignored) {
                label = null;
            }
            if (label == null && connected && cec.containsKey(info.getId())) label = cec.get(info.getId());
            if (label == null) label = "HDMI " + number;
            try {
                rows.add(new JSONObject().put("id", info.getId()).put("port", number).put("label", label).put("connected", connected));
            } catch (JSONException ignored) {
                // nothing to add for this port
            }
        }
        Collections.sort(rows, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return Integer.compare(a.optInt("port"), b.optInt("port"));
            }
        });
        for (JSONObject row : rows) out.put(row);
        return out;
    }

    /** The intent that opens live television: the first tuner input, else the first installed "live TV" app. */
    private Intent liveTvIntent() {
        TvInputManager tim = (TvInputManager) app.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim != null) {
            try {
                for (TvInputInfo info : tim.getTvInputList()) {
                    if (info.getType() == TvInputInfo.TYPE_TUNER) {
                        return new Intent(Intent.ACTION_VIEW, TvContract.buildChannelsUriForInput(info.getId()));
                    }
                }
            } catch (RuntimeException ignored) {
                // no tuner list: the apps below
            }
        }
        for (String pkg : LIVE_TV_APPS) {
            Intent intent = launchIntent(pkg);
            if (intent != null) return intent.addFlags(Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
        }
        return null;
    }

    boolean hasLiveTv() {
        try {
            return liveTvIntent() != null;
        } catch (RuntimeException e) {
            return false;
        }
    }

    String liveTv() {
        Intent intent = liveTvIntent();
        if (intent == null) return "Cette télé n'a ni antenne ni appli de chaînes.";
        String err = start(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), "la Télé");
        return err == null ? null : "Cette télé refuse d'ouvrir ses chaînes depuis un autre accueil.";
    }

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
        if (input == null || input.trim().isEmpty() || input.length() > 200) return "Entrée HDMI invalide.";
        TvInputManager tim = (TvInputManager) app.getSystemService(Context.TV_INPUT_SERVICE);
        if (tim == null) return "Cette télé ne donne pas accès à ses entrées HDMI.";
        List<TvInputInfo> inputs;
        try {
            inputs = tim.getTvInputList();
        } catch (RuntimeException e) {
            return "La télé n'a pas voulu donner la liste de ses entrées HDMI.";
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
        if (match == null) {
            return hdmi.isEmpty() ? "Cette télé ne déclare aucune entrée HDMI."
                    : "Entrée « " + shorten(wanted) + " » introuvable : cette télé a " + hdmi.size()
                            + (hdmi.size() > 1 ? " entrées HDMI." : " entrée HDMI.");
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(match.getId()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String err = start(intent, wanted);
        return err == null ? null : "Cette télé refuse d'ouvrir l'entrée « " + shorten(wanted) + " » depuis un autre accueil.";
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
