// Platform adapter: the only door from the interface to the outside world.
// On the web (mock-up): everything is simulated, except film links (opened in a new tab, for testing).
// In the Android launcher: a `window.Android` bridge exposed by the WebView, limited to explicit actions
// (launch an app by package, switch HDMI input, open an allow-listed link in the app that owns it, open one of
// the TV's own settings screens, take or give back the Home key).
// No arbitrary URL, no network access, no data transmitted beyond the app name and the configured link.
//
// Every action returns the same shape, so a screen never compares raw strings:
//   { status: 'bridge' | 'failed' | 'simulated' | 'opened', error: string | null, hint: string | null, missing?: true }
//   - 'bridge'    the TV took the call ({ok:true} from Bridge.java); `hint` carries its optional hint
//   - 'failed'    the TV answered {ok:false} or did not answer at all; `error` is the sentence for the Howler
//   - 'simulated' no bridge (the mock-up): nothing happened, the screen plays its animation alone
//   - 'opened'    the mock-up opened the link in a new tab
// Lists read from the TV (installed apps, HDMI inputs, banners) are cached until Platform.refresh(), which the
// router calls before every screen mount: one bridge call per screen, never one per cell.

const bridge = () => (typeof window !== 'undefined' && window.Android && typeof window.Android.launch === 'function') ? window.Android : null;
// Allowed hosts for content links (config.js). Any other link is refused, even if it comes from storage.
// Exact copy of Apps.URL_HOSTS (android/src/.../Apps.java): keep both lists identical.
const URL_HOSTS = new Set(['www.max.com', 'play.max.com', 'www.netflix.com', 'www.primevideo.com', 'www.disneyplus.com', 'www.youtube.com',
  'www.canalplus.com', 'canalplus.com']);
const NO_ANSWER = 'La télé n’a pas répondu.';
const PKG_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;

export function allowedUrl(url) {
  try { const u = new URL(String(url)); return (u.protocol === 'https:' && URL_HOSTS.has(u.hostname)) ? u.href : null; } catch (e) { return null; }
}

const simulated = () => ({ status: 'simulated', error: null, hint: null });
const failed = (error, extra) => ({ status: 'failed', error: error || NO_ANSWER, hint: null, ...(extra || {}) });

// The one sentence for an app that is not on this TV (the Howler reads it; `missing` offers "Retirer du parapet").
const notInstalled = (app) => failed(`${(app && app.name) || 'Cette appli'} n’est pas installée sur cette télé.`, { missing: true });

// Calls a bridge method and turns its JSON answer into a result object. Never throws.
// The method is called ON the bridge object (b[method](...)): the WebView's Java bridge refuses a detached call
// (`const f = b.launch; f()` throws), which is what broke every launch, film, HDMI input and settings screen on the TV.
// `app` (optional) names the app in the "not installed" sentence.
function call(method, args, app) {
  const b = bridge();
  if (!b || typeof b[method] !== 'function') return failed(NO_ANSWER);
  try {
    const raw = b[method](...args);
    const r = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (r && r.ok) return { status: 'bridge', error: null, hint: typeof r.hint === 'string' ? r.hint : null };
    const error = r && typeof r.error === 'string' && r.error ? r.error : NO_ANSWER;
    if (/install/i.test(error)) return app ? notInstalled(app) : failed(error, { missing: true });
    return failed(error);
  } catch (e) {
    return failed(NO_ANSWER);
  }
}

// Reads a JSON array from a bridge method; null if the method is missing or the answer is not an array.
function readList(b, method) {
  if (!b || typeof b[method] !== 'function') return null;
  try { const v = JSON.parse(b[method]()); return Array.isArray(v) ? v : null; } catch (e) { return null; }
}

let appsCache;        // undefined = not read since the last refresh; null = no list; array of { pkg, label, system }
let installedCache;   // idem for the Set of installed packages built from it
let inputsCache;      // idem for the HDMI inputs: array of { id, port, label, connected }
const iconCache = new Map();

