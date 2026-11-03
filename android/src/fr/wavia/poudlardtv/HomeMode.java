package fr.wavia.poudlardtv;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.Settings;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Which home the TV uses: Poudlard or the original. REVERSIBLE, adb-FREE version of Free My TV's HomeMode
 * (only the idea of originalHome() is taken from its stockHome(); MIT license in android/README.md).
 *
 * Free My TV goes through an internal adb client for `cmd package set-home-activity` and disables the Google home
 * (`pm disable-user`). We do neither: a socket requires the INTERNET permission, and disabling the Google home
 * is forbidden by the project rules. Instead:
 *
 *  - The `.Home` alias (HOME category) is DISABLED in the manifest: installing the APK never takes the Home key
 *    and never makes the TV show its "which home app?" chooser.
 *  - setHome("poudlard") = requestHome(activity): FIRST records the home that currently answers the Home key
 *    (files/original-home.txt: Free My TV, the Google TV home, any launcher), THEN enables our `.Home` alias, clears
 *    the safeguard counter, and asks the system for the HOME role (Android 10+: RoleManager.createRequestRoleIntent,
 *    the system shows its own confirmation dialog; no permission needed). If the person declines the role, the
 *    alias is disabled again (cancelRequest, from HomeActivity.onActivityResult): Home stays with the original.
 *    The hint returned tells the mock-up what to show: "held", "role", "fire", "settings" or "press-home".
 *  - setHome("original") = giveBackHome(): disables our `.Home` alias (allowed without permission on one's own
 *    components), then launches the recorded original home EXPLICITLY (its component), or failing that another
 *    home of the TV (originalHome). The `.Start` alias (app list) stays enabled: Poudlard TV is still there.
 *
 * No other app is ever touched. Uninstalling the APK puts everything back.
 */
final class HomeMode {
    static final String POUDLARD = "poudlard";
    static final String ORIGINAL = "original";
    /** The guard gave the key back after three crashes; the settings say so until the person asks again. */
    static final String REVERTED = "reverted";
    /** Hint returned by takeHome: the system's chooser screen has opened. */
    static final String HINT_SETTINGS = "settings";
    /** Hint returned by takeHome: press Home, the TV will offer both home screens. */
    static final String HINT_PRESS_HOME = "press-home";
    /** Hint: Poudlard already holds the HOME role. */
    static final String HINT_HELD = "held";
    /** Hint: the system's role dialog is on screen (RoleManager, Android 10+). */
    static final String HINT_ROLE = "role";
    /** Hint: Fire TV keeps the Home key for Amazon's home; Poudlard opens from the app list. */
    static final String HINT_FIRE = "fire";
    /** Request code of the role dialog (HomeActivity.onActivityResult). */
    static final int REQUEST_ROLE = 1;

    /** Where the home that answered the Home key before Poudlard is kept ("package/class", one line). */
    private static final String ORIGINAL_FILE = "original-home.txt";

    /** The system TV homes, in order of preference, when no recorded home is usable. */
    private static final List<String> SYSTEM_TV_HOMES = Arrays.asList(
            "com.google.android.apps.tv.launcherx",   // Google TV
            "com.google.android.tvlauncher",          // Android TV (9 to 12)
            "com.google.android.leanbacklauncher",    // Android TV (5 to 8)
            "com.amazon.tv.launcher");                // Fire TV

    private HomeMode() {}

    static boolean fireTv() {
        return "Amazon".equalsIgnoreCase(Build.MANUFACTURER);
    }

