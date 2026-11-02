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
 * Sert la maquette web depuis assets/web/ sous une origine https factice (https://poudlard.invalid/…), sans réseau :
 * c'est ce que fait WebViewAssetLoader (AndroidX), réécrit en 60 lignes pour n'avoir aucune bibliothèque.
 *
 * Pourquoi pas file:///android_asset/ ? Les modules ES (`<script type="module">`) sont refusés sous file:// par
 * Chromium (origine « null », contrôle CORS), et `setAllowUniversalAccessFromFileURLs` est déconseillé. Une origine
 * https propre règle les modules, le localStorage (persistant par origine) et l'audio Web Audio.
 *
 * Pourquoi « poudlard.invalid » ? Le domaine de premier niveau .invalid est réservé (RFC 2606) : il ne peut jamais
 * désigner un site réel, donc l'origine factice ne peut coïncider avec personne (même principe que l'hôte réservé
 * appassets.androidplatform.net d'AndroidX). Attention : le localStorage de la WebView (la config de config.js) est
 * lié à cette origine ; changer HOST ferait perdre la configuration enregistrée sur la télé.
 *
 * Aucune requête ne part réellement : tout ce qui vise HOST est répondu ici ; tout le reste (ex. fonts.googleapis.com,
 * tant que les polices ne sont pas embarquées) reçoit une réponse vide, et de toute façon l'APK n'a pas INTERNET.
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
        // Musique de fond personnelle (app/assets/music/, hors dépôt) : il faut le bon type pour que <audio> la lise.
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

    /** La page d'entrée : tv.html (plein écran, sans banc d'essai) si elle existe, sinon index.html. */
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

    /** Réponse pour une requête de la WebView : le fichier, 404 s'il manque, ou vide pour tout hôte étranger. */
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

    /** Réponse vide pour tout hôte étranger : la page continue sans la ressource (polices → repli système). */
    private static WebResourceResponse empty() {
        WebResourceResponse r = new WebResourceResponse("text/plain", "utf-8", null);
        r.setStatusCodeAndReasonPhrase(204, "No Content");
        return r;
    }
}
