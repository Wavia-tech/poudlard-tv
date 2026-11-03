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
 * The home screen. A full-screen WebView that loads the mock-up (assets/web/) and gives it the `window.Android` bridge.
 *
 * Structure taken from Free My TV's HomeActivity.java (Copyright (c) 2026 Free My TV contributors, MIT license:
 * full text in android/README.md, section "Free My TV license"): safeguard first, "too many crashes" test,
 * then the interface; the Home key arrives in onNewIntent; onResume forces opacity on TCL.
 *
 * Keys: arrows and OK reach the page natively (the WebView translates them into ArrowLeft…, Enter).
 * Back and Menu are captured here (otherwise Back would close the activity) and replayed into the page as
 * "Escape" / "ContextMenu" KeyboardEvents, key down AND key up, so that the long press in input.js works.
 *
 * Sleep: no FLAG_KEEP_SCREEN_ON. A home screen is the screen shown by default; the TV keeps its screensaver
 * and its standby exactly as before (reversibility rule, docs/FREE-MY-TV.md §10).
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
            // Too many crashes: we do not rebuild the interface, we explain and let the original take over.
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
        s.setJavaScriptEnabled(true);           // the mock-up is JS; the bridge is the only access to the TV
        s.setDomStorageEnabled(true);           // localStorage: the config.js configuration, tied to the WebAssets.ROOT origin
        s.setMediaPlaybackRequiresUserGesture(false); // Web Audio (sound.js) from the first remote key press
        s.setAllowFileAccess(false);            // everything goes through WebAssets, never through file://
        s.setAllowContentAccess(false);
        s.setBlockNetworkLoads(true);           // mandatory without INTERNET; shouldInterceptRequest is still called
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
                // The page never navigates elsewhere: an external link goes through Android.openUrl, not the WebView.
                return request.getUrl() == null || !WebAssets.HOST.equals(request.getUrl().getHost());
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // The render engine died (memory, bug): for the safeguard it is a crash like any other.
                // Android contract: when returning true, the affected WebView must be removed AND destroyed here.
                Log.w("WebView render engine lost (crash=" + (detail != null && detail.didCrash()) + ")");
                int n = Watchdog.record(HomeActivity.this);
                dropWebView();
                if (n >= Watchdog.LIMIT) {
                    HomeMode.giveBackHome(HomeActivity.this);
                    setContentView(crashedView());
                } else {
                    recreate();
                }
                return true; // handled: the app must not be killed by the system
            }
        });
        return v;
    }

    /** Detaches and destroys the WebView, then forgets it: no key is replayed to it any more, onDestroy leaves it alone. */
    private void dropWebView() {
        if (web == null) return;
        WebView v = web;
        web = null;
        try {
            if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
        } catch (RuntimeException e) {
            Log.w("detaching the WebView", e);
        }
        try {
            v.destroy();
        } catch (RuntimeException e) {
            Log.w("destroying the WebView", e);
        }
    }

    // ---------------------------------------------------------------- keys

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Without a WebView (native fallback screen), keys go to the native buttons.
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
        return true; // consumed: Back never closes the home screen
    }

    private void sendKey(String key, String type, boolean repeat) {
        if (web == null) return;
        web.evaluateJavascript(String.format(JS_KEY, repeat ? "true" : "false", key, type), null);
    }

    /** The Home key relaunches the activity (singleTask): we reset the home to its entry state, as Free My TV does. */
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
        // Never: Back is handled in dispatchKeyEvent. A home screen does not close.
        // On the fallback screen (web == null), Back does nothing either: the two buttons say what to do.
    }

    // ---------------------------------------------------------------- lifecycle

    @Override
    protected void onResume() {
        super.onResume();
        hideSystemUi();
        // TCL Android 11+ keeps the previous app visible over a translucent home (Free My TV field report).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && "TCL".equalsIgnoreCase(Build.MANUFACTURER)) {
            try { setTranslucent(false); } catch (RuntimeException ignored) { /* not available everywhere */ }
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
            // Full pause when the home is not visible: no animation, no audio, no timer (README rule).
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
        dropWebView(); // no effect if the fallback screen already did it
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

    // ---------------------------------------------------------------- fallback screens (native, no WebView)

    /**
     * After three crashes: one text, two buttons. Nothing else can crash.
     *  - « Ouvrir l'accueil d'origine » (open the original home): the HOME entry point stays disabled, the original home is launched.
     *  - « Réessayer Poudlard TV » (retry Poudlard TV): clears the counter and rebuilds the interface. The HOME entry point stays disabled
     *    until the person redoes « Faire de Poudlard l'accueil » in the settings: the safety net is kept.
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
