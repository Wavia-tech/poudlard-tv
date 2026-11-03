package fr.wavia.poudlardtv;

import android.app.Activity;
import android.content.ComponentCallbacks2;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioManager;
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
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

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
 *
 * Memory (a 1.3 GB TV killed the whole app while Netflix played): the WebView has no layer of its own and no
 * offscreen pre-raster; its renderer is IMPORTANT while visible and may be dropped by the system while hidden
 * (setRendererPriorityPolicy). When the system kills that hidden renderer, or asks for memory while we are hidden
 * (onTrimMemory >= MODERATE), the WebView is dropped and rebuilt on the next onResume: the process survives and
 * the next Home press reloads the page instead of cold-starting the app. Every trim is passed on to the page as
 * window 'poudlard:trim' (detail.level = the Android level) so it can drop its caches.
 */
public final class HomeActivity extends Activity {
    private static final String JS_KEY =
            "(function(k,t){try{document.dispatchEvent(new KeyboardEvent(t,{key:k,bubbles:true,cancelable:true,repeat:%s}))}catch(e){}})('%s','%s');";

    /** Back held this long opens the native rescue screen, whatever the page is doing (a frozen WebView included). */
    private static final long RESCUE_HOLD_MS = 6000;

    private static final int NIGHT = Color.rgb(0x07, 0x0B, 0x14);

