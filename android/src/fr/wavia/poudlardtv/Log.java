package fr.wavia.poudlardtv;

/**
 * Minimal logging to logcat (single tag "PoudlardTV"), in the manner of AppLog in Free My TV.
 * Nothing is written to disk, nothing leaves the device: `adb logcat -s PoudlardTV` is enough to debug.
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
