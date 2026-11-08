// Ollivanders: the film collection shown as a wandmaker's shop window, one screen per collection of LIBRARY, one instance of
// this screen per window (the router keeps the windows next to the one in place mounted, off screen).
// The screen is his picture and nothing over it: one opaque image (assets/ollivanders.webp, assets/beasts.webp, soft scrims for
// the caption and the help line baked in), the chosen box or suitcase, the text. No veil, no outline, no grade.
// Each film has a sprite cut out of the picture (tools/shop_sprites.py, assets/shop/), baked at the size it has once risen and
// drawn at rest at exactly its place in the picture, so that the settled focus maps 1:1 on the screen's pixels. The choice
// rises: the old sprite settles back and fades out as it lands, the new one fades in and rises (ollivanders.css), CSS
// transitions, so that a new key retargets from where things are. A key changes classes and reads no layout: the titles and the
// sub-lines are typeset ahead, a few per frame, as the rest of the window (mount: the picture and the chosen sprite first; a key
// that outruns this makes the one it needs).
// Down and Up between the windows are one vertical camera move (router.js, pan-down, pan-up), and Up from the first window is
// the same move up to the Parapet; the choice goes straight down to whatever sits below it.
import { LIBRARY, appById, getConfig, updateConfig } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram, logoBox } from '../monogram.js';
import { RISE } from '../../assets/shop/sprites.js';

