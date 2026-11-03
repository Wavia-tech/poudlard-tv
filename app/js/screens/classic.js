// Classic mode ("Monday morning"): an ordinary launcher, readable by anyone, with no owl and no scenery.
// Same configuration as Hogwarts mode (parapet, order, hidden apps): only the presentation layer changes.
//
// Grid of 6 per row, 16:9 stone tiles, rows by category: Parapet · Vidéo · Jeux · Autres · Passages,
// then a last row with "Réglages" (Settings) and "Lumos" (relight Hogwarts). A category of more than 6 apps is
// split into several visual rows (the first carries the title): `this.rows` always matches what is
// displayed, and D-pad navigation follows the screen.
// Focus = ivory frame + scale 1.06 in 150 ms, nothing else: by design.
//
// Entering from Hogwarts mode: the only long transition of this screen (900 ms). The candle goes out, smoke
// rises over the night, the grid appears underneath. None of this in reduced motion, nor at TV boot.
//
// Keys: D-pad (column memory), OK launches, long OK → Remembrall (Rappeltout), up on the first row → Settings,
// Back: nothing (no trap), long Back or "Lumos" → Hogwarts mode.

import { getConfig, updateConfig, allApps, removeCustomApp, DOCK_MAX, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { beuglante } from '../beuglante.js';
import { HOME_MODES, HOME_HINT, HOME_NOTE_MOCK, TV_SCREENS, TV_ONLY } from './settings.js';

const COLS = 6;                 // tiles per visual row (the CSS grid has the same column count)
const BANNER_MS = 1200;          // "Ouverture de X" banner in the mockup
const BRIDGE_MS = 3000;          // on the TV: time for the app to take the screen
const SMOKE_MS = 900;            // the Hogwarts → classic switch
const SMOKE_GRID_AT = 350;       // the grid appears under the smoke at this point
const PUFFS = 5;                 // smoke puffs

// Category labels, in display order. An empty category does not appear.
const CATEGORIES = [
  ['video', 'Vidéo'],
  ['jeux', 'Jeux'],
  ['autres', 'Autres'],
  ['perso', 'Perso'],          // hand-added apps (V4, config.custom)
  ['passage', 'Passages'],
];

// Glyphs of the special tiles (inline SVG, ivory strokes): a quill for Settings, a candle for Lumos,
// a screen for the TV's own settings, a door for the Home key.
const GLYPHS = {
  settings: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 8c-9 1-17 8-21 18l-3 9 9-3c10-4 17-12 18-21z"/><path d="M14 35 9 40"/><path d="M22 22l8 8"/></svg>',
  lumos: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-4 6-6 9-6 13a6 6 0 0 0 12 0c0-4-2-7-6-13z"/><path d="M18 26h12v14H18z"/><path d="M12 40h24"/></svg>',
  tv: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="10" width="36" height="24" rx="2"/><path d="M18 40h12M24 34v6"/><path d="M14 22h8M14 27h12"/></svg>',
  home: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 22L24 8l16 14"/><path d="M12 20v20h24V20"/><path d="M20 40V28h8v12"/></svg>',
};
const SPECIAL_NAMES = { settings: 'Réglages', lumos: 'Lumos', tv: 'Télé', home: 'Touche Home' };

// The Remembrall module is being written in parallel by a colleague: dynamic import, and if it is missing, ignore it.
// `dismissRappeltout` is also kept to close an open sphere when the screen unmounts.
let rappeltoutPromise = null;
let dismissRappeltout = null;
function loadRappeltout() {
  if (!rappeltoutPromise) {
    rappeltoutPromise = import('../rappeltout.js')
      .then((m) => {
        if (typeof m.dismissRappeltout === 'function') dismissRappeltout = m.dismissRappeltout;
        return typeof m.rappeltout === 'function' ? m.rappeltout : null;
      })
      .catch(() => null);
  }
  return rappeltoutPromise;
}

// Slices a list into chunks of COLS. The first chunk carries the title, the following ones are
// continuation rows (.cls-row-cont class, no title, flush against the previous one).
function sliceRows(title, items, extra = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += COLS) {
    out.push({ title, items: items.slice(i, i + COLS), cont: i > 0, ...extra });
  }
  return out;
}

