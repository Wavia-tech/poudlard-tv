// The Marauder's Map (Carte du Maraudeur): every app on a parchment that unfolds, the Passages (consoles, HDMI inputs),
// and the "Réglages" (Settings) candle. This is where you pin, unpin, hide, show and move what sits on the parapet,
// and where you add an app of your own (V4): a last "Ajouter une appli" piece opens a spell to write.
//
// Grammar: arrows in the grid (column memory per row) · OK launches (ink version of Lumos) ·
// long OK or Menu: the app's Remembrall (Rappeltout) · Back, down from the last row, up from the first: "Fait et bien fait" (the closing line)
// then back to the Parapet. Every change goes through updateConfig / addCustomApp / removeCustomApp (config.js): nothing else writes.
//
// Opening: the sheet unfolds and the ink appears (.is-in) as the screen arrives, not after it; the footprints walk once
// the ink is laid. Without `is-in`, map.css keeps everything folded and invisible.
//
// Added apps (config.custom): category 'perso', logo = monogram(app.name) when LOGOS[app.id] is missing. They come
// in the grid after the catalog, before the Passages, followed by the dotted "Ajouter une appli" frame.
// Their Remembrall also offers "Supprimer cette appli" (delete this app).
//
// The spell to write (.map-spell): a D-pad keyboard drawn in ink (letters, digits, space, Erase, "C'est fait" / Done),
// the name is written with a quill in IM Fell above it, letter by letter (each one inks in), 20 characters at most.
//
// Performance (TV: 4 weak cores, 1.3 GB): nothing moves when nothing happens, and a key costs the main thread almost
// nothing. One mark goes from piece to piece (.map-focus: what the lifted piece stands on), only its
// transform changes, on the shared curve; the piece over it rises by transform. Each piece is its own small layer, painted
// once. A piece is a handful of elements (its frame is a background picture), and only the rows in or next to the
// window exist: opening the Map builds three rows, one per frame while the move has already started (the key's task only makes the
// empty screen), the others come in an idle moment. No layout is read for a move: every position comes from GEO, the numbers of
// map.css.
// Back erases the last letter; Back on an empty field cancels. On the real TV, if Platform.installed() returns a list,
// those apps are offered first (Remembrall sphere); in the mockup the list is null, so the name is typed.
//
// Accepted parameters (optional): ctx.params.app  = id of the app in focus on the parapet (initial focus);
//                                 ctx.params.from = { x, y } screen fractions (0..1) the footprints start from.

import { allApps, appById, getConfig, updateConfig, addCustomApp, removeCustomApp, namePassage, isReduced, DOCK_MAX } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram, logoBox } from '../monogram.js';
import { rappeltout, dismissRappeltout } from '../rappeltout.js';
import { beuglante } from '../beuglante.js';
import { TV_SCREENS, TV_ONLY, ARROWS_LR, ARROWS_ALL, timeK, primeEnter, fontsReady, frames } from './settings.js';

const PAGE = 8;              // installed apps offered per Remembrall page ("Suivants ›" turns the page)
const NOT_CONNECTED = 'Cette source n’est pas raccordée.';

