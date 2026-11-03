// The Parapet (home): a single cinematic shot. The castle, the time with a drop cap, the apps engraved in gold
// and centred over a night fade, Hedwig (Hedwige) landing on the chosen app, and a discreet bar in the top-right
// corner (sound, Map, Settings). Lumos (launch), the boot sequence and Nox (idle) all live here.
//
// Nothing moves when nothing happens. At rest the Parapet runs no requestAnimationFrame, no CSS animation, no
// interval: the castle is a still picture with its windows lit once on a static canvas, the mist is still, the owl
// is still, the clock is rewritten once a minute by a timer aligned on the minute. Every movement is an answer to a
// key (a flight, Lumos, the Nox fly-by, the wake) and stops by itself. Nox settled is still too: a static starfield
// that exists only during Nox, the clock moving to a new spot once a minute (burn-in), nothing in between.
import { dockApps, updateConfig, getConfig, isReduced, onConfigChange, HOUSES } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram, logoBox } from '../monogram.js';
import { mountCrest } from '../crests.js';
import { createOwl } from '../owl.js';

const LOGO_H = 3.6;            // cqw: logo height at rest (3 m floor)
const LOGO_W_MAX = 12;         // cqw: a wide wordmark (prime video, Canal+) keeps enough height to weigh like the marks
const PER_ROW = 8;             // beyond this: a second row
const BAR = ['sound', 'map', 'settings'];
const OWL_CELLS = ['perch', 'look', 'sleep', 'up', 'down', 'glide', 'land'];   // the order of tools/cutout_owl.py --sheet
const OWL_COLS = 4;            // the sheet is a 4 x 2 grid of 320 x 248 cells
const CANCEL_MS = 350;         // after OK, Back cancels the launch until the intent fires
const NOX_CLOCK_SCALE = 1.45;  // the clock grows from --t-clock to about 9 cqw during Nox (a transform, never a font-size)
const FLY_MS = 1400;           // the Nox fly-by: the rider's crossing

const FMT = { time: null, date: null };

const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const logoOf = (app) => LOGOS[app.id] || monogram(app.name);
const kOf = (el) => Number(getComputedStyle(el).getPropertyValue('--k')) || 1;

// The sky by the hour (config.sky 'auto'): dusk 17-20, night, deep night 1-5, dawn 5-8.
function skyState(hour) {
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 1 && hour < 5) return 'deep';
  if (hour >= 5 && hour < 8) return 'dawn';
  return 'night';
}

