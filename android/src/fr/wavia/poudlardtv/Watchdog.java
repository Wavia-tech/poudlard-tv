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
 * Garde-fou : si l'accueil plante 3 fois en 5 minutes, il rend la main à l'accueil d'origine de la télé
 * (HomeMode.giveBackHome) et ne réessaie plus tant qu'on ne l'a pas remis volontairement (bouton « Réessayer »
 * de l'écran de secours, ou « Faire de Poudlard l'accueil » dans les réglages ; sinon, la fenêtre de 5 minutes expire).
 *
 * Repris quasi à l'identique de Watchdog.java de Free My TV — Copyright (c) 2026 Free My TV contributors,
 * licence MIT (texte complet dans android/README.md, section « Licence de Free My TV »).
 *
 * Les plantages sont des horodatages, un par ligne, dans files/home-crashes.txt (pas de SharedPreferences : le fichier
 * est lisible même si le processus meurt au milieu d'une écriture, et la lecture est plafonnée à 4 Ko).
 *
 * Compte comme plantage : une exception non rattrapée dans le processus, et la mort du moteur de rendu de la WebView
 * (HomeActivity appelle record() depuis onRenderProcessGone).
 */
final class Watchdog {
    static final int LIMIT = 3;
    static final long WINDOW = 5 * 60_000L;
    private static final String FILE = "home-crashes.txt";
    private static final int MAX_BYTES = 4096;

    private static boolean installed;

    private Watchdog() {}

    /** Pose le gestionnaire d'exceptions une seule fois ; garde l'ancien et le rappelle après (le système affiche sa boîte). */
    static synchronized void install(Context context) {
        if (installed) return;
        installed = true;
        final Context app = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable error) {
                try {
                    Log.w("plantage de l'accueil", error);
                    if (record(app) >= LIMIT) HomeMode.giveBackHome(app);
                } catch (Throwable ignored) {
                    // Rien ne doit empêcher l'ancien gestionnaire de tourner.
                }
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
    }

    /** Enregistre un plantage maintenant et renvoie le nombre de plantages dans la fenêtre. */
    static synchronized int record(Context context) {
        List<Long> recent = recent(context);
        recent.add(System.currentTimeMillis());
        StringBuilder sb = new StringBuilder();
        for (Long t : recent) sb.append(t).append('\n');
        try (FileOutputStream out = new FileOutputStream(file(context))) {
            out.write(sb.toString().getBytes(StandardCharsets.US_ASCII));
        } catch (IOException e) {
            Log.w("impossible d'écrire " + FILE + " : " + e.getMessage());
        }
        return recent.size();
    }

    /** Vrai tant que la fenêtre contient LIMIT plantages : l'accueil ne doit pas se relancer tout seul. */
    static boolean crashedTooOften(Context context) {
        return recent(context).size() >= LIMIT;
    }

    /** À appeler quand la personne remet Poudlard TV comme accueil : on repart de zéro. */
    static synchronized void clear(Context context) {
        File f = file(context);
        if (f.exists() && !f.delete()) Log.w("impossible d'effacer " + FILE);
    }

    private static File file(Context context) {
        return new File(context.getFilesDir(), FILE);
    }

    /** Les horodatages encore dans la fenêtre ; les lignes mal formées et les vieux plantages sont ignorés. */
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
                // ligne tronquée : on l'ignore
            }
        }
        return out;
    }
}