const COLS = 5;              // grid columns
const ROWS_VISIBLE = 3;      // visible rows per page (further pages downwards)
const STEPS = 6;             // footprints per walk
const FOCUS_SCALE = 1.05;    // the focused piece (map.css), and the mark that goes with it
const FOCUS_LIFT = 0.5;      // cqw: its lift (map.css)
const NAME_ONE_LINE = 14;    // a name longer than this may break on two lines
const STEP_GAP = 40;         // ms between two footprints
const STEP_MS = 1400;        // ms a footprint stays, from its ink to its drying
const STEP_MIN = 1.2;        // cqw a footprint needs
const REVEAL_GAP = 70;       // ms between two rows at opening
const ARRIVE_AFTER_MS = 220; // the sheet starts to unfold this far into the slide
const WALK_AFTER_MS = 520;   // the walk starts once the parchment is unfolded and the ink laid down
const OPENED_MS = 1000;      // all of the opening has played
const INTENT_MS = 350;       // the intent fires at 350 ms (Lumos blueprint); until then, Back cancels
const FRAME_W = 14, FRAME_H = 7;   // frame of the piece in cqw (map.css: 14 × 7, at the top of the 14 × 10.6 piece)
const ARRIVE = 'cubic-bezier(.32,.72,0,1)';   // --ease-arrive (base.css), for the Web Animations below
const TIDY_MS = 420;         // after a move has settled: the rows next to the window are built, the far ones put away
// Grid geometry in cqw, the same numbers as map.css (.map-sheet, .map-grid, .map-row, .map-cell). The page slide, the
// focus mark and the centre of the focused frame are computed from them, never read from the layout. If map.css
// changes one of these, change it here too.
const GEO = {
  sheetX: 7, sheetY: 3.2,              // .map-sheet left / top
  gridX: 3.4 + 1.4, gridY: 4.9 + 1.2,  // .map-grid left / top + its padding (left 1.4, top 1.2)
  cellW: 14, gapX: 1.6,                // .map-cell width, .map-row gap
  rowH: 10.6 + 0.9,                    // .map-cell height + .map-row margin-bottom
  titleH: 2.6,                         // .map-row.has-title padding-top
};
const SCREEN_H = 56.25;              // the stage is 16:9: 100 × 56.25 cqw
const PARAPET_GAP = 1.6;             // cqw between two miniatures (.map-parapet-row gap)
const LIFT = 0.7;                    // cqw: the held miniature's lift (.map-parapet-item.is-lift)
// The fonts the Map writes with (fonts.css). Loaded before the grid is built, so that its first layout is done in
// them, not in a fallback that is thrown away (and re-laid out) a moment later.
const MAP_FACES = ['1em "IM Fell English"', 'italic 1em "IM Fell English"', '1em "IM Fell English SC"', '1em "EB Garamond"', 'italic 500 1em "EB Garamond"'];
// The parchment: the paper cut out of its photo (alpha along its edge and its curls, map.css), decoded off the main
// thread before the sheet unfolds. Same URL as map.css resolves (relative to tv.html / index.html).
const PARCHMENT = 'assets/map-parchment.webp';
const PARCHMENT_MAX_MS = 700;        // the sheet never waits longer than that for its picture
let parchmentP = null;               // decode promise (true: decoded, false: missing), shared by every opening
function decodeParchment() {
  if (!parchmentP) {
    let im = new Image();
    im.decoding = 'async';
    im.src = PARCHMENT;
    parchmentP = (typeof im.decode === 'function' ? im.decode() : new Promise((res, rej) => { im.onload = res; im.onerror = rej; }))
      .then(() => true, () => { parchmentP = null; return false; })
      .finally(() => { im = null; });   // the element goes; the decoded picture stays in the browser's cache
  }
  return parchmentP;
}
const MASKS_PER_FRAME = 2;   // a logo's SVG document is parsed when its mask gets its style, on the main thread
const KEY_QUIET_MS = 300;    // no mask in the frames right after a key
let liveTv = null;           // the TV has a tuner: asked once (a bridge call, a synchronous trip to another process), it does not change
const facesLoaded = (faces) => { try { return Boolean(document.fonts) && faces.every((f) => document.fonts.check(f)); } catch (e) { return false; } };
// Nothing of the Map is held before it opens (memory: the parchment is 6 MB decoded, every logo a parsed SVG document): the parchment
// is decoded from the key, off the main thread, and has the time of the slide before it shows; the logos' masks come one row per
// frame, in the frames of that slide.
// Up/down chevrons of the 3-row window, and the Boutique's star: drawn, because the embedded fonts have no ⌃ ⌄ ✦
// (a missing glyph sends the browser looking for a system font during layout).
const CHEVRON_UP = '<svg viewBox="0 0 20 10" aria-hidden="true"><path d="M2 9 10 2l8 7"/></svg>';
const CHEVRON_DOWN = '<svg viewBox="0 0 20 10" aria-hidden="true"><path d="M2 1l8 7 8-7"/></svg>';
const STAR_SVG = '<svg class="map-star" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 12.2 7.8 20 10 12.2 12.2 10 20 7.8 12.2 0 10 7.8 7.8Z"/></svg>';

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
const KEYHINT_BROWSE = `<span><b>${ARROWS_ALL}</b>Parcourir</span><span><b>OK</b>Ouvrir</span><span><b>OK long</b>Rappeltout</span><span><b>Retour</b>Parapet</span>`;
const KEYHINT_MOVE = `<span><b>${ARROWS_LR}</b>Déplacer</span><span><b>OK</b>Poser</span><span><b>Retour</b>Annuler</span>`;
const KEYHINT_SPELL = `<span><b>${ARROWS_ALL}</b>Lettre</span><span><b>OK</b>Écrire</span><span><b>Retour</b>Effacer · Annuler</span>`;

