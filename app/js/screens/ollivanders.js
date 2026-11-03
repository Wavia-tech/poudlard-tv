// Ollivanders: the film collection shown as a wandmaker's shop window.
// The reference image (assets/ollivanders.webp) is displayed as is. Selection draws no outline at all:
// the rest of the shop rests under a soft veil (one static radial window moved by transform, no blur), the camera
// leans in by a hair, and the caption is typeset like a museum label whose gold rule draws itself from the centre
// between the title and the sub-line. Transform and opacity only.
import { LIBRARY, appById, getConfig, updateConfig, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';

// Each collection of LIBRARY (config.js) is a window: its `scene` gives the backdrop, its pixel size and one
// selection polygon per film. The windows stack under the Parapet: Down opens the next one, Up the previous one.
let IMG = { w: 1672, h: 941 };
const HOLE = 1.25;    // the window's box is 1.25 × the film box (the soft edge lives in the mask gradient): framed, not spilling
const LINE_W = 0.6;   // the label's rule spans 60% of the title's width, centred under it
const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);

export default {
  root: null, ctx: null, items: [], i: 0, busy: false, timers: [], hiddenKeys: new Set(), raf: 0, cur: null, dustTimer: 0,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.busy = false; this.holeBase = null;   // the veil is new on every mount
    const windows = LIBRARY.filter((c) => c.scene && Array.isArray(c.scene.boxes) && c.scene.boxes.length);
    const wanted = ctx.params && ctx.params.collection;
    this.ci = Math.max(0, windows.findIndex((c) => c.id === wanted));
    this.windows = windows;
    const coll = windows[this.ci] || LIBRARY[0];
    const boxes = coll.scene.boxes;
    IMG = { w: coll.scene.w, h: coll.scene.h };
    this.items = coll.items.slice(0, boxes.length).map((it, n) => ({ ...it, box: boxes[n], key: `${coll.id}:${it.content}`, also: coll.alsoWith || [] }));
    this.i = 0;
    root.innerHTML = `
      <div class="olv-scene">
        <img class="olv-bg" alt="">
        <div class="olv-shade"></div>
      </div>
      <div class="olv-caption"><div class="olv-caption-title"></div><i class="olv-line" aria-hidden="true"></i><div class="olv-caption-sub"></div></div>
      <div class="keyhint olv-hint"><span><b>◀ ▶</b>Choisir</span><span><b>OK</b>Ouvrir le film</span><span class="olv-hint-up"><b>▲</b>Parapet</span><span class="olv-hint-next"><b>▼</b></span></div>
      <div class="olv-dim"></div>`;
    const bg = root.querySelector('.olv-bg');
    bg.addEventListener('error', () => root.classList.add('no-image'));
    bg.src = coll.scene.image;
    const next = windows[this.ci + 1], prev = windows[this.ci - 1];
    const hintNext = root.querySelector('.olv-hint-next'), hintUp = root.querySelector('.olv-hint-up');
    if (next) hintNext.append(next.title); else hintNext.remove();
    if (prev) { hintUp.lastChild.textContent = prev.title; }
    this.timers.push(setTimeout(() => root.classList.add('is-in'), 60));
    this.focus(this.i, true);
    this.dust();
    if (ctx.config().sounds) ctx.fx.initAudio();
  },

  unmount() { this.timers.forEach(clearTimeout); clearTimeout(this.dustTimer); },

  // Centre of a box (image pixels and screen pixels).
  centerImg(n) { const b = this.items[n].box; return { x: b.reduce((s, p) => s + p[0], 0) / 4, y: b.reduce((s, p) => s + p[1], 0) / 4 }; },
  center(n) { const c = this.centerImg(n); return { x: c.x / IMG.w * this.root.clientWidth, y: c.y / IMG.h * this.root.clientHeight }; },
  // Box of a film in screen fractions: centre and size.
  boxOf(n) {
    const b = this.items[n].box;
    const xs = b.map((p) => p[0]), ys = b.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return { cx: (x0 + x1) / 2 / IMG.w, cy: (y0 + y1) / 2 / IMG.h, w: (x1 - x0) / IMG.w, h: (y1 - y0) / IMG.h };
  },

  // The veil (with its static window) glides by transform to the chosen box (480 ms, cubic-bezier(.3,0,.15,1) in
  // CSS). The window is cut once at HOLE × the first box; the veil then only translates (its centre onto the box)
  // and scales (the box's size relative to the first).
  moveHole(n, instant) {
    const root = this.root, W = root.clientWidth, H = root.clientHeight;
    const b = this.boxOf(n);
    const shade = root.querySelector('.olv-shade');
    if (!this.holeBase) {
      const b0 = this.boxOf(0);
      this.holeBase = { w: b0.w * HOLE, h: b0.h * HOLE };
      // Radii in % of the veil (three screens): half the window, divided by three. The edge is long and soft.
      const rx = (this.holeBase.w * 100 / 6).toFixed(2), ry = (this.holeBase.h * 100 / 6).toFixed(2);
      const m = `radial-gradient(ellipse ${rx}% ${ry}% at 50% 50%, transparent 60%, #000 85%)`;
      shade.style.webkitMaskImage = m; shade.style.maskImage = m;
    }
    const sx = (b.w * HOLE) / this.holeBase.w, sy = (b.h * HOLE) / this.holeBase.h;
    const tx = (b.cx - 0.5) * W, ty = (b.cy - 0.5) * H;
    const set = (el, v) => { if (instant) el.style.transition = 'none'; el.style.transform = v; if (instant) { void el.offsetWidth; el.style.transition = ''; } };
    set(shade, `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`);
  },

  // The label's rule: a 1 px gold line between the title and the sub-line, LINE_W of the title's text width, that
  // retracts at once (scaleX 0, no reverse draw) and draws itself again from the centre (the CSS transition, 300 ms).
  // Called once the title is typeset, so the width measured is the new title's.
  drawLine(instant) {
    const cap = this.root.querySelector('.olv-caption'), line = cap.querySelector('.olv-line');
    const range = document.createRange();
    range.selectNodeContents(cap.querySelector('.olv-caption-title'));
    const span = range.getBoundingClientRect().width * LINE_W;
    line.style.transition = 'none';
    line.classList.remove('is-drawn');
    line.style.width = `${span.toFixed(1)}px`;
    void line.getBoundingClientRect();
    if (!instant) line.style.transition = '';
    line.classList.add('is-drawn');
    if (instant) { void line.getBoundingClientRect(); line.style.transition = ''; }
  },

  focus(n, instant) {
    this.i = Math.max(0, Math.min(this.items.length - 1, n));
    const it = this.items[this.i];
    this.moveHole(this.i, instant);
    // The camera leaning towards the box.
    const c = this.centerImg(this.i);
    const scene = this.root.querySelector('.olv-scene');
    scene.style.transformOrigin = `${c.x / IMG.w * 100}% ${c.y / IMG.h * 100}%`;
    scene.classList.add('lean');
    const app = this.appFor(it);
    const cap = this.root.querySelector('.olv-caption');
    cap.querySelector('.olv-caption-title').textContent = `${it.title} · ${it.year}`;
    const others = this.choices(it).filter((a) => a.id !== (app && app.id));
    cap.querySelector('.olv-caption-sub').textContent = app
      ? (this.hiddenKeys.has(it.key) ? 'Ce film est prêté' : `S’ouvre dans ${app.name}${others.length ? ` · OK long : ${others.map((a) => a.name).join(', ')}` : ''}`)
      : 'Appli à choisir dans les réglages';
    this.drawLine(instant);
    if (!instant) { cap.classList.remove('is-write'); void cap.offsetWidth; cap.classList.add('is-write'); }
  },

  // A single speck of gold rises above the chosen box, rarely: a hint of life, never a show.
  dust() {
    clearTimeout(this.dustTimer);
    const tick = () => {
      if (!isReduced() && !this.busy && this.root) { const c = this.center(this.i); const y = c.y - this.root.clientHeight * (0.1 + Math.random() * 0.25); this.ctx.fx.burst(c.x + (Math.random() - 0.5) * this.root.clientWidth * 0.03, y, 1, this.root.clientWidth / 140); }
      this.dustTimer = setTimeout(tick, 3200 + Math.random() * 2800);
    };
    this.dustTimer = setTimeout(tick, 1500);
  },

  // Lumos: the box lights up, then the film opens in the app that owns it (link from the config).
  launch() {
    if (this.busy) return;
    const it = this.items[this.i]; const app = this.appFor(it); if (!app) return;
    this.busy = true; Input.hold();
    const root = this.root, fx = this.ctx.fx, k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
    const c = this.center(this.i);
    root.classList.add('is-launch');
    fx.lumos(root, c.x, c.y, 800);
    if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
    // The link opens right away (inside the OK gesture, otherwise the browser blocks the tab); the light dresses the wait.
    const r = Platform.openContent(app, it);
    const dim = root.querySelector('.olv-dim');
    const settle = () => { dim.classList.remove('show'); root.classList.remove('is-launch'); this.busy = false; this.settleFn = null; Input.release(); };
    this.settleFn = settle;
    if (r.status === 'failed') {                      // the TV refused: the light goes out at once, the Howler says why
      this.timers.push(setTimeout(async () => { settle(); if (fx.cue) fx.cue('error'); const b = await loadBeuglante(); if (b) b(root, { message: r.error }); }, 200 * k));
      return;
    }
    const L = LOGOS[app.id] || monogram(app.name);
    dim.innerHTML = `<div class="olv-launch-logo app-logo lit${L.luma ? ' luma' : ''}" style="--m:url('${L.src}')"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div><div class="olv-launch-title"></div><div class="olv-launch-sub engraved gold-text"></div>`;
    dim.querySelector('.olv-launch-title').textContent = `${it.title} · ${it.year}`;
    dim.querySelector('.olv-launch-sub').textContent = `sur ${app.name}`;
    this.timers.push(setTimeout(() => dim.classList.add('show'), 450 * k));
    this.timers.push(setTimeout(settle, (r.status === 'bridge' ? 4000 : 2600) * k));
  },

  // Everything released (main.js error boundary, hand-over to another app).
  settle() { if (this.settleFn) this.settleFn(); },

  // The apps that can open a film: the one in LIBRARY plus every app of `urls` (one link per app).
  choices(it) { return [...new Set([it.app, ...Object.keys(it.urls || {}), ...(it.also || [])])].map(appById).filter(Boolean); },
  // The app chosen for this film (config.library.apps, set from the Remembrall), else the collection's default.
  appFor(it) { const chosen = getConfig().library.apps[it.key]; return appById(chosen && this.choices(it).some((a) => a.id === chosen) ? chosen : it.app); },

  // Long OK: lend the film, and choose the app that opens it (kept per film in config.library.apps).
  async rappeltout() {
    const fn = await loadRappeltout(); if (!fn) return;
    const it = this.items[this.i]; const c = this.center(this.i);
    const current = this.appFor(it);
    const options = this.choices(it).filter((a) => a.id !== (current && current.id)).map((a) => ({ id: `app:${a.id}`, label: `Ouvrir avec ${a.name}` }));
    options.push({ id: 'lend', label: this.hiddenKeys.has(it.key) ? 'Reprendre ce film' : 'Marquer comme prêté' });
    const choice = await fn(this.root, { title: it.title, anchor: c, options });
    if (!choice || !this.root) return;
    if (choice.startsWith('app:')) {
      const lib = getConfig().library;
      updateConfig({ library: { ...lib, apps: { ...lib.apps, [it.key]: choice.slice(4) } } });
      this.focus(this.i, true);
      this.ctx.fx.chime(1568, 0.03);
      return;
    }
    if (choice === 'lend') { if (this.hiddenKeys.has(it.key)) this.hiddenKeys.delete(it.key); else this.hiddenKeys.add(it.key); this.focus(this.i, true); }
  },

  onKey(action, ctx) {
    if (action === 'okdown') { if (!this.busy) this.root.querySelector('.olv-scene').classList.add('is-press'); return true; }
    if (this.busy) return true;
    this.root.querySelector('.olv-scene').classList.remove('is-press');
    if (action === 'right') { if (this.i < this.items.length - 1) { this.focus(this.i + 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: 1 }) : ctx.fx.chime(1175, 0.02); } return true; }
    if (action === 'left') { if (this.i > 0) { this.focus(this.i - 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: -1 }) : ctx.fx.chime(1046, 0.02); } return true; }
    // The windows stack vertically under the Parapet: Down goes to the next one (the crane keeps descending), Up to
    // the previous one, and Up from the first climbs back to the Parapet.
    if (action === 'down') {
      const next = this.windows[this.ci + 1];
      if (next) { ctx.fx.cue ? ctx.fx.cue('enter') : ctx.fx.chime(880, 0.03); ctx.router.replace('library', { collection: next.id }, 'crane'); }
      return true;
    }
    if (action === 'ok') { this.launch(); return true; }
    if (action === 'longok') { this.rappeltout(); return true; }
    if (action === 'up' && this.windows[this.ci - 1]) { ctx.fx.cue ? ctx.fx.cue('return') : ctx.fx.whoosh(); ctx.router.replace('library', { collection: this.windows[this.ci - 1].id }, 'uncrane'); return true; }
    if (action === 'up' || action === 'back') { if (ctx.fx.cue) ctx.fx.cue('return'); else ctx.fx.whoosh(); ctx.router.go('home', {}, 'uncrane'); return true; }
    if (action === 'home') { ctx.router.replace('home', {}, 'fade'); return true; }
    if (action === 'longback') { ctx.router.go('home', { askClassic: true }, 'uncrane'); return true; }
    if (action === 'menu') { this.rappeltout(); return true; }   // Menu = the box's Remembrall
    return false;
  },
};
