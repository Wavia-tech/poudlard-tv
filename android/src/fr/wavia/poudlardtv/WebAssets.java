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
        // Background music (app/assets/music/): <audio> needs the right type to play it.
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
        if (mime.startsWith("audio/") || mime.startsWith("video/")) {
            WebResourceResponse media = media(path, mime, request.getRequestHeaders());
            if (media != null) return media;
        }
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

    /**
     * Audio and video with byte ranges (206 Partial Content): the media player reads the 19 MB music file in small
     * pieces and can loop or seek without the whole file going through memory. Only possible for an asset stored
     * uncompressed (build.sh adds assets with `jar -0`), whose length openFd() gives; otherwise null and the caller
     * serves the whole file.
     *
     * The stream handed back starts at byte 0 of the asset, whatever the Range says: the WebView itself skips `start`
     * bytes of it when the request has a Range, then reads on. The headers still describe the range asked for.
     */
    private WebResourceResponse media(String path, String mime, Map<String, String> requestHeaders) {
        long length;
        try (android.content.res.AssetFileDescriptor fd = assets.openFd(ASSET_DIR + "/" + path)) {
            length = fd.getLength();
        } catch (IOException | RuntimeException e) {
            return null;
        }
        if (length <= 0) return null;
        String range = null;
        if (requestHeaders != null) {
            for (Map.Entry<String, String> h : requestHeaders.entrySet()) {
                if ("range".equalsIgnoreCase(h.getKey())) range = h.getValue();
            }
        }
        long start = 0, end = length - 1;
        boolean partial = false;
        if (range != null && range.trim().toLowerCase(Locale.ROOT).startsWith("bytes=")) {
            String spec = range.trim().substring(6).split(",")[0].trim();
            int dash = spec.indexOf('-');
            try {
                if (dash > 0) {
                    start = Long.parseLong(spec.substring(0, dash).trim());
                    String e = spec.substring(dash + 1).trim();
                    if (!e.isEmpty()) end = Math.min(Long.parseLong(e), length - 1);
                    partial = true;
                } else if (dash == 0) {                       // "bytes=-500": the last 500 bytes
                    long n = Long.parseLong(spec.substring(1).trim());
                    start = Math.max(0, length - n);
                    partial = true;
                }
            } catch (NumberFormatException ignored) {
                start = 0;
                end = length - 1;
                partial = false;
            }
        }
        if (start < 0 || start >= length || end < start) {
            Map<String, String> h = new HashMap<>();
            h.put("Content-Range", "bytes */" + length);
            return new WebResourceResponse(mime, null, 416, "Range Not Satisfiable", h, null);
        }
        InputStream in;
        try {
            // Not skipped here (see above). Measured on the TV: a stream already at `start` answered bytes=1000-2023
            // with 24 bytes, <audio> failed, and the synthesised waltz played instead.
            in = assets.open(ASSET_DIR + "/" + path, AssetManager.ACCESS_RANDOM);
        } catch (IOException e) {
            return null;
        }
        Map<String, String> h = new HashMap<>();
        h.put("Cache-Control", "no-store");
        h.put("Accept-Ranges", "bytes");
        h.put("Content-Length", String.valueOf(end - start + 1));
        if (partial) h.put("Content-Range", "bytes " + start + "-" + end + "/" + length);
        return new WebResourceResponse(mime, null, partial ? 206 : 200, partial ? "Partial Content" : "OK", h,
                new Bounded(in, end + 1));
    }

    /** An InputStream that stops after `left` bytes: from the top of the asset, the last byte of the requested range + 1. */
    private static final class Bounded extends java.io.FilterInputStream {
        private long left;

        Bounded(InputStream in, long left) {
            super(in);
            this.left = left;
        }

        @Override
        public int read() throws IOException {
            if (left <= 0) return -1;
            int b = super.read();
            if (b >= 0) left--;
            return b;
        }

        @Override
        public int read(byte[] buf, int off, int len) throws IOException {
            if (left <= 0) return -1;
            int n = super.read(buf, off, (int) Math.min(len, left));
            if (n > 0) left -= n;
            return n;
        }

        @Override
        public long skip(long n) throws IOException {
            long k = super.skip(Math.min(n, left));
            if (k > 0) left -= k;
            return k;
        }

        @Override
        public int available() throws IOException {
            return (int) Math.min(super.available(), left);
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
