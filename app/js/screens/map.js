// The Marauder's Map (Carte du Maraudeur): every app on a parchment that unfolds, the Passages (consoles, HDMI inputs),
// and the "Réglages" (Settings) candle. This is where you pin, unpin, hide, show and move what sits on the parapet,
// and where you add an app of your own (V4): a last "Ajouter une appli" piece opens a spell to write.
//
// Grammar: arrows in the grid (column memory per row) · OK launches (ink version of Lumos) ·
// long OK or Menu: the app's Remembrall (Rappeltout) · Back, down from the last row, up from the first: "Fait et bien fait" (the closing line)
// then back to the Parapet. Every change goes through updateConfig / addCustomApp / removeCustomApp (config.js): nothing else writes.
//
// Opening choreography: the screen first slides into place (router `down` transition, 700 ms); ONLY THEN is the `is-in`
// class set on the section, the parchment unfolds, the formula writes itself, the ink appears, then the footprints
// walk (650 ms later). Without `is-in`, map.css keeps everything folded and invisible.
//
// Added apps (config.custom): category 'perso', logo = monogram(app.name) when LOGOS[app.id] is missing. They come
// in the grid after the catalog, before the Passages, followed by the dotted "Ajouter une appli" frame.
// Their Remembrall also offers "Supprimer cette appli" (delete this app).
//
// The spell to write (.map-spell): a D-pad keyboard drawn in ink (letters, digits, space, Erase, "C'est fait" / Done),
// the name is written with a quill in IM Fell above it, letter by letter (left-to-right mask), 20 characters at most.
// Back erases the last letter; Back on an empty field cancels. On the real TV, if Platform.installed() returns a list,
// those apps are offered first (Remembrall sphere); in the mockup the list is null, so the name is typed.
//
// Accepted parameters (optional): ctx.params.app  = id of the app in focus on the parapet (initial focus);
//                                 ctx.params.from = { x, y } screen fractions (0..1) the footprints start from.

import { allApps, appById, getConfig, updateConfig, addCustomApp, removeCustomApp, namePassage, isReduced, DOCK_MAX } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { rappeltout, dismissRappeltout } from '../rappeltout.js';
import { beuglante } from '../beuglante.js';
import { TV_SCREENS, TV_ONLY } from './settings.js';

const PAGE = 8;              // installed apps offered per Remembrall page ("Suivants ›" turns the page)
const NOT_CONNECTED = 'Cette source n’est pas raccordée.';

const COLS = 5;              // grid columns
const ROWS_VISIBLE = 3;      // visible rows per page (further pages downwards)
const STEPS = 6;             // footprints per walk
const STEP_GAP = 40;         // ms between two footprints
const REVEAL_GAP = 40;       // ms between two frames at opening
const ENTER_MS = 700;        // duration of the router's screen transition (TRANSITION_MS, not exported): we wait for arrival
const WALK_AFTER_MS = 650;   // the walk starts once the parchment is unfolded and the ink laid down
const INTENT_MS = 350;       // the intent fires at 350 ms (Lumos blueprint); until then, Back cancels
const FRAME_W = 14, FRAME_H = 7;   // frame of the piece in cqw (map.css: 14 × 7, at the top of the 14 × 10 piece)
const CUSTOM_MAX = 12;       // hand-added apps, at most (sanitize() trims to the same number)
const NAME_MAX = 20;         // characters of a quill-written name (NAME_RE in config.js)
const SEAL_MS = 520;         // the seal presses, then the spell closes and the app appears
const TOAST_MS = 2200;       // duration of an informative brass plate
// Same shape as an Android package accepted by sanitize() (PKG_RE in config.js): never offer a package
// the config would silently drop (the app would then be created without a path).
const PKG_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
// Original copy: the parchment's opening and closing lines are ours, not the books' (DISCLAIMER.md).
const FORMULA = 'Je jure que je ne veux que regarder la télé';
const MISCHIEF = 'Fait et bien fait';
const KEYHINT_BROWSE = '<span><b>◀ ▶ ▲ ▼</b>Parcourir</span><span><b>OK</b>Ouvrir</span><span><b>OK long</b>Rappeltout</span><span><b>Retour</b>Parapet</span>';
const KEYHINT_MOVE = '<span><b>◀ ▶</b>Déplacer</span><span><b>OK</b>Poser</span><span><b>Retour</b>Annuler</span>';
const KEYHINT_SPELL = '<span><b>◀ ▶ ▲ ▼</b>Lettre</span><span><b>OK</b>Écrire</span><span><b>Retour</b>Effacer · Annuler</span>';

// The spell keyboard: four rows of ten keys, then three wide keys. Labels are constants.
// A key = a character (`ch`) or an action (`id`: space, erase, done). `w`: width in cqw of the wide keys.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z', '+', '-', '.', '&'],
  [{ id: 'space', label: 'Espace', w: 17 }, { id: 'erase', label: 'Effacer', w: 17 }, { id: 'done', label: 'C’est fait', w: 25.6 }],
];

// Quill-drawn frame: a slightly wobbly rectangle, a double rule, four corner strokes.
const FRAME_SVG = `<svg class="map-frame" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
  <path class="map-frame-outer" d="M8 6 C60 3.5 140 8.5 192 6 C194.5 40 193 80 192 114 C140 116.5 60 111.5 8 114 C5.5 80 7 40 8 6 Z"/>
  <path class="map-frame-inner" d="M13 11 C60 9 140 13 187 11 C189 40 188 80 187 109 C140 111 60 107 13 109 C11 80 12 40 13 11 Z"/>
  <path class="map-frame-corners" d="M3 2 l6 6 M197 2 l-6 6 M3 118 l6 -6 M197 118 l-6 -6"/>
</svg>`;
// Quill stroke underlining the name (normalised pathLength: dasharray 100).
const UNDERLINE_SVG = `<svg class="map-underline" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
  <path pathLength="100" d="M2 3.4 C 22 1.2, 48 5.2, 70 2.6 S 92 3.8, 98 2.8"/></svg>`;
