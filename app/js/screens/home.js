// Le Parapet (accueil) : un seul plan de cinéma. Le château, l'heure en lettrine, les applis gravées en or
// centrées sur un fondu de nuit, Hedwige qui se pose sur l'appli choisie, et une barre discrète en haut à droite
// (son, Carte, Réglages). Lumos (lancement), l'allumage (démarrage) et Nox (veille) vivent ici.
import { dockApps, updateConfig, getConfig, isReduced, onConfigChange, HOUSES } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { crestSvg } from '../crests.js';
import { createOwl } from '../owl.js';

const FOCUS_SCALE = 1.28;
const LOGO_H = 3.4;            // cqw : hauteur de logo au repos
const LOGO_W_MAX = 9.5;        // cqw
const PER_ROW = 8;             // au-delà : deuxième rangée
const NOX_CORNER_MS = 10 * 60 * 1000;
const BAR = ['sound', 'map', 'settings'];

const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const logoOf = (app) => LOGOS[app.id] || monogram(app.name);

export default {
  root: null, ctx: null, owl: null, apps: [], items: [], i: 0, bar: 0, zone: 'dock', busy: false, mode: 'normal',
  windows: [], raf: 0, timers: [], ro: null, hintTimer: 0, noxTimers: [], lastFrame: 0,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.mode = 'normal'; this.zone = 'dock';
    this.apps = dockApps();
    const last = getConfig().lastApp;
    this.i = Math.max(0, this.apps.findIndex((a) => a.id === last));
    root.innerHTML = `
      <div class="home-plane"><img class="home-castle" alt=""><canvas class="home-lights"></canvas><div class="home-moon"></div></div>
      <div class="home-mist"></div>
      <div class="home-shade"></div>
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
      <div class="home-launch"><div class="home-launch-logo"></div><div class="home-launch-title engraved gold-text"></div><div class="home-launch-sub"></div></div>
      <div class="home-plate"><div class="home-plate-title engraved">Nox ?</div><div class="home-plate-sub">Passer en mode classique, sans décor ni chouette.</div><div class="home-plate-opts"><span class="home-plate-opt" data-v="yes">Oui, Nox</span><span class="home-plate-opt is-focus" data-v="no">Non</span></div></div>`;

    const castle = root.querySelector('.home-castle');
    castle.addEventListener('load', () => this.findWindows(castle));
    castle.addEventListener('error', () => { castle.remove(); root.classList.add('no-castle'); });
    castle.src = 'assets/castle.jpg';
    const mistProbe = new Image();
    mistProbe.onerror = () => root.querySelector('.home-mist').classList.add('fallback');
    mistProbe.src = 'assets/mist.png';

    this.buildDock();
    this.syncBar();
    this.syncHouse();
    this.unsub = onConfigChange(() => this.syncHouse());
    this.ro = new ResizeObserver(() => this.layout(true));
    this.ro.observe(root);
    this.tick();
    this.timers.push(setInterval(() => this.tick(), 15000));

    if (getConfig().owl !== 'absente') {
      const p = (n) => `assets/owl-${n}.png`;
      this.owl = createOwl(root.querySelector('.home-arena'), {
        poses: { perch: p('perch'), look: p('look'), sleep: p('sleep'), up: p('up'), down: p('down'), glide: p('glide'), land: p('land') },
        size: root.clientWidth * 0.082, reduced: () => isReduced() || getConfig().owl === 'calme',
      });
    }
    this.layout(true);
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.armHint();
    this.scheduleEvents();
    if (ctx.config().sounds) ctx.fx.initAudio();
    if (ctx.params.boot) this.boot(ctx.params.short ? 300 : 700);
    if (ctx.params.nox) this.nox();
    if (ctx.params.askClassic) this.timers.push(setTimeout(() => this.plate(true), 750));
  },

  // La maison choisie : son écusson sous l'horloge, un mot, et ses couleurs (cire, lueur) partout via main.js.
  syncHouse() {
    const c = getConfig(); const h = c.house ? HOUSES[c.house] : null;
    const el = this.root.querySelector('.home-crest'); if (!el) return;
    el.innerHTML = h ? `${crestSvg(c.house, 'home-crest-svg')}<span class="home-crest-name"></span>` : '';
    if (h) el.querySelector('.home-crest-name').textContent = h.name;
    el.classList.toggle('show', Boolean(h));
  },

  unmount() {
    if (this.unsub) this.unsub();
    cancelAnimationFrame(this.raf);
    this.timers.forEach(clearTimeout); this.timers.forEach(clearInterval);
    this.noxTimers.forEach(clearTimeout);
    clearTimeout(this.hintTimer);
    if (this.ro) this.ro.disconnect();
    if (this.owl) this.owl.destroy();
    this.owl = null;
  },

  // ---- Dock : toutes les applis visibles, centrées, réparties ; deux rangées au-delà de PER_ROW ----
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
        el.style.width = Math.min(LOGO_W_MAX, Math.max(3.4, LOGO_H * (L.ratio || 1))) + 'cqw';
        el.innerHTML = `<div class="app-logo${L.luma ? ' luma' : ''}"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div>`;
        el.querySelector('.app-logo').style.setProperty('--m', `url("${L.src}")`);
        el.title = app.name;   // pas de nom affiché sous l'icône (choix de Corentin)
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
    this.root.querySelector('.home-cap').textContent = d.charAt(0).toUpperCase();   // la lettrine
    this.root.querySelector('.home-date-rest').textContent = d.slice(1);
  },

  // ---- Fenêtres qui scintillent : points chauds de l'image, rendus fins et discrets ----
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
        pts.push({ x: xx / iw, y: y / ih, a: 0.18 + Math.random() * 0.22, ph: Math.random() * 6.28, sp: 0.35 + Math.random() * 1.1, r: 0.7 + Math.random() * 0.6, lit: 1 });
      }
    }
    this.windows = pts.slice(0, 140);
    // Lune : le point le plus clair du tiers supérieur.
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

  frame(t) {
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
    const eco = getConfig().motion === 'economie' || this.mode === 'nox';
    if (t - this.lastFrame < (eco ? 66 : 33)) return;
    this.lastFrame = t;
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
        if (this.mode === 'normal' && !isReduced()) {
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

  // ---- Barre haut droite ----
  syncBar() {
    const c = getConfig();
    this.root.querySelectorAll('.home-bar-item').forEach((el, n) => {
      el.classList.toggle('is-focus', this.zone === 'bar' && n === this.bar);
      if (el.dataset.k === 'sound') { el.classList.toggle('off', !c.sounds); el.querySelector('.home-bar-label').textContent = c.sounds ? 'Son' : 'Muet'; }
    });
    this.root.classList.toggle('bar-active', this.zone === 'bar');
  },
  toggleSound() {
    const on = !getConfig().sounds;
    updateConfig({ sounds: on });
    if (on) { this.ctx.fx.initAudio(); this.ctx.fx.configure({ sound: true }); this.ctx.fx.cue ? this.ctx.fx.cue('toggle') : this.ctx.fx.chime(1318, 0.04); }
    else this.ctx.fx.configure({ sound: false });
    this.syncBar();
  },

  // ---- Mise en page : parallaxe par index, chouette, bougie ----
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
        setTimeout(() => light.classList.add('on'), 80 * k);
      } });
    } else setTimeout(() => light.classList.add('on'), 250);
  },
  // Centre d'une appli dans le repère de l'écran (les rangées sont centrées : on lit les boîtes).
  center(el) {
    const r = el.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
    return { cx: r.left - rr.left + r.width / 2, cy: r.top - rr.top + r.height / 2, w: r.width, h: r.height, top: r.top - rr.top };
  },
  owlTarget() {
    const el = this.items[this.i], app = this.apps[this.i];
    const L = logoOf(app); const ratio = L.ratio || 1;
    const b = this.center(el);
    const ch = Math.min(b.h, b.w / ratio);                     // hauteur réelle du dessin dans sa boîte (déjà agrandie en focus)
    const logoTop = b.cy - ch / 2;
    const s = this.owl.size();
    return { cx: b.cx, x: b.cx - s.w / 2, y: logoTop - s.h * 0.95 };
  },

  // ---- Lumos ----
  async launch() {
    if (this.busy) return;
    const app = this.apps[this.i]; if (!app) return;
    this.busy = true; Input.hold();
    const root = this.root, fx = this.ctx.fx, k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
    const logoEl = this.items[this.i].querySelector('.app-logo');
    const { cx, cy } = this.center(logoEl);
    root.querySelector('.home-dim').classList.add('on');
    logoEl.classList.add('molten');
    if (this.owl) this.owl.liftOff(500);
    if (fx.cue) fx.cue('lumos'); else fx.arpeggio();
    const disc = root.querySelector('.home-disc'), bloom = root.querySelector('.home-bloom');
    disc.animate([{ opacity: 0.95, transform: `translate(${cx}px, ${cy}px) scale(.15)` }, { opacity: 0.9, transform: `translate(${cx}px, ${cy}px) scale(9)`, offset: 0.55 }, { opacity: 0, transform: `translate(${cx}px, ${cy}px) scale(34)` }], { duration: 700 * k, easing: 'cubic-bezier(.2,.7,.3,1)' });
    bloom.animate([{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 900 * k, easing: 'ease-in-out' });
    const L = logoOf(app);
    const box = root.querySelector('.home-launch'); const lg = box.querySelector('.home-launch-logo');
    lg.className = `home-launch-logo app-logo lit${L.luma ? ' luma' : ''}`;
    lg.innerHTML = '<i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i>';
    lg.style.setProperty('--m', `url("${L.src}")`);
    box.querySelector('.home-launch-title').textContent = `Ouverture de ${app.name}`;
    box.querySelector('.home-launch-sub').textContent = app.input ? `Entrée ${app.input}` : '';
    this.timers.push(setTimeout(() => box.classList.add('show'), 420 * k));
    updateConfig({ lastApp: app.id });
    let result = 'simulated', failed = false;
    this.timers.push(setTimeout(() => {
      const inst = Platform.installed();
      if (inst && app.pkg && !inst.has(app.pkg)) failed = true; else result = Platform.launch(app);
    }, 350 * k));
    const done = () => {
      box.classList.remove('show'); root.querySelector('.home-dim').classList.remove('on'); logoEl.classList.remove('molten');
      if (this.owl) { const t = this.owlTarget(); this.owl.comeBack(t.x, t.y); }
      this.busy = false; Input.release();
    };
    this.timers.push(setTimeout(async () => {
      done();
      if (failed) {
        const beuglante = await loadBeuglante();
        if (fx.cue) fx.cue('error');
        if (beuglante) beuglante(root, { message: `${app.name} n'est plus installé.`, action: { label: 'Retirer du parapet', onChoose: () => this.removeFromDock(app.id) } });
      }
    }, (result === 'bridge' ? 4000 : 2400) * k));
  },

  // ---- Allumage ----
  boot(ms) {
    const root = this.root; root.classList.add('booting');
    const W = root.clientWidth, H = root.clientHeight;
    const disc = root.querySelector('.home-disc');
    Input.hold();
    const k = Number(getComputedStyle(root).getPropertyValue('--k')) || 1;
    root.style.clipPath = 'circle(0 at 50% 58%)';
    this.timers.push(setTimeout(() => {
      disc.animate([{ opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(.1)` }, { opacity: 1, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(12)`, offset: 0.7 }, { opacity: 0, transform: `translate(${W * 0.5}px, ${H * 0.58}px) scale(30)` }], { duration: ms * k, easing: 'ease-out' });
      const reveal = root.animate([{ clipPath: 'circle(0 at 50% 58%)' }, { clipPath: 'circle(150% at 50% 58%)' }], { duration: ms * k, easing: 'ease-out', fill: 'forwards' });
      reveal.onfinish = () => { reveal.cancel(); root.style.clipPath = ''; };
      this.timers.push(setTimeout(() => root.classList.remove('booting'), ms * 0.6 * k));
      this.timers.push(setTimeout(() => Input.release(), ms * k));
    }, 120));
  },

  // ---- Nox ----
  nox() {
    if (this.mode === 'nox') return;
    this.mode = 'nox';
    const root = this.root; root.classList.add('nox');
    if (this.ctx.fx.cue) this.ctx.fx.cue('nox');
    if (this.owl) this.owl.sleep();
    const order = [...this.windows].sort(() => Math.random() - 0.5);
    const keep = Math.floor(order.length / 3);
    order.slice(keep).forEach((p, n) => this.noxTimers.push(setTimeout(() => { const t0 = performance.now(); const fade = () => { const k = Math.min(1, (performance.now() - t0) / 1500); p.lit = 1 - k * 0.95; if (k < 1) requestAnimationFrame(fade); }; fade(); }, (n / Math.max(1, order.length)) * 20000)));
    root.querySelector('.home-moon').style.opacity = '.4';
    let left = false;
    this.noxTimers.push(setTimeout(() => root.classList.add('nox-corner'), 12000));
    const corner = () => { left = !left; root.classList.toggle('nox-left', left); this.noxTimers.push(setTimeout(corner, NOX_CORNER_MS)); };
    this.noxTimers.push(setTimeout(corner, NOX_CORNER_MS));
    const plane = root.querySelector('.home-plane'); let dir = 1;
    const drift = () => { plane.style.transform = `translateX(${dir * 3}%)`; dir = -dir; this.noxTimers.push(setTimeout(drift, 90000)); };
    this.noxTimers.push(setTimeout(drift, 100));
  },
  wake() {
    if (this.mode !== 'nox') return;
    this.mode = 'normal';
    this.noxTimers.forEach(clearTimeout); this.noxTimers = [];
    const root = this.root; root.classList.remove('nox', 'nox-corner', 'nox-left');
    const sorted = [...this.windows].sort((a, b) => a.x - b.x);
    sorted.forEach((p, n) => setTimeout(() => { p.lit = 1; }, (n / Math.max(1, sorted.length)) * 1200));
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
    const choice = await fn(this.root, { title: app.name, options: [
      { id: 'move', label: 'Déplacer' }, { id: 'remove', label: 'Retirer du parapet' }, { id: 'hide', label: 'Masquer' }, { id: 'info', label: 'Infos' },
    ] });
    if (choice === 'move') this.enterMove();
    else if (choice === 'remove') this.removeFromDock(app.id);
    else if (choice === 'hide') { const c = getConfig(); updateConfig({ dock: c.dock.filter((id) => id !== app.id), hidden: [...c.hidden, app.id] }); this.rebuild(); }
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

  plate(show) {
    const p = this.root.querySelector('.home-plate');
    p.classList.toggle('show', show);
    this.mode = show ? 'plate' : 'normal';
    if (show) p.querySelectorAll('.home-plate-opt').forEach((o) => o.classList.toggle('is-focus', o.dataset.v === 'no'));
  },

  onKey(action, ctx) {
    if (this.mode === 'nox') { if (action !== 'ok') this.wake(); return action !== 'left' && action !== 'right'; }
    if (this.busy) return true;
    this.armHint();
    if (this.mode === 'plate') {
      const opts = [...this.root.querySelectorAll('.home-plate-opt')];
      let k = opts.findIndex((o) => o.classList.contains('is-focus'));
      if (action === 'left' || action === 'right') { k = (k + (action === 'left' ? -1 : 1) + opts.length) % opts.length; opts.forEach((o, n) => o.classList.toggle('is-focus', n === k)); return true; }
      if (action === 'ok') { const v = opts[k].dataset.v; this.plate(false); if (v === 'yes') { updateConfig({ mode: 'classique' }); ctx.fx.whoosh(); ctx.router.replace('classic', {}, 'fade'); } return true; }
      if (action === 'back') { this.plate(false); return true; }
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
        else { if (ctx.fx.cue) ctx.fx.cue('enter'); ctx.router.go('settings', {}, 'iris'); }
        return true;
      }
      return true;
    }
    const n = this.items.length;
    if (action === 'right') { if (this.i < n - 1) { this.i++; this.layout(false); ctx.fx.cue ? ctx.fx.cue('move', { dir: 1 }) : ctx.fx.chime(1175, 0.02); } else if (this.owl) this.owl.nod(); return true; }
    if (action === 'left') { if (this.i > 0) { this.i--; this.layout(false); ctx.fx.cue ? ctx.fx.cue('move', { dir: -1 }) : ctx.fx.chime(1046, 0.02); } else if (this.owl) this.owl.nod(); return true; }
    if (action === 'ok') { if (n) this.launch(); else this.goMap(ctx); return true; }
    if (action === 'longok') { if (n) this.rappeltout(); return true; }
    if (action === 'down') { if (this.owl) this.owl.liftOff(450); if (ctx.fx.cue) ctx.fx.cue('enter'); else ctx.fx.chime(880, 0.03); ctx.router.go('library', {}, 'up'); return true; }
    if (action === 'up') { this.zone = 'bar'; this.syncBar(); this.layout(true); if (this.owl) this.owl.nod(); return true; }
    if (action === 'menu') { ctx.router.go('settings', {}, 'iris'); return true; }
    if (action === 'longback') { this.plate(true); return true; }
    return false;
  },
};
