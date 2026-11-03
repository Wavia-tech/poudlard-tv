package fr.wavia.poudlardtv;

import android.app.Activity;
import android.app.role.RoleManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.provider.Settings;

import java.util.ArrayList;
import java.util.List;

/**
 * Which home the TV uses: Poudlard or the original. REVERSIBLE, adb-FREE version of Free My TV's HomeMode
 * (only the originalHome() method below is taken from its stockHome(); MIT license in android/README.md).
 *
 * Free My TV goes through an internal adb client for `cmd package set-home-activity` and disables the Google home
 * (`pm disable-user`). We do neither: a socket requires the INTERNET permission, and disabling the Google home
 * is forbidden by the project rules. Instead:
 *
 *  - setHome("poudlard") = requestHome(activity): re-enables our HOME entry point (the `.Home` alias), clears the
 *    safeguard counter, then ASKS the system for the HOME role (Android 10+: RoleManager.createRequestRoleIntent,
 *    the system shows its own confirmation dialog; no permission needed, the person confirms with OK). The hint
 *    returned tells the mock-up what to show: "held" (already ours), "role" (the dialog is on screen), "fire"
 *    (Fire TV never hands the Home key over), and on older sets "settings" (the system's "Home app" screen
 *    opened) or "press-home" (press Home, the TV offers both homes, choose "Always"). Never a failure for an
 *    absent screen: the choice belongs to the system and to the person.
 *  - setHome("original") = giveBackHome(): disables our `.Home` alias (allowed without permission on one's own
 *    components). The system then has only one candidate for the Home key: the original home. Then we launch it.
 *    The `.Start` alias (app list) stays enabled: Poudlard TV is still there to go back.
 *
 * No other app is ever touched. Uninstalling the APK puts everything back.
 * Status: written from the Android documentation, NOT TESTED on a device (see android/README.md, "Test status").
 */
final class HomeMode {
    static final String POUDLARD = "poudlard";
    static final String ORIGINAL = "original";
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
     * person, or null if our HOME entry point could not be re-enabled (the only real failure).
     * Must run on the UI thread.
     */
    static String requestHome(Activity a) {
        try {
            setHomeAlias(a, true);
        } catch (RuntimeException e) {
            Log.w("could not re-enable the HOME entry point", e);
            return null;
        }
        Watchdog.clear(a);
        if (fireTv()) return HINT_FIRE;
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

    private static ComponentName homeAlias(Context c) {
        return new ComponentName(c.getPackageName(), c.getPackageName() + ".Home");
    }

    /** Is our HOME entry point enabled? (Component state, not the person's choice in the settings.) */
    static boolean homeAliasEnabled(Context c) {
        int state = c.getPackageManager().getComponentEnabledSetting(homeAlias(c));
        // ENABLED by default in the manifest: DEFAULT therefore means "enabled".
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
                || state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT;
    }

    private static void setHomeAlias(Context c, boolean enabled) {
        c.getPackageManager().setComponentEnabledSetting(homeAlias(c),
                enabled ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP);
    }

    /** The package currently answering the Home key (system resolution of MAIN + HOME). */
    static String currentHomePackage(Context c) {
        try {
            Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
            ResolveInfo ri = c.getPackageManager().resolveActivity(home, PackageManager.MATCH_DEFAULT_ONLY);
            return ri == null || ri.activityInfo == null ? null : ri.activityInfo.packageName;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** What the JavaScript shows in the settings: "poudlard" if we are the current home, "original" otherwise. */
    static String mode(Context c) {
        if (!homeAliasEnabled(c)) return ORIGINAL;
        Boolean held = roleHeld(c);                      // Android 10+: the role is the truth
        if (held != null) return held ? POUDLARD : ORIGINAL;
        return c.getPackageName().equals(currentHomePackage(c)) ? POUDLARD : ORIGINAL;
    }

    /**
     * Gives the home back to the original. Called by the safeguard (3 crashes) and by setHome("original").
     * Never throws: as a last resort, the system will choose by itself on the next Home key press.
     */
    static void giveBackHome(Context c) {
        try {
            setHomeAlias(c, false);
            Log.i("HOME entry point disabled: the original home takes over the Home key");
        } catch (RuntimeException e) {
            Log.w("could not disable the HOME entry point", e);
        }
        Intent original = originalHome(c);
        if (original == null) {
            Log.w("original home not found or ambiguous: the system will choose on the next Home key press");
            return;
        }
        try {
            c.startActivity(original.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK));
        } catch (ActivityNotFoundException | SecurityException e) {
            Log.w("could not launch the original home", e);
        }
    }

    /**
     * Restores our HOME entry point and clears the crashes. Returns the hint for the person (HINT_SETTINGS if the
     * system's chooser screen could be opened, HINT_PRESS_HOME otherwise), or null if the HOME entry point could not
     * be re-enabled (the only real failure).
     */
    static String takeHome(Context c) {
        try {
            setHomeAlias(c, true);
        } catch (RuntimeException e) {
            Log.w("could not re-enable the HOME entry point", e);
            return null;
        }
        Watchdog.clear(c);
        Log.i("HOME entry point re-enabled: the TV will offer Poudlard TV on the next Home key press");
        return openHomeSettings(c) ? HINT_SETTINGS : HINT_PRESS_HOME;
    }

    /**
     * The system's "Home app" screen, if it exists (phones, a few boxes). On Android TV / Google TV
     * there is generally no recipient: we return false without opening anything else (the general settings
     * would lead nowhere).
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
     * The original home, in the manner of stockHome() in Free My TV: the HOME activities of SYSTEM apps,
     * without us, without FallbackHome (the "Android is starting" screen), and we do not guess if several candidates
     * remain (we then take the one the system prefers, if it is not us).
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
            if (target == null) Log.w(candidates.size() + " system home screens: not guessing");
        }
        if (target == null) return null;
        return new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).setComponent(target);
    }
}
