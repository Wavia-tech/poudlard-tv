// The Parapet (home): a single cinematic shot. The castle in three planes, the time with a drop cap, the apps engraved
// in gold and centred over a night fade, Hedwig (Hedwige) landing on the chosen app, and a discreet bar in the
// top-right corner (sound, Map, Settings). Lumos (launch), the boot sequence and Nox (idle) all live here.
//
// Nothing moves when nothing happens. At rest the Parapet runs no requestAnimationFrame, no CSS animation, no
// interval: the backdrop is three still pictures (assets/scene/: sky, castle, foreground), the mist is still, the owl
// is still, the clock is rewritten once a minute by a timer aligned on the minute. Every movement is an answer to a
// key and stops by itself, transform and opacity only:
//   - a focus move: the three planes slide a few px at three rates (depth), the logo lifts with its shadow and its
//     reflection in the lake, Hedwig flies over;
//   - Lumos (OK): the castle's windows light up in a wave from left to right (one pre-rendered layer, six bands);
//   - down: the camera dives into a lit window (router.js 'dive', toward diveOrigin());
//   - Nox: Harry crosses on his broom with a golden trail and a mist wake, the apps go out as he passes; wake: the
//     windows come back in a gentler wave.
// Nox settled is still too: a static starfield, the clock moving to a new spot once a minute (burn-in).
// The only loops allowed at rest are the "Ambiance vivante" option (config.ambiance, off by default): a slow mist
// drift and the lake reflections shimmering, both compositor-only CSS animations on small layers (home.css).
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
const FOCUS_SCALE = 1.24;      // the focused logo (home.css .home-app.is-focus .home-lift)
const FOCUS_LIFT = 0.62;       // cqw: its lift (home.css --lift)

// ---- The scene (assets/scene/, made from castle.jpg; geometry in scene.json, mirrored in home.css) ----
const SCENE = 'assets/scene/';
// Parallax per focus step, in CSS px of the 960 px screen, and the most a plane may move (its margin is 16 px). The
// steps shrink on a long dock so the end apps reach the limit, never beyond it.
const DEPTH = { sky: { step: 1, max: 2 }, castle: { step: 3, max: 5 }, fg: { step: 7, max: 10 } };
const DEPTH_MS = 680;          // home.css .home-layer
// The lit windows: lit-windows.webp (1035 px wide) cut into six bands in empty columns (windows.json): x, width (px of
// the picture), t (0 = leftmost, 1 = rightmost: the delay of the wave).
const LIT_W = 1035;
const LIT_BANDS = [[0, 185, 0.089], [185, 160, 0.256], [345, 195, 0.428], [540, 150, 0.594], [690, 177, 0.752], [867, 168, 0.919]];
// The waves: span (ms from the first band to the last), fade (ms per band), peak opacity, hold (ms at the peak before
// it fades out as one, null = until litOut()), out (ms of that fade).
const WAVE = {
  lumos: { span: 300, fade: 320, peak: 1, hold: null, out: 900 },
  wake: { span: 900, fade: 700, peak: 0.7, hold: 500, out: 1600 },
  dive: { span: 120, fade: 200, peak: 1, hold: null, out: 600 },
  undive: { span: 0, fade: 1, peak: 1, hold: 250, out: 900 },
};
// The window the camera dives into (router.js 'dive'): the brightest one, under the great tower (windows.json), as a
// fraction of the castle picture.
const DIVE_AT = [681.9 / 1920, 535.9 / 1080];
// The Nox fly-by. The rider layer (17 cqw wide, Harry facing right once mirrored) goes from -22 to 132 cqw: his trail
// (31 cqw behind the bristles) is off-screen at both ends. His hand leads at 97 % of the layer.
const FLY_MS = 1600;
const FLY_X0 = -22, FLY_X1 = 132, RIDER_W = 17, NOSE = 0.97;
const FLY_EASE = [0.3, 0.1, 0.7, 0.9];   // a gentle push and a gentle exit: he crosses the screen at speed

