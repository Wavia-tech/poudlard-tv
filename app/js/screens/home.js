// The Parapet (home): a single cinematic shot. The castle in three planes, the clouds drifting behind it, the time, the apps in
// ivory over a night fade, Hedwig (Hedwige) landing on the chosen app, and a discreet bar in the top-right corner (sound, Map,
// Settings). Lumos (launch), the boot sequence and Nox (idle) all live here.
//
// One thing moves at rest: the clouds behind the castle, by a timer, one device px at a time, cut from the owner's picture so the
// screen is that picture with a sky that lives (home.css, tools/parapet_scene.py). No requestAnimationFrame, and that one interval: the
// owl is still, the clock is rewritten once a minute by a timer aligned on the minute. Every other movement is an answer to
// a key and stops by itself, transform and opacity only, on layers made once at the mount:
//   - a focus move: the three planes slide a few px at three rates (depth), the logo lifts with its shadow, Hedwig flies over.
//     No layout is read and nothing is painted: the dock's places are measured at the mount and on a resize (measure()),
//     and a key only sets classes and starts animations;
//   - Lumos (OK): the castle's windows light up in a wave from left to right (one pre-rendered layer, six bands);
//   - down: the camera goes down to Ollivanders in one vertical move (router.js 'pan-down'); the shop stands ready one screen
//     below (neighbours()), and the clock, the dock and the owl fade by themselves, without ever moving with the camera;
//   - Nox: Harry crosses on his broom, a few motes of light left behind him, a mist wake, the apps go out as he
//     passes; wake: the windows come back in a gentler wave.
// Nox settled is still: a static starfield, the clock moving to a new spot once a minute (burn-in), the clouds paused.
// The other loops allowed at rest are the "Ambiance vivante" option (config.ambiance, off by default): a slow mist drift and
// the lake reflections shimmering, both compositor-only CSS animations on small layers (home.css).
import { dockApps, updateConfig, getConfig, isReduced, isAmbianceOn, onConfigChange, HOUSES, LIBRARY } from '../config.js';
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
const NOX_CLOCK_SCALE = 1.25;  // the clock grows from --t-clock to 4.5 cqw during Nox (a transform, never a font-size)
const NOX_CLOCK_Y = 0.86;      // and sits in the dark of the lake, as a fraction of the screen's height, away from the castle
const FOCUS_SCALE = 1.14;      // the focused logo (home.css .home-lift)
const FOCUS_LIFT = 0.625;      // cqw: its lift (home.css --lift): 6 CSS px of the 960 px screen, 12 device px at DPR 2
const HELP_MS = 3000;          // the help line, on arrival; it does not come back with the keys
// The Parapet's first frame: the chrome waits for the backdrop's pictures, this long at most.
const SCENE_WAIT_MS = 1500;
const RESYNC_MS = 400;         // parked behind another screen: the dock follows a change of the config this long after it

// ---- The scene (assets/scene/, made from castle.jpg by tools/parapet_scene.py; geometry in scene.json, mirrored in home.css) ----
const SCENE = 'assets/scene/';
// Parallax per focus step, in CSS px of the 960 px screen, and the most a plane may move (its margin is 16 px). The
// steps shrink on a long dock so the end apps reach the limit, never beyond it.
const DRIFT_STEPS = 12, DRIFT_HOLD_MS = 1500;   // steps a second, each of one device px: the whole sky goes by in under three minutes
const DEPTH = { sky: { step: 3, max: 5 }, castle: { step: 3, max: 5 }, fg: { step: 7, max: 10 } };   // the sky as the castle: the moon, in the castle's picture, never slides over its clouds
// The lit windows: lit-windows.webp (1035 px wide) cut into six bands in empty columns (windows.json): x, width (px of
// the picture), t (0 = leftmost, 1 = rightmost: the delay of the wave).
const LIT_W = 1035;
const LIT_BANDS = [[0, 185, 0.089], [185, 160, 0.256], [345, 195, 0.428], [540, 150, 0.594], [690, 177, 0.752], [867, 168, 0.919]];
// The waves: span (ms from the first band to the last), fade (ms per band), peak opacity, hold (ms at the peak before
// it fades out as one, null = until litOut()), out (ms of that fade).
const WAVE = {
  lumos: { span: 300, fade: 320, peak: 1, hold: null, out: 900 },
  wake: { span: 900, fade: 700, peak: 0.7, hold: 500, out: 1600 },
};
// The Nox fly-by. The rider layer (17 cqw wide, Harry facing right once mirrored) goes from -22 to 132 cqw, off-screen
// at both ends. His hand leads at 97 % of the layer; the tip of the bristles is at 3 % of its width, 70 % of its height.
const FLY_MS = 1600;
const FLY_X0 = -22, FLY_X1 = 132, RIDER_W = 17, NOSE = 0.97, TAIL = [0.03, 0.7];
const FLY_EASE = [0.3, 0.1, 0.7, 0.9];   // a gentle push and a gentle exit: he crosses the screen at speed
// The motes he leaves behind: hard little points of warm light (home.css .home-mote), dropped at fixed points of his
// path as the bristles pass, each fading in 300 ms (opacity only). x in fractions of the screen width.
const MOTES = [0.1, 0.23, 0.36, 0.49, 0.62, 0.75, 0.88];
const MOTE_MS = 320;
// The bob of the rider (home.css @keyframes home-rider-bob, translateY in cqw at these fractions of the flight).
const BOB = [[0, 0.45], [0.3, -0.3], [0.62, 0.22], [1, -0.25]];

const FMT = { time: null, date: null };

const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const logoOf = (app) => LOGOS[app.id] || monogram(app.name);
// The test bench's slow motion (base.css --k), without a style read.
const K = () => (document.documentElement.dataset.slow === '1' ? 3 : 1);
const decoded = (im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve());
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
// The bristles' bob at a fraction of the flight (linear between the keyframes: close enough for a mote).
function bobAt(u) {
  for (let j = 1; j < BOB.length; j++) if (u <= BOB[j][0]) { const [a, ya] = BOB[j - 1], [b, yb] = BOB[j]; return ya + (yb - ya) * (u - a) / (b - a); }
  return BOB[BOB.length - 1][1];
}

// The sky by the hour (config.sky 'auto'): dusk 17-20, night, deep night 1-5, dawn 5-8.
function skyState(hour) {
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 1 && hour < 5) return 'deep';
  if (hour >= 5 && hour < 8) return 'dawn';
  return 'night';
}