// The "Réglages" (Settings) candle: candle, drips, drip pan, flame (lit when focused).
const CANDLE_SVG = `<svg class="map-candle" viewBox="0 0 60 80" aria-hidden="true">
  <path class="map-candle-flame" d="M30 12 C23.5 21 23 29 30 34 C37 29 36.5 21 30 12 Z"/>
  <path class="map-candle-wick" d="M30 34 v4"/>
  <path class="map-candle-body" d="M22 38 h16 v30 h-16 Z M22 44 c-2.5 3 -1 8 1.5 10 M38 50 c2.2 2 2.2 6 .5 8"/>
  <path class="map-candle-dish" d="M12 68 h36 l-5 7 h-26 Z"/>
</svg>`;
// The quill of the "Ajouter une appli" (add an app) frame: a feather, its barbs, the nib and a drop of ink.
const QUILL_SVG = `<svg class="map-quill" viewBox="0 0 60 80" aria-hidden="true">
  <path class="map-quill-feather" d="M49 5 C35 9 23 23 18 43 C16 51 15 57 14 63 C23 59 33 49 39 37 C44 27 48 15 49 5 Z"/>
  <path class="map-quill-barbs" d="M45 13 C37 19 31 29 25 43 M41 23 L31 27 M37 33 L27 37 M33 43 L24 48"/>
  <path class="map-quill-nib" d="M14 63 L10 73 M12 68 L16 67"/>
  <path class="map-quill-ink" d="M5 76 c3 -1.2 6 -.2 9 1.2"/>
</svg>`;
// An inked footprint (symbol reused through <use>): toes at the top, pointing upwards.
const DEFS_SVG = `<svg class="map-defs" width="0" height="0" aria-hidden="true"><defs>
  <symbol id="map-foot" viewBox="0 0 20 32">
    <path d="M3.5 14 C3.5 11 6 8.5 10 8.5 S16.5 11 16.5 14 C16.5 17 14.5 18.5 14.5 21 C14.5 23 15 24 15 26 C15 29 13 31 10 31 S5 29 5 26 C5 24 5.5 23 5.5 21 C5.5 18.5 3.5 17 3.5 14 Z"/>
    <circle cx="4" cy="7.2" r="1.5"/><circle cx="6.8" cy="4.6" r="1.8"/><circle cx="10.2" cy="3.4" r="2.1"/><circle cx="13.8" cy="4.4" r="1.8"/><circle cx="16.6" cy="6.8" r="1.4"/>
  </symbol>
</defs></svg>`;

// Readable name derived from an Android package (real launcher): last segment, no punctuation, capitalised initial,
// 20 characters at most. Only produces characters accepted by sanitize() (NAME_RE), otherwise "Appli".
function pkgLabel(pkg) {
  const seg = String(pkg || '').split('.').pop() || '';
  const clean = seg.replace(/_/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, NAME_MAX).trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Appli';
}

// A name is "taken" if it is already on the Map, case-insensitively (catalog and added apps).
function nameTaken(name) {
  const n = String(name).trim().toLowerCase();
  return allApps().some((a) => String(a.name).toLowerCase() === n);
}

// Free name from a suggested label: "App", then "App 2", "App 3"... (always ≤ 20 characters).
function freeName(label) {
  if (!nameTaken(label)) return label;
  for (let n = 2; n < 100; n++) {
    const suffix = ` ${n}`;
    const candidate = label.slice(0, NAME_MAX - suffix.length).trim() + suffix;
    if (!nameTaken(candidate)) return candidate;
  }
  return null;
}