    private WebView web;
    private Apps apps;
    private WebAssets assets;
    private View rescue;
    /** The WebView was dropped while hidden (renderer killed, or memory trim): rebuild it on the next onResume. */
    private boolean reloadOnResume;
    private boolean visible;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Watchdog.install(this);
        getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(NIGHT)); // no white flash
        setVolumeControlStream(AudioManager.STREAM_MUSIC);   // the remote's volume keys act on the music and the cues

        apps = new Apps(this);
        assets = new WebAssets(getAssets());

        if (Watchdog.crashedTooOften(this)) {
            // Too many crashes: we do not rebuild the interface, we explain and let the original take over.
            HomeMode.giveBackHome(this, true);
            setContentView(crashedView());
            return;
        }
        if (Watchdog.reverted(this) && launchedAsHome()) {
            // Sticky revert: reached through the HOME intent after the guard fired (an OTA re-enabled the alias, say).
            // Opening Poudlard TV from the app list (.Start) still shows the interface, as Free My TV does.
            setContentView(crashedView());
            return;
        }
        if (!assets.exists("index.html")) {
            setContentView(noticeView(getString(R.string.missing_web)));
            return;
        }
        loadWeb();       // as early as possible: the page starts loading before anything else is done
        hideSystemUi();
        rememberOriginalHome();
    }

    /** Builds the WebView, puts it on screen and starts loading the page. */
    private void loadWeb() {
        reloadOnResume = false;
        web = buildWebView();
        web.loadUrl(assets.entryUrl());
        setContentView(web, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.requestFocus();
    }

    /**
     * While our HOME entry point is closed, whatever answers the Home key is the person's own home (Free My TV,
     * Google TV...): it is recorded (HomeMode.recordOriginalHome) so « Accueil d'origine » can go back to it. Off the
     * UI thread: a package-manager call and a small file must not delay the first frame.
     */
    private void rememberOriginalHome() {
        final android.content.Context app = getApplicationContext();
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (!HomeMode.homeAliasEnabled(app)) HomeMode.recordOriginalHome(app);
                } catch (Throwable e) {
                    Log.w("recording the original home", e);
                }
            }
        }, "poudlard-home");
        t.setPriority(Thread.MIN_PRIORITY);
        t.start();
    }

    private WebView buildWebView() {
        WebView v = new WebView(this);
        v.setBackgroundColor(NIGHT);
        // No layer of its own: the WebView draws straight into the window (a hardware layer would add a full-screen
        // offscreen buffer and a copy per frame).
        v.setLayerType(View.LAYER_TYPE_NONE, null);
        // Renderer kept alive while visible; when hidden (Netflix in front) the system may reclaim it first.
        v.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
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
        s.setOffscreenPreRaster(false);         // never rasterise what is off screen (memory)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            s.setForceDark(WebSettings.FORCE_DARK_OFF);
        }
        v.addJavascriptInterface(new Bridge(this, apps), "Android");   // keeps only a WeakReference to this activity
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
                // Android contract: when returning true, the affected WebView must be removed AND destroyed here.
                boolean crashed = detail != null && detail.didCrash();
                Log.w("WebView render engine lost (crash=" + crashed + ", visible=" + visible + ")");
                if (view != web) {            // an old WebView already dropped: just destroy it
                    destroyQuietly(view);
                    return true;
                }
                dropWebView();
                hideRescue();                 // the rescue overlay belonged to the lost page
                if (!crashed && !visible) {
                    // Reclaimed by the system while another app is in front: not a crash. Rebuilt on the next onResume.
                    reloadOnResume = true;
                    setContentView(blankView());
                    return true;
                }
                // A real crash, or killed while on screen: for the safeguard it counts like any other crash.
                int n = Watchdog.record(HomeActivity.this);
                if (n >= Watchdog.LIMIT) {
                    HomeMode.giveBackHome(HomeActivity.this, true);
                    setContentView(crashedView());
                } else {
                    loadWeb();                // a new WebView, a new renderer, the page reloads; the app keeps running
                }
                return true; // handled: the app must not be killed by the system
            }
        });
        return v;
    }

    /** Detaches and destroys the WebView, then forgets it: no key is replayed to it any more, onDestroy leaves it alone. */
    private boolean launchedAsHome() {
        Intent i = getIntent();
        return i != null && Intent.ACTION_MAIN.equals(i.getAction()) && i.hasCategory(Intent.CATEGORY_HOME);
    }

    private void dropWebView() {
        if (web == null) return;
        WebView v = web;
        web = null;
        destroyQuietly(v);
    }

    private static void destroyQuietly(WebView v) {
        if (v == null) return;
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

    /** What stays on screen while the WebView is dropped in the background: the night colour, nothing else. */
    private View blankView() {
        View v = new View(this);
        v.setBackgroundColor(NIGHT);
        return v;
    }

    // ---------------------------------------------------------------- keys

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        // Without a WebView (native fallback screen), or while the rescue screen is up, keys go to the native buttons.
        if (web == null || rescue != null) return super.dispatchKeyEvent(event);
        // Back held 6 s: the rescue screen, native, independent of the page.
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN
                && event.getRepeatCount() > 0 && event.getEventTime() - event.getDownTime() >= RESCUE_HOLD_MS) {
            showRescue();
            return true;
        }
        String key = null;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:
                key = "Escape";
                break;
            case KeyEvent.KEYCODE_MENU:
                key = "ContextMenu";
                break;
            case KeyEvent.KEYCODE_SETTINGS:
                // The remote's Settings key opens the TV's own settings, as Free My TV does; Hisense and TCL
                // handle that key themselves (their system menu), so there it is left to the system.
                if (settingsKeyIsOurs()) {
                    if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) apps.openSystem("settings", null);
                    return true;
                }
                return super.dispatchKeyEvent(event);
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

    private static boolean settingsKeyIsOurs() {
        String m = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER;
        return !"Hisense".equalsIgnoreCase(m) && !"TCL".equalsIgnoreCase(m);
    }

    private void sendKey(String key, String type, boolean repeat) {
        if (web == null) return;
        web.evaluateJavascript(String.format(JS_KEY, repeat ? "true" : "false", key, type), null);
    }

    /**
     * The system's HOME role dialog answered (HomeMode.requestHome). Declined: the HOME entry point is closed again
     * (HomeMode.afterRoleDialog), so the TV does not start asking "which home app?". Then the page repaints its
     * "Touche Home" row.
     */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != HomeMode.REQUEST_ROLE) return;
        try {
            HomeMode.afterRoleDialog(this);
        } catch (RuntimeException e) {
            Log.w("after the role dialog", e);
        }
        if (web == null) return;
        boolean held = HomeMode.POUDLARD.equals(HomeMode.mode(this));
        web.evaluateJavascript("document.dispatchEvent(new CustomEvent('poudlard:home',{detail:{held:" + held + "}}))", null);
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
        visible = true;
        hideSystemUi();
        if (web == null && reloadOnResume && rescue == null) loadWeb();
        // TCL Android 11+ keeps the previous app visible over a translucent home (Free My TV field report).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && "TCL".equalsIgnoreCase(Build.MANUFACTURER)) {
            try { setTranslucent(false); } catch (RuntimeException ignored) { /* not available everywhere */ }
        }
        if (web != null) {
            web.onResume();
            web.resumeTimers();
            web.requestFocus();
            checkLostHome();
        }
    }

    private Boolean lastLost;

    /**
     * No boot receiver here (rule): instead, each time the home comes back, it checks whether the HOME role was
     * lost while our alias is still enabled (a TV update resets the role). When that state changes, the page is told
     * ('poudlard:home' with lost:true) and offers to ask for the key again, once a day at most (home.js).
     */
    private void checkLostHome() {
        boolean lost;
        try {
            lost = HomeMode.homeAliasEnabled(this) && !HomeMode.POUDLARD.equals(HomeMode.mode(this)) && !Watchdog.reverted(this);
        } catch (RuntimeException e) {
            return;
        }
        if (lastLost != null && lastLost == lost) return;
        lastLost = lost;
        if (web != null && lost) {
            web.evaluateJavascript("document.dispatchEvent(new CustomEvent('poudlard:home',{detail:{held:false,lost:true}}))", null);
        }
    }

    @Override
    protected void onPause() {
        visible = false;
        if (web != null) {
            // Full pause when the home is not visible: no animation, no audio, no timer (README rule).
            web.pauseTimers();
            web.onPause();
        }
        super.onPause();
    }

    /**
     * The system is short of memory. The page is told first (window 'poudlard:trim', detail.level) so it can drop
     * its caches. While hidden and at MODERATE or worse (the next step is killing the whole app), the WebView is
     * dropped: its renderer's memory goes back to the app in front, and the page reloads on the next onResume.
     */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (web == null) return;
        try {
            web.evaluateJavascript("window.dispatchEvent(new CustomEvent('poudlard:trim',{detail:{level:" + level + "}}))", null);
        } catch (RuntimeException e) {
            Log.w("telling the page about the memory trim", e);
        }
        if (!visible && level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE && rescue == null) {
            Log.i("memory trim " + level + " while hidden: WebView dropped, reloaded on the next onResume");
            dropWebView();
            reloadOnResume = true;
            setContentView(blankView());
        }
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
     *    until the person sets « Touche Home : Poudlard TV » again in the settings: the safety net is kept.
     */
    private View crashedView() {
        LinearLayout box = column();
        box.addView(label(getString(R.string.crashed_title), 30, 0xFFF1D58A));
        box.addView(label(getString(R.string.crashed_body), 22, 0xFFF1EBDD));
        Button original = button(getString(R.string.crashed_button), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (HomeMode.giveBackHome(HomeActivity.this)) finish();
                else noOtherHome();
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

    /**
     * The rescue screen (Back held 6 s): four buttons over the WebView, nothing else can fail here.
     *  « Reprendre » closes it; « Recharger Poudlard TV » rebuilds the WebView; « Ouvrir l'accueil d'origine »
     *  gives the Home key back; « Réglages de la télé » opens the TV's own settings.
     */
    private void showRescue() {
        if (rescue != null) return;
        LinearLayout box = column();
        box.addView(label(getString(R.string.rescue_title), 28, 0xFFF1D58A));
        Button resume = button(getString(R.string.rescue_resume), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideRescue();
            }
        });
        Button reload = button(getString(R.string.rescue_reload), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideRescue();
                dropWebView();
                loadWeb();
            }
        });
        Button original = button(getString(R.string.crashed_button), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (HomeMode.giveBackHome(HomeActivity.this)) hideRescue();
                else noOtherHome();
            }
        });
        Button settings = button(getString(R.string.rescue_settings), new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                hideRescue();
                apps.openSystem("settings", null);
            }
        });
        box.addView(resume);
        box.addView(reload);
        box.addView(original);
        box.addView(settings);
        FrameLayout over = new FrameLayout(this);
        over.setBackgroundColor(0xE6070B14);
        over.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        rescue = over;
        addContentView(over, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        resume.requestFocus();
    }

    private void hideRescue() {
        if (rescue == null) return;
        View v = rescue;
        rescue = null;
        try {
            if (v.getParent() instanceof ViewGroup) ((ViewGroup) v.getParent()).removeView(v);
        } catch (RuntimeException e) {
            Log.w("closing the rescue screen", e);
        }
        if (web != null) web.requestFocus();
    }

    /** Nothing could be launched: say so, the screen stays (its other buttons still work). */
    private void noOtherHome() {
        try {
            Toast.makeText(this, R.string.no_other_home, Toast.LENGTH_LONG).show();
        } catch (RuntimeException e) {
            Log.w("toast", e);
        }
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
        box.setBackgroundColor(NIGHT);
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