// A CSS cubic-bezier as a function of time, and its inverse (the time at which it reaches a progress).
function cubic([X1, Y1, X2, Y2]) {
  const bx = (t) => 3 * (1 - t) * (1 - t) * t * X1 + 3 * (1 - t) * t * t * X2 + t * t * t;
  const by = (t) => 3 * (1 - t) * (1 - t) * t * Y1 + 3 * (1 - t) * t * t * Y2 + t * t * t;
  const at = (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (bx(t) < x) lo = t; else hi = t; } return by(t); };
  const inverse = (p) => { let lo = 0, hi = 1; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (at(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
  return { at, inverse };
}
const flyEase = cubic(FLY_EASE);

export default {
  // The router shows the Parapet at once if the camera outruns its mount: the scene first, the rest comes on top.
  progressive: true, built: false, mountGen: 0, keyLater: null, sig: '', resyncTimer: 0,
  root: null, ctx: null, owl: null, apps: [], items: [], i: 0, bar: 0, zone: 'dock', busy: false, mode: 'normal',
  timers: [], ro: null, hintTimer: 0, clockTimer: 0, noxTimers: [], launchTimers: [], cancelUntil: 0, sceneReady: null,
  wander: { x: 0, y: 0 }, shift: null, planes: null, flat: false, sceneOk: false, lit: null, amb: null,
  houseShown: undefined, flyGen: 0, away: false, howls: 0, W: 0, H: 0, geo: [], reduced: false, sel: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.W = 0; this.timers = []; this.noxTimers = []; this.mode = 'normal'; this.zone = 'dock'; this.launchTimers = []; this.cancelUntil = 0; this.owlAway = false; this.owlNox = false;
    this.shift = { sky: 0, castle: 0, fg: 0 }; this.flat = false; this.sceneOk = false; this.lit = null; this.amb = null; this.busy = false; this.sel = null; this.geo = [];
    this.houseShown = undefined; this.flyGen++; this.away = Boolean(ctx.prepared); this.howls = 0;
    this.built = false; this.keyLater = null; this.items = []; this.ro = null; this.unsub = null; clearTimeout(this.resyncTimer);
    this.reduced = isReduced();
    // The Parapet is built a piece per frame (router.js), and its first piece may be in a key's task. The boot, under its veil: at once.
    const gen = ++this.mountGen;
    const piece = async () => { if (ctx.slice && !ctx.params.boot) await ctx.slice(); return this.root === root && this.mountGen === gen; };
    this.apps = this.dockList();
    const last = getConfig().lastApp;
    this.lastSeen = last;
    this.i = Math.max(0, this.apps.findIndex((a) => a.id === last));
    // A band of the lit windows: a window of the layer (left, width in % of it) showing the whole picture shifted left.
    const band = ([x, w]) => `<div class="home-lit-band" style="left:${(x / LIT_W * 100).toFixed(3)}%;width:${(w / LIT_W * 100).toFixed(3)}%"><img alt="" decoding="async" style="left:-${(x / w * 100).toFixed(3)}%"></div>`;
    const lit = `<div class="home-lit">${LIT_BANDS.map(band).join('')}</div>`;
    // The backdrop, back to front. Under the castle: the clouds, two copies side by side (one opaque picture: everything still in
    // the sky, the moon with its glow first of all, is flattened into the castle's top plane). Each still picture carries the sky's tint
    // in its own layer (home.css .home-tint).
    const still = (cls, src) => `<div class="home-still ${cls}"><img alt="" decoding="async" data-s="${src}"><i class="home-tint"></i></div>`;
    const scene = `<div class="home-scene">
        <div class="home-layer home-sky"><div class="home-clouds"><div class="home-still home-cloud"><img alt="" decoding="async" data-s="clouds.webp"></div><div class="home-still home-cloud"><img alt="" decoding="async" data-s="clouds.webp"></div></div></div>
        <div class="home-layer home-castle">${still('home-castle-base', 'castle-base.webp')}${still('home-castle-top', 'castle-top.webp')}${lit}</div>
        <div class="home-layer home-fg">${still('home-fg-l', 'fg-left.webp')}${still('home-fg-r', 'fg-right.webp')}</div>
      </div>`;
    root.innerHTML = `${scene}<div class="home-night"></div>`;
    const clockAndBar = `
      <div class="home-clock pan-fade"><div class="home-time"></div><div class="home-date"></div></div>
      <div class="home-crest pan-fade" aria-hidden="true"></div>
      <div class="home-bar pan-fade">
        <div class="home-bar-item" data-k="sound" aria-label="Son"><svg viewBox="0 0 24 24"><path class="snd-on" d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"/><path class="snd-off" d="M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6"/></svg><span class="home-bar-label">Son</span></div>
        <div class="home-bar-item" data-k="map" aria-label="Toutes les applis"><svg viewBox="0 0 24 24"><path d="M9 3c-2.2 0-3.5 2.6-3.5 5.5 0 1.6.5 2.9 1.2 3.7-.7.9-1.2 2.3-1.2 3.8C5.5 18.4 7 21 9 21s3.5-2.6 3.5-5c0-1.5-.5-2.9-1.2-3.8.7-.8 1.2-2.1 1.2-3.7C12.5 5.6 11.2 3 9 3zm8 1c-1.7 0-2.7 2-2.7 4.2 0 1.2.4 2.2.9 2.8-.5.7-.9 1.8-.9 2.9 0 1.9 1.1 3.9 2.7 3.9s2.7-2 2.7-3.9c0-1.1-.4-2.2-.9-2.9.5-.6.9-1.6.9-2.8C19.7 6 18.7 4 17 4z" class="fill"/></svg><span class="home-bar-label">La Carte</span></div>
        <div class="home-bar-item" data-k="settings" aria-label="Réglages"><svg viewBox="0 0 24 24"><path d="M20 3c-6 0-11 4-13 10l-3 8 8-3c6-2 10-7 10-13M8 16l8-8"/></svg><span class="home-bar-label">Réglages</span></div>
      </div>
      <div class="home-dock pan-fade"><div class="home-rows"></div></div>
      <div class="home-arena pan-fade"></div>`;
    const theRest = `
      <div class="home-rider" aria-hidden="true"><img class="home-rider-wake" alt="" decoding="async"><div class="home-rider-bob"><img class="home-rider-img" alt="" decoding="async"></div></div>
      <div class="home-motes" aria-hidden="true">${MOTES.map(() => '<i class="home-mote"></i>').join('')}</div>
      <div class="keyhint home-hint pan-fade"><span><b>▼</b>vers Ollivanders</span></div>
      <div class="home-dim"></div><div class="home-veil"></div><div class="home-disc"></div>
      <div class="home-launch"><img class="home-launch-banner" alt=""><div class="home-launch-logo"></div><div class="home-launch-title"></div><div class="home-launch-sub"></div></div>
      <div class="home-plate"><div class="home-plate-title engraved">Nox ?</div><div class="home-plate-sub">Passer en mode classique, sans décor ni chouette.</div><div class="home-plate-opts"><span class="home-plate-opt" data-v="yes">Oui, Nox</span><span class="home-plate-opt is-focus" data-v="no">Non</span></div></div>`;

    // The chrome (clock, crest, bar, dock, owl, hint) waits for the backdrop, so the first frame is never a half-built
    // page over flat night: until then the scene shows a tiny inline picture of the castle (home.css). A prepared
    // screen (router.js) is invisible until its pictures are decoded: nothing to hold there. The boot holds it under
    // its veil (boot()).
    if (!ctx.prepared) root.classList.add('is-waiting');
    this.loadScene();
    const t0 = performance.now();
    within(this.sceneReady, SCENE_WAIT_MS).then(() => {
      if (this.root !== root || !root.classList.contains('is-waiting')) return;
      root.classList.remove('is-waiting');
      // A wait the eye could see: the castle and the chrome come in together (one short fade of the chrome).
      if (!ctx.params.boot && performance.now() - t0 > 80 && !isReduced()) {
        root.classList.add('is-reveal');
        this.timers.push(setTimeout(() => { if (this.root === root) root.classList.remove('is-reveal'); }, 450 * K()));
      }
    });
    if (!await piece()) return;
    root.insertAdjacentHTML('beforeend', clockAndBar);
    this.syncBar();
    this.syncHouse();
    this.tick();
    this.armClock();
    if (!await piece()) return;
    this.buildDock();
    if (!await piece()) return;
    root.insertAdjacentHTML('beforeend', theRest);
    // The fly-by's pictures (rider, mist wake) are fetched and decoded now, off the main thread, so the first frame of a
    // Nox does not wait on them; hidden, they are never painted at rest.
    const rider = root.querySelector('.home-rider');
    [['.home-rider-img', 'assets/rider.webp'], ['.home-rider-wake', SCENE + 'mist-wake.webp']].forEach(([sel, src]) => {
      const im = rider.querySelector(sel);
      im.src = src; decoded(im);
    });
    if (!await piece()) return;
    this.sig = this.configSig();
    // A setting changed (or only lastApp, at each Lumos): only what changed is touched. The crest is rebuilt only
    // when the house changes (a rebuilt crest picture stays blank until it is decoded again). Parked behind the Map or the Room of
    // Requirement, the dock and the owl follow too, a moment later, out of the key's task.
    this.unsub = onConfigChange(() => {
      if (!this.root) return;
      if ((getConfig().house || null) !== this.houseShown) this.syncHouse();
      this.tick(); this.syncAmbiance();
      const r = isReduced(); if (r !== this.reduced) { this.reduced = r; this.parallax(true); this.syncClouds(); }
      if (this.away && this.configSig() !== this.sig) { clearTimeout(this.resyncTimer); this.resyncTimer = setTimeout(() => this.resync(), RESYNC_MS); }
    });
    // The system's reduced-motion flag too, and the page going to the background (another app on top): the clouds stop.
    this.mql = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.onMotion = () => { const r = isReduced(); if (r !== this.reduced) { this.reduced = r; this.parallax(true); this.syncClouds(); } };
    if (this.mql && this.mql.addEventListener) this.mql.addEventListener('change', this.onMotion);
    this.onVisible = () => this.syncClouds();
    document.addEventListener('visibilitychange', this.onVisible);
    this.measure();
    // A resize is the only time the dock's places change: measured here (its layout is clean) and never on a key.
    this.ro = new ResizeObserver(() => {
      if (root.clientWidth === this.W && root.clientHeight === this.H) return;
      this.measure();
      if (this.mode === 'nox') this.placeNoxClock(false); else this.layout(true);
    });
    this.ro.observe(root);
    this.syncOwl();
    this.layout(true);
    this.built = true;
    if (!this.away) this.armHint();
    this.syncAmbiance();
    if (ctx.config().sounds) ctx.fx.initAudio();
    if (ctx.params.boot) this.boot(this.reduced ? 300 : ctx.params.short ? 700 : 1300);
    if (ctx.params.nox) this.nox();
    if (ctx.params.askClassic) this.askPlate();
    // The TV lost the Home key to an update (HomeActivity.checkLostHome): offer to ask it back, once a day at most.
    this.onHomeEvent = (e) => {
      if (!this.root || !e.detail || !e.detail.lost || this.mode !== 'normal' || this.busy) return;
      if (Date.now() - (getConfig().homeNagAt || 0) < 86400e3) return;
      this.plate(true, { title: 'La télé a repris la touche Home', sub: 'Une mise à jour, sans doute. OK pour la redemander.',
        onYes: () => Platform.setHome('poudlard'), onNo: () => updateConfig({ homeNagAt: Date.now() }) });
    };
    document.addEventListener('poudlard:home', this.onHomeEvent);
    // A key that came before the last piece.
    if (this.keyLater) { const k = this.keyLater; this.keyLater = null; Input.press(k); }
  },
  // As it stands in place for its raster (router.js), or once after the boot: what shows only on a move is drawn once at an opacity that cannot
  // be seen (a layer at 0 is not rasterised): the owl's poses, the logos' shadows.
  warm() {
    const under = this.items.filter((el) => el !== this.sel).map((el) => el.querySelector('.home-under')).filter(Boolean);
    under.forEach((u) => { u.style.transition = 'none'; u.style.opacity = '.004'; });
    return (this.owl ? this.owl.warm() : new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).then(() => {
      under.forEach((u) => { u.style.opacity = ''; });
      if (under[0]) void getComputedStyle(under[0]).opacity;       // back at 0 with the transitions off, not fading there
      under.forEach((u) => { u.style.transition = ''; });
    });
  },
  // The owl follows the setting.
  syncOwl() {
    const off = getConfig().owl === 'absente';
    if (off && this.owl) { this.owl.destroy(); this.owl = null; }
    if (!off && !this.owl) {
      this.owl = createOwl(this.root.querySelector('.home-arena'), {
        sheet: 'assets/owl-sheet.webp', cells: OWL_CELLS, cols: OWL_COLS, feather: 'assets/feather.webp',
        size: this.W * 0.0615, reduced: () => this.reduced || getConfig().owl === 'calme',
      });
    }
  },
  // What the dock and the owl are built from: while the Parapet stands behind another screen, a change here is followed by resync().
  configSig() { const c = getConfig(); return JSON.stringify([c.dock, c.hidden, c.custom, c.passages, c.owl, c.text]); },
  resync() {
    clearTimeout(this.resyncTimer);
    if (!this.root || !this.built) return;
    this.sig = this.configSig();
    this.apps = this.dockList();
    const last = this.apps.findIndex((x) => x.id === getConfig().lastApp);
    this.i = last >= 0 ? last : Math.min(this.i, Math.max(0, this.apps.length - 1));
    this.syncOwl();
    this.buildDock();
    this.layout(true);
  },
  // It stands behind the Map or the Room of Requirement now (router.js), out of sight: it will come back to the dock, on the app last
  // launched, as a Parapet mounted anew would.
  onParked() {
    if (!this.root || !this.built) return;
    this.zone = 'dock';
    const last = this.apps.findIndex((a) => a.id === getConfig().lastApp);
    if (last >= 0) this.i = last;
    this.syncBar();
    this.layout(true);
  },
  // Who stands next to the Parapet on the camera's strip (router.js): the first shop window, one screen below.
  neighbours() {
    const first = LIBRARY.find((c) => c.scene && Array.isArray(c.scene.sprites) && c.scene.sprites.length);
    return first ? { 'pan-down': { name: 'library', params: { collection: first.id } } } : {};
  },
  // The camera is coming (router.js). Off screen the clouds stop; on arrival the help line shows for a moment. The chrome is at 0
  // as it starts (.pan-fade), so what changed while it was away is simply put right: the config it depends on (resync), an app
  // launched from another screen, and the owl, whom onLeave stopped wherever she was.
  onEnter() {
    if (!this.root) return;
    this.away = false; this.syncClouds();
    if (!this.built) return;
    this.armHint();
    if (this.configSig() !== this.sig) { requestAnimationFrame(() => this.resync()); return; }
    const last = getConfig().lastApp, k = last === this.lastSeen ? -1 : this.apps.findIndex((a) => a.id === last);
    this.lastSeen = last;
    if (k >= 0) { this.i = k; this.layout(true); return; }
    if (this.owl && this.items.length && this.mode === 'normal' && !this.owlAway && !this.owlNox) {
      const t = this.owlTarget();
      this.owl.show(); this.owl.teleport(t.x, t.y);
    }
  },
  // The TV's lists were read again (main.js, once another app has left the screen). The Parapet does not read them by itself while
  // it stays mounted: its faded apps and its HDMI names follow here, if they changed, out of any key's task. During a launch or an
  // edit nothing is touched, and the next time the lists are read says it again.
  listsRead() {
    if (!this.root || !this.built || this.busy || this.mode !== 'normal') return;
    const fresh = this.dockList(), print = (l) => JSON.stringify(l.map((a) => [a.id, a.name, Boolean(a.absent), a.input, a.port, a.connected]));
    if (print(fresh) === print(this.apps)) return;
    const id = this.apps[this.i] && this.apps[this.i].id, k = fresh.findIndex((a) => a.id === id);
    this.apps = fresh;
    if (k >= 0) this.i = k;
    this.buildDock();
    this.layout(true);
  },
  // "Nox ?", asked by long Back on another screen, once the Parapet is on screen. Called off if the camera leaves first (onLeave).
  askPlate() {
    clearTimeout(this.askTimer);
    this.askTimer = setTimeout(() => { if (this.root && this.built) this.plate(true); }, 750);
  },
  // This Parapet stood ready, off screen, and the camera is coming back: it only has to do what it was asked.
  revisit(params) {
    if (params.askClassic) this.askPlate();
    if (params.nox) this.timers.push(setTimeout(() => { if (this.root && this.built) this.nox(); }, 0));
  },

  // ---- The backdrop: every picture of the three planes, shown together once all are decoded. One that fails: the single
  // castle picture instead (assets/castle.jpg, still, no parallax, no clouds), then the night gradient. castle.jpg is never
  // fetched otherwise. The lit-windows layer is optional (no wave without it). ----
  loadScene() {
    const root = this.root, scene = root.querySelector('.home-scene');
    this.clouds = scene.querySelector('.home-clouds'); this.driftX = 0; this.driftHold = 0;
    this.planes = { sky: scene.querySelector('.home-sky'), castle: scene.querySelector('.home-castle'), fg: scene.querySelector('.home-fg') };
    const need = [...scene.querySelectorAll('img[data-s]')];
    this.sceneReady = new Promise((resolve) => {
      let left = need.length, failed = false;
      const done = (ok) => {
        if (this.root !== root) return resolve(false);
        if (!ok) { if (!failed) { failed = true; this.fallback(); } return resolve(false); }
        if (--left > 0 || failed) return;
        scene.classList.add('is-ready');
        this.sceneOk = true; this.syncAmbiance(); this.syncClouds();  // the clouds and the living ambience wait for the planes
        resolve(true);
      };
      need.forEach((im) => {
        im.onerror = () => done(false);
        im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).then(() => done(true), () => done(true)); };
        im.src = SCENE + im.dataset.s;
      });
    });
    this.loadLit();
  },
  // The lit windows: six clipped copies of one picture (one fetch, one decode, done now so the first wave never
  // waits on it). Hidden at rest.
  loadLit() {
    const root = this.root, lit = root.querySelector('.home-lit'); if (!lit) return;
    const bands = [...lit.querySelectorAll('.home-lit-band')], first = bands[0].querySelector('img');
    first.onload = () => { decoded(first); if (this.root === root && lit.isConnected) this.lit = { el: lit, bands, anims: [], out: null, timer: 0, outMs: 900 }; };
    first.onerror = () => lit.remove();
    bands.forEach((b) => { b.querySelector('img').src = SCENE + 'lit-windows.webp'; });
  },
  fallback() {
    const root = this.root, scene = root.querySelector('.home-scene');
    this.flat = true; this.planes = null; this.clouds = null; this.lit = null; this.shift = { sky: 0, castle: 0, fg: 0 };
    clearInterval(this.driftTimer); this.driftTimer = 0;
    scene.querySelectorAll('.home-layer').forEach((l) => { l.querySelectorAll('img').forEach((im) => { im.onload = im.onerror = null; im.removeAttribute('src'); }); l.remove(); });
    const img = document.createElement('img');
    img.className = 'home-fallback'; img.alt = ''; img.decoding = 'async';
    img.onerror = () => { img.remove(); root.classList.add('no-castle'); };
    img.src = 'assets/castle.jpg';
    scene.prepend(img);
    const tint = document.createElement('i'); tint.className = 'home-tint';        // over this one picture, the sky's tint is plain
    scene.append(tint);
    const shade = document.createElement('div'); shade.className = 'home-shade';   // the planes have it baked in; this picture does not
    scene.after(shade);
    scene.classList.add('is-ready');
    this.syncAmbiance();
  },
  // The clouds drift while the Parapet is there to be seen: not before the planes are in, not under reduced motion (the sky is
  // then the picture), stopped during a launch, in Nox and while another app covers the page, and for a moment after each key: a
  // step costs a frame of the whole sky, and a move on screen needs every frame it can get (nobody sees them stop that long).
  syncClouds() {
    const root = this.root; if (!root) return;
    const on = this.sceneOk && !this.flat && !this.reduced && !this.away && !this.busy && !root.classList.contains('nox') && !document.hidden;
    if (on === Boolean(this.driftTimer)) return;
    clearInterval(this.driftTimer); this.driftTimer = 0;
    if (on) this.driftTimer = setInterval(() => this.driftStep(), 1000 / DRIFT_STEPS);
  },
  // One device px to the left; the picture is seamless over the 1024 CSS px of a 960 wide screen, so it starts over there.
  driftStep() {
    if (!this.clouds || !this.W || performance.now() < this.driftHold) return;
    const loop = this.W * 1024 / 960;
    this.driftX = (this.driftX + 1 / (window.devicePixelRatio || 1)) % loop;
    this.clouds.style.transform = `translateX(${-this.driftX}px)`;
  },

  // ---- Depth: the planes slide a few px as the focus moves along the dock (Apple TV style), the foreground most, the
  // sky and the castle less and together, then rest. Transform only, on whole device pixels (a still plane stays 1:1 sharp).
  // Reduced motion: the planes stay put. ----
  parallax(instant) {
    if (!this.planes || !this.root) return;
    const W = this.W; if (!W) return;
    const n = this.items.length, row = Math.floor(this.i / PER_ROW), inRow = Math.min(PER_ROW, n - row * PER_ROW);
    const half = (inRow - 1) / 2, u = this.reduced || inRow < 2 ? 0 : (this.i - row * PER_ROW) - half;
    const dpr = window.devicePixelRatio || 1, px = W / 960;
    const next = {};
    for (const [name, d] of Object.entries(DEPTH)) {
      const step = half > 0 ? Math.min(d.step, d.max / half) : 0;
      next[name] = Math.round(-u * step * px * dpr) / dpr || 0;       // camera right: the scene slides left
    }
    if (next.sky === this.shift.sky && next.castle === this.shift.castle && next.fg === this.shift.fg) return;
    this.shift = next;
    const scene = this.root.querySelector('.home-scene');
    if (instant) scene.classList.add('is-instant');
    for (const name of Object.keys(DEPTH)) this.planes[name].style.transform = next[name] ? `translateX(${next[name]}px)` : '';
    if (instant) { void getComputedStyle(this.planes.sky).transform; scene.classList.remove('is-instant'); }
  },

  // ---- The lit windows: a wave from left to right (each band fades in after its delay), then, after `hold`, the
  // whole layer fades out as one and is hidden again (nothing painted at rest). preset: a WAVE key. ----
  lightWindows(preset) {
    const L = this.lit, o = WAVE[preset];
    if (!L || !o || !this.root || this.reduced) return;
    this.litStop();
    const k = K();
    L.el.classList.add('on');
    L.anims = L.bands.map((b, j) => b.animate([{ opacity: 0 }, { opacity: o.peak }],
      { duration: o.fade * k, delay: LIT_BANDS[j][2] * o.span * k, easing: 'cubic-bezier(.3, 0, .2, 1)', fill: 'both' }));
    L.outMs = o.out;
    if (o.hold != null) L.timer = setTimeout(() => this.litOut(o.out), (o.span + o.fade + o.hold) * k);
  },
  litOut(ms) {
    const L = this.lit;
    if (!L || !L.anims.length || L.out || !this.root) return;
    clearTimeout(L.timer);
    L.out = L.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: (ms || L.outMs) * K(), easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' });
    L.out.onfinish = () => this.litStop();
  },
  litStop() {
    const L = this.lit; if (!L) return;
    clearTimeout(L.timer);
    L.anims.forEach((a) => a.cancel()); L.anims = [];
    if (L.out) { L.out.onfinish = null; L.out.cancel(); L.out = null; }
    L.el.classList.remove('on');
  },

  // ---- Ambiance vivante (config.ambiance): the lake shimmer (two pictures in the castle plane) and the mist drift
  // (two tiles in a mist layer under the pines) exist only while it is on; they pause during Lumos and Nox. ----
  syncAmbiance() {
    const root = this.root; if (!root) return;
    const on = isAmbianceOn() && !this.flat && this.sceneOk;
    if (on && !this.amb) {
      const castle = root.querySelector('.home-castle');
      const els = ['a', 'b'].map((v) => { const im = document.createElement('img'); im.className = `home-shimmer home-shimmer-${v}`; im.alt = ''; im.decoding = 'async'; im.src = `${SCENE}lake-shimmer-${v}.webp`; castle.appendChild(im); return im; });
      const mist = document.createElement('div'); mist.className = 'home-mist'; mist.innerHTML = '<div class="home-drift"><i></i><i></i></div>';
      castle.after(mist); els.push(mist);
      this.amb = { els };
    } else if (!on && this.amb) {
      this.amb.els.forEach((e) => { if (e.tagName === 'IMG') e.removeAttribute('src'); e.remove(); });
      this.amb = null;
    }
    root.classList.toggle('amb-on', on);
    this.ambPause();
  },
  ambPause() { if (this.root) this.root.classList.toggle('amb-paused', Boolean(this.amb) && (this.mode === 'nox' || this.busy)); },

  // The Home key (router.js): the Parapet goes back to its entry state, whatever it was doing. True = handled.
  onHome() {
    if (!this.root) return false;
    if (!this.built) return true;
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
  // starfield freed when it is not on screen, the windows put out. Nothing is lost: everything is rebuilt on the next event.
  trim() {
    if (!this.root) return;
    if (this.owl) this.owl.stop();
    if (this.mode !== 'nox') this.dropStars();
    else this.clearFly();
    if (!this.busy) this.litStop();
  },

  // The camera leaves (router.js): what floats in front of the castle fades by itself (.pan-fade), she stops where she is.
  onLeave(transition, staysBehind) {
    clearTimeout(this.askTimer);
    if (!this.root || (transition !== 'pan-down' && transition !== 'pan-up' && !staysBehind)) return;
    clearTimeout(this.hintTimer);
    this.away = true; this.lastSeen = getConfig().lastApp; this.syncClouds();
    if (this.owl) this.owl.stop();
  },

  // The chosen house: its crest under the clock, its name, and its colours (wax, glow) everywhere via main.js.
  syncHouse() {
    const c = getConfig(); const h = c.house ? HOUSES[c.house] : null;
    const el = this.root.querySelector('.home-crest'); if (!el) return;
    this.houseShown = c.house || null;
    el.innerHTML = '';
    if (h) mountCrest(el, c.house, 'home-crest-svg');
    el.classList.toggle('show', Boolean(h));
  },

  unmount() {
    this.mountGen++; clearTimeout(this.resyncTimer); clearInterval(this.driftTimer); this.driftTimer = 0;
    if (this.unsub) this.unsub();
    if (this.onHomeEvent) document.removeEventListener('poudlard:home', this.onHomeEvent); this.onHomeEvent = null;
    document.removeEventListener('visibilitychange', this.onVisible);
    if (this.mql && this.mql.removeEventListener) this.mql.removeEventListener('change', this.onMotion);
    if (this.mode === 'nox') this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    this.timers.forEach(clearTimeout);
    this.launchTimers.forEach(clearTimeout); this.launchTimers = [];
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    clearTimeout(this.clockTimer); clearTimeout(this.hintTimer); clearTimeout(this.askTimer);
    this.clearFly();
    this.howls++;
    this.litStop(); this.lit = null;
    if (this.amb) { this.amb.els.forEach((e) => e.remove()); this.amb = null; }
    if (this.ro) this.ro.disconnect();
    if (this.owl) this.owl.destroy();
    this.owl = null;
    this.dropStars();
    this.planes = null;
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
      row.className = chunk.length && chunk.length <= 3 ? 'home-row is-few' : 'home-row';
      if (!chunk.length) { row.innerHTML = '<div class="home-empty engraved">Le parapet est vide · ▲ La Carte</div>'; }
      chunk.forEach((app) => {
        const L = logoOf(app);
        const el = document.createElement('div');
        el.className = app.absent ? 'home-app is-absent' : 'home-app';
        el.dataset.id = app.id;
        const box = logoBox(L, LOGO_H, LOGO_W_MAX);           // equal visual weight across the row
        el.style.width = box.w.toFixed(2) + 'cqw'; el.style.height = box.h.toFixed(2) + 'cqw';
        const luma = L.luma ? ' luma' : '';
        // Under it: its soft shadow. On the lift: the logo, one layer painted once (home.css).
        el.innerHTML = `<div class="home-under"><i class="home-app-shadow"></i></div><div class="home-lift"><div class="app-logo home-logo${luma}"><i class="l-rimD"></i><i class="l-base"></i></div></div>`;
        el.style.setProperty('--m', `url("${L.src}")`);   // the logo's mask
        el.title = app.name;   // no name shown under the icon (by design)
        row.appendChild(el);
        this.items.push(el);
      });
      rows.appendChild(row);
    });
    this.root.classList.toggle('two-rows', chunks.length > 1);
    if (this.i >= this.items.length) this.i = Math.max(0, this.items.length - 1);
    this.sel = null;
    if (this.W) this.measure();                                // a rebuilt dock (mount does its own, once)
  },
  // The stage's size and the place of every app, relative to the screen. The only layout this screen reads for the dock: at the
  // mount, on a resize, when the dock is rebuilt. The app boxes are never transformed by a focus; their places hold at all times.
  measure() {
    const root = this.root, rr = root.getBoundingClientRect();
    this.W = root.clientWidth; this.H = root.clientHeight;
    this.geo = this.items.map((el) => { const r = el.getBoundingClientRect(); return { cx: r.left - rr.left + r.width / 2, cy: r.top - rr.top + r.height / 2, w: r.width, h: r.height, top: r.top - rr.top }; });
  },

  // The time and the date. Rewritten once a minute (armClock), never per frame.
  tick() {
    if (!this.root) return;
    const now = new Date();
    // Two formatters made once per page life (each toLocale…String call builds a new one: about 35 ms on the TV).
    if (!FMT.time) { FMT.time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }); FMT.date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); }
    // Only what changed is written (a config change calls this too: an unchanged clock costs nothing).
    const set = (sel, text) => { const n = this.root.querySelector(sel); if (n.textContent !== text) n.textContent = text; };
    set('.home-time', FMT.time.format(now));
    const d = FMT.date.format(now);
    set('.home-date', d.charAt(0).toUpperCase() + d.slice(1));
    const sky = getConfig().sky === 'nuit' ? 'night' : skyState(now.getHours());
    if (this.root.dataset.sky !== sky) this.root.dataset.sky = sky;
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

  armHint() {
    clearTimeout(this.hintTimer);
    const hint = this.root.querySelector('.home-hint');
    if (!hint) return;
    hint.classList.remove('hidden');
    this.hintTimer = setTimeout(() => { if (this.root) hint.classList.add('hidden'); }, HELP_MS);
  },

  // ---- Top-right bar ----
  syncBar() {
    const c = getConfig();
    this.root.querySelectorAll('.home-bar-item').forEach((el, n) => {
      el.classList.toggle('is-focus', this.zone === 'bar' && n === this.bar);
      if (el.dataset.k === 'sound') { el.classList.toggle('off', !c.sounds); const l = el.querySelector('.home-bar-label'), t = c.sounds ? 'Son' : 'Muet'; if (l.textContent !== t) l.textContent = t; }
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

  // ---- Layout: focus (the logo lifts, its shadow comes up: home.css), depth (the planes slide), owl. A key's
  // path: two classes and the animations it starts, nothing read from the layout. ----
  layout(instant, quiet) {
    if (!this.W) return;
    const next = this.zone === 'dock' ? this.items[this.i] || null : null;
    if (next !== this.sel) {
      if (this.sel) this.sel.classList.remove('is-sel');
      if (next) next.classList.add('is-sel');
      this.sel = next;
    }
    this.parallax(instant);
    if (!this.items.length) { if (this.owl) this.owl.hide(); return; }
    const el = this.items[this.i];
    if (this.owl && !this.owlAway) this.owl.show();
    if (!this.owl) return;
    const t = this.owlTarget();
    if (instant) this.owl.teleport(t.x, t.y);
    else this.owl.flyTo(t.x, t.y, { timeScale: K(), quiet, onLand: () => this.land(el) });
  },
  // The focused app settles under the owl's weight (a small dip of its lift, 200 ms). On the logo inside the lift, whose own transition of
  // the transform may not be over (two animations of one property on one element: neither runs on the compositor), and let go
  // when it ends (router.js, finished transitions).
  land(el) {
    if (!el || this.reduced || !this.root || el !== this.sel) return;
    const px = this.W * FOCUS_LIFT / 100;
    const a = el.querySelector('.home-logo').animate([{ transform: 'none' }, { transform: `translateY(${px * 0.14}px) scale(.994)`, offset: 0.45 }, { transform: 'none' }], { duration: 200 * K(), easing: 'cubic-bezier(.3, .5, .15, 1)' });
    a.onfinish = () => a.cancel();
  },
  press(on) {
    const el = this.zone === 'bar' ? this.root.querySelectorAll('.home-bar-item')[this.bar] : this.items[this.i];
    if (el) el.classList.toggle('is-press', on);
  },
  // Where Hedwig perches: over the focused logo, on one line above the row: the top of its tallest logo once lifted, a little
  // over it. Her feet are on that line whatever the logo's shape, so she is never seated on a glyph and never changes height.
  owlTarget() {
    const b = this.geo[this.i], W = this.W;
    const row = this.geo.slice(Math.floor(this.i / PER_ROW) * PER_ROW, (Math.floor(this.i / PER_ROW) + 1) * PER_ROW);
    const line = Math.min(...row.map((g) => g.cy - g.h * FOCUS_SCALE / 2)) - (FOCUS_LIFT + 0.5) * W / 100;
    const s = this.owl.size();
    return { cx: b.cx, x: b.cx - s.w / 2, y: line - s.h };
  },

  // ---- Lumos ----
  // t=0 the press: the castle's windows light up in a wave from left to right (300 ms from the first band to the last, each band
  // 320 ms) and the owl lifts off, the clouds pause, before any other work; the logo dips · t=100 the cue · t=180 the card is
  // filled (the TV's banner is a bridge call and a picture to decode: never in the press's frame) · t=350 the intent, then lastApp
  // is saved · t=420 the backdrop dims and the launch card comes up. On the TV the app usually covers the screen soon after.
  // Until the intent, Back cancels everything (nothing was started yet).
  // When the Parapet comes back (done), the windows go back to the castle's own light (one 900 ms fade).
  async launch() {
    if (this.busy) return;
    const app = this.apps[this.i]; if (!app) return;
    this.busy = true;                                         // keys still reach onKey (Back cancels) until the intent fires
    this.lightWindows('lumos');                               // the light first
    if (this.owl) this.owl.liftOff(500);
    this.syncClouds();
    let held = false, heldMusic = false;
    const root = this.root, fx = this.ctx.fx, k = K();
    const item = this.items[this.i];
    const timers = []; this.launchTimers = timers;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms * k));
    item.classList.add('is-press');
    this.ambPause();
    this.cancelUntil = performance.now() + CANCEL_MS * k;
    const box = root.querySelector('.home-launch');
    at(100, () => {
      item.classList.remove('is-press');
      if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
    });
    at(420, () => root.querySelector('.home-dim').classList.add('on'));   // with the card: the wave is seen whole
    at(180, () => {
      const L = logoOf(app);
      const lg = box.querySelector('.home-launch-logo'), banner = box.querySelector('.home-launch-banner');
      lg.className = `home-launch-logo app-logo lit${L.luma ? ' luma' : ''}`;
      lg.innerHTML = '<i class="l-rimD"></i><i class="l-base"></i>';
      lg.style.setProperty('--m', `url("${L.src}")`);
      const uri = app.pkg ? Platform.appIcon(app.pkg) : null;        // the TV's own banner when it has one
      box.classList.toggle('has-banner', Boolean(uri));
      banner.decoding = 'async';
      if (uri) banner.src = uri; else banner.removeAttribute('src');
      box.querySelector('.home-launch-title').textContent = `Ouverture de ${app.name}`;
      box.querySelector('.home-launch-sub').textContent = app.port ? `Entrée HDMI ${app.port}` : app.input ? `Entrée ${app.input}` : '';
    });
    const showCard = setTimeout(() => box.classList.add('show'), 420 * k); timers.push(showCard);
    const done = () => {
      timers.forEach(clearTimeout);
      box.classList.remove('show'); root.querySelector('.home-dim').classList.remove('on');
      item.classList.remove('is-press');
      this.litOut();
      if (this.owl) { const t = this.owlTarget(); this.owl.comeBack(t.x, t.y); }
      this.cancelUntil = 0; this.busy = false; this.launchDone = null;
      this.ambPause(); this.syncClouds();
      if (held) { held = false; Input.release(); }
      if (heldMusic) { heldMusic = false; if (fx.ambientHold) fx.ambientHold(false, 'launch'); }   // the music comes back with the Parapet
    };
    this.launchDone = done;
    // The intent fires at 350 ms; from then on keys are queued and replayed at the end. The TV's answer decides the rest:
    // refused → everything settles at once and the Howler reads the TV's sentence; taken → the card stays while the app takes the
    // screen (4 s), 2.4 s in the mock-up. lastApp is saved right after the intent (its storage write and the config listeners never
    // land in the light's first frames).
    at(CANCEL_MS, async () => {
      this.cancelUntil = 0;
      held = true; Input.hold();
      if (fx.ambientHold) { fx.ambientHold(true, 'launch'); heldMusic = true; }   // lifted by done(): never by a timer that done() could cancel
      const r = Platform.launch(app);
      updateConfig({ lastApp: app.id });
      if (r.status === 'failed') {
        clearTimeout(showCard);
        done();
        if (fx.cue) fx.cue('error');
        if (this.owl) this.owl.startle();
        const action = r.missing && app.pkg ? { label: 'Retirer du parapet', onChoose: () => this.removeFromDock(app.id) } : undefined;
        this.howl({ message: r.error, action });
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

  // ---- Boot: a Lumos. Dark screen, a point of light that opens, the castle appears, its windows light up (the gentle
  // wave, when the lit layer is already decoded), the clock writes itself, the dock rises, the owl arrives last.
  // `ms`: the whole thing (1300 cold, 700 short, 300 reduced). Transform and opacity only: the veil (a night layer)
  // fades while the disc grows; no clip-path. ----
  // The sequence starts once the backdrop is decoded (SCENE_WAIT_MS at most): until then the veil holds the screen
  // dark, so the castle is there when the light opens, never the chrome over an empty night.
  boot(ms) {
    const root = this.root; root.classList.add('booting');
    Input.hold();
    within(this.sceneReady, SCENE_WAIT_MS).then(() => { if (this.root === root) this.bootRun(ms); else Input.release(); });
  },
  bootRun(ms) {
    const root = this.root;
    const W = this.W, H = this.H;
    const disc = root.querySelector('.home-disc');
    const k = K();
    const s = ms / 1300;                                      // the short and reduced boots keep the same shape, compressed
    const at = (t, fn) => this.timers.push(setTimeout(fn, t * s * k));
    const pos = `translate(${W * 0.5}px, ${H * 0.58}px)`;
    const owlArrives = Boolean(this.owl && this.items.length && !this.reduced);
    this.owlAway = owlArrives;
    if (owlArrives) this.owl.hide();                            // she is not on her perch yet: she flies in at 700
    if (!this.reduced) disc.animate([
      { opacity: 0, transform: `${pos} scale(.02)` }, { opacity: 1, transform: `${pos} scale(.12)`, offset: 0.2 },
      { opacity: 0.8, transform: `${pos} scale(3)`, offset: 0.65 }, { opacity: 0, transform: `${pos} scale(7)` },
    ], { duration: 900 * s * k, easing: 'cubic-bezier(.4,0,.2,1)' });
    at(180, () => root.classList.add('boot-open'));            // the veil lifts (home.css, 600 ms)
    at(320, () => { if (this.mode === 'normal' && !this.busy) this.lightWindows('wake'); if (this.ctx.fx.cue) this.ctx.fx.cue('wake'); });
    at(480, () => { const c = root.querySelector('.home-clock'); c.classList.add('write-in'); root.classList.remove('booting'); });
    // The boot is over when the sequence has run AND the owl has landed: then main.js may arm the sound (its start-up
    // AudioContext costs one long frame, kept out of every boot movement).
    let pending = owlArrives ? 2 : 1;
    const settled = () => { if (--pending === 0) { this.warm(); window.dispatchEvent(new CustomEvent('poudlard:booted')); } };
    at(700, () => {
      this.owlAway = false;
      if (owlArrives && this.owl) {
        const t = this.owlTarget();
        this.owl.comeBack(t.x, t.y, { onLand: () => { this.land(this.items[this.i]); this.timers.push(setTimeout(settled, 500)); } });
      } else if (owlArrives) settled();
    });
    at(1300, () => {
      if (!this.root) return;
      root.querySelector('.home-clock').classList.remove('write-in');
      root.classList.remove('boot-open');
      Input.release();
      settled();
    });
  },

  // ---- Nox ----
  // Entrance: the fly-by. Harry on his broom crosses the Parapet left to right, above the owl, at speed; a few hard
  // motes of warm light stay behind the bristles where they passed and fade (no streak, no glow), a mist wake rolls
  // off the broom (home.css); each app goes out the moment his hand passes it (one timer per app, from the same ease:
  // no per-frame work), Hedwig takes off as he flies over her, then the Nox state settles (settleNox).
  // Timeline (× --k): his layer is shown and promoted first, off-screen, and the crossing starts two frames later
  // (its picture decoded, its layer rasterised: no hitch on the first frames) · 0 he starts (1600 ms), hint/bar/crest
  // fade (600) · the apps go out one by one · 1600 he is gone · 1700 settleNox. All of it transform and opacity, on the
  // compositor. Reduced motion, or the rider picture missing: straight to settleNox (fades).
  nox() {
    if (this.mode === 'nox') return;
    this.mode = 'nox';
    this.litStop();
    this.ambPause();
    this.ctx.fx.setRate(66);
    if (this.ctx.fx.ambientHold && getConfig().musicNox !== 'continue') this.ctx.fx.ambientHold(true, 'nox');   // the music waits, unless asked to go on
    if (this.ctx.fx.cue) this.ctx.fx.cue('nox');
    if (!this.flyBy()) this.settleNox();
  },
  // True when the fly-by started; false when it cannot (reduced motion, or the rider picture missing / not loaded yet).
  flyBy() {
    const root = this.root, W = this.W;
    const layer = root.querySelector('.home-rider'), img = layer && layer.querySelector('.home-rider-img');
    if (this.reduced || !layer || !img || !img.complete || !img.naturalWidth || !W) return false;
    const k = K();
    const DUR = FLY_MS * k;
    root.classList.add('nox-fly');
    // His height: the broom passes just over the owl's head (or over the logos when she is absent), never through them.
    const lh = RIDER_W * W / 100 * 216 / 399;                  // home.css .home-rider
    let clear;
    if (this.owl && this.items.length) { const t = this.owlTarget(), s = this.owl.size(); clear = t.y - 0.2 * s.h - 0.012 * W; }
    else clear = (this.geo.length ? Math.min(...this.geo.map((g) => g.top)) : this.H * 0.76) - 0.03 * W;
    const top = Math.round(Math.max(this.H * 0.12, clear - lh));
    layer.style.top = top + 'px';
    // The time a point of the layer (`at`, a fraction of its width) reaches x cqw, from the crossing's own ease.
    const when = (x, at = NOSE) => flyEase.inverse(Math.max(0, Math.min(1, (x - FLY_X0 - RIDER_W * at) / (FLY_X1 - FLY_X0)))) * DUR;
    const centres = this.geo.map((g) => g.cx / W * 100);
    const owlAt = this.owl && this.items[this.i] ? centres[this.i] : null;
    // Shown and promoted first, still off-screen (home.css .fly), then the crossing two frames later.
    layer.classList.add('fly');
    const gen = ++this.flyGen;
    const start = () => {
      if (this.flyGen !== gen || this.mode !== 'nox' || !this.root) return;
      layer.classList.add('go');
      this.riderAnim = layer.animate([{ transform: `translateX(${FLY_X0}cqw)` }, { transform: `translateX(${FLY_X1}cqw)` }],
        { duration: DUR, easing: `cubic-bezier(${FLY_EASE.join(',')})`, fill: 'forwards' });
      const anim = this.riderAnim;
      anim.onfinish = () => { if (this.riderAnim !== anim) return; anim.cancel(); this.riderAnim = null; layer.classList.remove('fly', 'go'); };
      // The motes: where the bristles pass, at the height they pass at (the bob included), each fading in 300 ms.
      const tipY = top + TAIL[1] * lh + 0.004 * W;
      this.motes = [...root.querySelectorAll('.home-mote')].map((m, j) => {
        const x = MOTES[j] * 100, t = when(x, TAIL[0]);
        m.style.transform = `translate(${(MOTES[j] * W).toFixed(1)}px, ${(tipY + bobAt(t / DUR) * W / 100 + (j % 2 ? 0.1 : -0.1) * W / 100).toFixed(1)}px)`;
        return m.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.1 }, { opacity: 0 }], { duration: MOTE_MS * k, delay: t, easing: 'linear', fill: 'backwards' });
      });
      // Each app goes out as his hand passes it.
      this.items.forEach((el, j) => { this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox') el.classList.add('is-out'); }, when(centres[j]))); });
      // Hedwig: as he flies over her, she takes off in his wake and leaves the frame (her perch is going out).
      if (owlAt != null) this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox' && this.owl && !this.owlNox) { this.owlNox = true; this.owl.liftOff(900); } }, when(owlAt + 3)));
      this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox' && this.root) this.settleNox(); }, (FLY_MS + 100) * k));
    };
    decoded(img).then(() => requestAnimationFrame(() => requestAnimationFrame(start)));
    return true;
  },
  // The rider, the motes and the per-app extinction all reset: used by wake() and before a new fly-by.
  clearFly() {
    const root = this.root; if (!root) return;
    this.flyGen++;                                             // a crossing still waiting for its frames never starts
    if (this.riderAnim) { this.riderAnim.onfinish = null; this.riderAnim.cancel(); this.riderAnim = null; }
    if (this.motes) { this.motes.forEach((a) => a.cancel()); this.motes = null; }
    const layer = root.querySelector('.home-rider'); if (layer) layer.classList.remove('fly', 'go');
    root.classList.remove('nox-fly');
    this.items.forEach((it) => it.classList.remove('is-out'));
  },
  // The Nox starfield: one static canvas the size of the screen (CSS px), created when Nox settles, removed on wake.
  makeStars() {
    if (this.root.querySelector('.home-stars')) return;
    const W = this.W, H = this.H; if (!W) return;
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
    this.root.querySelector('.home-night').after(cv);
    void getComputedStyle(cv).opacity;                         // the fade-in starts from 0
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
    const W = this.W, H = this.H;
    if (move && !this.reduced) this.wander = { x: (Math.random() * 2 - 1) * 0.3 * W, y: (Math.random() * 2 - 1) * 0.03 * H };
    else if (!move) this.wander = { x: 0, y: 0 };
    const left = clock.offsetLeft, top = clock.offsetTop, w = clock.offsetWidth, h = clock.offsetHeight;
    const dx = W / 2 - (left + w / 2) + this.wander.x, dy = H * NOX_CLOCK_Y - (top + h / 2) + this.wander.y;
    clock.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${NOX_CLOCK_SCALE})`;
    // The date line, left-aligned under the time at rest, is centred under it here (a transform too).
    const time = clock.querySelector('.home-time'), date = clock.querySelector('.home-date');
    const off = (time.offsetWidth - date.offsetWidth) / 2;
    date.style.transform = off > 0 ? `translateX(${off.toFixed(1)}px)` : '';
  },
  // The Nox state proper: a still starfield, the clock centred (then moving once a minute), the scene lowered (one
  // opacity fade of a night layer). The owl is away (she left with the rider, or fades out when there is no fly-by):
  // the apps she perches on are out. Nothing loops (the living ambience pauses).
  settleNox() {
    const root = this.root; root.classList.add('nox');
    this.syncClouds();
    this.clearFly();
    this.items.forEach((it) => it.classList.add('is-out'));
    if (this.owl && !this.owlNox) { this.owlNox = true; this.owl.hide(); }
    this.makeStars();
    this.placeNoxClock(false);
  },
  // Wake: the night lifts, the windows come back in a gentle wave (slower and softer than Lumos), the apps return,
  // Hedwig swoops back onto the focused app.
  wake() {
    if (this.mode !== 'nox') return;
    this.mode = 'normal';
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    this.clearFly();                                           // rider off-screen, mist settled, every app back
    this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    if (this.ctx.fx.ambientHold) this.ctx.fx.ambientHold(false, 'nox');
    const root = this.root; root.classList.remove('nox');
    this.ambPause(); this.syncClouds();
    const clock = root.querySelector('.home-clock'); clock.style.transform = '';
    const date = clock.querySelector('.home-date'); date.style.transform = '';
    this.dropStars();
    this.lightWindows('wake');
    if (this.ctx.fx.cue) this.ctx.fx.cue('wake');
    // Hedwig comes back: a swoop down onto the focused app (a plain fade-in in reduced motion).
    const away = this.owlNox; this.owlNox = false;
    if (this.owl && away) { this.owl.hide(); this.owlAway = true; }
    this.layout(true);
    if (this.owl && away) {
      this.owlAway = false;
      if (this.reduced || !this.items.length) this.layout(true);
      else {
        const t = this.owlTarget();
        this.owl.comeBack(t.x, t.y, { onLand: () => { if (!this.root || this.mode === 'nox') return; this.land(this.items[this.i]); } });
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
    else if (choice === 'appinfo') { const r = Platform.openSystem('appinfo', app.pkg); if (r.status === 'failed') this.howl({ message: r.error }); }
    else if (choice === 'info') this.howl({ message: this.infoText(app) });
  },
  // "Infos": one plain French sentence, never a package name or an input id.
  infoText(app) {
    const n = app.name;
    if (app.absent) return app.cat === 'passage'
      ? `${n} : cette entrée n’existe pas sur cette télé. « Retirer du parapet » l’enlève.`
      : `${n} n’est pas installée sur cette télé. « Retirer du parapet » l’enlève.`;
    if (app.port) return `${n} : entrée HDMI ${app.port}${app.connected === false ? ', rien n’y est branché pour l’instant' : ''}.`;
    if (app.cat === 'passage') return `${n} : une entrée de la télé.`;
    if (app.custom) return `${n} : ajoutée à la main sur la Carte du Maraudeur.`;
    return `${n} : sur la télé, « Infos de l’appli » ouvre sa page.`;
  },
  // A Howler over the Parapet: while it is up, the dock and the owl step back, so the card
  // never sits over half-hidden logos; they come back when it burns out.
  async howl(opts) {
    const b = await loadBeuglante(); if (!b || !this.root) return;
    const root = this.root;
    root.classList.add('howling');
    b(root, opts);
    const gen = ++this.howls;
    const cards = root.querySelectorAll('.beuglante'), card = cards[cards.length - 1];
    const back = () => { if (this.root === root && this.howls === gen) root.classList.remove('howling'); };
    if (!card) { back(); return; }
    const mo = new MutationObserver(() => { if (!card.isConnected) { mo.disconnect(); back(); } });
    mo.observe(root, { childList: true });
  },
  removeFromDock(id) { updateConfig({ dock: getConfig().dock.filter((x) => x !== id) }); this.rebuild(); },
  rebuild() { if (!this.root) return; this.sig = this.configSig(); this.apps = this.dockList(); this.i = Math.min(this.i, Math.max(0, this.apps.length - 1)); this.buildDock(); this.layout(true); },
  enterMove() { this.mode = 'move'; this.items[this.i].classList.add('lifted'); },
  swap(dir) {
    const j = this.i + dir; if (j < 0 || j >= this.apps.length) return;
    const dock = [...getConfig().dock]; [dock[this.i], dock[j]] = [dock[j], dock[this.i]];
    updateConfig({ dock }); this.sig = this.configSig(); this.apps = this.dockList(); this.i = j; this.buildDock(); this.items[this.i].classList.add('lifted'); this.layout(true);
  },
  leaveMove() { this.mode = 'normal'; this.items.forEach((it) => it.classList.remove('lifted')); },

  goMap(ctx) {
    const b = this.geo[this.i] || { cx: this.W / 2, cy: this.H * 0.78 };
    const app = this.apps[this.i];
    if (ctx.fx.cue) ctx.fx.cue('enter');
    ctx.router.go('map', { app: app ? app.id : null, from: { x: b.cx / this.W, y: b.cy / this.H } }, 'down');
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
    this.driftHold = performance.now() + DRIFT_HOLD_MS;
    // Still being built (the camera outran the mount): Down needs nothing of it; any other key is played when it is whole.
    if (!this.built && action !== 'down') { if (action !== 'okdown') this.keyLater = action; return true; }
    if (action === 'okdown') { if (!this.busy && this.mode !== 'nox') this.press(true); return true; }
    if (this.mode === 'nox') { this.wake(); return action !== 'left' && action !== 'right'; }   // any key wakes her, and OK launches nothing
    if (this.busy) { if (action === 'back') this.cancelLaunch(); return true; }
    this.press(false);
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
      if (action === 'down' || action === 'back') { this.zone = 'dock'; this.syncBar(); this.layout(false, true); return true; }
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
    if (action === 'down') {                                  // one vertical move of the camera (router.js)
      const next = this.neighbours()['pan-down'];
      if (next) { if (ctx.fx.cue) ctx.fx.cue('enter'); else ctx.fx.chime(880, 0.03); ctx.router.go(next.name, next.params, 'pan-down'); }
      return true;
    }
    if (action === 'up') { this.zone = 'bar'; this.syncBar(); this.layout(false, true); return true; }
    if (action === 'longback') { this.plate(true); return true; }
    return false;
  },
};