const FMT = { time: null, date: null };

const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const logoOf = (app) => LOGOS[app.id] || monogram(app.name);
const kOf = (el) => Number(getComputedStyle(el).getPropertyValue('--k')) || 1;
// Living ambience: asked for in the Room of Requirement, and never with reduced motion (setting or system).
const ambianceOn = () => getConfig().ambiance === 'vivante' && !isReduced();

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
  root: null, ctx: null, owl: null, apps: [], items: [], i: 0, bar: 0, zone: 'dock', busy: false, mode: 'normal',
  timers: [], ro: null, hintTimer: 0, clockTimer: 0, moveTimer: 0, noxTimers: [], launchTimers: [], cancelUntil: 0, sceneReady: null,
  wander: { x: 0, y: 0 }, shift: null, planes: null, flat: false, sceneOk: false, lit: null, amb: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.noxTimers = []; this.mode = 'normal'; this.zone = 'dock'; this.launchTimers = []; this.cancelUntil = 0; this.owlAway = false; this.owlNox = false;
    this.shift = { sky: 0, castle: 0, fg: 0 }; this.flat = false; this.sceneOk = false; this.lit = null; this.amb = null; this.busy = false; clearTimeout(this.moveTimer);
    this.apps = this.dockList();
    const last = getConfig().lastApp;
    this.i = Math.max(0, this.apps.findIndex((a) => a.id === last));
    // A band of the lit windows: a window of the layer (left, width in % of it) showing the whole picture shifted left.
    const band = ([x, w]) => `<div class="home-lit-band" style="left:${(x / LIT_W * 100).toFixed(3)}%;width:${(w / LIT_W * 100).toFixed(3)}%"><img alt="" decoding="async" style="left:-${(x / w * 100).toFixed(3)}%"></div>`;
    root.innerHTML = `
      <div class="home-scene">
        <div class="home-layer home-sky"><img class="home-sky-img" alt="" decoding="async"><img class="home-sky-detail" alt="" decoding="async"></div>
        <div class="home-layer home-castle"><img class="home-castle-img" alt="" decoding="async"><div class="home-lit">${LIT_BANDS.map(band).join('')}</div></div>
        <div class="home-mist"></div>
        <div class="home-layer home-fg"><img class="home-fg-l" alt="" decoding="async"><img class="home-fg-r" alt="" decoding="async"></div>
      </div>
      <div class="home-tint"></div>
      <div class="home-shade"></div>
      <div class="home-night"></div>
      <div class="home-clock"><div class="home-time"></div><div class="home-date"><span class="home-cap"></span><span class="home-date-rest"></span></div></div>
      <div class="home-crest" aria-hidden="true"></div>
      <div class="home-bar">
        <div class="home-bar-item" data-k="sound" aria-label="Son"><svg viewBox="0 0 24 24"><path class="snd-on" d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a4.5 4.5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12"/><path class="snd-off" d="M4 9v6h4l5 4V5L8 9H4zM16 9l5 6M21 9l-5 6"/></svg><span class="home-bar-label">Son</span></div>
        <div class="home-bar-item" data-k="map" aria-label="Toutes les applis"><svg viewBox="0 0 24 24"><path d="M9 3c-2.2 0-3.5 2.6-3.5 5.5 0 1.6.5 2.9 1.2 3.7-.7.9-1.2 2.3-1.2 3.8C5.5 18.4 7 21 9 21s3.5-2.6 3.5-5c0-1.5-.5-2.9-1.2-3.8.7-.8 1.2-2.1 1.2-3.7C12.5 5.6 11.2 3 9 3zm8 1c-1.7 0-2.7 2-2.7 4.2 0 1.2.4 2.2.9 2.8-.5.7-.9 1.8-.9 2.9 0 1.9 1.1 3.9 2.7 3.9s2.7-2 2.7-3.9c0-1.1-.4-2.2-.9-2.9.5-.6.9-1.6.9-2.8C19.7 6 18.7 4 17 4z" class="fill"/></svg><span class="home-bar-label">La Carte</span></div>
        <div class="home-bar-item" data-k="settings" aria-label="Réglages"><svg viewBox="0 0 24 24"><path d="M20 3c-6 0-11 4-13 10l-3 8 8-3c6-2 10-7 10-13M8 16l8-8"/></svg><span class="home-bar-label">Réglages</span></div>
      </div>
      <div class="home-dock"><div class="home-rows"></div></div>
      <div class="home-arena"></div>
      <div class="home-rider" aria-hidden="true"><img class="home-rider-trail" alt="" decoding="async"><img class="home-rider-wake" alt="" decoding="async"><div class="home-rider-bob"><img class="home-rider-img" alt="" decoding="async"></div></div>
      <div class="keyhint home-hint"><span><b>▼</b>vers Ollivanders</span></div>
      <div class="home-dim"></div><div class="home-veil"></div><div class="home-disc"></div>
      <div class="home-launch"><img class="home-launch-banner" alt=""><div class="home-launch-logo"></div><div class="home-launch-title engraved gold-text"></div><div class="home-launch-sub"></div></div>
      <div class="home-plate"><div class="home-plate-title engraved">Nox ?</div><div class="home-plate-sub">Passer en mode classique, sans décor ni chouette.</div><div class="home-plate-opts"><span class="home-plate-opt" data-v="yes">Oui, Nox</span><span class="home-plate-opt is-focus" data-v="no">Non</span></div></div>`;

    this.loadScene();
    const mistProbe = new Image();
    mistProbe.onerror = () => { const m = root.querySelector('.home-mist'); if (m) m.classList.add('fallback'); };
    mistProbe.src = 'assets/mist.png';
    // The fly-by's pictures (rider, trail, wake: 0.6 MB decoded in all) are fetched now and decoded off the main
    // thread, so the first frame of a Nox does not wait on them; hidden, they are never painted at rest.
    const rider = root.querySelector('.home-rider');
    [['.home-rider-img', 'assets/rider.webp'], ['.home-rider-trail', SCENE + 'trail-gold.webp'], ['.home-rider-wake', SCENE + 'mist-wake.webp']].forEach(([sel, src]) => {
      const im = rider.querySelector(sel); im.src = src; if (im.decode) im.decode().catch(() => {});
    });

    this.buildDock();
    this.syncBar();
    this.syncHouse();
    this.wasReduced = isReduced();
    this.unsub = onConfigChange(() => {
      if (!this.root) return;
      this.syncHouse(); this.tick(); this.syncAmbiance();
      const r = isReduced(); if (r !== this.wasReduced) { this.wasReduced = r; this.parallax(true); }
    });
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
    this.syncAmbiance();
    if (ctx.config().sounds) ctx.fx.initAudio();
    if (ctx.params.boot) this.boot(isReduced() ? 300 : ctx.params.short ? 700 : 1300);
    if (ctx.params.nox) this.nox();
    if (ctx.params.askClassic) this.timers.push(setTimeout(() => this.plate(true), 750));
    // Coming back up out of Ollivanders (router.js 'undive'): the camera pulls back out of the lit window, which then
    // goes back to the castle's own light.
    if (ctx.transition === 'undive' && !isReduced()) {
      this.sceneReady.then((ok) => { if (ok && this.root === root && this.mode === 'normal' && !this.busy) this.lightWindows('undive'); });
    }
    // The TV lost the Home key to an update (HomeActivity.checkLostHome): offer to ask it back, once a day at most.
    this.onHomeEvent = (e) => {
      if (!this.root || !e.detail || !e.detail.lost || this.mode !== 'normal' || this.busy) return;
      if (Date.now() - (getConfig().homeNagAt || 0) < 86400e3) return;
      this.plate(true, { title: 'La télé a repris la touche Home', sub: 'Une mise à jour, sans doute. OK pour la redemander.',
        onYes: () => Platform.setHome('poudlard'), onNo: () => updateConfig({ homeNagAt: Date.now() }) });
    };
    document.addEventListener('poudlard:home', this.onHomeEvent);
  },

  // ---- The backdrop: three planes (sky, castle, foreground), shown together once all four pictures are decoded. A
  // plane that fails: the single castle picture instead (assets/castle.jpg, still, no parallax), then the night
  // gradient. castle.jpg is never fetched otherwise. The moon sprite and the lit-windows layer are optional (the
  // half-resolution moon, or no wave, without them). ----
  loadScene() {
    const root = this.root, scene = root.querySelector('.home-scene');
    const need = [['.home-sky-img', 'sky.webp'], ['.home-castle-img', 'castle.webp'], ['.home-fg-l', 'fg-left.webp'], ['.home-fg-r', 'fg-right.webp']];
    this.planes = { sky: scene.querySelector('.home-sky'), castle: scene.querySelector('.home-castle'), fg: scene.querySelector('.home-fg') };
    this.sceneReady = new Promise((resolve) => {
      let left = need.length, failed = false;
      const done = (ok) => {
        if (this.root !== root) return resolve(false);
        if (!ok) { if (!failed) { failed = true; this.fallback(); } return resolve(false); }
        if (--left > 0 || failed) return;
        scene.classList.add('is-ready');
        this.sceneOk = true; this.syncAmbiance();                   // the living ambience waits for the planes
        resolve(true);
      };
      need.forEach(([sel, file]) => {
        const im = scene.querySelector(sel);
        im.onerror = () => done(false);
        im.onload = () => { (im.decode ? im.decode() : Promise.resolve()).then(() => done(true), () => done(true)); };
        im.src = SCENE + file;
      });
    });
    const detail = scene.querySelector('.home-sky-detail');
    detail.onerror = () => detail.remove();
    detail.src = SCENE + 'sky-detail.webp';
    // The lit windows: six clipped copies of one picture (one fetch, one decode).
    const lit = scene.querySelector('.home-lit'), bands = [...lit.querySelectorAll('.home-lit-band')];
    const first = bands[0].querySelector('img');
    first.onload = () => { if (this.root === root && !this.flat) this.lit = { el: lit, bands, anims: [], out: null, timer: 0, outMs: 900 }; };
    first.onerror = () => lit.remove();
    bands.forEach((b) => { b.querySelector('img').src = SCENE + 'lit-windows.webp'; });
  },
  fallback() {
    const root = this.root, scene = root.querySelector('.home-scene');
    this.flat = true; this.planes = null; this.lit = null; this.shift = { sky: 0, castle: 0, fg: 0 };
    scene.querySelectorAll('.home-layer').forEach((l) => { l.querySelectorAll('img').forEach((im) => { im.onload = im.onerror = null; im.removeAttribute('src'); }); l.remove(); });
    const img = document.createElement('img');
    img.className = 'home-fallback'; img.alt = ''; img.decoding = 'async';
    img.onerror = () => { img.remove(); root.classList.add('no-castle'); };
    img.src = 'assets/castle.jpg';
    scene.prepend(img);
    scene.classList.add('is-ready');
    this.syncAmbiance();
  },

  // ---- Depth: the planes slide a few px at three rates as the focus moves along the dock (Apple TV style), the
  // foreground most, the sky least, then rest. Transform only, on whole device pixels (a still plane stays 1:1 sharp).
  // The planes are promoted (will-change) only while the focus moves: 1.2 s after the last move they go back to the
  // still picture. Reduced motion: the planes stay put. ----
  parallax(instant) {
    if (!this.planes || !this.root) return;
    const W = this.root.clientWidth; if (!W) return;
    const n = this.items.length, row = Math.floor(this.i / PER_ROW), inRow = Math.min(PER_ROW, n - row * PER_ROW);
    const half = (inRow - 1) / 2, u = isReduced() || inRow < 2 ? 0 : (this.i - row * PER_ROW) - half;
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
    else {
      scene.classList.add('is-moving');
      clearTimeout(this.moveTimer);
      this.moveTimer = setTimeout(() => { if (this.root) scene.classList.remove('is-moving'); }, (DEPTH_MS + 1200) * kOf(this.root));
    }
    for (const name of Object.keys(DEPTH)) this.planes[name].style.transform = next[name] ? `translateX(${next[name]}px)` : '';
    if (instant) { void scene.offsetWidth; scene.classList.remove('is-instant'); }
  },

  // ---- The lit windows: a wave from left to right (each band fades in after its delay), then, after `hold`, the
  // whole layer fades out as one and is hidden again (nothing painted at rest). preset: a WAVE key. ----
  lightWindows(preset) {
    const L = this.lit, o = WAVE[preset];
    if (!L || !o || !this.root || isReduced()) return;
    this.litStop();
    const k = kOf(this.root);
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
    L.out = L.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: (ms || L.outMs) * kOf(this.root), easing: 'cubic-bezier(.4, 0, .6, 1)', fill: 'forwards' });
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
  // (two tiles in the mist layer) exist only while it is on; they pause during Lumos and Nox. ----
  syncAmbiance() {
    const root = this.root; if (!root) return;
    const on = ambianceOn() && !this.flat && this.sceneOk;
    if (on && !this.amb) {
      const castle = root.querySelector('.home-castle'), mist = root.querySelector('.home-mist');
      const els = ['a', 'b'].map((v) => { const im = document.createElement('img'); im.className = `home-shimmer home-shimmer-${v}`; im.alt = ''; im.decoding = 'async'; im.src = `${SCENE}lake-shimmer-${v}.webp`; castle.appendChild(im); return im; });
      const drift = document.createElement('div'); drift.className = 'home-drift'; drift.innerHTML = '<i></i><i></i>';
      mist.appendChild(drift); els.push(drift);
      this.amb = { els };
    } else if (!on && this.amb) {
      this.amb.els.forEach((e) => { if (e.tagName === 'IMG') e.removeAttribute('src'); e.remove(); });
      this.amb = null;
    }
    root.classList.toggle('amb-on', on);
    this.ambPause();
  },
  ambPause() { if (this.root) this.root.classList.toggle('amb-paused', Boolean(this.amb) && (this.mode === 'nox' || this.busy)); },

  // The dive (router.js): the point of the window the camera flies into, in CSS px of the stage (the castle plane's
  // parallax included), read when the Parapet leaves ('dive') and when it comes back ('undive').
  diveOrigin() {
    const root = this.root; if (!root) return null;
    const W = root.clientWidth, H = root.clientHeight; if (!W) return null;
    const sh = W * 0.5625, top = (H - sh) * 0.45;
    return { x: DIVE_AT[0] * W + (this.flat ? 0 : this.shift.castle), y: top + DIVE_AT[1] * sh };
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
  // starfield freed when it is not on screen, the windows put out, the planes no longer promoted. Nothing is lost:
  // everything is rebuilt on the next event.
  trim() {
    if (!this.root) return;
    if (this.owl) this.owl.stop();
    if (this.mode !== 'nox') this.dropStars();
    else this.clearFly();
    if (!this.busy) this.litStop();
    clearTimeout(this.moveTimer);
    const scene = this.root.querySelector('.home-scene'); if (scene) scene.classList.remove('is-moving');
    this.root.querySelectorAll('.app-logo .l-shine').forEach((s) => s.getAnimations({ subtree: true }).forEach((a) => a.finish()));
  },

  // The leaving screen's flourish (router.js): the owl lifts off before the crane; before the dive the window lights
  // up and what floats in front of the castle goes (home.css .diving), so the zoom is the castle alone.
  onLeave(transition) {
    if (!this.root) return;
    if (transition === 'crane' && this.owl) this.owl.liftOff(450);
    if (transition === 'dive') {
      clearTimeout(this.hintTimer);
      this.root.classList.add('diving');
      this.lightWindows('dive');
      if (this.owl) this.owl.stop();
    }
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
    clearTimeout(this.clockTimer); clearTimeout(this.hintTimer); clearTimeout(this.moveTimer);
    this.clearFly();
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
      row.className = 'home-row';
      if (!chunk.length) { row.innerHTML = '<div class="home-empty engraved">Le parapet est vide · ▲ La Carte</div>'; }
      chunk.forEach((app) => {
        const L = logoOf(app);
        const el = document.createElement('div');
        el.className = app.absent ? 'home-app is-absent' : 'home-app';
        el.dataset.id = app.id;
        const box = logoBox(L, LOGO_H, LOGO_W_MAX);           // equal visual weight across the row
        el.style.width = box.w.toFixed(2) + 'cqw'; el.style.height = box.h.toFixed(2) + 'cqw';
        el.innerHTML = `<i class="home-app-shadow"></i><div class="home-lift"><div class="app-logo${L.luma ? ' luma' : ''}"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div></div><i class="home-app-reflect${L.luma ? ' luma' : ''}"></i>`;
        const m = `url("${L.src}")`;   // the logo's mask: its engraved layers, and its reflection in the lake
        el.querySelector('.app-logo').style.setProperty('--m', m);
        el.querySelector('.home-app-reflect').style.setProperty('--m', m);
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

  // ---- Layout: focus (the logo lifts, its shadow and reflection come up: home.css), depth (the planes slide), owl. ----
  layout(instant) {
    const root = this.root, W = root.clientWidth;
    if (!W) return;
    const n = this.items.length;
    this.items.forEach((it, k) => it.classList.toggle('is-focus', this.zone === 'dock' && k === this.i));
    this.parallax(instant);
    if (!n) { if (this.owl) this.owl.hide(); return; }
    const el = this.items[this.i];
    if (this.owl && !this.owlAway) this.owl.show();
    if (instant) { if (this.owl) { const t = this.owlTarget(); this.owl.teleport(t.x, t.y); } return; }
    if (this.owl) {
      const t = this.owlTarget();
      this.owl.flyTo(t.x, t.y, { arena: { h: root.clientHeight }, timeScale: kOf(root), onLand: () => this.land(el) });
    }
  },
  // The focused app settles under the owl's weight (home.css .is-land on its lift, --t-land).
  land(el) {
    if (!el || isReduced() || !this.root) return;
    el.classList.remove('is-land'); void el.offsetWidth; el.classList.add('is-land');
    this.timers.push(setTimeout(() => el.classList.remove('is-land'), 200 * kOf(this.root)));
  },
  press(on) {
    const el = this.zone === 'bar' ? this.root.querySelectorAll('.home-bar-item')[this.bar] : this.items[this.i];
    if (el) el.classList.toggle('is-press', on);
  },
  // Centre of an app in screen coordinates (rows are centred, so we read the boxes). The box itself is never
  // transformed (the focus lifts the logo inside it), so this holds at any moment of a focus change.
  center(el) {
    const r = el.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    return { cx: r.left - rr.left + r.width / 2, cy: r.top - rr.top + r.height / 2, w: r.width, h: r.height, top: r.top - rr.top };
  },
  // Where Hedwig perches: on top of the focused logo as it stands once lifted (FOCUS_SCALE, FOCUS_LIFT).
  owlTarget() {
    const el = this.items[this.i], app = this.apps[this.i];
    const L = logoOf(app); const ratio = L.ratio || 1;
    const b = this.center(el), W = this.root.clientWidth, up = this.zone === 'dock';   // in the bar, the logo is down
    const ch = Math.min(b.h, b.w / ratio) * (up ? FOCUS_SCALE : 1);   // the artwork's height inside its box
    const logoTop = b.cy - ch / 2 - (up ? FOCUS_LIFT * W / 100 : 0);
    const s = this.owl.size();
    return { cx: b.cx, x: b.cx - s.w / 2, y: logoTop - s.h * 0.95 };
  },

  // ---- Lumos ----
  // t=0 the press, the logo charges, the castle's windows light up in a wave from left to right (300 ms from the
  // first band to the last, each band 320 ms) · t=100 molten gold, the owl lifts off, the cue · t=350 the intent ·
  // t=420 the backdrop dims and the launch card comes up (on the TV the app usually covers the screen by then).
  // Until the intent, Back cancels everything (nothing was started yet).
  // When the Parapet comes back (done), the windows go back to the castle's own light (one 900 ms fade).
  async launch() {
    if (this.busy) return;
    const app = this.apps[this.i]; if (!app) return;
    this.busy = true;                                         // keys still reach onKey (Back cancels) until the intent fires
    this.ambPause();
    let held = false, heldMusic = false;
    const root = this.root, fx = this.ctx.fx, k = kOf(root);
    const item = this.items[this.i], logoEl = item.querySelector('.app-logo');
    const timers = []; this.launchTimers = timers;
    const at = (ms, fn) => timers.push(setTimeout(fn, ms * k));
    item.classList.add('is-press'); logoEl.classList.add('charging');
    this.lightWindows('lumos');
    this.cancelUntil = performance.now() + CANCEL_MS * k;
    const box = root.querySelector('.home-launch');
    at(100, () => {
      item.classList.remove('is-press');
      logoEl.classList.add('molten');
      if (this.owl) this.owl.liftOff(500);
      if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
    });
    at(420, () => root.querySelector('.home-dim').classList.add('on'));   // with the card: the wave is seen whole
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
      item.classList.remove('is-press'); logoEl.classList.remove('molten', 'charging');
      this.litOut();
      if (this.owl) { const t = this.owlTarget(); this.owl.comeBack(t.x, t.y); }
      this.cancelUntil = 0; this.busy = false; this.launchDone = null;
      this.ambPause();
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

  // ---- Boot: a Lumos. Dark screen, a point of light that opens, the castle appears, its windows light up (the gentle
  // wave, when the lit layer is already decoded), the clock writes itself, the dock rises, the owl arrives last.
  // `ms`: the whole thing (1300 cold, 700 short, 300 reduced). Transform and opacity only: the veil (a night layer)
  // fades while the disc grows; no clip-path. ----
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
    at(320, () => { if (this.mode === 'normal' && !this.busy) this.lightWindows('wake'); if (this.ctx.fx.cue) this.ctx.fx.cue('wake'); });
    at(480, () => { const c = root.querySelector('.home-clock'); c.classList.add('write-in'); root.classList.remove('booting'); });
    // The boot is over when the sequence has run AND the owl has landed: then main.js may arm the sound (its start-up
    // AudioContext costs one long frame, kept out of every boot movement).
    let pending = owlArrives ? 2 : 1;
    const settled = () => { if (--pending === 0) window.dispatchEvent(new CustomEvent('poudlard:booted')); };
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
  // Entrance: the fly-by. Harry on his broom crosses the Parapet left to right, above the owl, at speed; a golden
  // trail stretches behind him and fades as he leaves, a mist wake rolls off the broom (home.css); each app goes out
  // the moment his hand passes it (one timer per app, from the same ease: no per-frame work), Hedwig takes off as he
  // flies over her, the lake mist is pushed aside, then the Nox state settles (settleNox).
  // Timeline (× --k): 0 he starts (1600 ms), hint/bar/crest fade (600) · 120 the mist push (1600) · the apps go out
  // one by one · 1600 he is gone · 1700 settleNox. All of it transform and opacity, on the compositor.
  // Reduced motion, or the rider picture missing: straight to settleNox (fades).
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
    const root = this.root, W = root.clientWidth;
    const layer = root.querySelector('.home-rider'), img = layer && layer.querySelector('.home-rider-img');
    if (isReduced() || !layer || !img || !img.complete || !img.naturalWidth || !W) return false;
    const k = kOf(root);
    const DUR = FLY_MS * k;
    root.classList.add('nox-fly');
    // His height: the broom passes just over the owl's head (or over the logos when she is absent), never through them.
    const lh = layer.offsetHeight;
    let clear;
    if (this.owl && this.items.length) { const t = this.owlTarget(), s = this.owl.size(); clear = t.y - 0.2 * s.h - 0.012 * W; }
    else { const rr = root.querySelector('.home-rows').getBoundingClientRect(), r0 = root.getBoundingClientRect(); clear = rr.top - r0.top - 0.03 * W; }
    layer.style.top = Math.round(Math.max(root.clientHeight * 0.12, clear - lh)) + 'px';
    layer.classList.add('fly');
    this.riderAnim = layer.animate([{ transform: `translateX(${FLY_X0}cqw)` }, { transform: `translateX(${FLY_X1}cqw)` }],
      { duration: DUR, easing: `cubic-bezier(${FLY_EASE.join(',')})`, fill: 'forwards' });
    const anim = this.riderAnim;
    anim.onfinish = () => { if (this.riderAnim !== anim) return; anim.cancel(); this.riderAnim = null; layer.classList.remove('fly'); };
    // The lake mist, pushed aside in his wake: one transform wave (translate + a slight scaleX) and an opacity dip on
    // the single, screen-wide mist layer.
    const mist = root.querySelector('.home-mist'), rest = Number(getComputedStyle(mist).opacity) || 0.13;
    this.noxTimers.push(setTimeout(() => {
      if (this.mode !== 'nox' || !this.root) return;
      this.mistAnim = mist.animate([
        { transform: 'translateX(0) scaleX(1)', opacity: rest },
        { transform: 'translateX(3cqw) scaleX(1.08)', opacity: rest * 0.2, offset: 0.5 },
        { transform: 'translateX(-1.2cqw) scaleX(1.03)', opacity: rest * 0.55, offset: 0.78 },
        { transform: 'translateX(0) scaleX(1)', opacity: rest },
      ], { duration: DUR, easing: 'ease-in-out' });
      this.mistAnim.onfinish = () => { this.mistAnim = null; };
    }, 120 * k));
    // The time his hand (NOSE of the layer) reaches x cqw, from the crossing's own ease.
    const when = (x) => flyEase.inverse(Math.max(0, Math.min(1, (x - FLY_X0 - RIDER_W * NOSE) / (FLY_X1 - FLY_X0)))) * DUR;
    this.items.forEach((el) => {
      const cx = this.center(el).cx / W * 100;
      this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox') el.classList.add('is-out'); }, when(cx)));
    });
    // Hedwig: as he flies over her, she takes off in his wake and leaves the frame (her perch is going out).
    if (this.owl && this.items[this.i]) {
      const cx = this.center(this.items[this.i]).cx / W * 100;
      this.noxTimers.push(setTimeout(() => { if (this.mode === 'nox' && this.owl && !this.owlNox) { this.owlNox = true; this.owl.liftOff(900); } }, when(cx + 3)));
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
    this.root.querySelector('.home-night').after(cv);
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
  // The Nox state proper: a still starfield, the clock centred (then moving once a minute), the scene lowered (one
  // opacity fade of a night layer). The owl is away (she left with the rider, or fades out when there is no fly-by):
  // the apps she perches on are out. Nothing loops (the living ambience pauses).
  settleNox() {
    const root = this.root; root.classList.add('nox');
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
    this.ambPause();
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
      if (isReduced() || !this.items.length) this.layout(true);
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
    if (action === 'down') { if (ctx.fx.cue) ctx.fx.cue('enter'); else ctx.fx.chime(880, 0.03); ctx.router.go('library', {}, 'dive'); return true; }   // into a lit window (router.js; onLeave clears the front)
    if (action === 'up') { this.zone = 'bar'; this.syncBar(); this.layout(true); return true; }
    if (action === 'longback') { this.plate(true); return true; }
    return false;
  },
};
