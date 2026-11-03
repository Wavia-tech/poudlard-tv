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
 * Which home the TV uses: Poudlard or the original. REVERSIBLE, adb-FREE version of Free My TV's HomeMode
 * (only the originalHome() method below is taken from its stockHome(); MIT license in android/README.md).
 *
 * Free My TV goes through an internal adb client for `cmd package set-home-activity` and disables the Google home
 * (`pm disable-user`). We do neither: a socket requires the INTERNET permission, and disabling the Google home
 * is forbidden by the project rules. Instead:
 *
 *  - setHome("poudlard") = takeHome(): re-enables our HOME entry point (the `.Home` alias) and clears the safeguard counter.
 *    That is all an app without permissions can do; the final choice belongs to the SYSTEM and to the person:
 *    on the next Home key press, the TV has two candidate home screens and shows its chooser
 *    ("Google TV" or "Poudlard TV", with "Always" to remember). On a phone there is a
 *    "Home app" screen (Settings.ACTION_HOME_SETTINGS); the Android TV / Google TV Settings generally do
 *    NOT have one. So we try that screen, but its absence is not a failure: the JSON returned tells the mock-up
 *    which instruction to show (`hint`: "settings" if the screen opened, "press-home" otherwise).
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

    private HomeMode() {}

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
        return homeAliasEnabled(c) && c.getPackageName().equals(currentHomePackage(c)) ? POUDLARD : ORIGINAL;
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