    private static RoleManager roleManager(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return null;
        try {
            RoleManager rm = (RoleManager) c.getSystemService(Context.ROLE_SERVICE);
            return rm != null && rm.isRoleAvailable(RoleManager.ROLE_HOME) ? rm : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Does Poudlard hold the HOME role (Android 10+)? Null when the role API is not there. */
    static Boolean roleHeld(Context c) {
        RoleManager rm = roleManager(c);
        if (rm == null) return null;
        try {
            return rm.isRoleHeld(RoleManager.ROLE_HOME);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Asks the system for the Home key, from the activity (the role dialog needs one). Returns the hint for the
     * person, or null if our HOME entry point could not be enabled (the only real failure).
     * Order matters: the current home is recorded BEFORE our alias exists as a candidate.
     * Must run on the UI thread.
     */
    static String requestHome(Activity a) {
        recordOriginalHome(a);
        if (fireTv()) {
            // Fire TV never hands the Home key over: the alias stays closed, nothing changes on the Amazon side.
            Watchdog.clear(a);
            return HINT_FIRE;
        }
        try {
            setHomeAlias(a, true);
        } catch (RuntimeException e) {
            Log.w("could not enable the HOME entry point", e);
            return null;
        }
        Watchdog.clear(a);
        RoleManager rm = roleManager(a);
        if (rm != null) {
            Boolean held = roleHeld(a);
            if (Boolean.TRUE.equals(held)) return HINT_HELD;
            try {
                a.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_HOME), REQUEST_ROLE);
                Log.i("HOME role requested: the system asks the person");
                return HINT_ROLE;
            } catch (ActivityNotFoundException | SecurityException | IllegalStateException e) {
                Log.w("role dialog unavailable, falling back to the settings screens", e);
            }
        }
        if (openHomeSettings(a)) return HINT_SETTINGS;
        try {
            a.startActivity(new Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return HINT_SETTINGS;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.i("no default-apps screen either: hint \"press Home\"");
        }
        return HINT_PRESS_HOME;
    }

    /**
     * The role dialog answered (HomeActivity.onActivityResult). If the person did not give the role, the alias is
     * closed again: otherwise the TV would show its "which home app?" chooser on every Home press.
     * Returns true when Poudlard now holds the Home key.
     */
    static boolean afterRoleDialog(Context c) {
        boolean held = Boolean.TRUE.equals(roleHeld(c));
        if (!held) {
            disableAliasQuietly(c);
            Log.i("HOME role declined: HOME entry point closed again, the original home keeps the Home key");
        }
        return held;
    }

    private static ComponentName homeAlias(Context c) {
        return new ComponentName(c.getPackageName(), c.getPackageName() + ".Home");
    }

    /** Is our HOME entry point enabled? (Component state, not the person's choice in the settings.) */
    static boolean homeAliasEnabled(Context c) {
        int state = c.getPackageManager().getComponentEnabledSetting(homeAlias(c));
        // DISABLED by default in the manifest: DEFAULT therefore means "disabled". Only an explicit ENABLED counts.
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private static void setHomeAlias(Context c, boolean enabled) {
        c.getPackageManager().setComponentEnabledSetting(homeAlias(c),
                enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
    }

    private static void disableAliasQuietly(Context c) {
        try {
            setHomeAlias(c, false);
        } catch (RuntimeException e) {
            Log.w("could not disable the HOME entry point", e);
        }
    }

    /** The component currently answering the Home key, or null when there is none or it is ambiguous (the chooser). */
    static ComponentName currentHome(Context c) {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = c.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            if (ri == null || ri.activityInfo == null) return null;
            return new ComponentName(ri.activityInfo.packageName, ri.activityInfo.name);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** The package currently answering the Home key (system resolution of MAIN + HOME). */
    static String currentHomePackage(Context c) {
        ComponentName cn = currentHome(c);
        return cn == null ? null : cn.getPackageName();
    }

    /** Not a real home: ourselves, the system's chooser (ResolverActivity), the "Android is starting" screen. */
    private static boolean notAHome(Context c, String pkg, String cls) {
        if (pkg == null || cls == null) return true;
        if (c.getPackageName().equals(pkg)) return true;
        if ("android".equals(pkg)) return true;                                  // com.android.internal.app.ResolverActivity
        if (cls.endsWith("ResolverActivity") || cls.endsWith("ChooserActivity")) return true;
        return cls.endsWith("FallbackHome");
    }

    /**
     * Records the home that answers the Home key right now, if it is a real one (not us, not the chooser).
     * Called before our alias is enabled, and each time Poudlard opens while its alias is closed (so the record
     * follows the person if they switch launchers in between). An ambiguous answer never erases a good record.
     */
    static void recordOriginalHome(Context c) {
        ComponentName cn = currentHome(c);
        if (cn == null || notAHome(c, cn.getPackageName(), cn.getClassName())) return;
        String line = cn.flattenToString();
        if (line.equals(readOriginal(c))) return;
        File target = new File(c.getFilesDir(), ORIGINAL_FILE);
        File tmp = new File(target.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write((line + '\n').getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        } catch (IOException e) {
            Log.w("could not record the original home: " + e.getMessage());
            return;
        }
        if (!tmp.renameTo(target)) {
            Log.w("could not rename " + tmp.getName());
            return;
        }
        Log.i("original home recorded: " + line);
    }

    /** The recorded original home ("package/class"), or null. */
    private static String readOriginal(Context c) {
        File f = new File(c.getFilesDir(), ORIGINAL_FILE);
        if (!f.exists()) return null;
        byte[] buf = new byte[512];
        int n;
        try (FileInputStream in = new FileInputStream(f)) {
            n = in.read(buf);
        } catch (IOException e) {
            return null;
        }
        if (n <= 0) return null;
        String s = new String(buf, 0, n, StandardCharsets.UTF_8).trim();
        return s.isEmpty() ? null : s;
    }

    static ComponentName recordedOriginal(Context c) {
        String s = readOriginal(c);
        return s == null ? null : ComponentName.unflattenFromString(s);
    }

    /** What the JavaScript shows in the settings: "poudlard" if we are the current home, "original" otherwise. */
    static String mode(Context c) {
        if (Watchdog.reverted(c)) return REVERTED;
        if (!homeAliasEnabled(c)) return ORIGINAL;
        Boolean held = roleHeld(c);                      // Android 10+: the role is the truth
        if (held != null) return held ? POUDLARD : ORIGINAL;
        return c.getPackageName().equals(currentHomePackage(c)) ? POUDLARD : ORIGINAL;
    }

    /**
     * Gives the home back to the original. Called by the safeguard (3 crashes) and by setHome("original").
     * Never throws. Returns true when a home screen was launched.
     */
    static boolean giveBackHome(Context c) {
        return giveBackHome(c, false);
    }

    /** `byWatchdog`: the guard fired; the revert is then sticky (Watchdog.markReverted) until the key is asked again. */
    static boolean giveBackHome(Context c, boolean byWatchdog) {
        if (byWatchdog) Watchdog.markReverted(c);
        try {
            setHomeAlias(c, false);
            Log.i("HOME entry point disabled: the original home takes over the Home key");
        } catch (RuntimeException e) {
            Log.w("could not disable the HOME entry point", e);
        }
        return launchOriginalHome(c);
    }

    /**
     * Launches the original home: the recorded component, else another home of the TV (originalHome), else the bare
     * HOME intent (the system resolves it; our alias is closed so it cannot come back to us). Returns false only
     * when nothing at all could be started.
     */
    static boolean launchOriginalHome(Context c) {
        Intent original = originalHome(c);
        if (original != null) {
            try {
                c.startActivity(original.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
                Log.i("original home launched: " + original.getComponent());
                return true;
            } catch (ActivityNotFoundException | SecurityException e) {
                Log.w("could not launch " + original.getComponent(), e);
            }
        }
        if (homeAliasEnabled(c)) return false;   // the bare HOME intent could lead back to us
        try {
            c.startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            Log.i("original home: bare HOME intent, the system chooses");
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w("no home screen could be launched", e);
            return false;
        }
    }

    /**
     * Restores our HOME entry point and clears the crashes, without an activity (no role dialog). Returns the hint
     * (HINT_SETTINGS if the system's chooser screen could be opened, HINT_PRESS_HOME otherwise), or null if the
     * HOME entry point could not be enabled.
     */
    static String takeHome(Context c) {
        recordOriginalHome(c);
        try {
            setHomeAlias(c, true);
        } catch (RuntimeException e) {
            Log.w("could not enable the HOME entry point", e);
            return null;
        }
        Watchdog.clear(c);
        Log.i("HOME entry point enabled: the TV will offer Poudlard TV on the next Home key press");
        return openHomeSettings(c) ? HINT_SETTINGS : HINT_PRESS_HOME;
    }

    /**
     * The system's "Home app" screen, if it exists (phones, a few boxes). On Android TV / Google TV
     * there is generally no recipient: we return false without opening anything else.
     */
    static boolean openHomeSettings(Context c) {
        try {
            c.startActivity(new Intent(Settings.ACTION_HOME_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.i("no \"Home app\" screen on this TV: hint \"press Home\"");
            return false;
        }
    }

    /**
     * The original home, as an explicit intent:
     *  1. the recorded component (files/original-home.txt), if it still answers HOME (Free My TV, any launcher);
     *  2. the current default home, if it is not us and not the chooser;
     *  3. another HOME activity of the TV: the recorded PACKAGE first (its home class may have changed), then the
     *     system TV homes (SYSTEM_TV_HOMES order), then any system home, then any other home.
     * Null only when the TV has no other home at all.
     */
    static Intent originalHome(Context c) {
        PackageManager pm = c.getPackageManager();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        List<ResolveInfo> all;
        try {
            all = pm.queryIntentActivities(home, 0);
        } catch (RuntimeException e) {
            all = new ArrayList<>();
        }
        if (all == null) all = new ArrayList<>();
        List<ComponentName> candidates = new ArrayList<>();
        List<Boolean> system = new ArrayList<>();
        for (ResolveInfo ri : all) {
            if (ri.activityInfo == null) continue;
            String pkg = ri.activityInfo.packageName;
            String cls = ri.activityInfo.name;
            if (notAHome(c, pkg, cls)) continue;
            candidates.add(new ComponentName(pkg, cls));
            ApplicationInfo ai = ri.activityInfo.applicationInfo;
            system.add(ai != null && (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
        }
        ComponentName target = null;
        ComponentName recorded = recordedOriginal(c);
        if (recorded != null && candidates.contains(recorded)) target = recorded;
        if (target == null) {
            ComponentName current = currentHome(c);
            if (current != null && candidates.contains(current)) target = current;
        }
        if (target == null && recorded != null) {
            for (ComponentName cn : candidates) if (cn.getPackageName().equals(recorded.getPackageName())) { target = cn; break; }
        }
        if (target == null) {
            for (String pkg : SYSTEM_TV_HOMES) {
                for (ComponentName cn : candidates) if (cn.getPackageName().equals(pkg)) { target = cn; break; }
                if (target != null) break;
            }
        }
        if (target == null) {
            for (int i = 0; i < candidates.size(); i++) if (system.get(i)) { target = candidates.get(i); break; }
        }
        if (target == null && !candidates.isEmpty()) target = candidates.get(0);
        if (target == null) {
            // Not visible through the query (package visibility) but recorded: try it anyway, startActivity will tell.
            target = recorded;
        }
        if (target == null) return null;
        return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setComponent(target);
    }

    /** The label of the original home (« Free My TV », « Google TV »…), for the settings; null if unknown. */
    static String originalHomeLabel(Context c) {
        Intent i = originalHome(c);
        if (i == null || i.getComponent() == null) return null;
        try {
            PackageManager pm = c.getPackageManager();
            CharSequence l = pm.getApplicationInfo(i.getComponent().getPackageName(), 0).loadLabel(pm);
            return l == null ? null : l.toString().trim();
        } catch (PackageManager.NameNotFoundException | RuntimeException e) {
            return null;
        }
    }
}