export const Platform = {
  isTV: () => Boolean(bridge()),
  status: (r) => (r && typeof r.status === 'string' ? r.status : 'simulated'),

  // Forgets the lists read from the TV (called by the router before each mount).
  refresh() { appsCache = undefined; installedCache = undefined; inputsCache = undefined; },

  // Launches an app (package) or switches to its HDMI input.
  launch(app) {
    const b = bridge();
    if (!b) return simulated();
    if (app && app.pkg) {
      if (!this.has(app)) return notInstalled(app);
      return call('launch', [String(app.pkg)], app);
    }
    if (app && app.input && typeof b.switchInput === 'function') return call('switchInput', [String(app.input)]);
    if (app && app.live && typeof b.liveTv === 'function') return call('liveTv', []);
    return failed(app && app.custom ? 'La Carte ne connaît pas le chemin de cette appli.' : 'Cette source n’est pas raccordée.');
  },

  // Opens a specific piece of content: `item.url` (host allow-list) in the app that owns it.
  // Must be called from a user gesture (OK), otherwise the browser blocks the opening in the mock-up.
  // `item.urls[app.id]` (one link per app) wins over `item.url`; an app with no link for this film simply opens.
  openContent(app, item) {
    const chosen = item && item.urls && app && item.urls[app.id];
    const url = allowedUrl(chosen || (item && app && item.app === app.id ? item.url : null));
    const b = bridge();
    if (b && app && app.pkg && !this.has(app)) return notInstalled(app);
    if (url && b && typeof b.openUrl === 'function') {
      const r = call('openUrl', [url, String(app.pkg || '')], app);
      // The link was refused for another reason (an older APK without this host, the app not taking the link):
      // the app still opens on its home screen rather than nothing at all (`hint: 'app'` says so).
      if (r.status === 'failed' && !r.missing && app && app.pkg) { const l = this.launch(app); if (l.status === 'bridge') return { ...l, hint: l.hint || 'app' }; }
      return r;
    }
    if (url && b) return this.launch(app);
    if (url) {
      // Mock-up: a new tab. window.open first, then a real anchor click (some frames only allow that); if both are
      // blocked (popup blocker, sandboxed frame), say so instead of pretending the film opened.
      try { const w = window.open(url, '_blank', 'noopener'); if (w) return { status: 'opened', error: null, hint: null }; } catch (e) { /* blocked: try the anchor */ }
      try {
        const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.style.display = 'none';
        document.body.appendChild(a); a.click(); a.remove();
        return { status: 'opened', error: null, hint: null };
      } catch (e) { /* blocked too */ }
      return failed('Le navigateur a bloqué l’ouverture du lien (fenêtre surgissante). Sur la télé, le film s’ouvre dans l’appli.');
    }
    return this.launch(app);
  },

  // The apps actually installed, with the label the TV gives them: [{ pkg, label, system }], or null in the mock-up.
  apps() {
    if (appsCache !== undefined) return appsCache;
    const b = bridge();
    let list = readList(b, 'installedApps');
    if (!list) { const pkgs = readList(b, 'installedPackages'); list = pkgs ? pkgs.map((p) => ({ pkg: p, label: '' })) : null; }
    appsCache = list ? list.filter((a) => a && typeof a.pkg === 'string' && PKG_RE.test(a.pkg))
      .map((a) => ({ pkg: a.pkg, label: typeof a.label === 'string' ? a.label.trim() : '', system: Boolean(a.system) })) : null;
    return appsCache;
  },
  // Set of installed packages (the mock-up says "all": null). Cached until refresh(), like apps().
  installed() {
    if (installedCache !== undefined) return installedCache;
    const a = this.apps();
    installedCache = a ? new Set(a.map((x) => x.pkg)) : null;
    return installedCache;
  },
  installedPackages() { return this.installed(); },
  // Is this app on this TV? true in the mock-up (no list), for an HDMI input or the live TV (no package), and when
  // the TV could not give its list (unknown: never block on a guess); false only when the list says it is absent.
  has(app) {
    if (!app) return false;
    if (!app.pkg) return true;
    const inst = this.installed();
    return !inst || inst.has(String(app.pkg));
  },

  // The TV's HDMI ports: [{ id, port, label, connected }] sorted by port, or null in the mock-up.
  inputs() {
    if (inputsCache !== undefined) return inputsCache;
    const list = readList(bridge(), 'inputs');
    inputsCache = list ? list.filter((p) => p && typeof p.id === 'string' && Number.isInteger(p.port) && p.port > 0 && p.port < 100)
      .map((p) => ({ id: p.id, port: p.port, label: typeof p.label === 'string' && p.label.trim() ? p.label.trim().slice(0, 20) : `HDMI ${p.port}`, connected: p.connected !== false }))
      .sort((a, b) => a.port - b.port) : null;
    return inputsCache;
  },
  hasLiveTv() { const b = bridge(); try { return Boolean(b && typeof b.hasLiveTv === 'function' && String(b.hasLiveTv()) === 'true'); } catch (e) { return false; } },
  liveTv() { const b = bridge(); return b && typeof b.liveTv === 'function' ? call('liveTv', []) : simulated(); },

  // The app's banner as a data URI (TV only), memoised; null when the TV has none.
  appIcon(pkg) {
    const b = bridge();
    if (!b || typeof b.appIcon !== 'function' || !PKG_RE.test(String(pkg))) return null;
    if (iconCache.has(pkg)) return iconCache.get(pkg);
    let uri = null;
    try { const v = b.appIcon(String(pkg)); uri = typeof v === 'string' && v.startsWith('data:image/') ? v : null; } catch (e) { uri = null; }
    iconCache.set(pkg, uri);
    return uri;
  },

  // Home key: 'poudlard' asks the system for the HOME role, 'original' gives it back. `hint` says what the TV did.
  setHome(mode) { const b = bridge(); return b && typeof b.setHome === 'function' ? call('setHome', [String(mode)]) : simulated(); },
  homeMode() { const b = bridge(); try { return b && typeof b.homeMode === 'function' ? String(b.homeMode()) : 'simulated'; } catch (e) { return 'original'; } },

  // One of the TV's own settings screens (Apps.SYSTEM keys: settings, wifi, bluetooth, picture, sound, apps, date,
  // language, accessibility, update, about, appinfo + package). Opens the TV's screen; changes nothing itself.
  openSystem(key, arg) { const b = bridge(); return b && typeof b.openSystem === 'function' ? call('openSystem', [String(key), arg == null ? '' : String(arg)]) : simulated(); },
  // The TV's app store (Play Store, or Amazon's on Fire TV).
  store() { const b = bridge(); return b && typeof b.store === 'function' ? call('store', []) : simulated(); },
  version() { const b = bridge(); try { return b && typeof b.version === 'function' ? String(b.version()) : null; } catch (e) { return null; } },
  // What the TV is ({ manufacturer, model, sdk, fireTv, lowRam, leanback, tv, phone }), memoised; {} in the mock-up.
  device() {
    if (deviceCache) return deviceCache;
    const b = bridge();
    let d = {};
    try { if (b && typeof b.device === 'function') { const v = JSON.parse(b.device()); if (v && typeof v === 'object') d = v; } } catch (e) { d = {}; }
    deviceCache = { manufacturer: String(d.manufacturer || ''), model: String(d.model || ''), sdk: Number(d.sdk) || 0, fireTv: Boolean(d.fireTv), lowRam: Boolean(d.lowRam), leanback: Boolean(d.leanback), tv: Boolean(d.tv), phone: Boolean(d.phone) };
    return deviceCache;
  },
  // A fatal error on the page, counted by the TV's guard (three in five minutes give the Home key back).
  fatal(reason) { const b = bridge(); if (b && typeof b.fatal === 'function') { try { b.fatal(String(reason).slice(0, 200)); } catch (e) { /* the guard is not reachable: nothing else to do */ } } },
};
let deviceCache = null;
