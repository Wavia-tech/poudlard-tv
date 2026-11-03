// Ollivanders: the film collection shown as a wandmaker's shop window.
// The reference image (assets/ollivanders.webp) is staged, not decorated: a static colour grade (two gradient layers
// at low opacity, warm from the lamp and cool from the night), a vignette, a letterbox frame with a hairline, and the
// selection: the whole shop drops under a veil except the chosen box, which keeps its full light inside a thin gold
// frame drawn exactly on its outline. Veil and frame are one inline SVG per selection, cut from scene.boxes (config.js);
// two such layers cross-fade (opacity only) when the choice moves. Nothing moves at rest: no loop, no dust, no breath.
// The camera leans in by a hair on arrival; the caption is typeset like a museum label above the boxes (never over
// them) whose gold rule draws itself from the centre between the title and the sub-line. Transform and opacity only; the styles live in ollivanders.css.
import { LIBRARY, appById, getConfig, updateConfig } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';

// Each collection of LIBRARY (config.js) is a window: its `scene` gives the backdrop, its pixel size and one
// selection polygon per film. The windows stack under the Parapet: Down opens the next one, Up the previous one.
let IMG = { w: 1920, h: 1080 };
const LINE_W = 0.6;   // the label's rule spans 60% of the title's width, centred under it
const SVG_NS = 'http://www.w3.org/2000/svg';
const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
// "Max", "Max ou Canal+", "Max, Netflix ou Canal+".
const orList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`);

export default {
  root: null, ctx: null, items: [], i: 0, busy: false, timers: [], hiddenKeys: new Set(), sel: null, selOn: 0, live: false, skipUnmount: 0,

  async mount(root, ctx) {
    // Window → window (Down / Up) mounts this same object again BEFORE the router unmounts the leaving one: the
    // leaving window's timers are cleared now, and the router's late unmount() is skipped (it would kill ours).
    if (this.live) { this.timers.forEach(clearTimeout); this.skipUnmount = (this.skipUnmount || 0) + 1; }
    this.live = true;
    this.root = root; this.ctx = ctx; this.timers = []; this.busy = false; this.selOn = 0;
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
        <div class="olv-grade olv-grade-warm"></div>
        <div class="olv-grade olv-grade-cool"></div>
        <div class="olv-sel"></div>
      </div>
      <div class="olv-vignette"></div>
      <div class="olv-band olv-band-top"></div><div class="olv-band olv-band-bottom"></div>
      <div class="olv-caption"><div class="olv-caption-title"></div><i class="olv-line" aria-hidden="true"></i><div class="olv-caption-sub"></div></div>
      <div class="keyhint olv-hint"><span><b>◀ ▶</b>Choisir</span><span><b>OK</b>Ouvrir le film</span><span class="olv-hint-up"><b>▲</b>Parapet</span><span class="olv-hint-next"><b>▼</b></span></div>
      <div class="olv-dim"></div>`;
    this.buildSelection(root.querySelector('.olv-sel'));
    const bg = root.querySelector('.olv-bg');
    bg.addEventListener('error', () => root.classList.add('no-image'));
    bg.src = coll.scene.image;
    const next = windows[this.ci + 1], prev = windows[this.ci - 1];
    const hintNext = root.querySelector('.olv-hint-next'), hintUp = root.querySelector('.olv-hint-up');
    if (next) hintNext.append(next.title); else hintNext.remove();
    if (prev) { hintUp.lastChild.textContent = prev.title; }
    // On arrival only: the layers fade in and the camera leans in by a hair (one transition, then everything rests).
    this.timers.push(setTimeout(() => { root.classList.add('is-in'); root.querySelector('.olv-scene').classList.add('lean'); }, 60));
    this.focus(this.i, true);
    if (ctx.config().sounds) ctx.fx.initAudio();
  },

  unmount() {
    if (this.skipUnmount) { this.skipUnmount -= 1; return; }
    this.timers.forEach(clearTimeout); this.timers = []; this.sel = null; this.live = false;
  },

  // Centre of a box (image pixels and screen pixels).
  centerImg(n) { const b = this.items[n].box; return { x: b.reduce((s, p) => s + p[0], 0) / 4, y: b.reduce((s, p) => s + p[1], 0) / 4 }; },
  center(n) { const c = this.centerImg(n); return { x: c.x / IMG.w * this.root.clientWidth, y: c.y / IMG.h * this.root.clientHeight }; },

  // Two selection layers, each an SVG in image coordinates stretched over the scene exactly as the image is
  // (object-fit: fill ↔ preserveAspectRatio="none"): a veil (the whole frame minus the box, even-odd) and the box's
  // outline in gold. The stroke keeps its width in CSS px (vector-effect), so it stays a crisp hairline at any size.
  buildSelection(host) {
    this.sel = [0, 1].map(() => {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'olv-sel-layer');
      svg.setAttribute('viewBox', `0 0 ${IMG.w} ${IMG.h}`);
      svg.setAttribute('preserveAspectRatio', 'none');
      svg.setAttribute('aria-hidden', 'true');
      const veil = document.createElementNS(SVG_NS, 'path'); veil.setAttribute('class', 'olv-veil'); veil.setAttribute('fill-rule', 'evenodd');
      const under = document.createElementNS(SVG_NS, 'polygon'); under.setAttribute('class', 'olv-frame-under'); under.setAttribute('vector-effect', 'non-scaling-stroke');
      const frame = document.createElementNS(SVG_NS, 'polygon'); frame.setAttribute('class', 'olv-frame'); frame.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(veil, under, frame);
      host.append(svg);
      return { svg, veil, under, frame };
    });
  },

  // The selection moves by cross-fade: the hidden layer is redrawn on the new box (while invisible), then the two
  // layers swap their opacity. Opacity only; each layer is static between two moves.
  paintSelection(n, instant) {
    if (!this.sel) return;
    const pts = this.items[n].box.map((p) => `${p[0]},${p[1]}`).join(' ');
    const next = instant ? this.selOn : 1 - this.selOn;
    const L = this.sel[next];
    L.veil.setAttribute('d', `M0 0H${IMG.w}V${IMG.h}H0Z M${this.items[n].box.map((p) => `${p[0]} ${p[1]}`).join(' L')} Z`);
    L.under.setAttribute('points', pts);
    L.frame.setAttribute('points', pts);
    if (instant) {
      this.sel.forEach((x, k) => { x.svg.style.transition = 'none'; x.svg.classList.toggle('is-on', k === next); });
      void L.svg.getBoundingClientRect();
      this.sel.forEach((x) => { x.svg.style.transition = ''; });
    } else {
      this.sel[this.selOn].svg.classList.remove('is-on');
      L.svg.classList.add('is-on');
    }
    this.selOn = next;
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

  // The label's sub-line: where the film opens (an app that IS on this TV), the other installed apps behind long OK,
  // or, plainly, that none of its apps is installed.
  subline(it) {
    if (this.hiddenKeys.has(it.key)) return 'Ce film est prêté';
    const app = this.appFor(it);
    if (!app) return `Aucune appli installée pour ce film · ${orList(this.choices(it).map((a) => a.name))}`;
    const others = this.installedChoices(it).filter((a) => a.id !== app.id);
    return `S’ouvre dans ${app.name}${others.length ? ` · OK long : ${others.map((a) => a.name).join(', ')}` : ''}`;
  },

  focus(n, instant) {
    this.i = Math.max(0, Math.min(this.items.length - 1, n));
    const it = this.items[this.i];
    this.paintSelection(this.i, instant);
    const cap = this.root.querySelector('.olv-caption');
    cap.querySelector('.olv-caption-title').textContent = `${it.title} · ${it.year}`;
    cap.querySelector('.olv-caption-sub').textContent = this.subline(it);
    this.drawLine(instant);
    if (!instant) { cap.classList.remove('is-write'); void cap.offsetWidth; cap.classList.add('is-write'); }
  },

  // Lumos: the box lights up, then the film opens in the app that owns it (link from the config).
  async launch() {
    if (this.busy) return;
    const it = this.items[this.i]; const app = this.appFor(it);
    const root = this.root, fx = this.ctx.fx;
    if (!app) {                                       // none of the film's apps is on this TV: say so, plainly
      if (fx.cue) fx.cue('error');
      const b = await loadBeuglante();
      if (b && this.root === root) b(root, { message: `Aucune appli installée pour ce film. Il se regarde sur ${orList(this.choices(it).map((a) => a.name))}.` });
      return;
    }
    this.busy = true; Input.hold();
    const k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
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
      this.timers.push(setTimeout(async () => {
        settle(); if (fx.cue) fx.cue('error');
        if (r.missing) this.focus(this.i, true);      // the TV says the app is gone: the label follows
        const b = await loadBeuglante(); if (b) b(root, { message: r.error });
      }, 200 * k));
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

  // The apps that can open a film, the film's own app first: the one in LIBRARY, then every app of `urls` (one link
  // per app). In the mock-up every one counts as installed (Platform.has); on the TV, only those present.
  choices(it) { return [...new Set([it.app, ...Object.keys(it.urls || {}), ...(it.also || [])])].map(appById).filter(Boolean); },
  installedChoices(it) { return this.choices(it).filter((a) => Platform.has(a)); },
  // The app that opens this film: the one chosen from the Remembrall (config.library.apps) if it is installed,
  // otherwise the first installed one in the film's order; null when none of them is on this TV.
  appFor(it) {
    const ok = this.installedChoices(it);
    const chosen = getConfig().library.apps[it.key];
    return ok.find((a) => a.id === chosen) || ok[0] || null;
  },

  // Long OK: lend the film, and choose the app that opens it (kept per film in config.library.apps). Only the apps
  // installed on this TV are offered.
  async rappeltout() {
    const fn = await loadRappeltout(); if (!fn) return;
    const it = this.items[this.i]; const c = this.center(this.i);
    const current = this.appFor(it);
    const options = this.installedChoices(it).filter((a) => a.id !== (current && current.id)).map((a) => ({ id: `app:${a.id}`, label: `Ouvrir avec ${a.name}` }));
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