// Each collection of LIBRARY (config.js) is a window: its `scene` gives the picture, its pixel size and one sprite per
// film. The windows stack under the Parapet: Down opens the next one, Up the previous one.
const pct = (v, of) => `${(v / of * 100).toFixed(4)}%`;
const HELP_MS = 3000;          // the help line, on arrival; it does not come back with the keys
const hiddenKeys = new Set();  // the films marked as lent: a window's instance does not outlive the move
const loadRappeltout = () => import('../rappeltout.js').then((m) => m.rappeltout).catch(() => null);
const loadBeuglante = () => import('../beuglante.js').then((m) => m.beuglante).catch(() => null);
const decodeOf = (im) => (im.decode ? im.decode().then(() => true, () => false) : Promise.resolve(true));
// "HBO Max", "HBO Max ou Canal+", "HBO Max, Netflix ou Canal+".
const orList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} ou ${names[names.length - 1]}`);

const SPRITES_PER_SLICE = 3;   // a sprite is one image layer to style, paint and promote
const TITLES_PER_SLICE = 3;    // a title is one line to shape

export default () => ({
  // The router shows this window at once if the camera outruns its mount: the picture is opaque, the rest comes on top.
  progressive: true,
  root: null, ctx: null, items: [], i: 0, busy: false, timers: [], ready: null, sprites: [], titles: [], subs: new Map(), subOn: null, helpTimer: 0,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.busy = false; this.subs = new Map(); this.subOn = null;
    const windows = LIBRARY.filter((c) => c.scene && Array.isArray(c.scene.sprites) && c.scene.sprites.length);
    const wanted = ctx.params && ctx.params.collection;
    this.ci = Math.max(0, windows.findIndex((c) => c.id === wanted));
    this.windows = windows;
    const coll = windows[this.ci] || LIBRARY[0];
    const { w: W, h: H, sprites } = coll.scene;
    this.items = coll.items.slice(0, sprites.length).map((it, n) => ({ ...it, sprite: sprites[n], key: `${coll.id}:${it.content}`, also: coll.alsoWith || [] }));
    this.i = this.nearest(ctx.params && ctx.params.near);
    root.dataset.window = coll.id;
    const next = windows[this.ci + 1], prev = windows[this.ci - 1];
    // The rise, as baked (sprites.js): at rest a sprite is drawn at 1 / scale, `lift` image pixels lower.
    const rise = RISE[coll.id] || { scale: 1, lift: 0 };
    // The first piece, in the caller's task (a key's, if the camera outran the mount): the opaque picture and the chosen sprite.
    root.innerHTML = `
      <div class="olv-scene" style="--rest-s:${(1 / rise.scale).toFixed(6)};--rest-y:${(rise.lift / W * 100).toFixed(4)}cqw"><img class="olv-bg" alt="" decoding="sync"></div>
      <div class="olv-captions pan-fade"></div>
      <div class="olv-help pan-fade"><div class="keyhint olv-nav"><span class="olv-hint-up"><b>▲</b>${prev ? '' : 'Parapet'}</span>${next ? '<span class="olv-hint-next"><b>▼</b></span>' : ''}</div></div>
      <div class="olv-dim"></div>`;
    this.scene = coll.scene; this.sceneEl = root.querySelector('.olv-scene'); this.captions = root.querySelector('.olv-captions');
    this.sprites = new Array(this.items.length).fill(null); this.titles = new Array(this.items.length).fill(null); this.decodes = [];
    this.nav = root.querySelector('.olv-nav');
    if (next) root.querySelector('.olv-hint-next').append(next.title);
    if (prev) root.querySelector('.olv-hint-up').append(prev.title);
    const bg = root.querySelector('.olv-bg');
    bg.addEventListener('error', () => root.classList.add('no-image'));
    bg.src = coll.scene.image;
    this.decodes.push(decodeOf(bg));
    this.sprite(this.i).classList.add('is-focus');
    // The router waits on this before it counts the window as whole: the picture and every sprite are decoded.
    let whole; this.ready = new Promise((r) => { whole = r; });
    if (ctx.config().sounds) ctx.fx.initAudio();
    // The rest, a few elements per frame (router.js). Each element made by a key that came first is simply there already.
    const gone = () => { if (this.root === root) return false; whole(); return true; };
    await ctx.slice(); if (gone()) return;
    this.title(this.i).classList.add('is-on');
    this.refreshCaption();
    for (let n = 0; n < this.items.length; n += SPRITES_PER_SLICE) {
      await ctx.slice(); if (gone()) return;
      for (let k = n; k < n + SPRITES_PER_SLICE && k < this.items.length; k++) this.sprite(k);
    }
    for (let n = 0; n < this.items.length; n += TITLES_PER_SLICE) {
      await ctx.slice(); if (gone()) return;
      for (let k = n; k < n + TITLES_PER_SLICE && k < this.items.length; k++) {
        this.title(k);
        const it = this.items[k];
        it.sub = this.subline(it);
        if (!this.subs.has(it.sub)) this.subs.set(it.sub, this.makeSub(this.captions, it.sub));
      }
    }
    await Promise.all(this.decodes);
    whole();
  },

  // A film's sprite and its title, made once, when the mount reaches them or a key needs them.
  sprite(n) {
    if (this.sprites[n]) return this.sprites[n];
    const s = this.items[n].sprite, { w: W, h: H } = this.scene;
    const im = document.createElement('img');
    im.className = 'olv-item'; im.alt = ''; im.decoding = 'sync';
    im.style.cssText = `left:${pct(s.x, W)};top:${pct(s.y, H)};width:${pct(s.w, W)};height:${pct(s.h, H)};transform-origin:${s.ox}% ${s.oy}%`;
    im.src = s.src;
    this.sceneEl.appendChild(im);
    this.sprites[n] = im;
    this.decodes.push(decodeOf(im));
    return im;
  },
  title(n) {
    if (this.titles[n]) return this.titles[n];
    const it = this.items[n], el = document.createElement('div');
    el.className = 'olv-title';
    el.textContent = `${it.title} · ${it.year}`;
    this.captions.appendChild(el);
    this.titles[n] = el;
    return el;
  },

  // Who stands next to this window on the camera's strip (router.js): the windows above and below, the Parapet over the first.
  neighbours() {
    const next = this.windows[this.ci + 1], prev = this.windows[this.ci - 1];
    return { 'pan-down': next ? { name: 'library', params: { collection: next.id } } : null, 'pan-up': prev ? { name: 'library', params: { collection: prev.id } } : { name: 'home', params: {} } };
  },
  // The film nearest to an x of the picture; the first without one.
  nearest(near) {
    let best = 0;
    if (Number.isFinite(near)) this.items.forEach((it, n) => { if (Math.abs(it.sprite.cx - near) < Math.abs(this.items[best].sprite.cx - near)) best = n; });
    return best;
  },
  // This window stood ready, off screen, and the camera is coming: the choice goes straight down or up from the one before.
  revisit(params) {
    if (Number.isFinite(params.near)) this.focus(this.nearest(params.near));
    this.refreshCaption();
  },
  // A layer at opacity 0 is not rasterised: its first use would do it on the key. Once, as the window stands in place for its
  // raster (router.js), the hidden sprites show for a few frames at an opacity that cannot be seen; their tiles then stay on the GPU.
  warm() {
    const hidden = this.sprites.filter((s) => s && !s.classList.contains('is-focus'));
    hidden.forEach((s) => { s.style.transition = 'none'; s.style.opacity = '.004'; });
    return new Promise((resolve) => {
      let n = 3;
      const step = () => {
        if (--n > 0) { requestAnimationFrame(step); return; }
        hidden.forEach((s) => { s.style.opacity = ''; });
        if (hidden[0]) void getComputedStyle(hidden[0]).opacity;   // back at 0 with the transitions off, not fading there
        hidden.forEach((s) => { s.style.transition = ''; });
        resolve();
      };
      requestAnimationFrame(step);
    });
  },

  // The camera is coming: the help line for a moment (ollivanders.css), then the picture alone.
  onEnter() { this.showHelp(); },
  // The camera leaves.
  onLeave() { clearTimeout(this.helpTimer); },

  showHelp() {
    clearTimeout(this.helpTimer);
    this.nav.classList.remove('hidden');
    this.helpTimer = setTimeout(() => { if (this.root) this.nav.classList.add('hidden'); }, HELP_MS);
  },

  // The layers are taken down and the shop's pictures let go (their decoded copies and GPU tiles are freed now, not
  // at the next garbage collection).
  unmount() {
    this.timers.forEach(clearTimeout); this.timers = []; clearTimeout(this.helpTimer);
    this.pick = null; this.pickEl = null; this.pickSig = ''; this.ready = null; this.sprites = []; this.titles = []; this.subs = new Map(); this.decodes = [];
    const r = this.root; this.root = null;
    if (r) { r.querySelectorAll('img').forEach((im) => im.removeAttribute('src')); r.textContent = ''; }
  },

  // The middle of a film's silhouette, in screen pixels (for the Lumos light and the Remembrall).
  center(n) { const s = this.items[n].sprite, c = this.windows[this.ci].scene; return { x: s.cx / c.w * this.root.clientWidth, y: s.cy / c.h * this.root.clientHeight }; },

  // The label's sub-line: the app the film opens in (one that IS on this TV), or, plainly, that none is installed.
  subline(it) {
    if (hiddenKeys.has(it.key)) return 'Ce film est prêté';
    const app = this.appFor(it);
    if (!app) return `Aucune appli installée · ${orList(this.choices(it).map((a) => a.name))}`;
    return this.choices(it).map((a) => a.name).join(' · ');
  },
  makeSub(host, text) {
    const el = document.createElement('div');
    el.className = 'olv-sub';
    el.textContent = text;
    host.appendChild(el);
    return el;
  },
  // A sub-line that does not change between two films is not touched at all.
  showSub(text) {
    const el = this.subs.get(text);
    if (el === this.subOn) return;
    if (this.subOn) this.subOn.classList.remove('is-on');
    if (el) el.classList.add('is-on');
    this.subOn = el;
  },

  // The choice moves: two classes change places, and the CSS transitions carry it from wherever things are. Nothing
  // here reads layout, nothing is typeset.
  focus(n) {
    n = Math.max(0, Math.min(this.items.length - 1, n));
    if (n === this.i) return;
    this.sprite(this.i).classList.remove('is-focus', 'is-press'); this.title(this.i).classList.remove('is-on');
    this.sprite(n).classList.add('is-focus'); this.title(n).classList.add('is-on');
    this.i = n;
    this.refreshCaption();
  },

  // The film's sub-line says what is true now (the app chosen, lent or not, what the TV has installed): a text not seen
  // yet is typeset then, which is rare.
  refreshCaption() {
    const it = this.items[this.i], sub = this.subline(it);
    it.sub = sub;
    if (!this.subs.has(sub)) this.subs.set(sub, this.makeSub(this.captions, sub));
    this.showSub(sub);
  },

  // Lumos: the box lights up, then the film opens in the app that owns it (link from the config).
  async launch(chosen) {
    if (this.busy) return;
    const it = this.items[this.i]; const app = chosen || this.appFor(it);
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
    const settle = () => { dim.classList.remove('show'); root.classList.remove('is-launch'); this.busy = false; this.settleFn = null; Input.release(); this.timers.push(setTimeout(() => { dim.textContent = ''; }, 320 * k)); };
    this.settleFn = settle;
    if (r.status === 'failed') {                      // the TV refused: the light goes out at once, the Howler says why
      this.timers.push(setTimeout(async () => {
        settle(); if (fx.cue) fx.cue('error');
        if (r.missing) this.refreshCaption();         // the TV says the app is gone: the label follows
        const b = await loadBeuglante(); if (b) b(root, { message: r.error });
      }, 200 * k));
      return;
    }
    const L = LOGOS[app.id] || monogram(app.name);
    dim.innerHTML = `<div class="olv-launch-logo app-logo lit${L.luma ? ' luma' : ''}" style="--m:url('${L.src}')"><i class="l-rimD"></i><i class="l-base"></i></div><div class="olv-launch-title"></div><div class="olv-launch-sub"></div>`;
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

  // Long OK: lend the film (the app is chosen on OK, openPick).
  async rappeltout() {
    const fn = await loadRappeltout(); if (!fn) return;
    const it = this.items[this.i]; const c = this.center(this.i);
    const options = [{ id: 'lend', label: hiddenKeys.has(it.key) ? 'Reprendre ce film' : 'Marquer comme prêté' }];
    const choice = await fn(this.root, { title: it.title, anchor: c, options });
    if (!choice || !this.root) return;
    if (choice === 'lend') { if (hiddenKeys.has(it.key)) hiddenKeys.delete(it.key); else hiddenKeys.add(it.key); this.refreshCaption(); }
  },

  // OK on a film: its apps in a row, under its title. Left and Right go along them, OK opens the film there, Back or Up closes.
  // Every app of the film is shown; one that is not on this TV stays dim and says so. The row is built once: the films
  // of a window have the same apps, so a move costs two classes.
  openPick() {
    const it = this.items[this.i], apps = this.choices(it);
    const sig = apps.map((a) => a.id).join();
    if (this.pickSig !== sig) {
      if (this.pickEl) this.pickEl.remove();
      const row = document.createElement('div');
      row.className = 'olv-pick';
      row.innerHTML = apps.map((a) => {
        const L = LOGOS[a.id] || monogram(a.name), b = logoBox(L, 2.6, 9);
        return `<div class="olv-pick-app${Platform.has(a) ? '' : ' is-absent'}" style="width:${b.w}cqw;height:${b.h}cqw"><div class="app-logo lit${L.luma ? ' luma' : ''}" style="--m:url('${L.src}')"><i class="l-rimD"></i><i class="l-base"></i></div></div>`;
      }).join('') + '<div class="olv-pick-label"></div>';
      this.captions.appendChild(row);
      this.pickEl = row; this.pickSig = sig;
      this.pickCells = [...row.querySelectorAll('.olv-pick-app')]; this.pickLabel = row.querySelector('.olv-pick-label');
    }
    const cur = this.appFor(it);
    this.pick = { it, apps, n: -1 };
    this.movePick(Math.max(0, cur ? apps.findIndex((a) => a.id === cur.id) : 0));
    requestAnimationFrame(() => { if (this.pick) { this.captions.classList.add('is-picking'); this.pickEl.classList.add('is-open'); } });
  },
  movePick(n) {
    const p = this.pick;
    if (p.n >= 0) this.pickCells[p.n].classList.remove('is-focus');
    p.n = n; this.pickCells[n].classList.add('is-focus');
    const a = p.apps[n];
    this.pickLabel.textContent = Platform.has(a) ? `Regarder sur ${a.name}` : `${a.name} n’est pas installée sur cette télé`;
  },
  closePick() {
    this.pick = null;
    this.captions.classList.remove('is-picking'); this.pickEl.classList.remove('is-open');
  },
  pickKey(action, ctx) {
    const p = this.pick, fx = ctx.fx;
    if (action === 'left' || action === 'right') {
      const n = p.n + (action === 'right' ? 1 : -1);
      if (n >= 0 && n < p.apps.length) { this.movePick(n); if (fx.cue) fx.cue('move', { dir: action === 'right' ? 1 : -1 }); }
    } else if (action === 'ok') {
      const a = p.apps[p.n];
      if (!Platform.has(a)) { if (fx.cue) fx.cue('error'); return true; }
      const lib = getConfig().library;
      if (lib.apps[p.it.key] !== a.id) updateConfig({ library: { ...lib, apps: { ...lib.apps, [p.it.key]: a.id } } });
      this.closePick();
      this.launch(a);
    } else if (action === 'back' || action === 'up' || action === 'down') {
      this.closePick(); if (fx.cue) fx.cue('return');
    }
    return true;
  },

  onKey(action, ctx) {
    if (this.pick) { if (action === 'home' || action === 'longback') this.closePick(); else return this.pickKey(action, ctx); }
    if (action === 'okdown') { if (!this.busy) this.sprites[this.i].classList.add('is-press'); return true; }
    if (this.busy) return true;
    this.sprites[this.i].classList.remove('is-press');
    if (action === 'right') { if (this.i < this.items.length - 1) { this.focus(this.i + 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: 1 }) : ctx.fx.chime(1175, 0.02); } return true; }
    if (action === 'left') { if (this.i > 0) { this.focus(this.i - 1); ctx.fx.cue ? ctx.fx.cue('move', { dir: -1 }) : ctx.fx.chime(1046, 0.02); } return true; }
    // The windows stack vertically under the Parapet: Down goes to the next one, Up to the previous one, in one move of
    // the camera (router.js), and Up from the first climbs back to the Parapet the same way.
    const near = this.items[this.i].sprite.cx;
    if (action === 'down') {
      const next = this.windows[this.ci + 1];
      if (next) { ctx.fx.cue ? ctx.fx.cue('enter') : ctx.fx.chime(880, 0.03); ctx.router.replace('library', { collection: next.id, near }, 'pan-down'); }
      return true;
    }
    if (action === 'ok') { if (this.choices(this.items[this.i]).length > 1) { this.openPick(); if (ctx.fx.cue) ctx.fx.cue('enter'); } else this.launch(); return true; }
    if (action === 'longok') { this.rappeltout(); return true; }
    if (action === 'up' && this.windows[this.ci - 1]) { ctx.fx.cue ? ctx.fx.cue('return') : ctx.fx.whoosh(); ctx.router.replace('library', { collection: this.windows[this.ci - 1].id, near }, 'pan-up'); return true; }
    if (action === 'up' || action === 'back') { if (ctx.fx.cue) ctx.fx.cue('return'); else ctx.fx.whoosh(); ctx.router.go('home', {}, 'pan-up'); return true; }
    if (action === 'home') { ctx.router.replace('home', {}, 'fade'); return true; }
    if (action === 'longback') { ctx.router.go('home', { askClassic: true }, 'pan-up'); return true; }
    if (action === 'menu') { this.rappeltout(); return true; }   // Menu = the box's Remembrall
    return false;
  },
});
