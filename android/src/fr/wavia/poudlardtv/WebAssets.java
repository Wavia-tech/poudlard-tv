package fr.wavia.poudlardtv;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Serves the web mock-up from assets/web/ under a fake https origin (https://poudlard.invalid/…), with no network:
 * this is what WebViewAssetLoader (AndroidX) does, rewritten in 60 lines to have no library at all.
 *
 * Why not file:///android_asset/? ES modules (`<script type="module">`) are refused under file:// by
 * Chromium ("null" origin, CORS check), and `setAllowUniversalAccessFromFileURLs` is discouraged. A clean
 * https origin sorts out modules, localStorage (persistent per origin) and Web Audio.
 *
 * Why "poudlard.invalid"? The .invalid top-level domain is reserved (RFC 2606): it can never
 * name a real site, so the fake origin can never collide with anyone (same principle as AndroidX's reserved
 * host appassets.androidplatform.net). Caution: the WebView's localStorage (the config.js configuration) is
 * tied to this origin; changing HOST would lose the configuration saved on the TV.
 *
 * No request actually leaves: everything aimed at HOST is answered here; everything else (e.g. fonts.googleapis.com,
 * as long as the fonts are not embedded) gets an empty response, and the APK has no INTERNET anyway.
 */
final class WebAssets {
    static final String HOST = "poudlard.invalid";
    static final String ROOT = "https://" + HOST + "/";
    private static final String ASSET_DIR = "web";
    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("mjs", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("jpg", "image/jpeg");
        MIME.put("jpeg", "image/jpeg");
        MIME.put("webp", "image/webp");
        MIME.put("gif", "image/gif");
        MIME.put("ico", "image/x-icon");
        MIME.put("woff2", "font/woff2");
        MIME.put("woff", "font/woff");
        MIME.put("ttf", "font/ttf");
        MIME.put("otf", "font/otf");
        // Personal background music (app/assets/music/, outside the repo): <audio> needs the right type to play it.
        MIME.put("mp3", "audio/mpeg");
        MIME.put("ogg", "audio/ogg");
        MIME.put("oga", "audio/ogg");
        MIME.put("m4a", "audio/mp4");
        MIME.put("aac", "audio/aac");
        MIME.put("wav", "audio/wav");
        MIME.put("flac", "audio/flac");
        MIME.put("txt", "text/plain");
        MIME.put("xml", "application/xml");
    }

    private final AssetManager assets;

    WebAssets(AssetManager assets) {
        this.assets = assets;
    }

    /** The entry page: tv.html (full screen, no test bench) if it exists, otherwise index.html. */
    String entryUrl() {
        return ROOT + (exists("tv.html") ? "tv.html" : "index.html");
    }

    boolean exists(String path) {
        try (InputStream in = assets.open(ASSET_DIR + "/" + path)) {
            return in != null;
        } catch (IOException e) {
            return false;
        }
    }

    /** Response for a WebView request: the file, 404 if missing, or empty for any foreign host. */
    WebResourceResponse intercept(WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (uri == null || !HOST.equals(uri.getHost())) return empty();
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (path.startsWith("/")) path = path.substring(1);
        if (path.isEmpty()) path = "index.html";
        if (path.contains("..")) return notFound();
        String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
        try {
            InputStream in = assets.open(ASSET_DIR + "/" + path);
            boolean text = mime.startsWith("text/") || mime.endsWith("json") || mime.endsWith("xml");
            WebResourceResponse r = new WebResourceResponse(mime, text ? "utf-8" : null, in);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            r.setResponseHeaders(headers);
            return r;
        } catch (IOException e) {
            return notFound();
        }
    }

    private static WebResourceResponse notFound() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
        r.setStatusCodeAndReasonPhrase(404, "Not Found");
        return r;
    }

    /** Empty response for any foreign host: the page carries on without the resource (fonts → system fallback). */
    private static WebResourceResponse empty() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
        r.setStatusCodeAndReasonPhrase(204, "No Content");
        return r;
    }
}