export default {
  root: null, ctx: null, rows: [], r: 0, c: 0, mem: [], top: 0,
  timers: [], busy: false, leaving: false, reduced: false, menuOpen: false, arrived: false,
  move: null,            // Move mode: { id, order:[ids], items:{ id: element } } or null
  spell: null,           // spell to write: { name, r, c, cm, rows:[[{ id?, ch?, el }]], busy } or null
  stepsBatch: null,      // footprints of the last walk (removed on the next one)
  launching: null,       // launch in progress: { app, sent, intentTimer, endTimer, held } or null
  toastTimer: 0,         // informative brass plate (outside launches)

  // ---------------------------------------------------------------- mount
  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = [];
    this.busy = false; this.leaving = false; this.menuOpen = false; this.arrived = false;
    this.move = null; this.spell = null; this.mem = []; this.top = 0; this.stepsBatch = null; this.launching = null; this.toastTimer = 0;
    this.reduced = isReduced();
    root.classList.toggle('is-reduced', this.reduced);

    root.innerHTML = `
      ${DEFS_SVG}
      <canvas class="map-sky" width="960" height="540"></canvas>
      <div class="map-vignette"></div>
      <div class="map-shadow"></div>
      <div class="map-sheet parchment">
        <div class="map-paper"></div>
        <div class="map-folds"></div>
        <div class="map-formula"></div>
        <div class="map-empty"></div>
        <div class="map-grid"><div class="map-rows"></div></div>
        <div class="map-more up">⌃</div><div class="map-more down">⌄</div>
        <div class="map-parapet"><div class="map-parapet-title">Le parapet</div><div class="map-parapet-row"></div></div>
        <div class="map-spell">
          <div class="map-spell-title"></div>
          <div class="map-spell-field"><div class="map-spell-name"></div><div class="map-spell-line"></div><div class="map-spell-count"></div></div>
          <div class="map-spell-keys"></div>
          <div class="map-spell-msg"></div>
          <div class="wax-seal map-spell-seal"></div>
        </div>
        <div class="map-candlelight"></div>
      </div>
      <div class="map-steps"></div>
      <div class="map-toast brass"></div>
      <div class="keyhint">${KEYHINT_BROWSE}</div>`;

    this.drawSky();
    root.querySelector('.map-formula').textContent = FORMULA;
    root.querySelector('.map-spell-title').textContent = 'Quelle appli ajouter ?';

    // Grid.
    this.rows = this.buildRows();
    this.renderRows();

    // Initial focus: the parapet app we came from, else the last launched one, else the first.
    const wanted = (ctx.params && typeof ctx.params.app === 'string') ? ctx.params.app : getConfig().lastApp;
    const pos = this.findCell((cell) => cell.kind === 'app' && cell.app.id === wanted) || { r: 0, c: 0 };
    this.setFocus(pos.r, pos.c, { walkFrom: null, instant: true });

    // The footprints start from where we were on the parapet (screen fractions), the dock by default.
    const from = (ctx.params && ctx.params.from && Number.isFinite(ctx.params.from.x) && Number.isFinite(ctx.params.from.y))
      ? ctx.params.from : { x: 0.5, y: 0.78 };
    const W = root.clientWidth || 1;
    const start = { x: from.x * 100, y: from.y * (root.clientHeight || W * 9 / 16) / W * 100 };

    // The staging waits for the screen to be in place: end of the router transition (transform), or a fallback timer.
    const arrive = () => {
      if (this.arrived || this.root !== root) return;
      this.arrived = true;
      root.classList.add('is-in');
      if (!this.reduced) this.after(WALK_AFTER_MS, () => this.walk(start, this.focusCenter()));
    };
    root.addEventListener('transitionend', (e) => { if (e.target === root && e.propertyName === 'transform') arrive(); });
    this.after(ENTER_MS + 40, arrive);

    if (ctx.config().sounds) ctx.fx.initAudio();
    ctx.fx.whoosh();
  },

  unmount() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.launching && this.launching.held) Input.release();   // never leave an orphaned input queue
    this.launching = null;
    dismissRappeltout();
    this.rows = [];
    this.stepsBatch = null;
    this.move = null;
    this.spell = null;
    this.root = null;
  },

  // Timer that honours the test bench slow-motion (--k) and is cancelled on unmount.
  k() { return Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1; },
  after(ms, fn) { const t = setTimeout(() => { if (this.root) fn(); }, ms * this.k()); this.timers.push(t); return t; },

  // Fallback sky behind the parchment: the Night and a few stars, drawn once (no loop).
  drawSky() {
    const cv = this.root.querySelector('.map-sky');
    const g = cv.getContext('2d'); if (!g) return;
    g.fillStyle = '#070B14'; g.fillRect(0, 0, cv.width, cv.height);
    for (let n = 0; n < 110; n++) {
      const x = Math.random() * cv.width, y = Math.random() * cv.height * 0.9, s = 0.4 + Math.random() * 1.3;
      g.globalAlpha = 0.25 + Math.random() * 0.6;
      g.fillStyle = Math.random() < 0.2 ? '#C9D9EA' : '#F1EBDD';
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  },

  // ---------------------------------------------------------------- data
  // Grid rows: the catalog apps (hidden ones included, in pale ink), then the hand-added apps,
  // then the "Ajouter une appli" frame, then "Les Passages", then the Settings candle as the last piece.
  // Catalog apps that are not installed (real launcher) are not drawn; hand-added apps always stay visible
  // (their package may have been uninstalled: they must remain deletable from here), in faded ink like
  // "hidden" (is-absent class, map.css); launching one ends in a gentle Howler (Beuglante).
  buildRows() {
    const inst = Platform.installed();
    const all = allApps().filter((a) => a.custom || !inst || !a.pkg || inst.has(a.pkg));
    const catalog = all.filter((a) => a.cat !== 'passage' && !a.custom).map((a) => ({ kind: 'app', app: a }));
    const custom = all.filter((a) => a.custom).map((a) => ({ kind: 'app', app: a }));
    const apps = [...catalog, ...custom, { kind: 'add' }];
    if (Platform.isTV()) apps.push({ kind: 'store' });                    // the TV's store, to install what the Map lacks
    const passages = this.passages(all).map((a) => ({ kind: 'app', app: a }));
    const rows = [];
    for (let i = 0; i < apps.length; i += COLS) rows.push({ title: null, cells: apps.slice(i, i + COLS) });
    const candle = { kind: 'candle' };
    if (passages.length) {
      passages.push(candle);
      for (let i = 0; i < passages.length; i += COLS) rows.push({ title: i === 0 ? 'Les Passages' : null, cells: passages.slice(i, i + COLS) });
    } else if (rows.length && rows[rows.length - 1].cells.length < COLS) {
      rows[rows.length - 1].cells.push(candle);
    } else {
      rows.push({ title: null, cells: [candle] });
    }
    return rows;
  },

  // The Passages: on the TV, its real HDMI ports (CEC name when a device is connected, the name given in the
  // Remembrall first), plus the tuner as "Télé" when the TV has one; in the mock-up, the four catalog consoles.
  passages(all) {
    const ports = Platform.inputs();
    if (!ports) return all.filter((a) => a.cat === 'passage');
    const cfg = getConfig();
    const list = ports.map((p) => {
      const id = `in${p.port}`;
      const named = cfg.passages[id];
      return { id, name: named ? named.name : p.label, cat: 'passage', input: p.id, port: p.port, connected: p.connected,
        onDock: cfg.dock.includes(id), hidden: cfg.hidden.includes(id) };
    });
    if (Platform.hasLiveTv()) list.push({ id: 'tv', name: 'Télé', cat: 'passage', live: true, connected: true, onDock: false, hidden: false });
    return list;
  },

  findCell(pred) {
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r].cells.findIndex(pred);
      if (c >= 0) return { r, c };
    }
    return null;
  },
  cellAt(r, c) { const row = this.rows[r]; return row ? row.cells[c] || null : null; },
  focusedCell() { return this.cellAt(this.r, this.c); },

  // ---------------------------------------------------------------- rendering
  // `quiet`: rebuild after an add or a delete, the screen already being in place: existing frames need not
  // reveal themselves again (is-quiet class), only the `fresh` frame (app id) appears in ink.
  renderRows({ quiet = false, fresh = null } = {}) {
    const host = this.root.querySelector('.map-rows');
    host.textContent = '';
    let index = 0;
    const total = this.rows.reduce((n, row) => n + row.cells.length, 0);
    this.rows.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'map-row' + (row.title ? ' has-title' : '');
      if (row.title) {
        const t = document.createElement('div');
        t.className = 'map-row-title';
        t.textContent = row.title;
        rowEl.appendChild(t);
      }
      row.cells.forEach((cell, c) => {
        const el = cell.kind === 'candle' ? this.renderCandle() : cell.kind === 'add' ? this.renderAdd() : cell.kind === 'store' ? this.renderStore() : this.renderApp(cell.app);
        el.dataset.r = r; el.dataset.c = c;
        const isFresh = Boolean(fresh && cell.kind === 'app' && cell.app.id === fresh);
        if (quiet && !isFresh) el.classList.add('is-quiet');
        if (isFresh) el.classList.add('is-fresh');                                       // appears without the opening delay
        el.style.setProperty('--d', isFresh ? '0ms' : `${index * REVEAL_GAP}ms`);            // cascading reveal
        el.style.setProperty('--dr', `${(total - 1 - index) * (150 / Math.max(1, total - 1))}ms`);   // reverse fade-out, 350 ms in all
        cell.el = el;
        rowEl.appendChild(el);
        index++;
      });
      row.el = rowEl;
      host.appendChild(rowEl);
    });
    const empty = this.root.querySelector('.map-empty');
    empty.textContent = this.rows.some((row) => row.cells.some((cell) => cell.kind === 'app')) ? '' : 'Le parapet est vide';
    this.refreshStates();
  },

  renderApp(app) {
    const el = document.createElement('div');
    el.className = 'map-cell map-app' + (app.custom ? ' is-custom' : '');
    const L = LOGOS[app.id] || monogram(app.name);                     // added app: its monogram
    el.innerHTML = `${FRAME_SVG}<div class="map-ink-logo"></div><div class="map-name"></div><div class="map-sub"></div>${UNDERLINE_SVG}<div class="wax-seal map-seal"></div><div class="map-tag"></div>`;
    const logo = el.querySelector('.map-ink-logo');
    if (L && L.src) {
      logo.style.setProperty('--m', `url("${L.src}")`);
      if (L.luma) logo.classList.add('luma');
      logo.style.width = Math.min(10, Math.max(1, 3.4 * (L.ratio || 1))).toFixed(2) + 'cqw';
    } else {                                                             // no logo: the initial in quill
      logo.classList.add('no-mask');
      logo.textContent = (app.name || '?').charAt(0);
    }
    el.querySelector('.map-name').textContent = app.name;
    el.querySelector('.map-sub').textContent = app.live ? 'Antenne' : app.port ? `HDMI ${app.port}` : app.input ? app.input : app.custom ? 'Perso' : '';
    el.querySelector('.map-tag').textContent = 'caché';
    // Added app whose package is no longer on the TV: drawn anyway (so it can be deleted), in faded ink.
    const inst = Platform.installed();
    if (app.custom && inst && app.pkg && !inst.has(app.pkg)) el.classList.add('is-absent');
    if (app.connected === false) el.classList.add('is-pale');            // HDMI port with nothing plugged in
    return el;
  },

  // "Boutique" (TV only): the store, to install an app the Map does not have yet. Same dotted frame as "Ajouter".
  renderStore() {
    const el = document.createElement('div');
    el.className = 'map-cell map-add-cell map-store-cell';
    el.innerHTML = `${FRAME_SVG}<div class="map-ink-logo no-mask"></div><div class="map-name"></div>${UNDERLINE_SVG}`;
    el.querySelector('.map-ink-logo').textContent = '✦';
    el.querySelector('.map-name').textContent = 'Boutique';
    return el;
  },

  renderCandle() {
    const el = document.createElement('div');
    el.className = 'map-cell map-candle-cell';
    el.innerHTML = `${FRAME_SVG}<div class="map-candle-halo"></div>${CANDLE_SVG}<div class="map-name"></div>${UNDERLINE_SVG}`;
    el.querySelector('.map-name').textContent = 'Réglages';
    return el;
  },

  // "Ajouter une appli": the same frame, but dotted (map.css), with a quill in place of the logo.
  renderAdd() {
    const el = document.createElement('div');
    el.className = 'map-cell map-add-cell';
    el.innerHTML = `${FRAME_SVG}${QUILL_SVG}<div class="map-name"></div>${UNDERLINE_SVG}`;
    el.querySelector('.map-name').textContent = 'Ajouter une appli';
    return el;
  },

  // Wax seal (on the parapet) and faded ink (hidden), re-read from the config after every change.
  refreshStates(pressedId) {
    const state = Object.fromEntries(allApps().map((a) => [a.id, a]));
    this.rows.forEach((row) => row.cells.forEach((cell) => {
      if (cell.kind !== 'app' || !cell.el) return;
      const s = state[cell.app.id] || {};
      cell.el.classList.toggle('on-dock', Boolean(s.onDock));
      cell.el.classList.toggle('is-hidden', Boolean(s.hidden));
      if (pressedId === cell.app.id) {                                    // the seal presses once
        const seal = cell.el.querySelector('.map-seal');
        seal.classList.remove('is-pressed'); void seal.offsetWidth; seal.classList.add('is-pressed');
      }
    }));
  },

  // Rebuilds the grid (app added or deleted) without replaying the opening, and restores the focus:
  // on the `fresh` app if given, otherwise as close as possible to the previous position.
  rebuildRows(fresh) {
    const { r, c } = this;
    this.rows = this.buildRows();
    this.mem = [];
    this.top = Math.min(this.top, Math.max(0, this.rows.length - ROWS_VISIBLE));
    this.renderRows({ quiet: true, fresh });
    const pos = (fresh && this.findCell((cell) => cell.kind === 'app' && cell.app.id === fresh))
      || { r: Math.min(r, this.rows.length - 1), c: 0 };
    if (!fresh) pos.c = Math.min(c, this.rows[pos.r].cells.length - 1);
    this.setFocus(pos.r, pos.c, { walkFrom: null, instant: true });
  },

  // Informative brass plate (outside launches: during Lumos, launch() owns the plate).
  say(text, ms = TOAST_MS) {
    const toast = this.root.querySelector('.map-toast');
    if (this.busy || !toast) return;
    clearTimeout(this.toastTimer);
    toast.textContent = text;
    toast.classList.add('is-on');
    this.toastTimer = this.after(ms, () => { if (!this.busy) toast.classList.remove('is-on'); });
  },

  // ---------------------------------------------------------------- focus and pages
  setFocus(r, c, { walkFrom = undefined, instant = false } = {}) {
    const from = walkFrom === undefined ? this.focusCenter() : walkFrom;
    this.rows.forEach((row) => row.cells.forEach((cell) => cell.el && cell.el.classList.remove('is-focus')));
    this.r = r; this.c = c; this.mem[r] = c;
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.add('is-focus');
    this.scrollTo(r, instant);
    if (!instant && from) this.walk(from, this.focusCenter());
  },

  // 3-row window: the focused row stays visible, rows slide vertically (translate in cqw).
  scrollTo(r, instant) {
    if (r < this.top) this.top = r;
    if (r > this.top + ROWS_VISIBLE - 1) this.top = r - ROWS_VISIBLE + 1;
    const rowsEl = this.root.querySelector('.map-rows');
    const row = this.rows[this.top];
    const W = this.root.clientWidth || 1;
    const y = row && row.el ? row.el.offsetTop / W * 100 : 0;
    if (instant) rowsEl.style.transition = 'none';
    rowsEl.style.transform = `translateY(${(-y).toFixed(3)}cqw)`;
    if (instant) { void rowsEl.offsetWidth; rowsEl.style.transition = ''; }
    this.root.querySelector('.map-more.up').classList.toggle('is-on', this.top > 0);
    this.root.querySelector('.map-more.down').classList.toggle('is-on', this.top + ROWS_VISIBLE < this.rows.length);
  },

  // Centre of the FRAME of the focused piece, in cqw (screen coordinates), once the page slide is complete.
  // The frame is an <svg> (no offsetLeft/offsetTop on an SVGElement): it occupies the top of the piece, 14 × 7 cqw,
  // i.e. the piece's width and half its height; it is derived from the piece's HTML offsets.
  focusCenter() {
    const cell = this.focusedCell();
    if (!cell || !cell.el || !this.root) return null;
    const W = this.root.clientWidth || 1;
    const rowsEl = this.root.querySelector('.map-rows');
    const grid = this.root.querySelector('.map-grid');
    const sheet = this.root.querySelector('.map-sheet');
    // Position computed from offsets (independent of the transition in progress on .map-rows).
    const topRow = this.rows[this.top];
    const shift = topRow && topRow.el ? topRow.el.offsetTop : 0;
    const fw = cell.el.offsetWidth, fh = fw * (FRAME_H / FRAME_W);
    const x = sheet.offsetLeft + grid.offsetLeft + rowsEl.offsetLeft + cell.el.parentElement.offsetLeft + cell.el.offsetLeft + fw / 2;
    const y = sheet.offsetTop + grid.offsetTop + rowsEl.offsetTop - shift + cell.el.parentElement.offsetTop + cell.el.offsetTop + fh / 2;
    return { x: x / W * 100, y: y / W * 100 };
  },

  // Same point in pixels (for Fx.lumos and the Remembrall anchor).
  focusCenterPx() {
    const p = this.focusCenter(); if (!p) return { x: 0, y: 0 };
    const W = this.root.clientWidth || 1;
    return { x: p.x * W / 100, y: p.y * W / 100 };
  },

  // ---------------------------------------------------------------- the footprints
  // Six inked footprints, alternating left foot / right foot, walking from `from` to the EDGE of the target frame (cqw),
  // 40 ms between two steps, then fading out. A new walk erases the previous one. Nothing in reduced motion.
  walk(from, to) {
    if (!this.root || this.reduced || !from || !to) return;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
    const layer = this.root.querySelector('.map-steps');
    if (this.stepsBatch) { this.stepsBatch.forEach((s) => s.remove()); this.stepsBatch = null; }
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;                                   // a step in place is not drawn
    const ux = dx / dist, uy = dy / dist;                   // walking direction
    const px = -uy, py = ux;                                // perpendicular (gap between the two feet)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;  // the foot points upwards in its drawing
    // Distance from the frame centre to its edge in the arrival direction: steps stop just before the rule.
    const edge = Math.min(FRAME_W / 2 / Math.max(1e-3, Math.abs(ux)), FRAME_H / 2 / Math.max(1e-3, Math.abs(uy)));
    const end = Math.max(0, dist - edge - 0.6);
    if (end < 1) return;                                    // already at the foot of the piece
    const batch = [];
    for (let i = 0; i < STEPS; i++) {
      const t = end * (i + 1) / STEPS;
      const side = i % 2 === 0 ? -1 : 1;
      const x = from.x + ux * t + px * side * 0.55, y = from.y + uy * t + py * side * 0.55;
      const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      s.setAttribute('class', 'map-step');
      s.setAttribute('viewBox', '0 0 20 32');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#map-foot');
      s.appendChild(use);
      s.style.left = x.toFixed(2) + 'cqw';
      s.style.top = y.toFixed(2) + 'cqw';
      s.style.setProperty('--t', `rotate(${angle.toFixed(1)}deg) scaleX(${side})`);
      s.style.setProperty('--d', `${i * STEP_GAP}ms`);
      layer.appendChild(s);
      batch.push(s);
    }
    this.stepsBatch = batch;
    this.after(2000 + STEPS * STEP_GAP, () => { batch.forEach((s) => s.remove()); if (this.stepsBatch === batch) this.stepsBatch = null; });
  },

  // Stop: the piece bumps against the edge (small recoil), the map does not wrap around.
  // The WAAPI animation replaces the CSS transform value, so the focus scale(1.04) is kept in every keyframe.
  nudge(dir, el) {
    const cell = this.focusedCell();
    const target = el || (cell && cell.el);
    if (!target || this.reduced) return;
    const d = { left: 'translateX(-.35cqw)', right: 'translateX(.35cqw)', up: 'translateY(-.35cqw)', down: 'translateY(.35cqw)' }[dir] || 'translateX(.3cqw)';
    const base = el ? 'scale(1.08)' : 'scale(1.04)';
    target.animate([{ transform: base }, { transform: `${base} ${d}` }, { transform: base }],
      { duration: 160 * this.k(), easing: 'ease-out' });
  },

  // ---------------------------------------------------------------- actions
  // OK on an app: ink version of Lumos (the piece lights up by candle), a single chime chord,
  // the brass plate at 300 ms, the intent at 350 ms. Until the intent, Back cancels (the light recedes);
  // afterwards, keys are queued (Input.hold) and replayed at the end, never lost.
  launch() {
    const cell = this.focusedCell();
    if (!cell || this.busy) return;
    if (cell.kind === 'candle') { this.ctx.fx.chime(988, 0.04); this.ctx.router.go('settings', {}, 'iris'); return; }
    if (cell.kind === 'add') { this.openSpell(); return; }
    if (cell.kind === 'store') { this.openStore(); return; }
    const app = cell.app;
    if (app.connected === false) { this.nudge('down'); this.ctx.fx.chime(440, 0.03); this.say(NOT_CONNECTED); return; }
    const fx = this.ctx.fx;
    this.busy = true;
    clearTimeout(this.toastTimer);
    const p = this.focusCenterPx();
    const W = this.root.clientWidth || 1;
    const light = this.root.querySelector('.map-candlelight');
    const sheet = this.root.querySelector('.map-sheet');
    const toast = this.root.querySelector('.map-toast');
    toast.classList.remove('is-on');
    light.style.left = ((p.x - sheet.offsetLeft) / W * 100).toFixed(2) + 'cqw';
    light.style.top = ((p.y - sheet.offsetTop) / W * 100).toFixed(2) + 'cqw';
    light.classList.add('is-on');
    fx.lumos(this.root, p.x, p.y, 900);
    fx.chime(1046, 0.04); fx.chime(1318, 0.03); fx.chime(1568, 0.025);     // a chord, not an arpeggio
    toast.textContent = app.live ? 'Passage vers la Télé' : app.input ? `Passage vers ${app.port ? `HDMI ${app.port}` : app.input}` : `Ouverture de ${app.name}`;

    const L = { app, sent: false, held: false, intentTimer: 0, endTimer: 0 };
    this.launching = L;
    const settle = () => {                                   // the light recedes, the screen takes back control
      toast.classList.remove('is-on'); light.classList.remove('is-on');
      if (L.held) { L.held = false; Input.release(); }
      if (this.launching === L) this.launching = null;
      this.busy = false;
    };
    L.settle = settle;
    this.after(300, () => { if (this.launching === L) toast.classList.add('is-on'); });
    L.intentTimer = this.after(INTENT_MS, () => {
      if (this.launching !== L) return;
      L.sent = true;
      if (app.id !== 'tv') updateConfig({ lastApp: app.id });
      const r = Platform.launch(app);
      if (r.status === 'failed') {                           // the TV did not take over: its sentence in a Howler, no plate
        settle();
        const action = r.missing && app.pkg && getConfig().dock.includes(app.id) ? { label: 'Retirer du parapet', onChoose: () => this.apply('unpin', app.id) } : undefined;
        beuglante(this.root, { message: r.error, action });
        return;
      }
      L.held = true; Input.hold();                           // once the intent is sent, keys wait and will be replayed
      L.endTimer = this.after((r.status === 'bridge' ? 4000 : 2200) - INTENT_MS, settle);
    });
  },

  // Everything released (main.js error boundary, hand-over to another app): the light recedes, keys are free.
  settle() { if (this.launching && this.launching.settle) this.launching.settle(); },

  // Back during the 350 ms window: the intent has not fired, everything is switched off.
  cancelLaunch() {
    const L = this.launching;
    if (!L || L.sent) return false;
    clearTimeout(L.intentTimer);
    L.settle();
    this.ctx.fx.chime(659, 0.02);
    return true;
  },

  // Long OK or Menu: the Remembrall sphere of the focused app, placed under the piece.
  async contextMenu() {
    const cell = this.focusedCell();
    if (!cell || this.busy || this.menuOpen) return;
    if (cell.kind === 'candle') { this.tvMenu(); return; }                 // long OK on the candle: the TV's own screens
    if (cell.kind !== 'app' || cell.app.live) return;
    const cfg = getConfig();
    const id = cell.app.id;
    const onDock = cfg.dock.includes(id), hidden = cfg.hidden.includes(id), full = cfg.dock.length >= DOCK_MAX;
    const options = [];
    if (onDock) {
      options.push({ id: 'unpin', label: 'Retirer du parapet' });
      if (cfg.dock.length > 1) options.push({ id: 'move', label: 'Déplacer' });
      options.push({ id: 'hide', label: 'Masquer' });
    } else {
      options.push(full ? { id: 'pin', label: 'Le parapet est plein, la Carte garde le reste', disabled: true } : { id: 'pin', label: 'Épingler au parapet' });
      options.push(hidden ? { id: 'show', label: 'Afficher' } : { id: 'hide', label: 'Masquer' });
    }
    if (cell.app.custom) options.push({ id: 'remove', label: 'Supprimer cette appli' });   // an added app can leave again
    if (cell.app.cat === 'passage') options.push({ id: 'rename', label: 'Renommer' });    // an HDMI port takes the name of what is behind it
    if (cell.app.pkg && Platform.isTV()) options.push({ id: 'appinfo', label: 'Infos de l’appli' });   // the TV's page: uninstall, force stop
    const choice = await this.ask(cell.app.name, options);
    if (!choice) return;
    this.apply(choice, id);
  },

  // A Remembrall under the focused piece. Anchor: the bottom edge of the frame (3.5 cqw below its centre) plus a
  // breath; `edge: 'below'` places the TOP of the sphere there.
  async ask(title, options) {
    const p = this.focusCenterPx();
    const W = this.root.clientWidth || 1;
    this.menuOpen = true;
    this.ctx.fx.chime(1319, 0.03);
    const choice = await rappeltout(this.root, { title, options, anchor: { x: p.x, y: p.y + W * (FRAME_H / 2 + 0.4) / 100, edge: 'below' } });
    this.menuOpen = false;
    return this.root ? choice : null;
  },

  // The TV's own screens (same eleven lines as the Room of Requirement), from the candle.
  async tvMenu() {
    const choice = await this.ask('Réglages de la télé', TV_SCREENS.map(([id, label]) => ({ id, label })));
    if (!choice) return;
    const r = Platform.openSystem(choice);
    if (r.status === 'simulated') this.say(TV_ONLY);
    else if (r.status === 'failed') this.say(r.error);
  },

  // The TV's store (Play Store, or Amazon's): the Map cannot install, the store can.
  openStore() {
    const r = Platform.store();
    if (r.status === 'failed') { beuglante(this.root, { message: r.error }); return; }
    if (r.status === 'simulated') this.say(TV_ONLY);
    else this.ctx.fx.chime(1319, 0.03);
  },

  // Applies a Remembrall choice. Everything goes through updateConfig: sanitize() guarantees dock ≤ DOCK_MAX and dock ∩ hidden = ∅.
  apply(choice, id) {
    const cfg = getConfig();
    const without = (list) => list.filter((x) => x !== id);
    if (choice === 'pin' && cfg.dock.length < DOCK_MAX) {
      updateConfig({ dock: [...without(cfg.dock), id], hidden: without(cfg.hidden) });
      this.refreshStates(id);
      this.ctx.fx.chime(1568, 0.04);
    } else if (choice === 'unpin') {
      updateConfig({ dock: without(cfg.dock) });
      this.refreshStates();
      this.ctx.fx.chime(784, 0.03);
    } else if (choice === 'hide') {
      updateConfig({ dock: without(cfg.dock), hidden: [...without(cfg.hidden), id] });
      this.refreshStates();
      this.ctx.fx.chime(659, 0.03);
    } else if (choice === 'show') {
      updateConfig({ hidden: without(cfg.hidden) });
      this.refreshStates();
      this.ctx.fx.chime(1175, 0.03);
    } else if (choice === 'move') {
      this.enterMove(id);
    } else if (choice === 'rename') {
      // The name is written with the quill, then kept in config.passages (sanitize: in<n> keys, plain names).
      const app = this.focusedCell() && this.focusedCell().app;
      if (!app || !this.arrived) return;
      this.openKeyboard({ title: `Renommer ${app.name}`, onDone: (name) => { namePassage(id, name); this.rebuildRows(id); this.refreshStates(id); this.say(`${name} : c’est noté`); this.ctx.fx.chime(1568, 0.04); } });
    } else if (choice === 'appinfo') {
      const app = appById(id) || (this.focusedCell() && this.focusedCell().app);
      const r = Platform.openSystem('appinfo', app && app.pkg);
      if (r.status === 'failed') this.say(r.error);
    } else if (choice === 'remove') {
      // The added app leaves the Map, the parapet and the hidden list (removeCustomApp); the grid tightens up.
      const app = appById(id);
      if (!app || !app.custom) return;
      removeCustomApp(id);
      this.rebuildRows(null);
      this.ctx.fx.whoosh();
      this.say(`${app.name} quitte la Carte`);
    }
  },

  // ---------------------------------------------------------------- the spell to write (add an app)
  // OK on "Ajouter une appli". On the real TV, if the list of installed apps is known, it is offered first
  // (Remembrall sphere: up to eight still-unknown packages, then "Écrire le nom à la plume" / write the name); otherwise, the keyboard.
  openSpell() {
    if (this.spell || this.busy || this.menuOpen || this.move) return;
    if (!this.arrived) return;                           // the parchment is not unfolded yet: the quill waits
    if (getConfig().custom.length >= CUSTOM_MAX) { this.say('La Carte garde douze formules au plus.'); this.ctx.fx.chime(440, 0.03); return; }
    const apps = Platform.apps();
    if (apps && apps.length) { this.chooseInstalled(apps, 0); return; }
    this.openKeyboard();
  },

  // The TV's own list, with the labels it gives its apps, eight per page; "Suivants ›" turns the page.
  async chooseInstalled(apps, from) {
    const known = new Set(allApps().map((a) => a.pkg).filter(Boolean));
    // Only well-formed packages (those sanitize() will keep) still unknown to the Map are offered.
    const candidates = apps.filter((a) => PKG_RE.test(a.pkg) && !known.has(a.pkg));
    const page = candidates.slice(from, from + PAGE);
    const options = page.map((a) => ({ id: `pkg:${a.pkg}`, label: a.label || pkgLabel(a.pkg) }));
    if (from + PAGE < candidates.length) options.push({ id: 'more', label: 'Suivants ›' });
    options.push({ id: 'write', label: 'Écrire le nom à la plume' });
    const choice = await this.ask('Applis installées', options);
    if (!choice) return;
    if (choice === 'write') { this.openKeyboard(); return; }
    if (choice === 'more') { this.chooseInstalled(apps, from + PAGE); return; }
    const pkg = choice.slice(4);
    const chosen = page.find((a) => a.pkg === pkg);
    // Same guard as "C'est fait": never two frames with the same name; suffix ("App 2") rather than refuse.
    // The TV's label is kept when sanitize() accepts it (NAME_RE), otherwise the package's readable tail.
    const raw = chosen && chosen.label && /^[\p{L}\p{N} .+'&-]{1,20}$/u.test(chosen.label) ? chosen.label : pkgLabel(pkg);
    const name = freeName(raw);
    if (!name) { this.say('La Carte a déjà ce nom trop de fois.'); this.ctx.fx.chime(440, 0.03); return; }
    this.commitApp(name, pkg);
  },

  // The keyboard is drawn once per opening; the grid fades behind it (is-spell class on the section).
  // `opts.onDone(name)`: what to do with the written name (default: add an app); `opts.title`: the question asked.
  openKeyboard(opts = {}) {
    const panel = this.root.querySelector('.map-spell');
    const keys = this.root.querySelector('.map-spell-keys');
    keys.textContent = '';
    this.root.querySelector('.map-spell-name').textContent = '';
    this.root.querySelector('.map-spell-msg').textContent = '';
    this.root.querySelector('.map-spell-title').textContent = opts.title || 'Quelle appli ajouter ?';
    const rows = [];
    let index = 0;
    KEY_ROWS.forEach((keyRow) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'map-key-row';
      const row = [];
      keyRow.forEach((k) => {
        const el = document.createElement('div');
        const key = typeof k === 'string' ? { ch: k, el } : { id: k.id, el };
        el.className = 'map-key' + (typeof k === 'string' ? '' : ' is-wide is-' + k.id);
        el.textContent = typeof k === 'string' ? k : k.label;
        if (typeof k !== 'string') el.style.width = k.w + 'cqw';
        el.style.setProperty('--d', `${index * 18}ms`);                             // cascading appearance
        el.style.setProperty('--rot', `${(((index * 7) % 5) - 2) * 0.35}deg`);      // hand wobble, fixed per key
        rowEl.appendChild(el);
        row.push(key);
        index++;
      });
      keys.appendChild(rowEl);
      rows.push(row);
    });
    this.spell = { name: '', r: 1, c: 0, cm: 0, rows, busy: false, onDone: typeof opts.onDone === 'function' ? opts.onDone : null };
    // One focus at a time (contract): the "Ajouter" frame hands its class over to the keyboard; closeSpell() gives it back.
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.remove('is-focus');
    this.root.classList.add('is-spell');
    panel.classList.add('is-open', 'is-dealing');                                   // the keys are dealt, once only
    this.after(index * 18 + 300, () => panel.classList.remove('is-dealing'));
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_SPELL;
    this.paintSpell();
    this.spellFocus(1, 0);
    this.ctx.fx.chime(1319, 0.03); this.ctx.fx.chime(1568, 0.02);
  },

  closeSpell() {
    const panel = this.root.querySelector('.map-spell');
    this.spell = null;
    this.root.classList.remove('is-spell');
    panel.classList.remove('is-open', 'is-dealing');
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_BROWSE;
    // Focus returns to the grid frame (no walk, no slide: nothing has moved).
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.add('is-focus');
  },

  cancelSpell() {
    this.ctx.fx.chime(659, 0.02);
    this.closeSpell();
  },

  spellFocus(r, c) {
    const s = this.spell;
    s.r = Math.min(Math.max(0, r), s.rows.length - 1);
    s.c = Math.min(Math.max(0, c), s.rows[s.r].length - 1);
    s.rows.forEach((row, i) => row.forEach((k, j) => k.el.classList.toggle('is-focus', i === s.r && j === s.c)));
  },

  // Counter and state of "C'est fait" (pale as long as nothing is written).
  paintSpell() {
    const s = this.spell; if (!s) return;
    this.root.querySelector('.map-spell-count').textContent = `${s.name.length} / ${NAME_MAX}`;
    const done = s.rows[s.rows.length - 1].find((k) => k.id === 'done');
    if (done) done.el.classList.toggle('is-off', !s.name.trim());
  },

  // One more letter: a <span> per character, revealed by a left-to-right mask (map.css).
  typeChar(ch) {
    const s = this.spell;
    const key = s.rows[s.r][s.c];
    if (s.name.length >= NAME_MAX) { this.nudge('right', key.el); this.ctx.fx.chime(440, 0.02); this.sayCount(); return; }
    if (ch === ' ' && (!s.name || s.name.endsWith(' '))) { this.nudge('right', key.el); this.ctx.fx.chime(440, 0.02); return; }
    s.name += ch;
    const span = document.createElement('span');
    span.textContent = ch === ' ' ? ' ' : ch;
    this.root.querySelector('.map-spell-name').appendChild(span);
    this.root.querySelector('.map-spell-msg').textContent = '';
    this.paintSpell();
    this.ctx.fx.chime(ch === ' ' ? 988 : 1175 + (ch.charCodeAt(0) % 7) * 45, 0.025);
  },
  sayCount() {
    const m = this.root.querySelector('.map-spell-msg');
    m.textContent = 'Vingt caractères au plus : la plume s’arrête là.';
  },

  eraseChar() {
    const s = this.spell;
    if (!s.name) return false;
    s.name = s.name.slice(0, -1);
    const name = this.root.querySelector('.map-spell-name');
    if (name.lastElementChild) name.lastElementChild.remove();
    this.root.querySelector('.map-spell-msg').textContent = '';
    this.paintSpell();
    this.ctx.fx.chime(784, 0.02);
    return true;
  },

  // "C'est fait": the name is checked (not empty, not already on the Map), the seal presses, then the app is added.
  confirmSpell() {
    const s = this.spell;
    const name = s.name.trim();
    const done = s.rows[s.rows.length - 1].find((k) => k.id === 'done');
    if (!name) { this.nudge('right', done && done.el); this.ctx.fx.chime(440, 0.03); return; }
    if (!s.onDone && nameTaken(name)) {
      this.root.querySelector('.map-spell-msg').textContent = 'Cette appli est déjà sur la Carte.';
      this.nudge('right', done && done.el); this.ctx.fx.chime(440, 0.03);
      return;
    }
    s.busy = true;
    const onDone = s.onDone;
    const seal = this.root.querySelector('.map-spell-seal');
    seal.classList.remove('is-pressed'); void seal.offsetWidth; seal.classList.add('is-pressed');
    this.ctx.fx.chime(1046, 0.04); this.ctx.fx.chime(1318, 0.03); this.ctx.fx.chime(1568, 0.025);
    this.after(this.reduced ? 200 : SEAL_MS, () => {
      if (!this.spell) return;
      this.closeSpell();
      seal.classList.remove('is-pressed');
      if (onDone) onDone(name); else this.commitApp(name);
    });
  },

  // addCustomApp (config.js) places the app on the parapet if there is room left; the grid rebuilds, the new
  // frame appears in ink with its monogram, its seal presses, the focus lands on it and the plate says where it went.
  commitApp(name, pkg) {
    const id = addCustomApp(name, pkg);
    const app = appById(id);                            // no onDock field (only allApps() sets it): read the config
    if (!app) { this.say('La plume a tremblé : rien n’a été ajouté.'); this.ctx.fx.chime(440, 0.03); return; }
    this.rebuildRows(id);
    this.refreshStates(id);
    const onDock = getConfig().dock.includes(id);
    this.say(onDock ? 'Ajoutée au parapet' : 'Ajoutée à la Carte (parapet plein)');
    this.ctx.fx.chime(1568, 0.04);
    return { id, onDock };
  },

  // Keys during the spell: arrows on the keyboard (column memory, rows of different lengths scaled),
  // OK writes, Back erases then cancels, Menu / long Back cancel, Home cancels AND returns to the Parapet.
  spellKey(action) {
    const s = this.spell;
    if (s.busy) return true;
    if (action === 'left' || action === 'right') {
      const nc = s.c + (action === 'left' ? -1 : 1);
      if (nc < 0 || nc >= s.rows[s.r].length) { this.nudge(action, s.rows[s.r][s.c].el); this.ctx.fx.chime(440, 0.02); return true; }
      s.cm = nc;
      this.spellFocus(s.r, nc);
      this.ctx.fx.chime(action === 'left' ? 1046 : 1175, 0.02);
      return true;
    }
    if (action === 'up' || action === 'down') {
      const nr = s.r + (action === 'up' ? -1 : 1);
      if (nr < 0 || nr >= s.rows.length) { this.nudge(action, s.rows[s.r][s.c].el); this.ctx.fx.chime(440, 0.02); return true; }
      const from = s.rows[s.r].length, to = s.rows[nr].length;
      const c = from === to ? s.cm : Math.round(s.cm / Math.max(1, from - 1) * (to - 1));
      this.spellFocus(nr, c);
      if (from === to) s.cm = s.c;
      this.ctx.fx.chime(action === 'up' ? 1319 : 988, 0.02);
      return true;
    }
    if (action === 'ok' || action === 'longok') {
      const key = s.rows[s.r][s.c];
      if (key.ch) this.typeChar(key.ch);
      else if (key.id === 'space') this.typeChar(' ');
      else if (key.id === 'erase') { if (!this.eraseChar()) { this.nudge('left', key.el); this.ctx.fx.chime(440, 0.02); } }
      else if (key.id === 'done') this.confirmSpell();
      return true;
    }
    if (action === 'back') { if (!this.eraseChar()) this.cancelSpell(); return true; }
    if (action === 'home') { this.cancelSpell(); this.leave(); return true; }   // Home always goes back to the home screen
    if (action === 'longback' || action === 'menu') { this.cancelSpell(); return true; }
    return true;
  },

  // ---------------------------------------------------------------- Move mode
  // The parapet is drawn in miniature at the bottom of the map; left/right swaps the app with its neighbour (both
  // slide, FLIP 300 ms), OK sets it down (updateConfig({ dock })), Back cancels without writing anything.
  enterMove(id) {
    const order = [...getConfig().dock];
    if (!order.includes(id)) return;
    this.move = { id, order, items: {} };
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.add('is-moving');
    this.root.classList.add('is-move');
    this.renderParapet();
    this.root.querySelector('.map-parapet').classList.add('is-open');
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_MOVE;
  },

  // Draws the row once; elements are then reordered (never rebuilt) so the slide can be seen.
  renderParapet() {
    const row = this.root.querySelector('.map-parapet-row');
    row.textContent = '';
    const byId = Object.fromEntries(allApps().map((a) => [a.id, a]));
    this.move.order.forEach((id) => {
      const app = byId[id]; if (!app) return;
      const L = LOGOS[id] || monogram(app.name);
      const it = document.createElement('div');
      it.className = 'map-parapet-item' + (id === this.move.id ? ' is-lift' : '');
      const logo = document.createElement('div');
      logo.className = 'map-ink-logo small' + (L && L.luma ? ' luma' : '') + (L ? '' : ' no-mask');
      if (L) { logo.style.setProperty('--m', `url("${L.src}")`); logo.style.width = Math.min(6, Math.max(1, 2.2 * (L.ratio || 1))).toFixed(2) + 'cqw'; }
      else logo.textContent = (app.name || '?').charAt(0);
      const name = document.createElement('div');
      name.className = 'map-parapet-name';
      name.textContent = app.name;
      it.appendChild(logo); it.appendChild(name);
      this.move.items[id] = it;
      row.appendChild(it);
    });
  },

  // FLIP: record each miniature's position, reorder the DOM to match `order`, then each moved miniature
  // starts from its old position (translateX) and slides to the new one in 300 ms.
  reflowParapet() {
    const m = this.move;
    const row = this.root.querySelector('.map-parapet-row');
    const before = {};
    m.order.forEach((id) => { const it = m.items[id]; if (it) before[id] = it.offsetLeft; });
    m.order.forEach((id) => { const it = m.items[id]; if (it) row.appendChild(it); });   // appendChild moves: the DOM order follows `order`
    if (this.reduced) return;
    const k = this.k();
    m.order.forEach((id) => {
      const it = m.items[id]; if (!it || before[id] === undefined) return;
      const dx = before[id] - it.offsetLeft;
      if (Math.abs(dx) < 1) return;
      const lift = id === m.id ? ' translateY(-.7cqw)' : '';          // the held app keeps its lift during the slide
      it.animate([{ transform: `translateX(${dx}px)${lift}` }, { transform: `translateX(0)${lift}` }],
        { duration: 300 * k, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  },

  moveKey(action) {
    const m = this.move;
    const i = m.order.indexOf(m.id);
    if (action === 'left' || action === 'right') {
      const j = action === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= m.order.length) { this.ctx.fx.chime(440, 0.02); return true; }
      [m.order[i], m.order[j]] = [m.order[j], m.order[i]];
      this.reflowParapet();
      this.ctx.fx.chime(action === 'left' ? 1046 : 1175, 0.03);
      return true;
    }
    if (action === 'ok' || action === 'longok') { updateConfig({ dock: [...m.order] }); this.refreshStates(m.id); this.ctx.fx.chime(1568, 0.04); this.exitMove(); return true; }
    if (action === 'back' || action === 'menu' || action === 'longback' || action === 'home') { this.ctx.fx.chime(659, 0.02); this.exitMove(); return true; }
    return true;                                            // up/down: nothing while holding an app
  },

  exitMove() {
    this.move = null;
    this.rows.forEach((row) => row.cells.forEach((cell) => cell.el && cell.el.classList.remove('is-moving')));
    this.root.classList.remove('is-move');
    this.root.querySelector('.map-parapet').classList.remove('is-open');
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_BROWSE;
  },

  // ---------------------------------------------------------------- leaving
  // "Fait et bien fait": the formula rewrites itself, the ink fades in reverse order (350 ms),
  // the parchment folds up, and the Parapet comes back up (`up` transition).
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    dismissRappeltout();
    if (this.spell) this.closeSpell();
    if (this.stepsBatch) { this.stepsBatch.forEach((s) => s.remove()); this.stepsBatch = null; }
    this.ctx.fx.whoosh();
    // Reduced motion, or Back before the screen is even in place (nothing unfolded yet): leave without staging.
    if (this.reduced || !this.arrived) { this.ctx.router.go('home', {}, 'up'); return; }
    const root = this.root;
    const formula = root.querySelector('.map-formula');
    root.classList.add('is-leaving');                       // class first: the rewrite picks up the exit pace
    formula.textContent = MISCHIEF;
    formula.style.animation = 'none'; void formula.offsetWidth; formula.style.animation = '';
    this.after(420, () => this.ctx.router.go('home', {}, 'up'));
  },

  // ---------------------------------------------------------------- keys
  onKey(action, ctx) {
    if (action === 'okdown') { const c = this.focusedCell(); if (c && c.el && !this.busy && !this.spell && !this.move) c.el.classList.add('is-press'); return true; }
    { const c = this.focusedCell(); if (c && c.el) c.el.classList.remove('is-press'); }
    if (this.leaving || this.menuOpen) return true;
    if (this.busy) {                                         // during Lumos: Back cancels as long as the intent has not fired
      if (action === 'back' || action === 'longback') this.cancelLaunch();
      return true;
    }
    if (this.spell) return this.spellKey(action);
    if (this.move) return this.moveKey(action);

    const row = this.rows[this.r];
    if (!row) { if (action === 'back') this.leave(); return true; }

    if (action === 'left' || action === 'right') {
      const nc = this.c + (action === 'left' ? -1 : 1);
      if (nc < 0 || nc >= row.cells.length) { this.nudge(action); ctx.fx.chime(440, 0.02); return true; }
      this.setFocus(this.r, nc);
      ctx.fx.chime(action === 'left' ? 1046 : 1175, 0.03);
      return true;
    }
    if (action === 'up' || action === 'down') {
      const nr = this.r + (action === 'up' ? -1 : 1);
      if (nr < 0 || nr >= this.rows.length) { this.leave(); return true; }    // up from the first, down from the last: the Parapet
      const target = this.rows[nr];
      const nc = Math.min(this.mem[nr] !== undefined ? this.mem[nr] : this.c, target.cells.length - 1);   // memory per row, never diagonal
      this.setFocus(nr, nc);
      ctx.fx.chime(action === 'up' ? 1319 : 988, 0.03);
      return true;
    }
    if (action === 'ok') { this.launch(); return true; }
    if (action === 'longok' || action === 'menu') { this.contextMenu(); return true; }
    if (action === 'back' || action === 'home') { this.leave(); return true; }
    return false;
  },
};
