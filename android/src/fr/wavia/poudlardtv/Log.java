package fr.wavia.poudlardtv;

/**
 * Journal minimal vers logcat (tag unique « PoudlardTV »), à la manière de AppLog dans Free My TV.
 * Rien n'est écrit sur disque, rien ne quitte l'appareil : `adb logcat -s PoudlardTV` suffit pour déboguer.
 */
final class Log {
    private static final String TAG = "PoudlardTV";

    private Log() {}

    static void i(String message) {
        android.util.Log.i(TAG, message);
    }

    static void w(String message) {
        android.util.Log.w(TAG, message);
    }

    static void w(String message, Throwable t) {
        android.util.Log.w(TAG, message, t);
    }
}
