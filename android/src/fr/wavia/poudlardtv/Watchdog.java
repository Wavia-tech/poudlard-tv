package fr.wavia.poudlardtv;

import android.content.Context;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Safeguard: if the home crashes 3 times in 5 minutes, it hands over to the TV's original home
 * (HomeMode.giveBackHome) and does not try again until it is deliberately restored (« Réessayer » button
 * on the fallback screen, or « Faire de Poudlard l'accueil » in the settings; otherwise, the 5-minute window expires).
 *
 * Taken almost verbatim from Free My TV's Watchdog.java — Copyright (c) 2026 Free My TV contributors,
 * MIT license (full text in android/README.md, section "Free My TV license").
 *
 * Crashes are timestamps, one per line, in files/home-crashes.txt (no SharedPreferences: the file
 * stays readable even if the process dies mid-write, and reading is capped at 4 KB).
 *
 * Counts as a crash: an uncaught exception in the process, and the death of the WebView's render engine
 * (HomeActivity calls record() from onRenderProcessGone).
 */
final class Watchdog {
    static final int LIMIT = 3;
    static final long WINDOW = 5 * 60_000L;
    private static final String FILE = "home-crashes.txt";
    /** Sticky revert (Free My TV's homeReverted): once the guard has fired, the home stays out of the way across
     *  reboots until the person asks for the Home key again (clear()). */
    private static final String REVERTED = "home-reverted";
    private static final int MAX_BYTES = 4096;

    private static boolean installed;

    private Watchdog() {}

    /** Installs the exception handler once; keeps the previous one and calls it afterwards (the system shows its dialog). */
    static synchronized void install(Context context) {
        if (installed) return;
        installed = true;
        final Context app = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable error) {
                try {
                    Log.w("home screen crash", error);
                    if (record(app) >= LIMIT) HomeMode.giveBackHome(app, true);
                } catch (Throwable ignored) {
                    // Nothing must prevent the previous handler from running.
                }
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
    }

    /** Records a crash now and returns the number of crashes within the window. */
    static synchronized int record(Context context) {
        List<Long> recent = recent(context);
        recent.add(System.currentTimeMillis());
        StringBuilder sb = new StringBuilder();
        for (Long t : recent) sb.append(t).append('\n');
        writeAtomic(file(context), sb.toString());
        return recent.size();
    }

    /** True as long as the window holds LIMIT crashes: the home must not relaunch on its own. */
    static boolean crashedTooOften(Context context) {
        return recent(context).size() >= LIMIT;
    }

    /** The guard gave the Home key back: remembered until clear(). */
    static synchronized void markReverted(Context context) {
        writeAtomic(new File(context.getFilesDir(), REVERTED), String.valueOf(System.currentTimeMillis()) + '\n');
    }

    static boolean reverted(Context context) {
        return new File(context.getFilesDir(), REVERTED).exists();
    }

    /** To call when the person makes Poudlard TV the home again: start from scratch. */
    static synchronized void clear(Context context) {
        File f = file(context);
        if (f.exists() && !f.delete()) Log.w("could not delete " + FILE);
        File r = new File(context.getFilesDir(), REVERTED);
        if (r.exists() && !r.delete()) Log.w("could not delete " + REVERTED);
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE);
    }

    /** tmp + rename: a process dying mid-write never leaves a half file behind. */
    private static void writeAtomic(File target, String text) {
        File tmp = new File(target.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(text.getBytes(StandardCharsets.US_ASCII));
            out.getFD().sync();
        } catch (IOException e) {
            Log.w("could not write " + tmp.getName() + ": " + e.getMessage());
            return;
        }
        if (!tmp.renameTo(target)) Log.w("could not rename " + tmp.getName());
    }

    /** The timestamps still within the window; malformed lines and old crashes are ignored. */
    private static List<Long> recent(Context context) {
        List<Long> out = new ArrayList<>();
        File f = file(context);
        if (!f.exists()) return out;
        byte[] buf = new byte[MAX_BYTES];
        int n;
        try (FileInputStream in = new FileInputStream(f)) {
            n = in.read(buf);
        } catch (IOException e) {
            return out;
        }
        if (n <= 0) return out;
        long now = System.currentTimeMillis();
        for (String line : new String(buf, 0, n, StandardCharsets.US_ASCII).split("\n")) {
            line = line.trim();
            if (line.isEmpty()) continue;
            try {
                long t = Long.parseLong(line);
                if (t <= now && now - t < WINDOW) out.add(t);
            } catch (NumberFormatException ignored) {
                // truncated line: ignored
            }
        }
        return out;
    }
}