export default {
  root: null, ctx: null,
  rows: [],          // VISUAL rows: [{ title, cont, tail?, items: [{ kind: 'app'|'settings'|'lumos', app?, el }], el }]
  r: 0, c: 0,        // focused row and column
  wantCol: 0,        // column memory when changing rows
  busy: false,       // banner, Remembrall, switch or smoke in progress: keys are queued (Input.hold)
  held: false,       // true while we hold the Input queue
  _off: 0,           // current scroll offset (px)
  timers: [], msg: null, installed: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = [];
    this.busy = false; this.held = false; this._off = 0; this.msg = null;
    this.installed = Platform.installed();   // Set of packages, or null (mockup: everything is installed)

    root.innerHTML = `
      <div class="cls-clock"><div class="cls-time"></div><div class="cls-date"></div></div>
      <div class="cls-scroll"><div class="cls-pool"></div><div class="cls-rows"></div></div>
      <div class="keyhint"><span><b>▲</b>Réglages</span><span><b>OK</b>Ouvrir</span><span><b>OK long</b>Options</span><span><b>Retour long</b>Poudlard</span></div>
      <div class="cls-banner"><span class="cls-banner-text"></span></div>`;

    this.tick();
    this.timers.push(setInterval(() => this.tick(), 15000));

    // Starting focus: the last launched app if it is on the grid, otherwise the first tile.
    this.build();
    const last = getConfig().lastApp;
    let found = null;
    this.rows.forEach((row, ri) => row.items.forEach((it, ci) => { if (!found && it.app && it.app.id === last) found = [ri, ci]; }));
    [this.r, this.c] = found || [0, 0];
    this.wantCol = this.c;
    this.focus(true);

    // Hogwarts → classic switch: the smoke, except at TV boot (params.boot) and in reduced motion.
    // home.js and settings.js can say so explicitly with { smoke: true }; without a parameter, any mount
    // that is not a boot is a switch.
    const p = ctx.params || {};
    const smoke = p.smoke === true || (p.smoke !== false && !p.boot);
    if (smoke && !isReduced()) this.smoke();
    else this.enter();
  },

  unmount() {
    this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    this.timers = [];
    if (this.msg) { this.msg.close(); this.msg = null; }
    if (typeof dismissRappeltout === 'function') dismissRappeltout();   // an open sphere is not left orphaned
    this.release();                                                      // never leave the input queue closed
    this.busy = false;
    this.rows = [];
  },

  // Cinzel clock + EB Garamond date.
  tick() {
    const now = new Date();
    const t = this.root.querySelector('.cls-time'), d = this.root.querySelector('.cls-date');
    if (t) t.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d) d.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  },

  // Test bench time factor (×3 slow motion).
  k() {
    const k = Number(getComputedStyle(this.root).getPropertyValue('--k'));
    return Number.isFinite(k) && k > 0 ? k : 1;
  },

  // Busy: keys are queued by input.js and replayed at the end, never lost.
  hold() { if (!this.held) { this.held = true; Input.hold(); } this.busy = true; },
  release() { this.busy = false; if (this.held) { this.held = false; Input.release(); } },

  // ---- Building the grid ----------------------------------------------------------------------------------

  // Visual rows from the shared config: Parapet (in dock order), then the categories,
  // then Settings / Lumos. Each list is sliced by COLS so that `rows` is exactly what is displayed.
  computeRows() {
    const cfg = getConfig();
    const apps = allApps().filter((a) => !a.hidden);
    const byId = Object.fromEntries(apps.map((a) => [a.id, a]));
    const rows = [];

    const dock = cfg.dock.map((id) => byId[id]).filter(Boolean);
    if (dock.length) rows.push(...sliceRows('Parapet', dock.map((app) => ({ kind: 'app', app }))));

    for (const [cat, title] of CATEGORIES) {
      const list = apps.filter((a) => a.cat === cat && !a.onDock);
      if (list.length) rows.push(...sliceRows(title, list.map((app) => ({ kind: 'app', app }))));
    }

    rows.push({ title: 'Poudlard TV', items: [{ kind: 'settings' }, { kind: 'tv' }, { kind: 'home' }, { kind: 'lumos' }], cont: false, tail: true });
    return rows;
  },

  // Renders (or re-renders) every row. Names come from the CATALOG: textContent everywhere.
  build() {
    const host = this.root.querySelector('.cls-rows');
    host.textContent = '';
    this.rows = this.computeRows();

    const hasApps = this.rows.some((row) => !row.tail);
    if (!hasApps) {
      const empty = document.createElement('div');
      empty.className = 'cls-empty';
      empty.textContent = 'Le parapet est vide. Les applis se choisissent dans les Réglages.';
      host.appendChild(empty);
    }

    for (const row of this.rows) {
      const sec = document.createElement('section');
      sec.className = 'cls-row' + (row.tail ? ' cls-row-tail' : '') + (row.cont ? ' cls-row-cont' : '');
      if (!row.cont) {
        const h = document.createElement('h2');
        h.className = 'cls-row-title';
        h.textContent = row.title;
        sec.appendChild(h);
      }
      const grid = document.createElement('div');
      grid.className = 'cls-grid';
      for (const it of row.items) {
        it.el = it.kind === 'app' ? this.tileApp(it.app) : this.tileSpecial(it.kind);
        grid.appendChild(it.el);
      }
      sec.appendChild(grid);
      row.el = sec;
      host.appendChild(sec);
    }
  },

  // App tile: 16:9 stone plate, centred ivory logo (or the initial in Cinzel if the logo is missing), name below.
  // Flat logo, a single layer: a deliberate exception of classic mode (blueprint: "focus = frame + scale, nothing else").
  tileApp(app) {
    const el = document.createElement('div');
    el.className = 'cls-tile';
    const plate = document.createElement('div');
    plate.className = 'cls-plate';
    const L = LOGOS[app.id] || monogram(app.name);      // hand-added app: its monogram
    if (L && L.src) {
      const box = document.createElement('div');
      box.className = 'cls-icon';
      // Fixed height, width = height × ratio, capped to the plate.
      const h = 3.4, w = Math.min(10.5, Math.max(2.2, h * (L.ratio || 1)));
      box.style.width = w + 'cqw';
      box.style.height = h + 'cqw';
      const logo = document.createElement('div');
      logo.className = 'app-logo ivory-logo' + (L.luma ? ' luma' : '');
      logo.style.setProperty('--m', `url("${L.src}")`);
      const base = document.createElement('i');
      base.className = 'l-base';
      logo.appendChild(base);
      box.appendChild(logo);
      plate.appendChild(box);
    } else {
      const g = document.createElement('div');
      g.className = 'cls-glyph';
      g.textContent = (app.name || '?').trim().charAt(0).toUpperCase();
      plate.appendChild(g);
    }
    // On the TV, the app's own banner (Platform.appIcon, a data URI) sits behind the overlay; the mock-up keeps monograms.
    if (app.pkg && Platform.isTV()) {
      const uri = Platform.appIcon(app.pkg);
      if (uri) { const img = document.createElement('img'); img.className = 'cls-banner-img'; img.decoding = 'async'; img.alt = ''; img.src = uri; plate.prepend(img); el.classList.add('has-banner'); }
    }
    if (app.id === getConfig().lastApp) { const last = document.createElement('span'); last.className = 'cls-last brass'; last.textContent = 'Dernière'; plate.appendChild(last); }
    const name = document.createElement('div');
    name.className = 'cls-name';
    name.textContent = app.name;
    el.append(plate, name);
    if (!this.isInstalled(app)) el.classList.add('is-absent');
    return el;
  },

  // The house candle pool slides under the focused tile (transform only, 150 ms), and the rows dim when idle.
  movePool(instant) {
    const pool = this.root.querySelector('.cls-pool'); const it = this.current();
    if (!pool || !it || !it.el) { if (pool) pool.classList.remove('is-on'); return; }
    const host = this.root.querySelector('.cls-rows');
    const x = it.el.offsetLeft + it.el.parentElement.offsetLeft + it.el.offsetWidth / 2, y = it.el.parentElement.parentElement.offsetTop + it.el.offsetTop + it.el.offsetHeight * 0.3 - (this._off || 0);
    if (instant) pool.style.transition = 'none';
    pool.style.transform = `translate(${x - pool.offsetWidth / 2}px, ${y - pool.offsetHeight / 2}px)`;
    if (instant) { void pool.offsetWidth; pool.style.transition = ''; }
    pool.classList.add('is-on');
    void host;
  },
  dim() { if (this.root) this.root.classList.add('is-dim'); },
  // Everything released (main.js error boundary, hand-over to another app): the banner withdraws, keys are free.
  settle() { const b = this.root && this.root.querySelector('.cls-banner'); if (b) b.classList.remove('is-in'); this.release(); },
  undim() { if (!this.root || !this.root.classList.contains('is-dim')) return false; this.root.classList.remove('is-dim'); return true; },

  // "Réglages" and "Lumos" tiles: constant SVG glyph (no data), name in EB Garamond.
  tileSpecial(kind) {
    const el = document.createElement('div');
    el.className = 'cls-tile cls-tile-' + kind;
    const plate = document.createElement('div');
    plate.className = 'cls-plate';
    const g = document.createElement('div');
    g.className = 'cls-svg';
    g.innerHTML = GLYPHS[kind] || '';     // module constant, never data
    plate.appendChild(g);
    const name = document.createElement('div');
    name.className = 'cls-name';
    name.textContent = SPECIAL_NAMES[kind] || kind;
    el.append(plate, name);
    return el;
  },

  // Short message in the banner (outside launches): what the TV answered, or "TV only" in the mockup.
  say(text) {
    const banner = this.root.querySelector('.cls-banner'); if (!banner) return;
    banner.querySelector('.cls-banner-text').textContent = text;
    banner.classList.add('is-in');
    clearTimeout(this.sayTimer);
    this.sayTimer = setTimeout(() => { if (!this.busy && banner.isConnected) banner.classList.remove('is-in'); }, 2600 * this.k());
    this.timers.push(this.sayTimer);
  },

  // The "Télé" tile: the TV's own screens in a Remembrall (same eleven lines as the Room of Requirement).
  async tvMenu(it) {
    const rappeltout = await loadRappeltout();
    if (!rappeltout || this.busy) return;
    const choice = await this.ask(rappeltout, it, 'Réglages de la télé', TV_SCREENS.map(([id, label]) => ({ id, label })));
    if (!choice) return;
    const r = Platform.openSystem(choice);
    if (r.status === 'simulated') this.say(TV_ONLY);
    else if (r.status === 'failed') this.say(r.error);
  },

  // The "Touche Home" tile: who answers the Home key (Platform.setHome, hints from settings.js).
  async homeMenu(it) {
    const rappeltout = await loadRappeltout();
    if (!rappeltout || this.busy) return;
    const mode = Platform.homeMode();
    if (mode === 'simulated') { this.say(HOME_NOTE_MOCK); return; }
    const choice = await this.ask(rappeltout, it, 'Touche Home', HOME_MODES.map(([id, label]) => ({ id, label: (mode === id ? '● ' : '') + label })));
    if (!choice) return;
    const r = Platform.setHome(choice);
    if (r.status === 'failed') { this.msg = beuglante(this.root, { message: r.error }); return; }
    this.say(choice === 'original' ? 'La touche Home revient à l’accueil d’origine.' : (HOME_HINT[r.hint] || HOME_HINT['press-home']));
  },

  // A Remembrall anchored on a tile; `busy` while it is open (it takes the keys itself).
  async ask(rappeltout, it, title, options) {
    const rr = this.root.getBoundingClientRect(), tr = it.el.getBoundingClientRect();
    const anchor = { x: tr.left - rr.left + tr.width / 2, y: tr.top - rr.top + tr.height / 2 };
    this.busy = true;
    let choice = null;
    try { choice = await rappeltout(this.root, { title, options, anchor }); } catch (e) { choice = null; }
    if (!this.root || !this.root.isConnected) return null;
    this.busy = false;
    return choice;
  },

  // An app is "installed" unless the TV says otherwise. Passages (HDMI) are not packages.
  isInstalled(app) {
    if (!this.installed || !app.pkg) return true;
    return this.installed.has(app.pkg);
  },

  // Grid entrance: rows settle with a light fade, staggered by 40 ms. Nothing in reduced motion.
  enter() {
    if (isReduced()) return;
    const k = this.k();
    this.rows.forEach((row, i) => {
      if (!row.el || !row.el.animate) return;
      row.el.animate(
        [{ opacity: 0, transform: 'translateY(1.2cqw)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 360 * k, delay: 40 * k * i, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' },
      );
    });
  },

  // The switch (900 ms): a night layer covers the grid, a candle ember at the bottom goes out,
  // ivory puffs rise (radial-gradient ellipses, no blur: the softness is in the gradient),
  // the layer dissipates and the grid appears underneath at 350 ms. Transform and opacity only, in WAAPI.
  smoke() {
    const k = this.k();
    const layer = document.createElement('div');
    layer.className = 'cls-smoke';
    const ember = document.createElement('i');
    ember.className = 'cls-ember';
    layer.appendChild(ember);
    const puffs = [];
    for (let i = 0; i < PUFFS; i++) {
      const p = document.createElement('i');
      p.className = 'cls-puff';
      // Fixed spread around the bottom centre (no randomness: the switch is the same every time).
      const spread = (i - (PUFFS - 1) / 2) * 7;                   // in cqw, from −14 to +14
      p.style.left = `calc(50% + ${spread}cqw)`;
      p.style.width = (16 + (i % 2) * 6) + 'cqw';
      p.style.height = (9 + (i % 3) * 2) + 'cqw';
      layer.appendChild(p);
      puffs.push(p);
    }
    this.root.appendChild(layer);

    if (!layer.animate) { layer.remove(); this.enter(); return; }   // no WAAPI: no cinema

    this.hold();
    const rows = this.root.querySelector('.cls-rows');
    if (rows) rows.style.opacity = '0';                              // the grid waits under the smoke

    // The ember: the candle goes out in 300 ms.
    ember.animate([{ opacity: .9, transform: 'translate(-50%, 0) scale(1)' }, { opacity: 0, transform: 'translate(-50%, .6cqw) scale(.7)' }],
      { duration: 300 * k, easing: 'ease-in', fill: 'forwards' });

    // The puffs: rise + expansion, opacity 0 → .1 → 0, staggered by 80 ms.
    puffs.forEach((p, i) => {
      p.animate(
        [
          { opacity: 0, transform: 'translate(-50%, 0) scale(1)' },
          { opacity: .1, transform: 'translate(-50%, -7cqw) scale(1.25)', offset: .35 },
          { opacity: 0, transform: 'translate(-50%, -18cqw) scale(1.6)' },
        ],
        { duration: SMOKE_MS * k, delay: 80 * k * i, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'both' },
      );
    });

    // The night layer dissipates from the moment the grid appears.
    layer.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: SMOKE_GRID_AT / SMOKE_MS }, { opacity: 0 }],
      { duration: SMOKE_MS * k, easing: 'ease-out', fill: 'forwards' });

    this.timers.push(setTimeout(() => {
      if (rows) rows.style.opacity = '';
      this.enter();
    }, SMOKE_GRID_AT * k));
    this.timers.push(setTimeout(() => {
      layer.remove();
      this.release();
    }, (SMOKE_MS + 80 * (PUFFS - 1)) * k));
  },

  // ---- Focus and scrolling --------------------------------------------------------------------------------

  current() {
    const row = this.rows[this.r];
    return row ? row.items[this.c] : null;
  },

  // Puts the ivory frame on the current tile and scrolls the row into the window (transform only).
  // The focused row stays above the window's bottom fade (2.4 cqw, see classic.css).
  focus(instant) {
    this.rows.forEach((row, ri) => row.items.forEach((it, ci) => it.el.classList.toggle('is-focus', ri === this.r && ci === this.c)));
    const scroll = this.root.querySelector('.cls-scroll');
    const host = this.root.querySelector('.cls-rows');
    const row = this.rows[this.r];
    if (!scroll || !host || !row || !row.el) return;
    const viewH = scroll.clientHeight;
    const top = row.el.offsetTop, bottom = top + row.el.offsetHeight;
    const pad = Math.round(scroll.clientWidth * 0.006);    // margin for the 1.06 scale
    const fade = Math.round(scroll.clientWidth * 0.024);   // height of the bottom fade (.cls-scroll::after)
    const maxOff = Math.max(0, host.offsetHeight - viewH);
    let off = this._off || 0;
    if (top - pad < off) off = Math.max(0, top - pad);
    else if (bottom + pad + fade > off + viewH) off = bottom + pad + fade - viewH;
    if (this.r === 0) off = 0;
    off = Math.min(Math.max(0, off), maxOff);
    this._off = off;
    if (instant) host.style.transition = 'none';
    host.style.transform = `translateY(${-off}px)`;
    if (instant) { void host.offsetWidth; host.style.transition = ''; }
    this.movePool(instant);
  },

  move(dr, dc) {
    const row = this.rows[this.r];
    if (!row) return false;
    if (dc) {
      const nc = this.c + dc;
      if (nc < 0 || nc >= row.items.length) return false;   // stop: nothing, no wrap-around
      this.c = nc; this.wantCol = nc;
      this.focus(false);
      return true;
    }
    const nr = this.r + dr;
    if (nr < 0 || nr >= this.rows.length) return false;
    this.r = nr;
    this.c = Math.min(this.wantCol, this.rows[nr].items.length - 1);
    this.focus(false);
    return true;
  },

  // ---- Actions ------------------------------------------------------------------------------------------

  // OK on an app: if the TV says it is no longer installed, a Howler (Beuglante); otherwise Platform.launch.
  // During the banner, keys are queued (Input.hold) and replayed afterwards.
  launch(app) {
    if (!app) return;
    if (!this.isInstalled(app)) { this.complain(app); return; }
    this.hold();
    updateConfig({ lastApp: app.id });
    const r = Platform.launch(app);
    // The TV refused (app gone, source not connected, no path): Howler with its own sentence, no banner, keys back at once.
    if (r.status === 'failed') {
      this.release();
      const action = r.missing && app.pkg ? { label: getConfig().dock.includes(app.id) ? 'Retirer du parapet' : 'Masquer', onChoose: () => (getConfig().dock.includes(app.id) ? this.undock(app) : this.hide(app)) } : undefined;
      this.msg = beuglante(this.root, { message: r.error, action });
      return;
    }
    const banner = this.root.querySelector('.cls-banner');
    banner.querySelector('.cls-banner-text').textContent = app.input ? `Passage vers ${app.name}` : `Ouverture de ${app.name}`;
    banner.classList.add('is-in');
    // On the TV, the app takes the screen; in the mockup, the banner withdraws on its own after 1.2 s.
    const k = this.k();
    this.timers.push(setTimeout(() => { banner.classList.remove('is-in'); this.release(); }, (r.status === 'bridge' ? BRIDGE_MS : BANNER_MS) * k));
  },

  // Howler "X n'est plus installé." (X is no longer installed) with at most one action: unpin from the parapet (or hide if it is not on it).
  complain(app) {
    const onDock = getConfig().dock.includes(app.id);
    this.msg = beuglante(this.root, {
      message: `${app.name} n'est plus installé.`,
      action: {
        label: onDock ? 'Retirer du parapet' : 'Masquer',
        onChoose: () => { if (onDock) this.undock(app); else this.hide(app); },
      },
    });
  },

  undock(app) { updateConfig({ dock: getConfig().dock.filter((id) => id !== app.id) }); this.rebuild(); },
  hide(app) {
    const cfg = getConfig();
    updateConfig({ dock: cfg.dock.filter((id) => id !== app.id), hidden: [...cfg.hidden, app.id] });
    this.rebuild();
  },
  pin(app) {
    const cfg = getConfig();
    if (cfg.dock.length >= DOCK_MAX) {
      this.msg = beuglante(this.root, { message: 'Le parapet est plein, la Carte garde le reste.' });
      return;
    }
    updateConfig({ dock: [...cfg.dock, app.id] });
    this.rebuild();
  },

  // After a config change: rebuild and keep the focus as close as possible.
  rebuild() {
    const { r, c } = this;
    this.build();
    this.r = Math.min(r, this.rows.length - 1);
    this.c = Math.min(c, this.rows[this.r].items.length - 1);
    this.wantCol = this.c;
    this.focus(true);
  },

  // Long OK: the app's Remembrall (unpin from parapet / pin · hide). If the module is missing, ignore it.
  // The Remembrall takes the keys itself: no queue here, just `busy`.
  async options(app) {
    const rappeltout = await loadRappeltout();
    if (!rappeltout || this.busy) return;
    const it = this.current();
    if (!it || it.app !== app) return;
    const onDock = getConfig().dock.includes(app.id);
    const options = [
      onDock ? { id: 'undock', label: 'Retirer du parapet' } : { id: 'pin', label: 'Épingler au parapet', disabled: getConfig().dock.length >= DOCK_MAX },
      { id: 'hide', label: 'Masquer' },
    ];
    if (app.custom) options.push({ id: 'remove', label: 'Supprimer cette appli' });   // a hand-added app can leave again
    if (app.pkg && Platform.isTV()) options.push({ id: 'appinfo', label: 'Infos de l’appli' });   // the TV's own page: uninstall, force stop
    const choice = await this.ask(rappeltout, it, app.name, options);
    if (choice === 'undock') this.undock(app);
    else if (choice === 'pin') this.pin(app);
    else if (choice === 'hide') this.hide(app);
    else if (choice === 'remove' && app.custom) { removeCustomApp(app.id); this.rebuild(); }
    else if (choice === 'appinfo') { const r = Platform.openSystem('appinfo', app.pkg); if (r.status === 'failed') this.say(r.error); }
  },

  // Relight Hogwarts: the preference is persisted, then the home screen replays the Lumos boot.
  toPoudlard() {
    if (this.busy) return;
    this.busy = true;
    updateConfig({ mode: 'poudlard' });
    this.ctx.router.replace('home', { boot: true }, 'fade');
  },

  onKey(action, ctx) {
    const it = this.current();
    if (action === 'okdown') { if (!this.busy && it && it.el) it.el.classList.add('is-press'); return true; }
    if (this.busy) return true;     // (during a banner or the smoke, input.js already queues the key)
    if (it && it.el) it.el.classList.remove('is-press');
    if (this.undim()) return true;  // idle dim: the first key only wakes the grid, the focus does not move
    switch (action) {
      case 'left': this.move(0, -1); return true;
      case 'right': this.move(0, 1); return true;
      case 'down': this.move(1, 0); return true;
      case 'up':
        if (this.r === 0) { ctx.router.go('settings', {}, 'iris'); return true; }
        this.move(-1, 0); return true;
      case 'ok':
        if (!it) return true;
        if (it.kind === 'settings') ctx.router.go('settings', {}, 'iris');
        else if (it.kind === 'lumos') this.toPoudlard();
        else if (it.kind === 'tv') this.tvMenu(it);
        else if (it.kind === 'home') this.homeMenu(it);
        else this.launch(it.app);
        return true;
      case 'longok':
        if (it && it.kind === 'app') this.options(it.app);
        return true;
      case 'menu': if (it && it.kind === 'app') this.options(it.app); else ctx.router.go('settings', {}, 'iris'); return true;   // Menu = the tile's Remembrall
      case 'longback': this.toPoudlard(); return true;
      case 'back': return true;     // nothing: no trap
      default: return false;
    }
  },
};
