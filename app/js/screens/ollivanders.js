// Ollivanders: the film collection shown as a wandmaker's shop window.
// The reference image (assets/ollivanders.webp) is displayed as is. Selection draws no outline at all:
// a warm spotlight lights the chosen box (the rest of the shop dims gently), the camera leans slightly
// towards it, and a few specks of gold dust rise from the wand.
import { LIBRARY, appById, getConfig, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';

const IMG = { w: 1672, h: 941 };
// The eight boxes, left to right, in image pixels: top-left, top-right, bottom-right, bottom-left.
const BOXES = [
  [[248, 318], [338, 313], [350, 790], [162, 790]],
  [[340, 318], [438, 313], [506, 790], [352, 790]],
  [[556, 322], [674, 318], [686, 790], [520, 790]],
  [[708, 322], [820, 318], [852, 790], [690, 790]],
  [[861, 322], [977, 318], [1020, 790], [858, 790]],
  [[1011, 322], [1135, 318], [1200, 790], [1030, 790]],
  [[1195, 320], [1285, 316], [1370, 790], [1180, 790]],
  [[1340, 322], [1440, 318], [1565, 790], [1385, 790]],
];
const FEATHER = 22;   // blur of the spotlight edge (image units)
const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);

export default {
  root: null, ctx: null, items: [], i: 0, busy: false, timers: [], hiddenKeys: new Set(), raf: 0, cur: null, dustTimer: 0,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.busy = false;
    const coll = LIBRARY[0];
    this.items = coll.items.slice(0, BOXES.length).map((it, n) => ({ ...it, box: BOXES[n], key: `${coll.id}:${it.content}` }));
    this.i = 0;
    root.innerHTML = `
      <div class="olv-scene">
        <img class="olv-bg" alt="">
        <svg class="olv-overlay" viewBox="0 0 ${IMG.w} ${IMG.h}" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <filter id="olv-feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${FEATHER}"/></filter>
            <mask id="olv-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${IMG.w}" height="${IMG.h}">
              <rect width="${IMG.w}" height="${IMG.h}" fill="#fff"/>
              <polygon class="olv-hole" fill="#000" filter="url(#olv-feather)" points=""/>
            </mask>
            <radialGradient id="olv-warm"><stop offset="0" stop-color="#ffd38a" stop-opacity=".45"/><stop offset=".55" stop-color="#ffb457" stop-opacity=".12"/><stop offset="1" stop-color="#ffb457" stop-opacity="0"/></radialGradient>
          </defs>
          <rect class="olv-shade" width="${IMG.w}" height="${IMG.h}" mask="url(#olv-mask)"/>
          <ellipse class="olv-warmth" fill="url(#olv-warm)"/>
        </svg>
      </div>
      <div class="olv-caption"><div class="olv-caption-title"></div><div class="olv-caption-sub"></div></div>
      <div class="keyhint olv-hint"><span><b>◀ ▶</b>Choisir</span><span><b>OK</b>Ouvrir le film</span><span><b>▲</b>Parapet</span></div>
      <div class="olv-dim"></div>`;
    const bg = root.querySelector('.olv-bg');
    bg.addEventListener('error', () => root.classList.add('no-image'));
    bg.src = 'assets/ollivanders.webp';
    this.timers.push(setTimeout(() => root.classList.add('is-in'), 60));
    this.focus(0, true);
    this.dust();
    if (ctx.config().sounds) ctx.fx.initAudio();
  },

  unmount() { this.timers.forEach(clearTimeout); cancelAnimationFrame(this.raf); clearTimeout(this.dustTimer); },

  // Centre of a box (image pixels and screen pixels).
  centerImg(n) { const b = this.items[n].box; return { x: b.reduce((s, p) => s + p[0], 0) / 4, y: b.reduce((s, p) => s + p[1], 0) / 4 }; },
  center(n) { const c = this.centerImg(n); return { x: c.x / IMG.w * this.root.clientWidth, y: c.y / IMG.h * this.root.clientHeight }; },

  // The spotlight hole slides from one box to the next: interpolation of the 8 coordinates, 380 ms.
  moveHole(target, instant) {
    const hole = this.root.querySelector('.olv-hole');
    const flat = target.flat();
    const set = (pts) => hole.setAttribute('points', pts.map((v) => v.toFixed(1)).join(' '));
    cancelAnimationFrame(this.raf);
    if (instant || !this.cur || isReduced()) { this.cur = flat; set(flat); return; }
    const from = this.cur, t0 = performance.now(), k = Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1, dur = 380 * k;
    const step = (now) => {
      let t = Math.min(1, (now - t0) / dur); t = 1 - Math.pow(1 - t, 3);                 // ease-out
      const pts = from.map((v, n) => v + (flat[n] - v) * t);
      set(pts); this.cur = pts;
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  },

  focus(n, instant) {
    this.i = Math.max(0, Math.min(this.items.length - 1, n));
    const it = this.items[this.i];
    this.moveHole(it.box, instant);
    // Warm light resting on the box, and the camera leaning towards it.
    const c = this.centerImg(this.i);
    const warm = this.root.querySelector('.olv-warmth');
    warm.setAttribute('cx', c.x); warm.setAttribute('cy', c.y - 40); warm.setAttribute('rx', 150); warm.setAttribute('ry', 290);
    const scene = this.root.querySelector('.olv-scene');
    scene.style.transformOrigin = `${c.x / IMG.w * 100}% ${c.y / IMG.h * 100}%`;
    scene.classList.add('lean');
    const app = appById(it.app);
    const cap = this.root.querySelector('.olv-caption');
    cap.querySelector('.olv-caption-title').textContent = `${it.title} · ${it.year}`;
    cap.querySelector('.olv-caption-sub').textContent = app ? (this.hiddenKeys.has(it.key) ? 'Ce film est prêté' : `Disponible sur ${app.name}`) : 'Appli à choisir dans les réglages';
    if (!instant) { cap.classList.remove('is-write'); void cap.offsetWidth; cap.classList.add('is-write'); }
  },

  // A few specks of gold rise from the chosen wand, now and then.
  dust() {
    clearTimeout(this.dustTimer);
    const tick = () => {
      if (!isReduced() && !this.busy) { const c = this.center(this.i); this.ctx.fx.burst(c.x, c.y - this.root.clientHeight * 0.12, 3, this.root.clientWidth / 90); }
      this.dustTimer = setTimeout(tick, 1400 + Math.random() * 1200);
    };
    this.dustTimer = setTimeout(tick, 600);
  },

  // Lumos: the box lights up, then the film opens in the app that owns it (link from the config).
  launch() {
    if (this.busy) return;
    const it = this.items[this.i]; const app = appById(it.app); if (!app) return;
    this.busy = true; Input.hold();
    const root = this.root, fx = this.ctx.fx, k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
    const c = this.center(this.i);
    root.classList.add('is-launch');
    fx.lumos(root, c.x, c.y, 800);
    if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
    // The link opens right away (inside the OK gesture, otherwise the browser blocks the tab); the light dresses the wait.
    const r = Platform.openContent(app, it);
    const dim = root.querySelector('.olv-dim');
    const settle = () => { dim.classList.remove('show'); root.classList.remove('is-launch'); this.busy = false; Input.release(); };
    if (r.status === 'failed') {                      // the TV refused: the light goes out at once, the Howler says why
      this.timers.push(setTimeout(async () => { settle(); if (fx.cue) fx.cue('error'); const b = await loadBeuglante(); if (b) b(root, { message: r.error }); }, 200 * k));
      return;
    }
    const L = LOGOS[app.id] || monogram(app.name);
    dim.innerHTML = `<div class="olv-launch-logo app-logo lit${L.luma ? ' luma' : ''}" style="--m:url('${L.src}')"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div><div class="olv-launch-title"></div><div class="olv-launch-sub engraved gold-text"></div>`;
    dim.querySelector('.olv-launch-title').textContent = `Harry Potter ${it.title.charAt(0).toLowerCase()}${it.title.slice(1)}`;
    dim.querySelector('.olv-launch-sub').textContent = `sur ${app.name}`;
    this.timers.push(setTimeout(() => dim.classList.add('show'), 450 * k));
    this.timers.push(setTimeout(settle, (r.status === 'bridge' ? 4000 : 2600) * k));
  },

  async rappeltout() {
    const fn = await loadRappeltout(); if (!fn) return;
    const it = this.items[this.i]; const c = this.center(this.i);
    const choice = await fn(this.root, { title: it.title, anchor: c, options: [{ id: 'lend', label: this.hiddenKeys.has(it.key) ? 'Reprendre ce film' : 'Marquer comme prêté' }] });
    if (choice === 'lend') { if (this.hiddenKeys.has(it.key)) this.hiddenKeys.delete(it.key); else this.hiddenKeys.add(it.key); this.focus(this.i, true); }
  },

  onKey(action, ctx) {
    if (this.busy) return true;
    if (action === 'right') { if (this.i < this.items.length - 1) { this.focus(this.i + 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: 1 }) : ctx.fx.chime(1175, 0.02); } return true; }
    if (action === 'left') { if (this.i > 0) { this.focus(this.i - 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: -1 }) : ctx.fx.chime(1046, 0.02); } return true; }
    if (action === 'ok') { this.launch(); return true; }
    if (action === 'longok') { this.rappeltout(); return true; }
    if (action === 'up' || action === 'back') { if (ctx.fx.cue) ctx.fx.cue('return'); else ctx.fx.whoosh(); ctx.router.go('home', {}, 'down'); return true; }
    if (action === 'longback') { ctx.router.go('home', { askClassic: true }, 'down'); return true; }
    if (action === 'menu') { ctx.router.go('settings', {}, 'iris'); return true; }
    return false;
  },
};