// The spell keyboard: four rows of ten keys, then three wide keys. Labels are constants.
// A key = a character (`ch`) or an action (`id`: space, erase, done). `w`: width in cqw of the wide keys.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z', '+', '-', '.', '&'],
  [{ id: 'space', label: 'Espace', w: 17 }, { id: 'erase', label: 'Effacer', w: 17 }, { id: 'done', label: 'C’est fait', w: 25.6 }],
];

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
  timers: [], busy: false, leaving: false, reduced: false, menuOpen: false, arrived: false, built: false, arriveWanted: false,
  ring: null,            // the focus mark
  focusEl: null,         // the piece that wears .is-focus
  keyEl: null,           // the spell key that wears it
  pressed: false,        // OK is down on the focused piece
  steps: [],             // the six footprints, drawn once: { el, anim }
  tidyTimer: 0,
  fresh: null,           // the app that inks itself alone after a rebuild
  masksLater: null,      // while mounting: the logos' masks still to set
  move: null,            // Move mode: { id, order:[ids], items:{ id: element } } or null
  spell: null,           // spell to write: { name, r, c, cm, rows:[[{ id?, ch?, el }]], busy } or null
  launching: null,       // launch in progress: { app, sent, intentTimer, endTimer, held } or null
  toastTimer: 0,         // informative brass plate (outside launches)

  // ---------------------------------------------------------------- mount
  async mount(root, ctx) {
    primeEnter(root);                                                    // the router's slide needs the layer's start style
    this.root = root; this.ctx = ctx; this.timers = [];
    this.busy = false; this.leaving = false; this.menuOpen = false; this.arrived = false; this.built = false; this.arriveWanted = false; this.rows = [];
    this.move = null; this.spell = null; this.mem = []; this.top = 0; this.launching = null; this.toastTimer = 0;
    this.ring = null; this.focusEl = null; this.keyEl = null; this.pressed = false; this.steps = []; this.tidyTimer = 0; this.fresh = null;
    this.reduced = isReduced();
    root.classList.toggle('is-reduced', this.reduced);

    root.innerHTML = `
      <canvas class="map-sky" width="960" height="540"></canvas>
      <div class="map-sheet parchment">
        <div class="map-paper"></div>
        <div class="map-folds"></div>
        <div class="map-formula"></div>
        <div class="map-empty"></div>
        <div class="map-grid"><div class="map-rows"></div></div>
        <div class="map-more up">${CHEVRON_UP}</div><div class="map-more down">${CHEVRON_DOWN}</div>
        <div class="map-parapet"><div class="map-parapet-title"></div><div class="map-parapet-row"></div></div>
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

    // The footprints start from where we were on the parapet (screen fractions), the dock by default. In cqw,
    // from the 16:9 stage: no layout read.
    const from = (ctx.params && ctx.params.from && Number.isFinite(ctx.params.from.x) && Number.isFinite(ctx.params.from.y))
      ? ctx.params.from : { x: 0.5, y: 0.78 };
    const start = { x: from.x * 100, y: from.y * SCREEN_H };

    // The staging starts a moment into the slide, once the grid
    // is built. Once the ink is laid, the rows' opening reveal is retired (is-quiet): a row that later scrolls into the
    // window fades in at once, without the opening's delay. The rows next to the window come then, nothing else moving.
    const arrive = () => {
      if (this.arrived || this.root !== root) return;
      if (!this.built) { this.arriveWanted = true; return; }
      this.arrived = true;
      root.classList.add('is-in');
      if (!this.reduced) this.after(WALK_AFTER_MS, () => this.walk(start, this.focusCenter()));
      this.after(OPENED_MS, () => { const host = root.querySelector('.map-rows'); if (host) host.classList.add('is-quiet'); this.tidyRows(); });
    };
    this.after(ARRIVE_AFTER_MS, arrive);

    if (ctx.config().sounds) ctx.fx.initAudio();
    ctx.fx.whoosh();

    const parchment = decodeParchment();
    // The key's task ends here: it only made the empty screen, and the move starts on its next frame. What follows comes a piece per
    // frame, under the move; the parchment is still folded and invisible (no .is-in), so nothing half-built shows. Keys stay with the
    // router until mount() resolves, so none reaches a half-built Map.
    await ctx.slice();
    if (this.root !== root) return;
    this.drawSky();
    await Promise.all([ctx.slice(), facesLoaded(MAP_FACES) ? null : fontsReady(MAP_FACES, 600)]);
    if (this.root !== root) return;
    // The lines in IM Fell are written once their fonts are there: one layout, not a fallback one and then another.
    root.querySelector('.map-formula').textContent = FORMULA;
    root.querySelector('.map-spell-title').textContent = 'Quelle appli ajouter ?';
    root.querySelector('.map-parapet-title').textContent = 'Le parapet';
    // A mask's SVG document is parsed when its element first gets its style, on the main thread, a few ms each: the
    // pictures come last, one row per frame, the ink being invisible until the sheet opens.
    this.masksLater = [];
    this.rows = this.buildRows();
    // Initial focus: the parapet app we came from, else the last launched one, else the first.
    const wanted = (ctx.params && typeof ctx.params.app === 'string') ? ctx.params.app : getConfig().lastApp;
    const pos = this.findCell((cell) => cell.kind === 'app' && cell.app.id === wanted) || { r: 0, c: 0 };
    this.r = pos.r; this.c = pos.c;
    this.top = Math.min(Math.max(0, pos.r - ROWS_VISIBLE + 1), Math.max(0, this.rows.length - ROWS_VISIBLE));
    await ctx.slice();
    if (this.root !== root) return;
    this.renderRows({ fill: false });
    this.setFocus(pos.r, pos.c, { walkFrom: null, instant: true });
    for (let r = this.top; r < this.top + ROWS_VISIBLE; r++) {
      if (r === pos.r || !this.rows[r]) continue;
      await ctx.slice();
      if (this.root !== root) return;
      this.fillRow(r);
    }
    const later = this.masksLater;
    this.masksLater = null;
    while (later.length) {
      await ctx.slice();
      if (this.root !== root) return;
      later.splice(0, MASKS_PER_FRAME).forEach(([logo, src]) => { logo.style.webkitMaskImage = `url("${src}")`; });
    }
    // The sheet unfolds once its picture is decoded (PARCHMENT_MAX_MS at most); a missing picture falls back to the
    // plain parchment colour (map.css .no-parchment), never ink on the night.
    const decoded = await Promise.race([parchment, new Promise((r) => setTimeout(() => r(true), PARCHMENT_MAX_MS))]);
    if (this.root !== root) return;
    if (!decoded) root.classList.add('no-parchment');
    // A layer at opacity 0 is not rasterised: the rows' raster would land in the first frames of the unfolding. Two frames at an opacity
    // that cannot be seen, on a sheet that cannot be seen.
    const rowsHost = root.querySelector('.map-rows');
    rowsHost.classList.add('is-warm');
    await ctx.slice(); await ctx.slice();
    if (this.root !== root) return;
    rowsHost.classList.remove('is-warm');
    this.built = true;
    if (this.arriveWanted) arrive();
  },

  unmount() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.launching && this.launching.held) Input.release();   // never leave an orphaned input queue
    this.launching = null;
    dismissRappeltout();
    this.rows = [];
    this.steps = []; this.ring = null; this.focusEl = null; this.keyEl = null;
    this.move = null;
    this.spell = null;
    this.root = null;
  },

  // Timer that honours the test bench slow-motion (--k) and is cancelled on unmount.
  k() { return timeK(); },
  after(ms, fn) { const t = setTimeout(() => { if (this.root) fn(); }, ms * this.k()); this.timers.push(t); return t; },

  // Behind the parchment: the Night, a few stars and the vignette, drawn once on one opaque picture (no loop), so that
  // the screen is one layer under the sheet.
  drawSky() {
    const cv = this.root.querySelector('.map-sky');
    const g = cv.getContext('2d', { alpha: false }); if (!g) return;
    const W = cv.width, H = cv.height;
    g.fillStyle = '#070B14'; g.fillRect(0, 0, W, H);
    for (let n = 0; n < 110; n++) {
      const x = Math.random() * W, y = Math.random() * H * 0.9, s = 0.4 + Math.random() * 1.3;
      g.globalAlpha = 0.25 + Math.random() * 0.6;
      g.fillStyle = Math.random() < 0.2 ? '#C9D9EA' : '#F1EBDD';
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    const side = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.6);
    side.addColorStop(0, '#070b1400'); side.addColorStop(1, '#070b14cc');
    g.fillStyle = side; g.fillRect(0, 0, W, H);
    const band = g.createLinearGradient(0, 0, 0, H);
    band.addColorStop(0, '#070b14ff'); band.addColorStop(0.18, '#070b1400'); band.addColorStop(0.82, '#070b1400'); band.addColorStop(1, '#070b14ff');
    g.fillStyle = band; g.fillRect(0, 0, W, H);
  },

  // ---------------------------------------------------------------- data
  // Grid rows: the catalog apps (hidden ones included, in pale ink), then the hand-added apps,
  // then the "Ajouter une appli" frame, then "Les Passages", then the Settings candle as the last piece.
  // On the TV (Platform.installed() is a Set), only the catalog apps actually installed are drawn; in the mock-up
  // (null) the whole catalog. Hand-added apps always stay visible (their package may have been uninstalled: they
  // must remain deletable from here), and so does a catalog app still pinned to the parapet although the TV no
  // longer has it (it would otherwise hold a parapet slot nobody can free): both in faded ink with the mention
  // "absente" (is-absent class, map.css); launching one ends in a Howler with the TV's sentence.
  buildRows() {
    const inst = Platform.installed();
    const dock = getConfig().dock;
    const all = allApps().filter((a) => a.custom || !inst || !a.pkg || inst.has(a.pkg) || dock.includes(a.id));
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
    if (liveTv === null) liveTv = Platform.hasLiveTv();
    if (liveTv) list.push({ id: 'tv', name: 'Télé', cat: 'passage', live: true, connected: true, onDock: false, hidden: false });
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
  // The ink appears row by row (--d on each row, map.css): one fading layer per row, never one per piece.
  // Every row gets its empty shell, of the size GEO gives it; only the rows in the window get their pieces (fillRow).
  renderRows({ quiet = false, fresh = null, fill = true } = {}) {
    const host = this.root.querySelector('.map-rows');
    host.textContent = '';
    host.classList.toggle('is-quiet', quiet);
    this.fresh = quiet ? fresh : null;
    this.rows.forEach((row, r) => {
      const rowEl = document.createElement('div');
      rowEl.className = 'map-row' + (row.title ? ' has-title' : '') + (r < this.top - 1 || r > this.top + ROWS_VISIBLE ? ' is-far' : '');
      rowEl.style.setProperty('--d', `${Math.max(0, r - this.top) * REVEAL_GAP}ms`);
      if (row.title) {
        const t = document.createElement('div');
        t.className = 'map-row-title';
        t.textContent = row.title;
        rowEl.appendChild(t);
      }
      row.el = rowEl;
      host.appendChild(rowEl);
    });
    if (fill) for (let r = this.top; r < this.top + ROWS_VISIBLE; r++) this.fillRow(r);
    if (!this.ring) {
      this.ring = document.createElement('div');
      this.ring.className = 'map-focus';
      this.ring.innerHTML = '<i></i>';
    }
    host.appendChild(this.ring);
    const empty = this.root.querySelector('.map-empty');
    empty.textContent = this.rows.some((row) => row.cells.some((cell) => cell.kind === 'app')) ? '' : 'Le parapet est vide';
  },

  // A row's pieces, built once; their states follow the config (paintCell).
  fillRow(r) {
    const row = this.rows[r];
    if (!row || row.filled) return;
    row.filled = true;
    const frag = document.createDocumentFragment();
    const state = this.appStates();
    row.cells.forEach((cell) => {
      const el = cell.kind === 'candle' ? this.renderCandle() : cell.kind === 'add' ? this.renderAdd() : cell.kind === 'store' ? this.renderStore() : this.renderApp(cell.app);
      if (this.fresh && cell.kind === 'app' && cell.app.id === this.fresh) el.classList.add('is-fresh');   // the new piece inks itself alone
      cell.el = el;
      if (cell.kind === 'app') this.paintCell(cell, state);
      frag.appendChild(el);
    });
    row.el.appendChild(frag);
  },

  // A piece: the frame is its background (map.css), the logo one masked element, the name one more. The line under the
  // logo and the wax seal exist only on the pieces that have them.
  renderApp(app) {
    const el = document.createElement('div');
    el.className = 'map-cell map-app' + (app.custom ? ' is-custom' : '');
    const L = LOGOS[app.id] || monogram(app.name);                     // added app: its monogram
    const logo = document.createElement('div');
    logo.className = 'map-ink-logo';
    if (L && L.src) {
      if (this.masksLater) this.masksLater.push([logo, L.src]);
      else logo.style.webkitMaskImage = `url("${L.src}")`;             // on the element: a var() here is substituted again in each of the mask's longhands
      if (L.luma) logo.classList.add('luma');
      const bx = logoBox(L, 3.4, 10);                                  // equal visual weight across the pieces
      logo.style.width = bx.w.toFixed(2) + 'cqw'; logo.style.height = bx.h.toFixed(2) + 'cqw';
    } else {                                                             // no logo: the initial in quill
      logo.classList.add('no-mask');
      logo.textContent = (app.name || '?').charAt(0);
    }
    el.append(logo, this.renderName(app.name));
    // The line under the logo: what the piece is (HDMI port, hand-added), then its state ("absente", "cachée"),
    // written by paintCell() so that it follows the config.
    const sub = app.live ? 'Antenne' : app.port ? `HDMI ${app.port}` : app.input ? app.input : app.custom ? 'Perso' : '';
    el.dataset.sub = sub === app.name ? '' : sub;                       // a port still named "HDMI 2" does not say it twice
    // Added app whose package is no longer on the TV (or a pinned catalog app the TV lacks): drawn anyway, so it
    // can be removed, in faded ink with its mention.
    const inst = Platform.installed();
    if (inst && app.pkg && !inst.has(app.pkg)) el.classList.add('is-absent');
    if (app.connected === false) el.classList.add('is-pale');            // HDMI port with nothing plugged in
    return el;
  },

  // A long name may take two lines; only those pay for the balanced break.
  renderName(text) {
    const name = document.createElement('div');
    name.className = 'map-name' + (text.length > NAME_ONE_LINE ? ' is-long' : '');
    name.textContent = text;
    return name;
  },

  // "Boutique" (TV only): the store, to install an app the Map does not have yet. Same dotted frame as "Ajouter".
  renderStore() {
    const el = document.createElement('div');
    el.className = 'map-cell map-add-cell map-store-cell';
    el.innerHTML = STAR_SVG;
    el.appendChild(this.renderName('Boutique'));
    return el;
  },

  renderCandle() {
    const el = document.createElement('div');
    el.className = 'map-cell map-candle-cell';
    el.innerHTML = `<div class="map-candle-halo"></div>${CANDLE_SVG}`;
    el.appendChild(this.renderName('Réglages'));
    return el;
  },

  // "Ajouter une appli": the same frame, but dotted (map.css), with a quill in place of the logo.
  renderAdd() {
    const el = document.createElement('div');
    el.className = 'map-cell map-add-cell';
    el.innerHTML = QUILL_SVG;
    el.appendChild(this.renderName('Ajouter une appli'));
    return el;
  },

  appStates() { return Object.fromEntries(allApps().map((a) => [a.id, a])); },

  // Wax seal (on the parapet) and faded ink (hidden), read from the config.
  paintCell(cell, state, pressedId) {
    const el = cell.el;
    const s = state[cell.app.id] || {};
    const onDock = Boolean(s.onDock);
    el.classList.toggle('on-dock', onDock);
    el.classList.toggle('is-hidden', Boolean(s.hidden));
    let seal = el.querySelector('.map-seal');
    if (onDock && !seal) { seal = document.createElement('div'); seal.className = 'wax-seal map-seal'; el.appendChild(seal); }
    const mention = el.classList.contains('is-absent') ? 'absente' : s.hidden ? 'cachée' : '';
    const text = [el.dataset.sub, mention].filter(Boolean).join(' · ');
    let sub = el.querySelector('.map-sub');
    if (text && !sub) { sub = document.createElement('div'); sub.className = 'map-sub'; el.appendChild(sub); }
    if (sub) sub.textContent = text;
    el.classList.toggle('has-sub', Boolean(text));                      // the logo rises a little to leave the line room
    if (pressedId === cell.app.id && seal && seal.animate) seal.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 200 * this.k(), easing: ARRIVE });   // the seal presses once
  },

  // Re-read from the config after every change.
  refreshStates(pressedId) {
    const state = this.appStates();
    this.rows.forEach((row) => row.cells.forEach((cell) => { if (cell.kind === 'app' && cell.el) this.paintCell(cell, state, pressedId); }));
  },

  // A moment after a move: the rows next to the window are built (a key reaching them finds them ready), the far ones
  // are put away (map.css .is-far: no style, no layout, no layer, and what they had is kept for when they come back).
  // Then the names are measured, the layout being clean by then: the pen stroke goes under a two-line name.
  tidyRows() {
    if (!this.root || this.leaving) return;
    const masks = [];
    this.masksLater = masks;
    this.rows.forEach((row, r) => {
      const far = r < this.top - 1 || r > this.top + ROWS_VISIBLE;
      if (!far) this.fillRow(r);
      if (row.el) row.el.classList.toggle('is-far', far);
    });
    this.masksLater = null;
    const root = this.root;
    // Their logos, a few per frame, and none in the frames of a key.
    const nextMasks = () => {
      if (this.root !== root || !masks.length) return;
      if (performance.now() - this.lastKey > KEY_QUIET_MS) masks.splice(0, MASKS_PER_FRAME).forEach(([logo, src]) => { logo.style.webkitMaskImage = `url("${src}")`; });
      if (masks.length) frames(1, 60).then(nextMasks);
    };
    nextMasks();
    frames(2, 120).then(() => {
      if (this.root !== root) return;
      this.rows.forEach((row) => row.cells.forEach((cell) => {
        if (!cell.el || cell.two !== undefined || !row.el || row.el.classList.contains('is-far')) return;
        const name = cell.el.querySelector('.map-name');
        cell.two = Boolean(name) && name.offsetHeight > cell.el.offsetWidth * 0.25;   // one line is .15 of the piece's width, two are .29 (.18 and .36 in "Grande")
      }));
      this.placeRing(false);
    });
  },
  tidySoon() { clearTimeout(this.tidyTimer); this.tidyTimer = this.after(TIDY_MS, () => this.tidyRows()); },

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
    this.tidySoon();
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
    if (this.focusEl) this.focusEl.classList.remove('is-focus');
    this.r = r; this.c = c; this.mem[r] = c;
    this.fillRow(r);                                                     // only a key faster than the idle moment gets here first
    const cell = this.focusedCell();
    this.focusEl = cell && cell.el;
    if (this.focusEl) this.focusEl.classList.add('is-focus');
    this.placeRing(instant);
    this.scrollTo(r, instant);
    if (!instant && from) this.walk(from, this.focusCenter(), true);
  },

  // The focus mark goes to the focused piece: one transform, in the rows' own coordinates (it slides with them), at the
  // scale of the focused piece. `instant` (mount, rebuild): the transition is off for this change, back on two frames
  // later, without forcing a style flush.
  placeRing(instant) {
    const ring = this.ring; if (!ring) return;
    const row = this.rows[this.r];
    const x = this.c * (GEO.cellW + GEO.gapX), y = this.rowY(this.r) + (row && row.title ? GEO.titleH : 0);
    if (instant) {
      ring.style.transition = 'none';
      const root = this.root;
      frames(2, 100).then(() => { if (this.root === root) ring.style.transition = ''; });
    }
    const flat = this.pressed || this.reduced;
    ring.style.transform = `translate(${x.toFixed(2)}cqw, ${(y - (flat ? 0 : FOCUS_LIFT)).toFixed(2)}cqw) scale(${flat ? 1 : FOCUS_SCALE})`;
  },

  // Top of row `r` inside the rows block, in cqw (GEO, no layout read).
  rowY(r) {
    let y = 0;
    for (let i = 0; i < r && i < this.rows.length; i++) y += GEO.rowH + (this.rows[i].title ? GEO.titleH : 0);
    return y;
  },

  // 3-row window: the focused row stays visible, rows slide vertically (translate in cqw).
  // `instant` (mount, rebuild): no slide. The transition is switched off for this change and back on two frames
  // later, without forcing a style flush.
  scrollTo(r, instant) {
    const before = this.top;
    if (r < this.top) this.top = r;
    if (r > this.top + ROWS_VISIBLE - 1) this.top = r - ROWS_VISIBLE + 1;
    const rowsEl = this.root.querySelector('.map-rows');
    if (instant) {
      rowsEl.style.transition = 'none';
      const root = this.root;
      frames(2, 100).then(() => { if (this.root === root) rowsEl.style.transition = ''; });
    } else if (before === this.top) return;                              // the window has not moved: nothing below changes
    rowsEl.style.transform = `translateY(${(-this.rowY(this.top)).toFixed(3)}cqw)`;
    // Rows outside the window fade out: never a row cut in half at the bottom of the parchment.
    this.rows.forEach((rw, i) => {
      if (!rw.el) return;
      const out = i < this.top || i >= this.top + ROWS_VISIBLE;
      rw.el.classList.toggle('is-out', out);
      if (!out) { rw.el.classList.remove('is-far'); this.fillRow(i); }
    });
    this.root.querySelector('.map-more.up').classList.toggle('is-on', this.top > 0);
    this.root.querySelector('.map-more.down').classList.toggle('is-on', this.top + ROWS_VISIBLE < this.rows.length);
    if (!instant) this.tidySoon();
  },

  // Centre of the FRAME of the focused piece, in cqw (screen coordinates), once the page slide is complete.
  // Computed from the grid geometry (GEO, the numbers of map.css), never read from the layout: independent of the
  // slide in progress on .map-rows, and no forced style or layout on every move.
  focusCenter() {
    if (!this.focusedCell() || !this.root) return null;
    const row = this.rows[this.r];
    const x = GEO.sheetX + GEO.gridX + this.c * (GEO.cellW + GEO.gapX) + FRAME_W / 2;
    const y = GEO.sheetY + GEO.gridY + this.rowY(this.r) - this.rowY(this.top) + (row && row.title ? GEO.titleH : 0) + FRAME_H / 2;
    return { x, y };
  },

  // Same point in pixels (for Fx.lumos and the Remembrall anchor).
  focusCenterPx() {
    const p = this.focusCenter(); if (!p) return { x: 0, y: 0 };
    const W = this.root.clientWidth || 1;
    return { x: p.x * W / 100, y: p.y * W / 100 };
  },

  // ---------------------------------------------------------------- the footprints
  // Inked footprints, six at most, alternating left foot / right foot, walking from `from` to the EDGE of the target frame
  // (cqw), 40 ms between two steps, then fading out. From one piece to another they walk between the two frames, never
  // over the ink: side by side there is no room, and no walk. A new walk takes them back. Nothing in reduced motion.
  // The six are drawn once and stay; a walk only starts six animations of their transform and opacity, on the compositor.
  footprints() {
    if (this.steps.length) return this.steps;
    const layer = this.root.querySelector('.map-steps');
    for (let i = 0; i < STEPS; i++) {
      const el = document.createElement('i');
      el.className = 'map-step';
      layer.appendChild(el);
      this.steps.push({ el, anim: null });
    }
    return this.steps;
  },
  walk(from, to, fromPiece) {
    if (!this.root || this.reduced || !from || !to) return;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
    const steps = this.footprints();
    steps.forEach((s) => { if (s.anim) { s.anim.cancel(); s.anim = null; } });
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;                                   // a step in place is not drawn
    const ux = dx / dist, uy = dy / dist;                   // walking direction
    const px = -uy, py = ux;                                // perpendicular (gap between the two feet)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;  // the foot points upwards in its drawing
    // Distance from the frame centre to its edge in the arrival direction: steps stop just before the rule.
    const edge = Math.min(FRAME_W / 2 / Math.max(1e-3, Math.abs(ux)), FRAME_H / 2 / Math.max(1e-3, Math.abs(uy)));
    const end = Math.max(0, dist - edge - 0.6);
    const begin = fromPiece ? edge + 0.6 : 0;               // the other frame has the same edge, on the way out
    const count = Math.min(STEPS, Math.floor((end - begin) / STEP_MIN));
    if (count < 2) return;                                  // already at the foot of the piece
    const k = this.k();
    const total = STEP_MS + (STEPS - 1) * STEP_GAP;
    steps.slice(0, count).forEach((s, i) => {
      const t = begin + (end - begin) * (i + 1) / count;
      const side = i % 2 === 0 ? -1 : 1;
      const x = from.x + ux * t + px * side * 0.55, y = from.y + uy * t + py * side * 0.55;
      const at = `translate(${x.toFixed(2)}cqw, ${y.toFixed(2)}cqw) rotate(${angle.toFixed(1)}deg) scaleX(${side})`;
      // All six start together, each one's turn written in its keyframes: a `delay` would wake the main thread for every
      // frame until the last one had started.
      const o = (ms) => (i * STEP_GAP + ms) / total;
      s.anim = s.el.animate([
        { opacity: 0, transform: `${at} scale(1.3)` },
        { opacity: 0, transform: `${at} scale(1.3)`, offset: o(0) },
        { opacity: 0.82, transform: `${at} scale(1)`, offset: o(STEP_MS * 0.1) },
        { opacity: 0.82, transform: `${at} scale(1)`, offset: o(STEP_MS * 0.64) },
        { opacity: 0, transform: `${at} scale(1)`, offset: o(STEP_MS) },
        { opacity: 0, transform: `${at} scale(1)` },
      ], { duration: total * k });
    });
  },

  // Stop: the piece bumps against the edge (small recoil), the map does not wrap around.
  // The WAAPI animation replaces the CSS transform value, so the focus scale(1.04) is kept in every keyframe.
  nudge(dir, el) {
    const cell = this.focusedCell();
    const target = el || (cell && cell.el);
    if (!target || this.reduced) return;
    const d = { left: 'translateX(-.35cqw)', right: 'translateX(.35cqw)', up: 'translateY(-.35cqw)', down: 'translateY(.35cqw)' }[dir] || 'translateX(.3cqw)';
    const base = el ? 'scale(1.1)' : 'scale(1.05)';                     // the focus scale of a key / a piece (map.css)
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
    const at = this.focusCenter();
    const light = this.root.querySelector('.map-candlelight');
    const toast = this.root.querySelector('.map-toast');
    toast.classList.remove('is-on');
    light.style.transform = `translate(${(at.x - GEO.sheetX).toFixed(2)}cqw, ${(at.y - GEO.sheetY).toFixed(2)}cqw)`;
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
    else if (r.status === 'failed') beuglante(this.root, { message: r.error });   // the TV's own sentence, whole
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
      if (r.status === 'failed') beuglante(this.root, { message: r.error });
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
        el.style.setProperty('--rot', `${(((index * 7) % 5) - 2) * 0.35}deg`);      // hand wobble, fixed per key
        rowEl.appendChild(el);
        row.push(key);
        index++;
      });
      rowEl.style.setProperty('--d', `${rows.length * 50}ms`);                    // the keys are dealt row by row
      keys.appendChild(rowEl);
      rows.push(row);
    });
    this.spell = { name: '', r: 1, c: 0, cm: 0, rows, busy: false, onDone: typeof opts.onDone === 'function' ? opts.onDone : null };
    this.keyEl = null;
    // One focus at a time (contract): the "Ajouter" frame hands its class over to the keyboard; closeSpell() gives it back.
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.remove('is-focus');
    this.root.classList.add('is-spell');
    panel.classList.add('is-open', 'is-dealing');                                   // the keys are dealt, once only
    this.after(rows.length * 50 + 300, () => panel.classList.remove('is-dealing'));
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
    if (this.keyEl) this.keyEl.classList.remove('is-focus');
    this.keyEl = s.rows[s.r][s.c].el;
    this.keyEl.classList.add('is-focus');
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
    seal.classList.add('is-pressed');
    if (!this.reduced && seal.animate) seal.animate([{ transform: 'scale(1.5)' }, { transform: 'none' }], { duration: 260 * this.k(), easing: ARRIVE });
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
  // slide), OK sets it down (updateConfig({ dock })), Back cancels without writing anything.
  enterMove(id) {
    const order = [...getConfig().dock];
    if (!order.includes(id)) return;
    this.move = { id, order, base: [...order], items: {}, widths: {}, gap: 0 };
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.add('is-moving');
    this.root.classList.add('is-move');
    const moving = appById(id) || (cell && cell.app);
    const title = this.root.querySelector('.map-parapet-title');      // who is moving, written whole, then the arrows (drawn)
    title.textContent = moving ? `${moving.name} ` : 'Le parapet';
    if (moving) title.insertAdjacentHTML('beforeend', ARROWS_LR);
    this.renderParapet();
    this.root.querySelector('.map-parapet').classList.add('is-open');
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_MOVE;
    // The miniatures' widths, read once here: a swap then only computes where each one goes.
    const m = this.move;
    m.gap = this.root.clientWidth * PARAPET_GAP / 100;
    m.base.forEach((x) => { m.widths[x] = m.items[x] ? m.items[x].offsetWidth : 0; });
  },

  // Draws the row once, in the parapet's order; a swap only moves the miniatures by transform, until OK writes the order.
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
      if (L) { logo.style.webkitMaskImage = `url("${L.src}")`; logo.style.width = Math.min(6, Math.max(1, 2.2 * (L.ratio || 1))).toFixed(2) + 'cqw'; }
      else logo.textContent = (app.name || '?').charAt(0);
      it.appendChild(logo);
      this.move.items[id] = it;
      row.appendChild(it);
    });
  },

  // Each miniature goes to its place in the new order: its distance from where the row first drew it, by transform.
  // A CSS transition (map.css), so a quick second swap retargets from where it is.
  placeParapet() {
    const m = this.move;
    const at = (list) => { const out = {}; let x = 0; list.forEach((id) => { out[id] = x; x += (m.widths[id] || 0) + m.gap; }); return out; };
    const was = at(m.base), now = at(m.order);
    m.order.forEach((id) => {
      const it = m.items[id];
      if (it) it.style.transform = `translate(${(now[id] - was[id]).toFixed(1)}px, ${id === m.id ? `${-LIFT}cqw` : '0'})`;
    });
  },

  moveKey(action) {
    const m = this.move;
    const i = m.order.indexOf(m.id);
    if (action === 'left' || action === 'right') {
      const j = action === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= m.order.length) { this.ctx.fx.chime(440, 0.02); return true; }
      [m.order[i], m.order[j]] = [m.order[j], m.order[i]];
      this.placeParapet();
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
    this.root.querySelector('.map-parapet-title').textContent = 'Le parapet';
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_BROWSE;
  },

  // ---------------------------------------------------------------- leaving
  // "Fait et bien fait": the key is answered at once, the formula rewrites itself; the parchment folds as the camera goes
  // back to the Parapet (map.css, when the router gives this layer its leave class).
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    dismissRappeltout();
    if (this.spell) this.closeSpell();
    this.steps.forEach((s) => { if (s.anim) { s.anim.cancel(); s.anim = null; } });
    this.ctx.fx.whoosh();
    if (!this.reduced && this.arrived) {                     // Back before the screen is even in place: nothing to fold
      const formula = this.root.querySelector('.map-formula');
      this.root.classList.add('is-leaving');
      formula.textContent = MISCHIEF;
      if (formula.animate) formula.animate([{ opacity: 0, transform: 'translateX(-1.2cqw)' }, { opacity: 0.92, transform: 'none' }], { duration: 300 * this.k(), easing: ARRIVE });
    }
    this.ctx.router.go('home', {}, 'pan-down');
  },

  // ---------------------------------------------------------------- keys
  onKey(action, ctx) {
    this.lastKey = performance.now();
    if (action === 'okdown') { const c = this.focusedCell(); if (c && c.el && !this.busy && !this.spell && !this.move) { c.el.classList.add('is-press'); this.pressed = true; this.root.classList.add('is-pressing'); this.placeRing(false); } return true; }
    { const c = this.focusedCell(); if (c && c.el) c.el.classList.remove('is-press'); if (this.pressed) { this.pressed = false; this.root.classList.remove('is-pressing'); this.placeRing(false); } }
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
