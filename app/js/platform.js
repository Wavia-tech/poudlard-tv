// Platform adapter: the only door from the interface to the outside world.
// On the web (mock-up): everything is simulated, except film links (opened in a new tab, for testing).
// In the Android launcher: a `window.Android` bridge exposed by the WebView, limited to explicit actions
// (launch an app by package, switch HDMI input, open an allow-listed link in the app that owns it).
// No arbitrary URL, no network access, no data transmitted beyond the app name and the configured link.

const bridge = () => (typeof window !== 'undefined' && window.Android && typeof window.Android.launch === 'function') ? window.Android : null;
// Allowed hosts for content links (config.js). Any other link is refused, even if it comes from storage.
const URL_HOSTS = new Set(['www.max.com', 'play.max.com', 'www.netflix.com', 'www.primevideo.com', 'www.disneyplus.com', 'www.youtube.com']);

function allowedUrl(url) {
  try { const u = new URL(String(url)); return (u.protocol === 'https:' && URL_HOSTS.has(u.hostname)) ? u.href : null; } catch (e) { return null; }
}

export const Platform = {
  isTV: () => Boolean(bridge()),

  // Launches an app. Returns 'bridge' if the TV took over, 'simulated' otherwise.
  launch(app) {
    const b = bridge();
    if (b && app.pkg) { b.launch(String(app.pkg)); return 'bridge'; }
    if (b && app.input && typeof b.switchInput === 'function') { b.switchInput(String(app.input)); return 'bridge'; }
    return 'simulated';
  },

  // Opens a specific piece of content: `item.url` (host allow-list) in the app that owns it.
  // Must be called from a user gesture (OK), otherwise the browser blocks the opening in the mock-up.
  openContent(app, item) {
    const url = item && allowedUrl(item.url);
    const b = bridge();
    if (url && b && typeof b.openUrl === 'function') { b.openUrl(url, String(app.pkg || '')); return 'bridge'; }
    if (url) { try { const w = window.open(url, '_blank', 'noopener'); if (w) return 'opened'; } catch (e) { /* window blocked: simulate */ } }
    return this.launch(app);
  },

  // List of the apps actually installed (the real launcher provides it; the mock-up says "all").
  installed() {
    const b = bridge();
    if (b && typeof b.installedPackages === 'function') {
      try { return new Set(JSON.parse(b.installedPackages())); } catch (e) { return null; }
    }
    return null;
  },
};