// cubic-bezier(.55, 0, .45, 1) (the rider's momentum ease): progress at a fraction of the time, and its inverse.
function momentum(x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const X1 = 0.55, Y1 = 0, X2 = 0.45, Y2 = 1;
  const bx = (t) => 3 * (1 - t) * (1 - t) * t * X1 + 3 * (1 - t) * t * t * X2 + t * t * t;
  const by = (t) => 3 * (1 - t) * (1 - t) * t * Y1 + 3 * (1 - t) * t * t * Y2 + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 18; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; }
  return by(t);
}
// ---- The lit windows of the castle (warm spots) and the moon (the brightest point of the upper third) ----
// The analysis reads every pixel of a 480 px copy of the picture: about 50 ms on the TV's cores, more under load, and
// it used to run on every Parapet mount, inside the boot. Now: the spots of the versioned assets/castle.jpg are a
// constant (CASTLE_SPOTS, made by this same function, seed 1), and any other picture (a castle replaced by hand) is
// analysed ONCE per page life and cached here. Replacing castle.jpg with a picture of the same size? Run
// analyseCastle(img) in the console and paste its result into CASTLE_SPOTS, or empty CASTLE_SPOTS.pts.
const CASTLE_SPOTS = { w: 1920, h: 1080, moon: [0.7167, 0.237], pts: [
  0.3583, 0.4222, 0.228, 0.701, 0.4083, 0.4593, 0.214, 1.191, 0.3542, 0.4741, 0.276, 0.841, 0.2708, 0.4889, 0.226, 1.06,
  0.3125, 0.4889, 0.2, 1.197, 0.35, 0.5037, 0.204, 0.944, 0.2333, 0.5111, 0.159, 0.902, 0.25, 0.5185, 0.175, 0.777,
  0.2167, 0.5333, 0.208, 0.734, 0.2333, 0.5333, 0.195, 1.084, 0.25, 0.5333, 0.18, 0.795, 0.2542, 0.563, 0.146, 0.914,
  0.5667, 0.5704, 0.223, 1.099, 0.6625, 0.5778, 0.181, 0.803, 0.5667, 0.6519, 0.232, 0.973, 0.5667, 0.6815, 0.246, 0.796,
  0.6083, 0.6815, 0.241, 0.927, 0.8292, 0.9333, 0.248, 1.197, 0.5708, 0.9926, 0.174, 1.079,
] };   // x, y (fractions of the picture), alpha, radius: 4 numbers per window
let spotsCache = null;     // { key, spots }
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function analyseCastle(img) {
  const iw = 480, ih = Math.round(iw * img.naturalHeight / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = iw; c.height = ih;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, iw, ih);
  let d; try { d = x.getImageData(0, 0, iw, ih).data; } catch (e) { return null; }
  const rnd = seeded(1), seen = new Set(), pts = [];
  for (let y = 0; y < ih && pts.length < 560; y += 2) for (let xx = 0; xx < iw && pts.length < 560; xx += 2) {
    const k = (y * iw + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
    if (r > 175 && g > 115 && b < 130 && r - b > 80) {
      const cell = `${xx >> 3}:${y >> 3}`;
      if (seen.has(cell)) continue;
      seen.add(cell);
      pts.push(+(xx / iw).toFixed(4), +(y / ih).toFixed(4), +(0.14 + rnd() * 0.14).toFixed(3), +(0.7 + rnd() * 0.5).toFixed(3));
    }
  }
  let best = 0, bx = 0.3, by = 0.2;
  const top = Math.round(ih * 0.4);
  for (let y = 0; y < top; y += 2) for (let xx = 0; xx < iw; xx += 2) { const k = (y * iw + xx) * 4, v = d[k] + d[k + 1] + d[k + 2]; if (v > best) { best = v; bx = xx / iw; by = y / ih; } }
  c.width = c.height = 1;                                        // the analysis canvas is freed at once
  return { w: img.naturalWidth, h: img.naturalHeight, moon: best > 600 ? [+bx.toFixed(4), +by.toFixed(4)] : null, pts };
}
function castleSpots(img) {
  if (!img.naturalWidth) return null;
  const src = img.currentSrc || img.src || '';
  if (/assets\/castle\.jpg(\?|$)/.test(src) &&CASTLE_SPOTS.pts.length && img.naturalWidth === CASTLE_SPOTS.w && img.naturalHeight === CASTLE_SPOTS.h) return CASTLE_SPOTS;
  const key = `${src}|${img.naturalWidth}x${img.naturalHeight}`;
  if (!spotsCache || spotsCache.key !== key) spotsCache = { key, spots: analyseCastle(img) };
  return spotsCache.spots;
}

function momentumInverse(p) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (momentum(m) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export default {
  root: null, ctx: null, owl: null, apps: [], items: [], i: 0, bar: 0, zone: 'dock', busy: false, mode: 'normal',
  windows: [], timers: [], ro: null, hintTimer: 0, clockTimer: 0, noxTimers: [], launchTimers: [], cancelUntil: 0, castleReady: null,
  wander: { x: 0, y: 0 },

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.noxTimers = []; this.mode = 'normal'; this.zone = 'dock'; this.launchTimers = []; this.cancelUntil = 0; this.owlAway = false; this.owlNox = false;
    this.apps = this.dockList();
    const last = getConfig().lastApp;
    this.i = Math.max(0, this.apps.findIndex((a) => a.id === last));
    root.innerHTML = `
      <div class="home-plane"><img class="home-castle" alt="" decoding="async"><canvas class="home-lights"></canvas><div class="home-moon"></div></div>
      <div class="home-tint"></div>
      <div class="home-mist"></div>
      <div class="home-shade"></div>
      <div class="home-clock"><div class="home-time"></div><div class="home-date"><span class="home-cap"></span><span class="home-date-rest"></span></div></div>
      <div class="home-crest" aria-hidden="true"></div>
      <div class="home-bar">
        <div class="home-bar-item" data-k="sound" aria-label="Son"><svg viewBox="0 0 24 24"><path class="snd-on" d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"/><path class="snd-off" d="M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6"/></svg><span class="home-bar-label">Son</span></div>
        <div class="home-bar-item" data-k="map" aria-label="Toutes les applis"><svg viewBox="0 0 24 24"><path d="M9 3c-2.2 0-3.5 2.6-3.5 5.5 0 1.6.5 2.9 1.2 3.7-.7.9-1.2 2.3-1.2 3.8C5.5 18.4 7 21 9 21s3.5-2.6 3.5-5c0-1.5-.5-2.9-1.2-3.8.7-.8 1.2-2.1 1.2-3.7C12.5 5.6 11.2 3 9 3zm8 1c-1.7 0-2.7 2-2.7 4.2 0 1.2.4 2.2.9 2.8-.5.7-.9 1.8-.9 2.9 0 1.9 1.1 3.9 2.7 3.9s2.7-2 2.7-3.9c0-1.1-.4-2.2-.9-2.9.5-.6.9-1.6.9-2.8C19.7 6 18.7 4 17 4z" class="fill"/></svg><span class="home-bar-label">La Carte</span></div>
        <div class="home-bar-item" data-k="settings" aria-label="Réglages"><svg viewBox="0 0 24 24"><path d="M20 3c-6 0-11 4-13 10l-3 8 8-3c6-2 10-7 10-13M8 16l8-8"/></svg><span class="home-bar-label">Réglages</span></div>
      </div>
      <div class="home-candlelight"></div>
      <div class="home-dock"><div class="home-rows"></div></div>
      <div class="home-arena"></div>
      <div class="home-rider" aria-hidden="true"><i class="home-puff"></i><i class="home-puff"></i><i class="home-puff"></i><div class="home-rider-bob"><img class="home-rider-img" alt="" decoding="async" src="assets/rider.webp"></div></div>
      <div class="keyhint home-hint"><span><b>▼</b>vers Ollivanders</span></div>
      <div class="home-dim"></div><div class="home-veil"></div><div class="home-disc"></div><div class="home-bloom"></div>
      <div class="home-launch"><img class="home-launch-banner" alt=""><div class="home-launch-logo"></div><div class="home-launch-title engraved gold-text"></div><div class="home-launch-sub"></div></div>
      <div class="home-plate"><div class="home-plate-title engraved">Nox ?</div><div class="home-plate-sub">Passer en mode classique, sans décor ni chouette.</div><div class="home-plate-opts"><span class="home-plate-opt" data-v="yes">Oui, Nox</span><span class="home-plate-opt is-focus" data-v="no">Non</span></div></div>`;

    const castle = root.querySelector('.home-castle');
    this.castleReady = new Promise((resolve) => {
      castle.addEventListener('load', () => { if (!this.root) return resolve(false); this.findWindows(castle); this.drawLights(); resolve(true); });
      castle.addEventListener('error', () => { castle.remove(); root.classList.add('no-castle'); resolve(false); });
    });
    castle.src = 'assets/castle.jpg';
    const mistProbe = new Image();
    mistProbe.onerror = () => { const m = root.querySelector('.home-mist'); if (m) m.classList.add('fallback'); };
    mistProbe.src = 'assets/mist.png';

    this.buildDock();
    this.syncBar();
    this.syncHouse();
    this.unsub = onConfigChange(() => { this.syncHouse(); this.tick(); });
    this.ro = new ResizeObserver(() => { if (this.mode === 'nox') this.placeNoxClock(false); else this.layout(true); });
    this.ro.observe(root);
    this.tick();
    this.armClock();

    if (getConfig().owl !== 'absente') {
      this.owl = createOwl(root.querySelector('.home-arena'), {
        sheet: 'assets/owl-sheet.webp', cells: OWL_CELLS, cols: OWL_COLS, feather: 'assets/feather.webp',
        size: root.clientWidth * 0.082, reduced: () => isReduced() || getConfig().owl === 'calme',
      });
    }
    this.layout(true);
    this.armHint();
    if (ctx.config().sounds) ctx.fx.initAudio();
    if (ctx.params.boot) this.boot(isReduced() ? 300 : ctx.params.short ? 700 : 1300);
    if (ctx.params.nox) this.nox();
    if (ctx.params.askClassic) this.timers.push(setTimeout(() => this.plate(true), 750));
    // The TV lost the Home key to an update (HomeActivity.checkLostHome): offer to ask it back, once a day at most.
    this.onHomeEvent = (e) => {
      if (!this.root || !e.detail || !e.detail.lost || this.mode !== 'normal' || this.busy) return;
      if (Date.now() - (getConfig().homeNagAt || 0) < 86400e3) return;
      this.plate(true, { title: 'La télé a repris la touche Home', sub: 'Une mise à jour, sans doute. OK pour la redemander.',
        onYes: () => Platform.setHome('poudlard'), onNo: () => updateConfig({ homeNagAt: Date.now() }) });
    };
    document.addEventListener('poudlard:home', this.onHomeEvent);
  },

  // The Home key (router.js): the Parapet goes back to its entry state, whatever it was doing. True = handled.
  onHome() {
    if (!this.root) return false;
    if (this.mode === 'nox') { this.wake(); return true; }
    if (this.busy) { this.cancelLaunch(); return true; }
    if (this.mode === 'plate') this.plate(false);
    if (this.mode === 'move') this.leaveMove();
    this.zone = 'dock'; this.syncBar(); this.layout(true); this.armHint();
    return true;
  },
  // Everything released (main.js error boundary, hand-over to another app): the launch settles at once.
  settle() { if (this.busy && this.launchDone) this.launchDone(); },
  // Memory pressure (main.js relays the shell's 'poudlard:trim'): the owl is parked, the fly-by dropped, the Nox
  // starfield freed when it is not on screen. Nothing is lost: everything is rebuilt on the next event.
  trim() {
    if (!this.root) return;
    if (this.owl) this.owl.stop();
    if (this.mode !== 'nox') this.dropStars();
    else this.clearFly();
    this.root.querySelectorAll('.app-logo .l-shine').forEach((s) => s.getAnimations({ subtree: true }).forEach((a) => a.finish()));
  },

  // The leaving screen's flourish (router.js): the owl lifts off before the crane, the candle goes out before the Room.
  onLeave(transition) {
    if (transition === 'crane' && this.owl) this.owl.liftOff(450);
    if (transition === 'snuff') { const light = this.root && this.root.querySelector('.home-candlelight'); if (light) light.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }); }
  },

  // The chosen house: its crest under the clock, its name, and its colours (wax, glow) everywhere via main.js.
  syncHouse() {
    const c = getConfig(); const h = c.house ? HOUSES[c.house] : null;
    const el = this.root.querySelector('.home-crest'); if (!el) return;
    el.innerHTML = '';
    if (h) { mountCrest(el, c.house, 'home-crest-svg'); const name = document.createElement('span'); name.className = 'home-crest-name'; name.textContent = h.name; el.appendChild(name); }
    el.classList.toggle('show', Boolean(h));
  },

  unmount() {
    if (this.unsub) this.unsub();
    if (this.onHomeEvent) document.removeEventListener('poudlard:home', this.onHomeEvent); this.onHomeEvent = null;
    if (this.mode === 'nox') this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    this.timers.forEach(clearTimeout);
    this.launchTimers.forEach(clearTimeout); this.launchTimers = [];
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    clearTimeout(this.clockTimer); clearTimeout(this.hintTimer);
    this.clearFly();
    if (this.ro) this.ro.disconnect();
    if (this.owl) this.owl.destroy();
    this.owl = null;
    this.dropStars();
  },

  // ---- Dock: every visible app, centred and spread out; two rows beyond PER_ROW ----
  // On the TV a passage (in<n>) is the TV's real HDMI port, as on the Map and in classic mode: the name given on the
  // Map, else the TV's own label ("HDMI 1", a CEC name), and the TV's input id to switch to. An app the TV does not
  // have (a package missing, a port the TV lacks) stays on the Parapet, faded, until the Remembrall removes it.
  dockList() {
    const ports = Platform.inputs(), named = getConfig().passages || {};
    return dockApps().map((a) => {
      if (a.cat === 'passage' && ports) {
        const p = ports.find((q) => `in${q.port}` === a.id);
        if (!p) return { ...a, absent: true };
        return { ...a, name: named[a.id] ? named[a.id].name : p.label, input: p.id, port: p.port, connected: p.connected };
      }
      return a.pkg && !Platform.has(a) ? { ...a, absent: true } : a;
    });
  },
  buildDock() {
    const rows = this.root.querySelector('.home-rows');
    rows.innerHTML = '';
    this.items = [];
    const chunks = [];
    for (let k = 0; k < this.apps.length; k += PER_ROW) chunks.push(this.apps.slice(k, k + PER_ROW));
    if (!chunks.length) chunks.push([]);
    chunks.forEach((chunk) => {
      const row = document.createElement('div');
      row.className = 'home-row';
      if (!chunk.length) { row.innerHTML = '<div class="home-empty engraved">Le parapet est vide · ▲ La Carte</div>'; }
      chunk.forEach((app) => {
        const L = logoOf(app);
        const el = document.createElement('div');
        el.className = app.absent ? 'home-app is-absent' : 'home-app';
        el.dataset.id = app.id;
        const box = logoBox(L, LOGO_H, LOGO_W_MAX);           // equal visual weight across the row
        el.style.width = box.w.toFixed(2) + 'cqw'; el.style.height = box.h.toFixed(2) + 'cqw';
        el.innerHTML = `<div class="app-logo${L.luma ? ' luma' : ''}"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div>`;
        el.querySelector('.app-logo').style.setProperty('--m', `url("${L.src}")`);
        el.title = app.name;   // no name shown under the icon (by design)
        row.appendChild(el);
        this.items.push(el);
      });
      rows.appendChild(row);
    });
    this.root.classList.toggle('two-rows', chunks.length > 1);
    if (this.i >= this.items.length) this.i = Math.max(0, this.items.length - 1);
  },

  // The time and the date. Rewritten once a minute (armClock), never per frame.
  tick() {
    if (!this.root) return;
    const now = new Date();
    // Two formatters made once per page life (each toLocale…String call builds a new one: about 35 ms on the TV).
    if (!FMT.time) { FMT.time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }); FMT.date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    this.root.querySelector('.home-time').textContent = FMT.time.format(now);
    const d = FMT.date.format(now);
    this.root.querySelector('.home-cap').textContent = d.charAt(0).toUpperCase();   // the drop cap
    this.root.querySelector('.home-date-rest').textContent = d.slice(1);
    this.root.dataset.sky = getConfig().sky === 'nuit' ? 'night' : skyState(now.getHours());
  },
  // One timer per minute, aligned on the minute change (+ 50 ms), re-armed each time; during Nox the clock also
  // moves to a new spot (burn-in protection), one short transition per minute.
  armClock() {
    clearTimeout(this.clockTimer);
    const ms = 60000 - (Date.now() % 60000) + 50;
    this.clockTimer = setTimeout(() => {
      if (!this.root) return;
      this.tick();
      if (this.mode === 'nox') this.placeNoxClock(true);
      this.armClock();
    }, ms);
  },

  // ---- Lit windows: warm spots of the image (castleSpots: a constant for the shipped castle, else analysed once per
  // page life), drawn ONCE on a static canvas (no flicker loop). Returning to the Parapet costs no pixel read. ----
  findWindows(img) {
    const spots = castleSpots(img); if (!spots) return;
    const p = spots.pts; this.windows = [];
    for (let k = 0; k + 3 < p.length; k += 4) this.windows.push({ x: p[k], y: p[k + 1], a: p[k + 2], r: p[k + 3] });
    const moon = this.root.querySelector('.home-moon');
    if (spots.moon) { moon.style.left = spots.moon[0] * 100 + '%'; moon.style.top = spots.moon[1] * 100 + '%'; } else moon.style.opacity = '0';
  },
  // The window glows, painted once at half the CSS resolution (they are soft): a still layer the GPU keeps as is.
  // Boot and Nox only fade this layer (opacity), never redraw it.
  drawLights() {
    const cv = this.root && this.root.querySelector('.home-lights');
    if (!cv || !this.windows.length) return;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    cv.width = Math.round(W / 2); cv.height = Math.round(H / 2);
    const g = document.createElement('canvas'); g.width = g.height = 32;
    const gx = g.getContext('2d'); const rg = gx.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,225,170,0.9)'); rg.addColorStop(0.25, 'rgba(255,190,100,0.35)'); rg.addColorStop(1, 'rgba(255,170,60,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 32, 32);
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, unit = w / 300;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    for (const p of this.windows) {
      c.globalAlpha = p.a;
      const sz = unit * 1.6 * p.r;
      c.drawImage(g, p.x * w - sz / 2, p.y * h - sz / 2, sz, sz);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },

  armHint() {
    clearTimeout(this.hintTimer);
    const hint = this.root.querySelector('.home-hint');
    hint.classList.remove('hidden');
    this.hintTimer = setTimeout(() => { if (this.root) hint.classList.add('hidden'); }, 10000);
  },

  // ---- Top-right bar ----
  syncBar() {
    const c = getConfig();
    this.root.querySelectorAll('.home-bar-item').forEach((el, n) => {
      el.classList.toggle('is-focus', this.zone === 'bar' && n === this.bar);
      if (el.dataset.k === 'sound') { el.classList.toggle('off', !c.sounds); el.querySelector('.home-bar-label').textContent = c.sounds ? 'Son' : 'Muet'; }
    });
    this.root.classList.toggle('bar-active', this.zone === 'bar');
    if (this.owl) this.owl.lookAt(this.zone === 'bar' ? 'up' : 'down');   // she glances up at the bar
  },
  toggleSound() {
    const on = !getConfig().sounds;
    updateConfig({ sounds: on });
    if (on) { this.ctx.fx.initAudio(); this.ctx.fx.configure({ sound: true }); this.ctx.fx.cue ? this.ctx.fx.cue('toggle') : this.ctx.fx.chime(1318, 0.04); }
    else this.ctx.fx.configure({ sound: false });
    this.syncBar();
  },

  // ---- Layout: focus, owl, candle. The castle stays put (drawn 1:1, sharp): no parallax layer wider than the screen. ----
  layout(instant) {
    const root = this.root, W = root.clientWidth;
    if (!W) return;
    const n = this.items.length;
    this.items.forEach((it, k) => it.classList.toggle('is-focus', this.zone === 'dock' && k === this.i));
    const light = root.querySelector('.home-candlelight');
    if (!n) { light.classList.remove('on'); if (this.owl) this.owl.hide(); return; }
    const el = this.items[this.i];
    const { cx, cy } = this.center(el);
    light.style.transform = `translate(${cx}px, ${cy}px)`;
    if (this.owl && !this.owlAway) this.owl.show();
    if (instant) { light.classList.toggle('on', this.zone === 'dock'); if (this.owl) { const t = this.owlTarget(); this.owl.teleport(t.x, t.y); } return; }
    light.classList.remove('on');
    if (this.owl) {
      const t = this.owlTarget();
      const k = kOf(root);
      this.owl.flyTo(t.x, t.y, { arena: { h: root.clientHeight }, timeScale: k, onLand: () => {
        this.ctx.fx.burst(t.cx, t.y + this.owl.size().h * 0.98, 8, W / 60);
        this.land(el);
        this.timers.push(setTimeout(() => light.classList.add('on'), 80 * k));
      } });
    } else this.timers.push(setTimeout(() => light.classList.add('on'), 250));
  },
  // The focused app settles under the owl's weight (focus.css .is-land, --t-land).
  land(el) {
    if (!el || isReduced()) return;
    el.classList.remove('is-land'); void el.offsetWidth; el.classList.add('is-land');
    this.timers.push(setTimeout(() => el.classList.remove('is-land'), 200 * kOf(this.root)));
  },
  press(on) {
    const el = this.zone === 'bar' ? this.root.querySelectorAll('.home-bar-item')[this.bar] : this.items[this.i];
    if (el) el.classList.toggle('is-press', on);
  },
  // Centre of an app in screen coordinates (rows are centred, so we read the boxes).
  center(el) {
    const r = el.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    return { cx: r.left - rr.left + r.width / 2, cy: r.top - rr.top + r.height / 2, w: r.width, h: r.height, top: r.top - rr.top };
  },
  owlTarget() {
    const el = this.items[this.i], app = this.apps[this.i];
    const L = logoOf(app); const ratio = L.ratio || 1;
    const b = this.center(el);
    const ch = Math.min(b.h, b.w / ratio);                     // actual height of the artwork inside its box (already scaled up in focus)
    const logoTop = b.cy - ch / 2;
    const s = this.owl.size();
    return { cx: b.cx, x: b.cx - s.w / 2, y: logoTop - s.h * 0.95 };
  },

  // ---- Lumos ----
  // t=0 anticipation (press, the logo charges, the candle flares) · t=100 the light (dim, molten, disc, bloom) ·
  // t=350 the intent. Until then, Back cancels everything (nothing was started yet).
  async launch() {
    if (this.busy) return;
    const app = this.apps[this.i]; if (!app) return;
    this.busy = true;                                         // keys still reach onKey (Back cancels) until the intent fires
    let held = false, heldMusic = false;
    const root = this.root, fx = this.ctx.fx, k = kOf(root);
    const item = this.items[this.i], logoEl = item.querySelector('.app-logo');
    const { cx, cy } = this.center(logoEl);
    const light = root.querySelector('.home-candlelight');
    const timers = []; this.launchTimers = timers;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms * k));
    item.classList.add('is-press'); logoEl.classList.add('charging'); light.classList.add('flare');
    this.cancelUntil = performance.now() + CANCEL_MS * k;
    const disc = root.querySelector('.home-disc'), bloom = root.querySelector('.home-bloom');
    const box = root.querySelector('.home-launch');
    at(100, () => {
      item.classList.remove('is-press');
      root.querySelector('.home-dim').classList.add('on');
      logoEl.classList.add('molten');
      if (this.owl) this.owl.liftOff(500);
      if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
      // The disc is 24 cqw wide: it grows from a point to a few screen widths and fades; transform and opacity only.
      disc.animate([{ opacity: 0.7, transform: `translate(${cx}px, ${cy}px) scale(.05)` }, { opacity: 0.55, transform: `translate(${cx}px, ${cy}px) scale(3)`, offset: 0.55 }, { opacity: 0, transform: `translate(${cx}px, ${cy}px) scale(10)` }], { duration: 900 * k, easing: 'cubic-bezier(.3,.6,.2,1)' });
      bloom.animate([{ opacity: 0 }, { opacity: 0.32, offset: 0.45 }, { opacity: 0 }], { duration: 1100 * k, easing: 'ease-in-out' });
    });
    const L = logoOf(app);
    const lg = box.querySelector('.home-launch-logo'), banner = box.querySelector('.home-launch-banner');
    lg.className = `home-launch-logo app-logo lit${L.luma ? ' luma' : ''}`;
    lg.innerHTML = '<i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i>';
    lg.style.setProperty('--m', `url("${L.src}")`);
    const uri = app.pkg ? Platform.appIcon(app.pkg) : null;        // the TV's own banner when it has one
    box.classList.toggle('has-banner', Boolean(uri));
    if (uri) banner.src = uri; else banner.removeAttribute('src');
    box.querySelector('.home-launch-title').textContent = `Ouverture de ${app.name}`;
    box.querySelector('.home-launch-sub').textContent = app.port ? `Entrée HDMI ${app.port}` : app.input ? `Entrée ${app.input}` : '';
    updateConfig({ lastApp: app.id });
    const showCard = setTimeout(() => box.classList.add('show'), 420 * k); timers.push(showCard);
    const done = () => {
      timers.forEach(clearTimeout);
      box.classList.remove('show'); root.querySelector('.home-dim').classList.remove('on');
      item.classList.remove('is-press'); logoEl.classList.remove('molten', 'charging'); light.classList.remove('flare');
      if (this.owl) { const t = this.owlTarget(); this.owl.comeBack(t.x, t.y); }
      this.cancelUntil = 0; this.busy = false;
      if (held) { held = false; Input.release(); }
      if (heldMusic) { heldMusic = false; if (fx.ambientHold) fx.ambientHold(false, 'launch'); }   // the music comes back with the Parapet
    };
    this.launchDone = done;
    // The intent fires at 350 ms; from then on keys are queued and replayed at the end. The TV's answer decides the
    // rest: refused → everything settles at once and the Howler reads the TV's sentence; taken → the card stays while
    // the app takes the screen (4 s), 2.4 s in the mock-up.
    at(CANCEL_MS, async () => {
      this.cancelUntil = 0;
      held = true; Input.hold();
      if (fx.ambientHold) { fx.ambientHold(true, 'launch'); heldMusic = true; }   // lifted by done(): never by a timer that done() could cancel
      const r = Platform.launch(app);
      if (r.status === 'failed') {
        clearTimeout(showCard);
        done();
        const beuglante = await loadBeuglante();
        if (fx.cue) fx.cue('error');
        if (this.owl) this.owl.startle();
        const action = r.missing && app.pkg ? { label: 'Retirer du parapet', onChoose: () => this.removeFromDock(app.id) } : undefined;
        if (beuglante) beuglante(root, { message: r.error, action });
        return;
      }
      at((r.status === 'bridge' ? 4000 : 2400) - CANCEL_MS, done);
    });
  },
  // Back before the intent: the light recedes, nothing was launched.
  cancelLaunch() {
    if (!this.busy || !this.cancelUntil || performance.now() > this.cancelUntil) return false;
    if (this.launchDone) this.launchDone();
    this.ctx.fx.chime(659, 0.02);
    return true;
  },

  // ---- Boot: a Lumos. Dark screen, a point of light that opens, the castle appears, its windows light up, the clock
  // writes itself, the dock rises, the owl arrives last. `ms`: the whole thing (1300 cold, 700 short, 300 reduced).
  // Transform and opacity only: the veil (a night layer) fades while the disc grows; no clip-path. ----
  boot(ms) {
    const root = this.root; root.classList.add('booting');
    const W = root.clientWidth, H = root.clientHeight;
    const disc = root.querySelector('.home-disc');
    Input.hold();
    const k = kOf(root);
    const s = ms / 1300;                                      // the short and reduced boots keep the same shape, compressed
    const at = (t, fn) => this.timers.push(setTimeout(fn, t * s * k));
    const pos = `translate(${W * 0.5}px, ${H * 0.58}px)`;
    const owlArrives = Boolean(this.owl && this.items.length && !isReduced());
    this.owlAway = owlArrives;
    if (owlArrives) this.owl.hide();                            // she is not on her perch yet: she flies in at 700
    if (!isReduced()) disc.animate([
      { opacity: 0, transform: `${pos} scale(.02)` }, { opacity: 1, transform: `${pos} scale(.12)`, offset: 0.2 },
      { opacity: 0.8, transform: `${pos} scale(3)`, offset: 0.65 }, { opacity: 0, transform: `${pos} scale(7)` },
    ], { duration: 900 * s * k, easing: 'cubic-bezier(.4,0,.2,1)' });
    at(180, () => root.classList.add('boot-open'));            // the veil lifts (home.css, 600 ms)
    at(320, () => { root.classList.add('boot-lit'); if (this.ctx.fx.cue) this.ctx.fx.cue('wake'); });   // the windows light up (opacity)
    at(480, () => { const c = root.querySelector('.home-clock'); c.classList.add('write-in'); root.classList.remove('booting'); });
    // The boot is over when the sequence has run AND the owl has landed: then main.js may arm the sound (its start-up
    // AudioContext costs one long frame, kept out of every boot movement).
    let pending = owlArrives ? 2 : 1;
    const settled = () => { if (--pending === 0) window.dispatchEvent(new CustomEvent('poudlard:booted')); };
    at(700, () => {
      this.owlAway = false;
      if (owlArrives && this.owl) {
        const t = this.owlTarget();
        this.owl.comeBack(t.x, t.y, { onLand: () => { this.ctx.fx.burst(t.cx, t.y + this.owl.size().h * 0.98, 8, W / 60); this.land(this.items[this.i]); this.timers.push(setTimeout(settled, 500)); } });
      } else if (owlArrives) settled();
    });
    at(1300, () => {
      if (!this.root) return;
      root.querySelector('.home-clock').classList.remove('write-in');
      root.classList.remove('boot-open', 'boot-lit');
      Input.release();
      settled();
    });
  },

  // ---- Nox: the scene clock drops to 15 fps for the whole of it. ----
  // Entrance (nox): a fly-by. A rider on a broom crosses the Parapet left to right at speed; each app goes out the
  // moment his nose passes it (one timer per app, computed from the same ease: no per-frame work), the mist is pushed
  // aside behind him, then the Nox state settles (settleNox).
  // Timeline (× --k): 0 rider starts (1400 ms, momentum ease), hint/bar/crest/candle fade (600) · 120 the mist push
  // (1400) · 0-1400 the apps go out one by one · 1400 rider gone · 1500 settleNox.
  // Reduced motion, or the rider image missing: straight to settleNox (a fade).
  nox() {
    if (this.mode === 'nox') return;
    this.mode = 'nox';
    this.ctx.fx.setRate(66);
    if (this.ctx.fx.ambientHold && getConfig().musicNox !== 'continue') this.ctx.fx.ambientHold(true, 'nox');   // the music waits, unless asked to go on
    if (this.ctx.fx.cue) this.ctx.fx.cue('nox');
    if (!this.flyBy()) this.settleNox();
  },
  // True when the fly-by started; false when it cannot (reduced motion, or the rider image missing / not loaded yet).
  flyBy() {
    const root = this.root, W = root.clientWidth;
    const layer = root.querySelector('.home-rider'), img = layer && layer.querySelector('.home-rider-img');
    if (isReduced() || !layer || !img || !img.complete || !img.naturalWidth || !W) return false;
    const k = kOf(root);
    const DUR = FLY_MS * k;
    root.classList.add('nox-fly');
    // Above the dock: the layer's foot clears the owl's head (she is 8.2 cqw tall on the focused app), so the broom
    // skims over her and over the apps rather than through them.
    const rows = root.querySelector('.home-rows'), rr = rows.getBoundingClientRect(), r0 = root.getBoundingClientRect();
    layer.style.top = Math.round(rr.top - r0.top - layer.offsetHeight - W * 0.075) + 'px';
    layer.classList.add('fly');
    this.riderAnim = layer.animate([{ transform: 'translateX(-25cqw)' }, { transform: 'translateX(125cqw)' }],
      { duration: DUR, easing: 'cubic-bezier(.55,0,.45,1)', fill: 'forwards' });
    const anim = this.riderAnim;
    anim.onfinish = () => { if (this.riderAnim !== anim) return; anim.cancel(); this.riderAnim = null; layer.classList.remove('fly'); };
    // The mist, pushed aside in his wake: one transform wave (translate + a slight scaleX) and an opacity dip on the
    // single, screen-wide mist layer. The local wake (three puffs that bloom and fade behind the broom) is CSS.
    const mist = root.querySelector('.home-mist');
    this.noxTimers.push(setTimeout(() => {
      if (this.mode !== 'nox' || !this.root) return;
      this.mistAnim = mist.animate([
        { transform: 'translateX(0) scaleX(1)', opacity: 0.13 },             // .13: the mist's resting opacity (home.css)
        { transform: 'translateX(3cqw) scaleX(1.08)', opacity: 0.025, offset: 0.5 },
        { transform: 'translateX(-1.2cqw) scaleX(1.03)', opacity: 0.07, offset: 0.78 },
        { transform: 'translateX(0) scaleX(1)', opacity: 0.13 },
      ], { duration: DUR, easing: 'ease-in-out' });
      this.mistAnim.onfinish = () => { this.mistAnim = null; };
    }, 120 * k));
    // The apps go out as his nose passes them: the nose is at −25 + 150·p + 13 cqw (the layer is 14 cqw wide, he
    // faces right), p = momentum(t / DUR); one timer per app at the inverse of that ease.
    this.items.forEach((el) => {
      const cx = this.center(el).cx / W * 100;                // in cqw
      const p = Math.max(0, Math.min(1, (cx + 12) / 150));
      this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox') el.classList.add('is-out'); }, momentumInverse(p) * DUR));
    });
    // Hedwig: once his tail has passed over her, she takes off in his wake and leaves the frame (her perch is going out).
    if (this.owl && this.items[this.i]) {
      const cx = this.center(this.items[this.i]).cx / W * 100;
      const p = Math.max(0, Math.min(1, (cx + 12 + 10) / 150));
      this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox' && this.owl && !this.owlNox) { this.owlNox = true; this.owl.liftOff(900); } }, momentumInverse(p) * DUR));
    }
    this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox' && this.root) this.settleNox(); }, (FLY_MS + 100) * k));
    return true;
  },
  // The rider, the mist push and the per-app extinction all reset: used by wake() and before a new fly-by.
  clearFly() {
    const root = this.root; if (!root) return;
    if (this.riderAnim) { this.riderAnim.onfinish = null; this.riderAnim.cancel(); this.riderAnim = null; }
    if (this.mistAnim) { this.mistAnim.onfinish = null; this.mistAnim.cancel(); this.mistAnim = null; }
    const layer = root.querySelector('.home-rider'); if (layer) layer.classList.remove('fly');
    root.classList.remove('nox-fly');
    this.items.forEach((it) => it.classList.remove('is-out'));
  },
  // The Nox starfield: one static canvas the size of the screen (CSS px), created when Nox settles, removed on wake.
  makeStars() {
    if (this.root.querySelector('.home-stars')) return;
    const W = this.root.clientWidth, H = this.root.clientHeight; if (!W) return;
    const cv = document.createElement('canvas'); cv.className = 'home-stars'; cv.setAttribute('aria-hidden', 'true');
    cv.width = Math.round(W); cv.height = Math.round(H);
    const g = cv.getContext('2d'), u = W / 960;
    const count = 70;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * W, y = Math.pow(Math.random(), 1.6) * H * 0.62;   // denser high in the sky
      const r = (0.5 + Math.random() * Math.random() * 1.1) * u;
      g.globalAlpha = 0.3 + Math.random() * 0.55; g.fillStyle = Math.random() < 0.2 ? '#C9D9EA' : '#F1EBDD';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    this.root.querySelector('.home-shade').after(cv);
    void cv.offsetWidth;                                       // the fade-in starts from 0
    cv.classList.add('on');
  },
  dropStars() {
    const cv = this.root && this.root.querySelector('.home-stars');
    if (cv) { cv.width = cv.height = 1; cv.remove(); }
  },
  // The Nox clock: centred and grown by a transform (FLIP from its resting place), then a new spot within ±30 % /
  // ±14 % of the screen once a minute. `move` false: the centred spot (entering Nox, a resize).
  placeNoxClock(move) {
    const root = this.root, clock = root.querySelector('.home-clock'); if (!clock) return;
    const W = root.clientWidth, H = root.clientHeight;
    if (move && !isReduced()) this.wander = { x: (Math.random() * 2 - 1) * 0.3 * W, y: (Math.random() * 2 - 1) * 0.14 * H };
    else if (!move) this.wander = { x: 0, y: 0 };
    const left = clock.offsetLeft, top = clock.offsetTop, w = clock.offsetWidth, h = clock.offsetHeight;
    const dx = W / 2 - (left + w / 2) + this.wander.x, dy = H * 0.44 - (top + h / 2) + this.wander.y;
    clock.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${NOX_CLOCK_SCALE})`;
    // The date line, left-aligned under the time at rest, is centred under it here (a transform too).
    const time = clock.querySelector('.home-time'), date = clock.querySelector('.home-date');
    const off = (time.offsetWidth - date.scrollWidth) / 2;
    date.style.transform = off > 0 ? `translateX(${off.toFixed(1)}px)` : '';
  },
  // The Nox state proper: a still starfield, the clock centred (then moving once a minute), the windows dimmed
  // (one opacity fade of the static light layer), the moon veiled. The owl is away (she left with the rider, or
  // fades out when there is no fly-by): the apps she perches on are out. Nothing loops.
  settleNox() {
    const root = this.root; root.classList.add('nox');
    this.clearFly();
    this.items.forEach((it) => it.classList.add('is-out'));
    if (this.owl && !this.owlNox) { this.owlNox = true; this.owl.hide(); }
    this.makeStars();
    this.placeNoxClock(false);
  },
  wake() {
    if (this.mode !== 'nox') return;
    this.mode = 'normal';
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    this.clearFly();                                           // rider off-screen, mist settled, every app back
    this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    if (this.ctx.fx.ambientHold) this.ctx.fx.ambientHold(false, 'nox');
    const root = this.root; root.classList.remove('nox');
    const clock = root.querySelector('.home-clock'); clock.style.transform = '';
    const date = clock.querySelector('.home-date'); date.style.transform = '';
    this.dropStars();
    if (this.ctx.fx.cue) this.ctx.fx.cue('wake');
    // Hedwig comes back: a swoop down onto the focused app (a plain fade-in in reduced motion).
    const away = this.owlNox; this.owlNox = false;
    if (this.owl && away) { this.owl.hide(); this.owlAway = true; }
    this.layout(true);
    if (this.owl && away) {
      this.owlAway = false;
      if (isReduced() || !this.items.length) this.layout(true);
      else {
        const t = this.owlTarget(), W = root.clientWidth;
        this.owl.comeBack(t.x, t.y, { onLand: () => { if (!this.root || this.mode === 'nox') return; this.ctx.fx.burst(t.cx, t.y + this.owl.size().h * 0.98, 8, W / 60); this.land(this.items[this.i]); } });
      }
    }
    this.armHint();
  },

  // ---- Rappeltout ----
  async rappeltout() {
    const app = this.apps[this.i]; if (!app) return;
    const fn = await loadRappeltout(); if (!fn) return;
    // On the TV, an app with a package gets the system's own page (uninstall, force stop); the mock-up shows a plain note.
    const sysInfo = Boolean(app.pkg && Platform.isTV() && Platform.has(app));   // an absent app has no page to open
    const choice = await fn(this.root, { title: app.name, options: [
      { id: 'move', label: 'Déplacer' }, { id: 'remove', label: 'Retirer du parapet' }, { id: 'hide', label: 'Masquer' },
      sysInfo ? { id: 'appinfo', label: 'Infos de l’appli' } : { id: 'info', label: 'Infos' },
    ] });
    if (!this.root) return;
    if (choice === 'move') this.enterMove();
    else if (choice === 'remove') this.removeFromDock(app.id);
    else if (choice === 'hide') { const c = getConfig(); updateConfig({ dock: c.dock.filter((id) => id !== app.id), hidden: [...c.hidden, app.id] }); this.rebuild(); }
    else if (choice === 'appinfo') { const r = Platform.openSystem('appinfo', app.pkg); if (r.status === 'failed') { const b = await loadBeuglante(); if (b) b(this.root, { message: r.error }); } }
    else if (choice === 'info') { const b = await loadBeuglante(); if (b) b(this.root, { message: app.pkg ? `${app.name} · ${app.pkg}` : `${app.name} · ${app.input || 'ajoutée à la main'}` }); }
  },
  removeFromDock(id) { updateConfig({ dock: getConfig().dock.filter((x) => x !== id) }); this.rebuild(); },
  rebuild() { if (!this.root) return; this.apps = this.dockList(); this.i = Math.min(this.i, Math.max(0, this.apps.length - 1)); this.buildDock(); this.layout(true); },
  enterMove() { this.mode = 'move'; this.items[this.i].classList.add('lifted'); },
  swap(dir) {
    const j = this.i + dir; if (j < 0 || j >= this.apps.length) return;
    const dock = [...getConfig().dock]; [dock[this.i], dock[j]] = [dock[j], dock[this.i]];
    updateConfig({ dock }); this.apps = this.dockList(); this.i = j; this.buildDock(); this.items[this.i].classList.add('lifted'); this.layout(true);
  },
  leaveMove() { this.mode = 'normal'; this.items.forEach((it) => it.classList.remove('lifted')); },

  goMap(ctx) {
    const el = this.items[this.i];
    const b = el ? this.center(el) : { cx: this.root.clientWidth / 2, cy: this.root.clientHeight * 0.78 };
    const app = this.apps[this.i];
    if (ctx.fx.cue) ctx.fx.cue('enter');
    ctx.router.go('map', { app: app ? app.id : null, from: { x: b.cx / this.root.clientWidth, y: b.cy / this.root.clientHeight } }, 'down');
  },

  // The plate: "Nox ?" by default (classic mode), or any yes/no question (`q`: title, sub, onYes, onNo); focus on Non.
  plate(show, q) {
    const p = this.root.querySelector('.home-plate');
    p.classList.toggle('show', show);
    this.mode = show ? 'plate' : 'normal';
    this.plateQ = show && q ? q : null;
    p.querySelector('.home-plate-title').textContent = q && q.title ? q.title : 'Nox ?';
    p.querySelector('.home-plate-sub').textContent = q && q.sub ? q.sub : 'Passer en mode classique, sans décor ni chouette.';
    p.querySelector('.home-plate-opt[data-v="yes"]').textContent = q && q.title ? 'Oui' : 'Oui, Nox';
    if (show) p.querySelectorAll('.home-plate-opt').forEach((o) => o.classList.toggle('is-focus', o.dataset.v === 'no'));
  },

  onKey(action, ctx) {
    if (action === 'okdown') { if (!this.busy && this.mode !== 'nox') this.press(true); return true; }
    if (this.mode === 'nox') { if (action !== 'ok') this.wake(); return action !== 'left' && action !== 'right'; }
    if (this.busy) { if (action === 'back') this.cancelLaunch(); return true; }
    this.press(false);
    this.armHint();
    if (this.mode === 'plate') {
      const opts = [...this.root.querySelectorAll('.home-plate-opt')];
      let k = opts.findIndex((o) => o.classList.contains('is-focus'));
      if (action === 'left' || action === 'right') { k = (k + (action === 'left' ? -1 : 1) + opts.length) % opts.length; opts.forEach((o, n) => o.classList.toggle('is-focus', n === k)); return true; }
      if (action === 'ok') {
        const v = opts[k].dataset.v, q = this.plateQ; this.plate(false);
        if (q) { if (v === 'yes' && q.onYes) q.onYes(); else if (v !== 'yes' && q.onNo) q.onNo(); return true; }
        if (v === 'yes') { updateConfig({ mode: 'classique' }); ctx.fx.whoosh(); ctx.router.replace('classic', {}, 'fade'); }
        return true;
      }
      if (action === 'back') { const q = this.plateQ; this.plate(false); if (q && q.onNo) q.onNo(); return true; }
      return true;
    }
    if (this.mode === 'move') {
      if (action === 'left') { this.swap(-1); return true; }
      if (action === 'right') { this.swap(1); return true; }
      if (action === 'ok' || action === 'back') { this.leaveMove(); return true; }
      return true;
    }
    if (this.zone === 'bar') {
      if (action === 'left' || action === 'right') { this.bar = Math.max(0, Math.min(BAR.length - 1, this.bar + (action === 'left' ? -1 : 1))); this.syncBar(); ctx.fx.chime(1175, 0.02); return true; }
      if (action === 'down' || action === 'back') { this.zone = 'dock'; this.syncBar(); this.layout(true); return true; }
      if (action === 'ok') {
        const k = BAR[this.bar];
        if (k === 'sound') this.toggleSound();
        else if (k === 'map') this.goMap(ctx);
        else { if (ctx.fx.cue) ctx.fx.cue('enter'); ctx.router.go('settings', {}, 'snuff'); }
        return true;
      }
      return true;
    }
    const n = this.items.length;
    if (action === 'right') { if (this.i < n - 1) { this.i++; this.layout(false); ctx.fx.cue ? ctx.fx.cue('move', { dir: 1 }) : ctx.fx.chime(1175, 0.02); } else if (this.owl) this.owl.nod(); return true; }
    if (action === 'left') { if (this.i > 0) { this.i--; this.layout(false); ctx.fx.cue ? ctx.fx.cue('move', { dir: -1 }) : ctx.fx.chime(1046, 0.02); } else if (this.owl) this.owl.nod(); return true; }
    if (action === 'ok') { if (n) this.launch(); else this.goMap(ctx); return true; }
    if (action === 'longok') { if (n) this.rappeltout(); return true; }
    if (action === 'menu') { if (n) this.rappeltout(); else ctx.router.go('settings', {}, 'snuff'); return true; }   // Menu = the focused item's Remembrall
    if (action === 'down') { if (ctx.fx.cue) ctx.fx.cue('enter'); else ctx.fx.chime(880, 0.03); ctx.router.go('library', {}, 'crane'); return true; }   // onLeave lifts the owl
    if (action === 'up') { this.zone = 'bar'; this.syncBar(); this.layout(true); return true; }
    if (action === 'longback') { this.plate(true); return true; }
    return false;
  },
};
