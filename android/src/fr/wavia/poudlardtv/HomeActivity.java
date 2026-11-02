package fr.wavia.poudlardtv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * L'accueil. Une WebView plein écran qui charge la maquette (assets/web/) et lui donne le pont `window.Android`.
 *
 * Structure reprise de HomeActivity.java de Free My TV (Copyright (c) 2026 Free My TV contributors, licence MIT :
 * texte complet dans android/README.md, section « Licence de Free My TV ») : garde-fou d'abord, test « trop de
 * plantages », puis l'interface ; la touche Home arrive dans onNewIntent ; onResume force l'opacité sur TCL.
 *
 * Touches : les flèches et OK arrivent nativement dans la page (la WebView les traduit en ArrowLeft…, Enter).
 * Retour et Menu sont capturés ici (sinon Retour fermerait l'activité) et rejoués dans la page comme des
 * KeyboardEvent « Escape » / « ContextMenu », appui ET relâchement, pour que l'appui long de input.js fonctionne.
 *
 * Veille : aucun FLAG_KEEP_SCREEN_ON. Un accueil est l'écran affiché par défaut ; la télé garde son économiseur
 * et sa mise en veille exactement comme avant (règle de réversibilité, docs/FREE-MY-TV.md §10).
 */
public final class HomeActivity extends Activity {
    private static final String JS_KEY =
            "(function(k,t){try{document.dispatchEvent(new KeyboardEvent(t,{key:k,bubbles:true,cancelable:true,repeat:%s}))}catch(e){}})('%s','%s');";

    private WebView web;
    private Apps apps;
    private WebAssets assets;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Watchdog.install(this);
        hideSystemUi();

        apps = new Apps(this);
        assets = new WebAssets(getAssets());

        if (Watchdog.crashedTooOften(this)) {
            // Trop de plantages : on ne reconstruit pas l'interface, on explique et on laisse l'original reprendre.
            HomeMode.giveBackHome(this);
            setContentView(crashedView());
            return;
        }
        if (!assets.exists("index.html")) {
            setContentView(noticeView(getString(R.string.missing_web)));
            return;
        }
        web = buildWebView();
        setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(assets.entryUrl());
    }

    private WebView buildWebView() {
        WebView v = new WebView(this);
        v.setBackgroundColor(Color.rgb(0x07, 0x0B, 0x14));
        v.setFocusable(true);
        v.setFocusableInTouchMode(true);
        WebSettings s = v.getSettings();
        s.setJavaScriptEnabled(true);           // la maquette est en JS ; le pont est le seul accès à la télé
        s.setDomStorageEnabled(true);           // localStorage : la config de config.js, liée à l'origine WebAssets.ROOT
        s.setMediaPlaybackRequiresUserGesture(false); // Web Audio (sound.js) dès la première touche de la télécommande
        s.setAllowFileAccess(false);            // tout passe par WebAssets, jamais par file://
        s.setAllowContentAccess(false);
        s.setBlockNetworkLoads(true);           // obligatoire sans INTERNET ; shouldInterceptRequest reste appelé
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setGeolocationEnabled(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        v.addJavascriptInterface(new Bridge(this, apps), "Android");
        v.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assets.intercept(request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // La page ne navigue jamais ailleurs : un lien externe passe par Android.openUrl, pas par la WebView.
                return request.getUrl() == null || !WebAssets.HOST.equals(request.getUrl().getHost());
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Le moteur de rendu est mort (mémoire, bug) : c'est un plantage comme un autre pour le garde-fou.
                // Contrat Android : quand on renvoie true, la WebView concernée doit être retirée ET détruite ici.
                Log.w("moteur WebView perdu (crash=" + (detail != null && detail.didCrash()) + ")");
                int n = Watchdog.record(HomeActivity.this);
                dropWebView();
                if (n >= Watchdog.LIMIT) {
                    HomeMode.giveBackHome(HomeActivity.this);
                    setContentView(crashedView());
                } else {
                    recreate();
                }
                return true; // on a géré : l'appli ne doit pas être tuée par le système
            }
        });
        return v;
    }

    /** Détache et détruit la WebView, puis l'oublie : plus aucune touche ne lui est rejouée, onDestroy n'y touche plus. */
    private void dropWebView() {
        if (web == null) return;
        WebView v = web;
        web = null;
        try {
            if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
        } catch (RuntimeException e) {
            Log.w("détachement de la WebView", e);
        }
        try {
            v.destroy();
        } catch (RuntimeException e) {
            Log.w("destruction de la WebView", e);
        }
    }

    // ---------------------------------------------------------------- touches

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Sans WebView (écran de secours natif), les touches vont aux boutons natifs.
        if (web == null) return super.dispatchKeyEvent(event);
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                key = "Escape";
                break;
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_SETTINGS:
                key = "ContextMenu";
                break;
            default:
                return super.dispatchKeyEvent(event);
        }
        int action = event.getAction();
        if (action == KeyEvent.ACTION_DOWN) {
            sendKey(key, "keydown", event.getRepeatCount() > 0);
        } else if (action == KeyEvent.ACTION_UP) {
            sendKey(key, "keyup", false);
        }
        return true; // consommé : Retour ne ferme jamais l'accueil
    }

    private void sendKey(String key, String type, boolean repeat) {
        if (web == null) return;
        web.evaluateJavascript(String.format(JS_KEY, repeat ? "true" : "false", key, type), null);
    }

    /** La touche Home relance l'activité (singleTask) : on remet l'accueil à son état d'entrée, comme Free My TV. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null && intent != null && Intent.ACTION_MAIN.equals(intent.getAction())
                && intent.hasCategory(Intent.CATEGORY_HOME)) {
            sendKey("Home", "keydown", false);
            sendKey("Home", "keyup", false);
        }
    }

    @Override
    public void onBackPressed() {
        // Jamais : Retour est géré dans dispatchKeyEvent. Un accueil ne se ferme pas.
        // Sur l'écran de secours (web == null), Retour ne fait rien non plus : les deux boutons disent quoi faire.
    }

    // ---------------------------------------------------------------- cycle de vie

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        // TCL Android 11+ garde l'appli précédente visible par-dessus un accueil translucide (retour terrain Free My TV).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && "TCL".equalsIgnoreCase(Build.MANUFACTURER)) {
            try { setTranslucent(false); } catch (RuntimeException ignored) { /* pas disponible partout */ }
        }
        if (web != null) {
            web.onResume();
            web.resumeTimers();
            web.requestFocus();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            // Pause totale quand l'accueil n'est pas visible : ni animation, ni audio, ni timer (règle du README).
            web.pauseTimers();
            web.onPause();
        }
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        dropWebView(); // sans effet si l'écran de secours l'a déjà fait
        super.onDestroy();
    }

    private void hideSystemUi() {
        View decor = getWindow().getDecorView();
        decor.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }

    // ---------------------------------------------------------------- écrans de secours (natifs, sans WebView)

    /**
     * Après trois plantages : un texte, deux boutons. Rien d'autre ne peut planter.
     *  - « Ouvrir l'accueil d'origine » : la porte HOME reste désactivée, l'accueil d'origine est lancé.
     *  - « Réessayer Poudlard TV » : efface le compteur et reconstruit l'interface. La porte HOME reste désactivée
     *    tant que la personne n'a pas refait « Faire de Poudlard l'accueil » dans les réglages : la sécurité est gardée.
     */
    private View crashedView() {
        LinearLayout box = column();
        box.addView(label(getString(R.string.crashed_title), 30, 0xFFF1D58A));
        box.addView(label(getString(R.string.crashed_body), 22, 0xFFF1EBDD));
        Button original = button(getString(R.string.crashed_button), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                HomeMode.giveBackHome(HomeActivity.this);
                finish();
            }
        });
        Button retry = button(getString(R.string.crashed_retry), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Watchdog.clear(HomeActivity.this);
                recreate();
            }
        });
        box.addView(original);
        box.addView(retry);
        original.requestFocus();
        return box;
    }

    private View noticeView(String text) {
        LinearLayout box = column();
        box.addView(label(text, 24, 0xFFF1EBDD));
        return box;
    }

    private Button button(String text, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(text);
        b.setTextSize(22);
        b.setFocusable(true);
        b.setOnClickListener(onClick);
        return b;
    }

    private LinearLayout column() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.rgb(0x07, 0x0B, 0x14));
        int pad = 96;
        box.setPadding(pad, pad, pad, pad);
        return box;
    }

    private TextView label(String text, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(text);
        t.setTextSize(sp);
        t.setTextColor(color);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, 0, 0, 32);
        return t;
    }
}
