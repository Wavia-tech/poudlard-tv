// The Parapet (home): a single cinematic shot. The castle, the time with a drop cap, the apps engraved in gold
// and centred over a night fade, Hedwig (Hedwige) landing on the chosen app, and a discreet bar in the top-right
// corner (sound, Map, Settings). Lumos (launch), the boot sequence and Nox (idle) all live here.
import { dockApps, updateConfig, getConfig, isReduced, onConfigChange, HOUSES } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram, logoBox } from '../monogram.js';
import { crestSvg } from '../crests.js';
import { createOwl } from '../owl.js';

const FOCUS_SCALE = 1.28;
const LOGO_H = 3.6;            // cqw: logo height at rest (3 m floor)
const LOGO_W_MAX = 9.5;        // cqw
const PER_ROW = 8;             // beyond this: a second row
const NOX_WANDER_MS = 20 * 60 * 1000;   // one lap of the clock's wander during Nox
const BAR = ['sound', 'map', 'settings'];
const OWL_CELLS = ['perch', 'look', 'sleep', 'up', 'down', 'glide', 'land'];   // the order of tools/cutout_owl.py --sheet
const CANCEL_MS = 350;         // after OK, Back cancels the launch until the intent fires

const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const logoOf = (app) => LOGOS[app.id] || monogram(app.name);

// Nox starfield: three 512 px tiles of ivory dots, drawn once per page, then drifted by CSS (home.css).
let STAR_TILES = null;
function starTiles() {
  if (STAR_TILES) return STAR_TILES;
  STAR_TILES = [12, 14, 16].map((count, n) => {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    for (let i = 0; i < count; i++) {
      const x = Math.random() * 512, y = Math.random() * 512, r = 0.6 + Math.random() * (0.9 + n * 0.3);
      g.globalAlpha = 0.35 + Math.random() * 0.5; g.fillStyle = Math.random() < 0.2 ? '#C9D9EA' : '#F1EBDD';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return c.toDataURL();
  });
  return STAR_TILES;
}

// The sky by the hour (config.sky 'auto'): dusk 17-20, night, deep night 1-5, dawn 5-8.
function skyState(hour) {
  if (hour >= 17 && hour < 20) return 'dusk';
  if (hour >= 1 && hour < 5) return 'deep';
  if (hour >= 5 && hour < 8) return 'dawn';
  return 'night';
}

export default {
  root: null, ctx: null, owl: null, apps: [], items: [], i: 0, bar: 0, zone: 'dock', busy: false, mode: 'normal',
  windows: [], untick: null, timers: [], ro: null, hintTimer: 0, noxTimers: [], noxAnim: null, launchTimers: [], cancelUntil: 0, castleReady: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.mode = 'normal'; this.zone = 'dock'; this.launchTimers = []; this.cancelUntil = 0;
    this.apps = dockApps();
    const last = getConfig().lastApp;
    this.i = Math.max(0, this.apps.findIndex((a) => a.id === last));
    root.innerHTML = `
      <div class="home-plane"><img class="home-castle" alt=""><canvas class="home-lights"></canvas><div class="home-moon"></div></div>
      <div class="home-tint"></div>
      <div class="home-mist"></div>
      <div class="home-shade"></div>
      <div class="home-stars home-stars-1"></div><div class="home-stars home-stars-2"></div><div class="home-stars home-stars-3"></div>
      <div class="home-event"></div>
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
      <div class="keyhint home-hint"><span><b>▼</b>La Bibliothèque</span><span><b>▲</b>Son · Carte · Réglages</span><span><b>OK</b>Ouvrir</span></div>
      <div class="home-dim"></div><div class="home-disc"></div><div class="home-bloom"></div>
      <div class="home-launch"><img class="home-launch-banner" alt=""><div class="home-launch-logo"></div><div class="home-launch-title engraved gold-text"></div><div class="home-launch-sub"></div></div>
      <div class="home-plate"><div class="home-plate-title engraved">Nox ?</div><div class="home-plate-sub">Passer en mode classique, sans décor ni chouette.</div><div class="home-plate-opts"><span class="home-plate-opt" data-v="yes">Oui, Nox</span><span class="home-plate-opt is-focus" data-v="no">Non</span></div></div>`;

    const castle = root.querySelector('.home-castle');
    this.castleReady = new Promise((resolve) => {
      castle.addEventListener('load', () => { this.findWindows(castle); resolve(true); });
      castle.addEventListener('error', () => { castle.remove(); root.classList.add('no-castle'); resolve(false); });
    });
    castle.src = 'assets/castle.jpg';
    const mistProbe = new Image();
    mistProbe.onerror = () => root.querySelector('.home-mist').classList.add('fallback');
    mistProbe.src = 'assets/mist.png';
    const tiles = starTiles();
    root.querySelectorAll('.home-stars').forEach((s, n) => { s.style.backgroundImage = `url(${tiles[n]})`; });

    this.buildDock();
    this.syncBar();
    this.syncHouse();
    this.unsub = onConfigChange(() => { this.syncHouse(); this.tick(); });
    this.ro = new ResizeObserver(() => this.layout(true));
    this.ro.observe(root);
    this.tick();
    this.timers.push(setInterval(() => this.tick(), 15000));

    if (getConfig().owl !== 'absente') {
      this.owl = createOwl(root.querySelector('.home-arena'), {
        sheet: 'assets/owl-sheet.webp', cells: OWL_CELLS, feather: 'assets/feather.webp',
        size: root.clientWidth * 0.082, reduced: () => isReduced() || getConfig().owl === 'calme',
      });
    }
    this.layout(true);
    this.untick = ctx.fx.tick((t) => this.frame(t));          // the window flicker rides the shared scene clock
    this.armHint();
    this.scheduleEvents();
    if (ctx.config().sounds) ctx.fx.initAudio();
    if (ctx.params.boot) this.boot(isReduced() ? 300 : ctx.params.short ? 700 : 1800);
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

  // The leaving screen's flourish (router.js): the owl lifts off before the crane, the candle goes out before the Room.
  onLeave(transition) {
    if (transition === 'crane' && this.owl) this.owl.liftOff(450);
    if (transition === 'snuff') { const light = this.root && this.root.querySelector('.home-candlelight'); if (light) light.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }); }
  },

  // The chosen house: its crest under the clock, its name, and its colours (wax, glow) everywhere via main.js.
  syncHouse() {
    const c = getConfig(); const h = c.house ? HOUSES[c.house] : null;
    const el = this.root.querySelector('.home-crest'); if (!el) return;
    el.innerHTML = h ? `${crestSvg(c.house, 'home-crest-svg')}<span class="home-crest-name"></span>` : '';
    if (h) el.querySelector('.home-crest-name').textContent = h.name;
    el.classList.toggle('show', Boolean(h));
  },

  unmount() {
    if (this.unsub) this.unsub();
    if (this.onHomeEvent) document.removeEventListener('poudlard:home', this.onHomeEvent); this.onHomeEvent = null;
    if (this.untick) this.untick(); this.untick = null;
    this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    this.timers.forEach(clearTimeout); this.timers.forEach(clearInterval);
    this.launchTimers.forEach(clearTimeout); this.launchTimers = [];
    this.noxTimers.forEach(clearTimeout);
    if (this.noxAnim) { this.noxAnim.cancel(); this.noxAnim = null; }
    clearTimeout(this.hintTimer);
    if (this.ro) this.ro.disconnect();
    if (this.owl) this.owl.destroy();
    this.owl = null;
  },

  // ---- Dock: every visible app, centred and spread out; two rows beyond PER_ROW ----
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
        el.className = 'home-app';
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

  tick() {
    const now = new Date();
    this.root.querySelector('.home-time').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const d = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    this.root.querySelector('.home-cap').textContent = d.charAt(0).toUpperCase();   // the drop cap
    this.root.querySelector('.home-date-rest').textContent = d.slice(1);
    this.root.dataset.sky = getConfig().sky === 'nuit' ? 'night' : skyState(now.getHours());
  },

  // ---- Flickering windows: warm spots of the image, drawn small and discreet ----
  findWindows(img) {
    if (!img.naturalWidth) return;
    const iw = 640, ih = Math.round(iw * img.naturalHeight / img.naturalWidth);
    const c = document.createElement('canvas'); c.width = iw; c.height = ih;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, iw, ih);
    let d; try { d = x.getImageData(0, 0, iw, ih).data; } catch (e) { return; }
    const seen = new Set(), pts = [];
    for (let y = 0; y < ih; y += 2) for (let xx = 0; xx < iw; xx += 2) {
      const k = (y * iw + xx) * 4, r = d[k], g = d[k + 1], b = d[k + 2];
      if (r > 175 && g > 115 && b < 130 && r - b > 80) {
        const cell = `${xx >> 3}:${y >> 3}`;
        if (seen.has(cell)) continue;
        seen.add(cell);
        pts.push({ x: xx / iw, y: y / ih, a: 0.12 + Math.random() * 0.16, ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.7, r: 0.7 + Math.random() * 0.5, lit: 1 });
      }
    }
    this.windows = pts.slice(0, 140);
    // Moon: the brightest point of the upper third.
    const moon = this.root.querySelector('.home-moon');
    try {
      const top = x.getImageData(0, 0, iw, Math.round(ih * 0.4)).data; let best = 0, bx = 0.3, by = 0.2;
      for (let y = 0; y < Math.round(ih * 0.4); y += 2) for (let xx = 0; xx < iw; xx += 2) { const k = (y * iw + xx) * 4, v = top[k] + top[k + 1] + top[k + 2]; if (v > best) { best = v; bx = xx / iw; by = y / ih; } }
      if (best > 600) { moon.style.left = bx * 100 + '%'; moon.style.top = by * 100 + '%'; } else moon.style.opacity = '0';
    } catch (e) { moon.style.opacity = '0'; }
    if (!this.glow) {
      this.glow = document.createElement('canvas'); this.glow.width = this.glow.height = 32;
      const g = this.glow.getContext('2d'); const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      rg.addColorStop(0, 'rgba(255,225,170,0.9)'); rg.addColorStop(0.25, 'rgba(255,190,100,0.35)'); rg.addColorStop(1, 'rgba(255,170,60,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    }
  },

  // One frame of the window flicker, on the shared scene clock (Fx.tick): the castle's own canvas, half resolution.
  frame(t) {
    if (!this.root) return;
    const cv = this.root.querySelector('.home-lights');
    if (!cv || !this.windows.length || !this.glow) return;
    const W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    if (cv.width !== Math.round(W / 2)) { cv.width = Math.round(W / 2); cv.height = Math.round(H / 2); }
    const c = cv.getContext('2d'), w = cv.width, h = cv.height, s = t / 1000;
    c.clearRect(0, 0, w, h);
    c.globalCompositeOperation = 'lighter';
    const unit = w / 300;
    for (const p of this.windows) {
      if (p.lit <= 0) continue;
      let a = p.a * (0.6 + 0.4 * Math.sin(s * p.sp + p.ph)) * p.lit;
      if (Math.sin(s * 5.1 + p.ph * 3) > 0.992) a *= 0.35;
      c.globalAlpha = Math.max(0, Math.min(1, a));
      const sz = unit * 1.6 * p.r;
      c.drawImage(this.glow, p.x * w - sz / 2, p.y * h - sz / 2, sz, sz);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  },

  scheduleEvents() {
    const next = () => {
      this.timers.push(setTimeout(() => {
        if ((this.mode === 'normal' || this.mode === 'nox') && !isReduced()) {   // the shooting star also crosses the Nox sky
          const ev = this.root.querySelector('.home-event');
          ev.style.top = (5 + Math.random() * 16) + '%'; ev.style.left = (15 + Math.random() * 70) + '%';
          ev.animate([{ opacity: 0, transform: 'rotate(-18deg) translateX(0)' }, { opacity: 0.9, offset: 0.1 }, { opacity: 0, transform: 'rotate(-18deg) translateX(-16cqw)' }], { duration: 420, easing: 'ease-out' });
        }
        next();
      }, (90 + Math.random() * 150) * 1000));
    };
    next();
    const tower = () => {
      this.timers.push(setTimeout(() => {
        if (this.mode === 'normal' && this.windows.length) { const p = this.windows[Math.floor(Math.random() * this.windows.length)]; const t0 = performance.now();
          const fade = () => { const k = Math.min(1, (performance.now() - t0) / 2000); p.lit = 1 - k; if (k < 1) requestAnimationFrame(fade); else setTimeout(() => { p.lit = 1; }, 30000); }; fade(); }
        tower();
      }, 40000));
    };
    tower();
  },

  armHint() {
    clearTimeout(this.hintTimer);
    const hint = this.root.querySelector('.home-hint');
    hint.classList.remove('hidden');
    this.hintTimer = setTimeout(() => hint.classList.add('hidden'), 10000);
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

  // ---- Layout: parallax by index, owl, candle ----
  layout(instant) {
    const root = this.root, W = root.clientWidth;
    if (!W) return;
    const n = this.items.length;
    const p = n > 1 ? (this.i / (n - 1)) * 2 - 1 : 0;        // −1 … 1
    root.querySelector('.home-plane').style.transform = `translateX(${-p * 3}%)`;
    this.items.forEach((it, k) => it.classList.toggle('is-focus', this.zone === 'dock' && k === this.i));
    const light = root.querySelector('.home-candlelight');
    if (!n) { light.classList.remove('on'); if (this.owl) this.owl.hide(); return; }
    const el = this.items[this.i];
    const { cx, cy } = this.center(el);
    light.style.transform = `translate(${cx}px, ${cy}px)`;
    if (this.owl) this.owl.show();
    if (instant) { light.classList.toggle('on', this.zone === 'dock'); if (this.owl) { const t = this.owlTarget(); this.owl.teleport(t.x, t.y); } return; }
    light.classList.remove('on');
    if (this.owl) {
      const t = this.owlTarget();
      const k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
      this.owl.flyTo(t.x, t.y, { arena: { h: root.clientHeight }, timeScale: k, onLand: () => {
        this.ctx.fx.burst(t.cx, t.y + this.owl.size().h * 0.98, 8, W / 60);
        this.land(el);
        setTimeout(() => light.classList.add('on'), 80 * k);
      } });
    } else setTimeout(() => light.classList.add('on'), 250);
  },
  // The focused app settles under the owl's weight (focus.css .is-land, --t-land).
  land(el) {
    if (!el || isReduced()) return;
    el.classList.remove('is-land'); void el.offsetWidth; el.classList.add('is-land');
    this.timers.push(setTimeout(() => el.classList.remove('is-land'), 200 * (Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1)));
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
    let held = false;
    const root = this.root, fx = this.ctx.fx, k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
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
      disc.animate([{ opacity: 0.7, transform: `translate(${cx}px, ${cy}px) scale(.15)` }, { opacity: 0.55, transform: `translate(${cx}px, ${cy}px) scale(9)`, offset: 0.55 }, { opacity: 0, transform: `translate(${cx}px, ${cy}px) scale(30)` }], { duration: 900 * k, easing: 'cubic-bezier(.3,.6,.2,1)' });
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
    box.querySelector('.home-launch-sub').textContent = app.input ? `Entrée ${app.input}` : '';
    updateConfig({ lastApp: app.id });
    const showCard = setTimeout(() => box.classList.add('show'), 420 * k); timers.push(showCard);
    const done = () => {
      timers.forEach(clearTimeout);
      box.classList.remove('show'); root.querySelector('.home-dim').classList.remove('on');
      item.classList.remove('is-press'); logoEl.classList.remove('molten', 'charging'); light.classList.remove('flare');
      if (this.owl) { const t = this.owlTarget(); this.owl.comeBack(t.x, t.y); }
      this.cancelUntil = 0; this.busy = false;
      if (held) { held = false; Input.release(); }
    };
    this.launchDone = done;
    // The intent fires at 350 ms; from then on keys are queued and replayed at the end. The TV's answer decides the
    // rest: refused → everything settles at once and the Howler reads the TV's sentence; taken → the card stays while
    // the app takes the screen (4 s), 2.4 s in the mock-up.
    at(CANCEL_MS, async () => {
      this.cancelUntil = 0;
      held = true; Input.hold();
      if (fx.ambientHold) { fx.ambientHold(true, 'launch'); timers.push(setTimeout(() => fx.ambientHold(false, 'launch'), 6000)); }
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

  // ---- Boot: a Lumos. Dark castle, a point of light, the iris, the windows relight left to right, the clock
  // writes itself, the dock rises, the owl arrives last. `ms`: the whole thing (1800 cold, 700 short, 300 reduced). ----
  boot(ms) {
    const root = this.root; root.classList.add('booting');
    const W = root.clientWidth, H = root.clientHeight;
    const disc = root.querySelector('.home-disc');
    Input.hold();
    const k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
    const s = ms / 1800;                                      // the short and reduced boots keep the same shape, compressed
    const at = (t, fn) => this.timers.push(setTimeout(fn, t * s * k));
    root.style.clipPath = 'circle(0 at 50% 58%)';
    this.windows.forEach((p) => { p.lit = 0; });
    const ready = this.castleReady || Promise.resolve(false);
    ready.then(() => { if (!this.root) return; this.windows.forEach((p) => { p.lit = 0; }); });
    at(0, () => disc.animate([{ opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(.05)` }, { opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(.4)` }], { duration: 300 * s * k, easing: 'ease-out', fill: 'forwards' }));
    at(300, () => {
      disc.animate([{ opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(.4)` }, { opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(12)`, offset: 0.7 }, { opacity: 0, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(30)` }], { duration: 600 * s * k, easing: 'ease-out' });
      const reveal = root.animate([{ clipPath: 'circle(0 at 50% 58%)' }, { clipPath: 'circle(150% at 50% 58%)' }], { duration: 600 * s * k, easing: 'ease-out', fill: 'forwards' });
      reveal.onfinish = () => { reveal.cancel(); root.style.clipPath = ''; };
    });
    at(450, () => {
      ready.then(() => {
        if (!this.root) return;
        const sorted = [...this.windows].sort((a, b) => a.x - b.x);
        sorted.forEach((p, n) => this.timers.push(setTimeout(() => { p.lit = 1; }, (n / Math.max(1, sorted.length)) * 900 * s * k)));
      });
      if (this.ctx.fx.cue) this.ctx.fx.cue('wake');
    });
    at(700, () => { const c = root.querySelector('.home-clock'); c.classList.add('write-in'); root.classList.remove('booting'); });
    at(1000, () => {
      if (this.owl && this.items.length && !isReduced()) {
        const t = this.owlTarget();
        this.owl.comeBack(t.x, t.y, { onLand: () => { this.ctx.fx.burst(t.cx, t.y + this.owl.size().h * 0.98, 8, W / 60); this.land(this.items[this.i]); } });
      }
    });
    at(1800, () => { root.querySelector('.home-clock').classList.remove('write-in'); Input.release(); });
  },

  // ---- Nox: a slow starfield (three drifting tiles), the clock wanders on a 20 min loop (never the same pixel),
  // the windows go out one by one, the owl sleeps, the scene clock drops to 15 fps. ----
  nox() {
    if (this.mode === 'nox') return;
    this.mode = 'nox';
    const root = this.root; root.classList.add('nox');
    this.ctx.fx.setRate(66);
    if (this.ctx.fx.ambientHold && getConfig().musicNox !== 'continue') this.ctx.fx.ambientHold(true, 'nox');   // the music waits, unless asked to go on
    if (this.ctx.fx.cue) this.ctx.fx.cue('nox');
    if (this.owl) this.owl.sleep();
    const order = [...this.windows].sort(() => Math.random() - 0.5);
    const keep = Math.floor(order.length / 3);
    order.slice(keep).forEach((p, n) => this.noxTimers.push(setTimeout(() => { const t0 = performance.now(); const fade = () => { const k = Math.min(1, (performance.now() - t0) / 1500); p.lit = 1 - k * 0.95; if (k < 1) requestAnimationFrame(fade); }; fade(); }, (n / Math.max(1, order.length)) * 20000)));
    root.querySelector('.home-moon').style.opacity = '.4';
    if (!isReduced()) {
      const W = root.clientWidth;
      const pts = [[0, 0], [30, 12], [-20, 16], [-36, -6], [10, -18], [38, 4], [-8, 18], [-30, -14], [0, 0]];   // in cqw, within ±38 / ±18
      this.noxTimers.push(setTimeout(() => {
        if (!this.root || this.mode !== 'nox') return;
        this.noxAnim = root.querySelector('.home-clock').animate(pts.map(([x, y], i) => ({ transform: `translate(${x * W / 100}px, ${y * W / 100}px)`, offset: i / (pts.length - 1) })),
          { duration: NOX_WANDER_MS, iterations: Infinity, easing: 'linear', composite: 'add' });
      }, 2000));
    }
    const plane = root.querySelector('.home-plane'); let dir = 1;
    const drift = () => { plane.style.transform = `translateX(${dir * 3}%)`; dir = -dir; this.noxTimers.push(setTimeout(drift, 90000)); };
    this.noxTimers.push(setTimeout(drift, 100));
  },
  wake() {
    if (this.mode !== 'nox') return;
    this.mode = 'normal';
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    if (this.noxAnim) { this.noxAnim.cancel(); this.noxAnim = null; }
    this.ctx.fx.setRate(getConfig().motion === 'economie' ? 66 : 33);
    if (this.ctx.fx.ambientHold) this.ctx.fx.ambientHold(false, 'nox');
    const root = this.root; root.classList.remove('nox');
    const sorted = [...this.windows].sort((a, b) => a.x - b.x);
    sorted.forEach((p, n) => setTimeout(() => { p.lit = 1; }, (n / Math.max(1, sorted.length)) * 700));
    root.querySelector('.home-moon').style.opacity = '';
    if (this.ctx.fx.cue) this.ctx.fx.cue('wake');
    if (this.owl) this.owl.wake();
    this.layout(true);
    this.armHint();
  },

  // ---- Rappeltout ----
  async rappeltout() {
    const app = this.apps[this.i]; if (!app) return;
    const fn = await loadRappeltout(); if (!fn) return;
    // On the TV, an app with a package gets the system's own page (uninstall, force stop); the mock-up shows a plain note.
    const sysInfo = Boolean(app.pkg && Platform.isTV());
    const choice = await fn(this.root, { title: app.name, options: [
      { id: 'move', label: 'Déplacer' }, { id: 'remove', label: 'Retirer du parapet' }, { id: 'hide', label: 'Masquer' },
      sysInfo ? { id: 'appinfo', label: 'Infos de l’appli' } : { id: 'info', label: 'Infos' },
    ] });
    if (choice === 'move') this.enterMove();
    else if (choice === 'remove') this.removeFromDock(app.id);
    else if (choice === 'hide') { const c = getConfig(); updateConfig({ dock: c.dock.filter((id) => id !== app.id), hidden: [...c.hidden, app.id] }); this.rebuild(); }
    else if (choice === 'appinfo') { const r = Platform.openSystem('appinfo', app.pkg); if (r.status === 'failed') { const b = await loadBeuglante(); if (b) b(this.root, { message: r.error }); } }
    else if (choice === 'info') { const b = await loadBeuglante(); if (b) b(this.root, { message: app.pkg ? `${app.name} · ${app.pkg}` : `${app.name} · ${app.input || 'ajoutée à la main'}` }); }
  },
  removeFromDock(id) { updateConfig({ dock: getConfig().dock.filter((x) => x !== id) }); this.rebuild(); },
  rebuild() { this.apps = dockApps(); this.i = Math.min(this.i, Math.max(0, this.apps.length - 1)); this.buildDock(); this.layout(true); },
  enterMove() { this.mode = 'move'; this.items[this.i].classList.add('lifted'); },
  swap(dir) {
    const j = this.i + dir; if (j < 0 || j >= this.apps.length) return;
    const dock = [...getConfig().dock]; [dock[this.i], dock[j]] = [dock[j], dock[this.i]];
    updateConfig({ dock }); this.apps = dockApps(); this.i = j; this.buildDock(); this.items[this.i].classList.add('lifted'); this.layout(true);
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
