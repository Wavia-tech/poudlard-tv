// The Room of Requirement (Salle sur Demande): the settings, on a large ledger open as a double-page spread.
// Left page: the sections. Right page: the section's content, and at the bottom a miniature preview
// of the parapet that recomposes live. Every change is saved immediately (updateConfig) and its new value written
// in quill; a parapet row also keeps a pressed wax seal. Two levels, never more.
// Holding Back for 2 s brings up classic mode from here too (the blueprint's reversibility rule).
//
// Motion: the shared curve, transform and opacity only. One mark per page goes from line to line (.set-mark on the left,
// .set-focus on the right): a key moves its transform and paints nothing, and no layout is read for a move (the lines'
// positions are measured once, when a section is laid out). The sections stay laid out and painted once built: going from one
// to the next changes the opacity of two sheets that are already there, and only when the keys stop (the mark never waits for
// it). Opening the room: the key's task only makes the empty room, and the rest comes a piece per frame, under the move (mount).
import { HOUSES, DOCK_MAX, getConfig, updateConfig, resetConfig, allApps, appById, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram, logoBox } from '../monogram.js';

// App logo: official (LOGOS) or, for a hand-added app (V4), its monogram. Null if the id is unknown.
const logoOf = (id) => LOGOS[id] || (appById(id) ? monogram(appById(id).name) : null);

// Sections of the left page (display order). The first two are the Free My TV pair: who answers the Home key,
// and the TV's own settings screens (Poudlard opens them, changes nothing itself).
const RUBRIQUES = [
  { id: 'home', label: 'Accueil de la télé', title: 'La touche Home', sub: 'Revenir à l’accueil de la télé, ou choisir qui répond à la touche Home.' },
  { id: 'tv', label: 'Réglages de la télé', title: 'La télé elle-même', sub: 'Ses propres menus : image, son, réseau, télécommandes. Poudlard n’y change rien.', wide: true },
  { id: 'dock', label: 'Parapet et applis', title: 'Le Parapet', sub: 'OK pose ou retire une appli ; Gauche et Droite changent son rang ; OK maintenu la cache dans la Carte.' },
  { id: 'owl', label: 'Chouette et sons', title: 'Hedwige', sub: 'Elle est le curseur du parapet. Les sons sont des clochettes ; la musique joue en fond.' },
  { id: 'motion', label: 'Mouvement et énergie', title: 'Mouvement', sub: 'Pour une télé qui rame, ou pour les yeux fatigués.' },
  { id: 'idle', label: 'Veille', title: 'Nox', sub: 'Sans touche, le château s’endort et seule l’heure veille.' },
  { id: 'classic', label: 'Mode classique', title: 'Le lundi matin', sub: 'Un accueil ordinaire, même parapet, sans décor ni chouette.' },
  { id: 'about', label: 'À propos', title: 'Poudlard TV', sub: 'Un objet privé, hors ligne, réversible.', wide: true },
];
// `wide`: a long list with nothing to show on the parapet, which takes the preview's room (settings.css .set-right.is-wide).

// Enumerated values: [config value, displayed label]. Labels are constants, never data.
const OWL = [['vive', 'Vive'], ['calme', 'Calme'], ['absente', 'Absente']];
const YESNO = [[true, 'Oui'], [false, 'Non']];
const MOTION = [['auto', 'Auto'], ['reduit', 'Réduit'], ['economie', 'Économie']];
const SKY = [['auto', 'Selon l’heure'], ['nuit', 'Nuit claire']];
// Living ambience (config.ambiance): the lake and its mist moving on the Parapet at rest, off by default.
const AMBIANCE = [['calme', 'Non'], ['vivante', 'Oui']];
const AMBIANCE_NOTE = (v) => (v !== 'vivante' ? 'Au repos, le lac reste immobile : il attend une touche.'
  : isReduced() ? 'Le mouvement est réduit : le lac reste immobile tant qu’il l’est.'
    : 'La brume dérive et les reflets frémissent sur le lac. Un peu plus de calcul.');
const FOLLOW = [['follow', 'Oui'], ['ignore', 'Non']];
const TEXT = [['normal', 'Normale'], ['grand', 'Grande']];
// Background music (sound.js): 'auto' = personal file (assets/music/ambiance.ogg, .mp3 or .m4a, not in the repo,
// see docs/MUSIC.md) if it exists, otherwise the celesta waltz. The notes speak to the person holding the
// remote: never a file path on screen.
const MUSIC = [['fichier', 'Ambiance Poudlard'], ['celesta', 'Célesta'], ['auto', 'Auto'], ['aucune', 'Aucune']];
const MUSIC_NOX = [['pause', 'Se tait'], ['continue', 'Continue']];
const MUSIC_NOTE = { fichier: 'L’ambiance du château, en boucle, en fond. Si elle manque, la valse de célesta prend le relais.', auto: 'L’ambiance du château si elle est là, sinon la valse de célesta.', celesta: 'Une valse lente de célesta, harpe et cordes, composée pour le parapet. Jamais un thème des films.', aucune: 'Les clochettes seulement, sans musique.' };
const MOTION_NOTE = { auto: 'Vol de la chouette, fondus, lumières, nuages derrière le château.', reduit: 'Fondus de 200 ms, rien de plus, pas de nuages. Aussi forcé par le système si demandé.', economie: 'Le strict nécessaire, pour une télé qui rame : moins d’effets, aucune particule, pas de nuages.' };
const IDLE = [[90, '1,5 min'], [180, '3 min'], [300, '5 min'], [600, '10 min'], [0, 'Jamais']];
const VERSION = 'Maquette 0.3 · novembre 2026';   // equals android:versionName (AndroidManifest.xml); CHANGELOG.md
// Android's marketing version from the API level the bridge reports (Build.VERSION.SDK_INT): 30 is Android 11.
const ANDROID = { 21: '5.0', 22: '5.1', 23: '6', 24: '7.0', 25: '7.1', 26: '8.0', 27: '8.1', 28: '9', 29: '10', 30: '11', 31: '12', 32: '12L', 33: '13', 34: '14', 35: '15', 36: '16' };
const androidName = (sdk) => (ANDROID[sdk] ? `Android ${ANDROID[sdk]}` : `Android (API ${sdk})`);
// Home key: the two answers, and what the TV says back when Poudlard asks for the key (Bridge.setHome hints).
export const HOME_MODES = [['poudlard', 'Poudlard TV'], ['original', 'Accueil d’origine']];
export const HOME_HINT = {
  held: 'La touche Home ouvre déjà Poudlard.',
  role: 'La télé vous demande confirmation : OK sur « Poudlard TV ».',
  settings: 'Choisissez Poudlard TV dans l’écran qui vient de s’ouvrir.',
  'press-home': 'Appuyez sur Home, choisissez Poudlard TV, puis « Toujours ».',
  fire: 'Sur Fire TV la touche Home reste à Amazon : ouvrez Poudlard TV depuis vos applis.',
};
export const HOME_NOTE_MOCK = 'Sur la télé seulement : la maquette ne change rien.';
// « Revenir à l'accueil de la télé », the way out in one press (here and on classic mode's « Touche Home » tile):
// setHome('original') closes our HOME entry point if it was open (the Home key goes back) and opens the TV's own
// home (HomeMode.giveBackHome: the recorded original, else the system TV launcher). `mode` is Platform.homeMode().
// Returns { ok, text }: `text` is the sentence for the message band (the page is usually hidden by then).
export const TV_HOME = 'Revenir à l’accueil de la télé';
const TV_HOME_NOTE = (mode) => (mode === 'poudlard'
  ? 'Rend la touche Home à l’accueil de la télé et l’ouvre. Poudlard TV reste dans vos applis.'
  : 'Ouvre l’accueil de la télé. Poudlard TV reste dans vos applis.');
export function openTvHome(mode) {
  const r = Platform.setHome('original');
  if (r.status === 'simulated') return { ok: false, text: HOME_NOTE_MOCK };
  if (r.status === 'failed') return { ok: false, text: r.error };
  if (r.hint === 'press-home') {   // nothing could be started; the HOME entry point is closed all the same
    return { ok: false, text: mode === 'poudlard' ? 'Aucun autre accueil n’a pu s’ouvrir. La touche Home est rendue à la télé : appuyez dessus.' : 'Aucun autre accueil n’a pu s’ouvrir sur cette télé.' };
  }
  return { ok: true, text: mode === 'poudlard' ? 'La touche Home revient à l’accueil de la télé.' : 'L’accueil de la télé s’ouvre.' };
}
// The TV's own screens, in Free My TV's order (Apps.SYSTEM keys). Shared with classic mode and the Map.
export const TV_SCREENS = [
  ['settings', 'Tous les réglages'], ['wifi', 'Réseau et Wi-Fi'], ['bluetooth', 'Télécommande et Bluetooth'], ['picture', 'Image'],
  ['sound', 'Son'], ['apps', 'Applications'], ['date', 'Date et heure'], ['language', 'Langue'], ['accessibility', 'Accessibilité'],
  ['update', 'Mise à jour'], ['about', 'À propos de la télé'],
];
export const TV_ONLY = 'Sur la télé seulement.';
// The arrow keys of the key hints, drawn as tiny inline SVG triangles. The embedded fonts have no ◀ ▶ ▲ ▼ glyph:
// each one made the browser look for a system fallback font in the middle of the screen's first layout (on the
// desktop it loaded Segoe UI Symbol, Georgia, Times New Roman: about 150 ms of a 4× throttled CPU, once). Shared
// with the Map and classic mode. Sized in em, coloured by currentColor (that of .keyhint b).
const tri = (deg) => `<svg viewBox="0 0 10 10" width=".62em" height=".62em" aria-hidden="true" style="fill:currentColor;vertical-align:.02em;transform:rotate(${deg}deg)"><path d="M2 1.2 9 5 2 8.8Z"/></svg>`;
export const ARROW = { left: tri(180), right: tri(0), up: tri(-90), down: tri(90) };
export const ARROWS_LR = `${ARROW.left} ${ARROW.right}`;
export const ARROWS_ALL = `${ARROW.left} ${ARROW.right} ${ARROW.up} ${ARROW.down}`;
// Test-bench slow motion (base.css: --k is 3 under :root[data-slow="1"], 1 otherwise), read from the attribute:
// getComputedStyle() would force a style recalculation of the whole page at every timer.
export const timeK = () => (document.documentElement.dataset.slow === '1' ? 3 : 1);
// The router adds the `enter-…` class, then removes it in the next animation frame; a CSS transition only runs if
// the new layer's style was computed once WITH that class. A screen whose mount() reads no layout (the point of
// this round) must therefore ask for that style itself: a style-only read of the still empty layer, no layout.
// (Better done once in router.js after appending the layer; until then each screen that mounts lazily calls it.)
export const primeEnter = (root) => { void getComputedStyle(root).opacity; };
// Resolves when these font faces are loaded (or after `ms`, whichever first): never blocks a screen on a missing
// file. A screen builds its text once its fonts are there, so its first layout is done in them, not in a system
// fallback that the browser must find, load, then throw away with a second layout (fonts.css: font-display block,
// and only four faces are preloaded by tv.html).
export function fontsReady(faces, ms) {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  return Promise.race([Promise.all(faces.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, ms))]);
}
// The first time a glyph of a face is met at a size, its outline and metrics are loaded on the main thread; set in text,
// that is about 50 ms for fifteen short names on a 4× throttled CPU, and the browser drops them again once nothing uses
// that face: opening the Map shaped its text for about 100 ms, every time. So the screens' faces stay in use with all
// their letters: one hidden line wearing the screen's own class, one per idle moment after start-up, none of it in a
// key's task. "Taille du texte" follows, since the classes do.
const KEPT_TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789éèêàâçôîùû+-.,:;'’·«»?";
// 'a>b': a line of class b inside one of class a, for a class that takes its font from its parent.
const KEPT_FACES = [
  'olv-title', 'olv-sub', 'home-time', 'home-date', 'map-name', 'map-sub', 'map-formula', 'map-row-title', 'map-parapet-title', 'keyhint',
  'set-title engraved', 'set-rub', 'set-rtitle', 'set-rsub', 'set-row', 'set-row>set-row-label', 'set-row>set-row-value', 'set-note', 'set-app-name', 'set-btn', 'set-pv-label', 'set-house-letter',
  'cls-time', 'cls-date', 'cls-row-title', 'cls-name', 'cls-last brass', 'rpt-title', 'rpt-line', 'beuglante-msg',
];
const idle = (fn) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 50); };
function keepFaces() {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const host = el('div', 'kept-faces');
  host.setAttribute('aria-hidden', 'true');
  stage.appendChild(host);
  let n = 0;
  const next = () => {
    let line = host;
    for (const cls of KEPT_FACES[n++].split('>')) line = line.appendChild(el('div', cls));
    line.innerHTML = `<b>${KEPT_TEXT}</b>${KEPT_TEXT}`;
    if (n < KEPT_FACES.length) idle(next);
  };
  idle(next);
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') setTimeout(keepFaces, 4000);
// Resolves after `n` animation frames (or after `ms` if the page is hidden and frames do not come).
export function frames(n, ms) {
  return new Promise((resolve) => {
    let done = false; const end = () => { if (!done) { done = true; resolve(); } };
    const step = () => { if (--n <= 0) end(); else requestAnimationFrame(step); };
    requestAnimationFrame(step); setTimeout(end, ms);
  });
}
// The faces the Room of Requirement writes with.
const SET_FACES = ['1em "IM Fell English"', 'italic 1em "IM Fell English"', '1em "EB Garamond"', 'italic 500 1em "EB Garamond"', '1em Cinzel'];
const SAND_MS = 320;          // the sand falls through the hourglass before the list recomposes
const TURN_MS = 110;          // the right page follows the left one when the keys stop for this long
const ARRIVE = 'cubic-bezier(.32,.72,0,1)';   // --ease-arrive (base.css), for the Web Animations below
// A logo met for the first time has its SVG document parsed on the main thread, in the style pass that follows its mask: about
// 12 to 19 ms each on a 4x throttled CPU, whatever its size. So one per frame when its section shows, one per idle moment while
// the sections are prepared (four per frame made 50 to 115 ms frames at 4x).
const MASKS_PER_STEP = 1;
// The parapet list is the one long section (some 25 rows, 240 elements: about 100 ms of first style and layout at 4x): prepared
// in the background, it is built this many rows per idle moment, each piece laid out in the frame after.
const ROWS_PER_STEP = 5;
const SETTLE_MS = 320;        // --t-settle (base.css)
const WARM_QUIET_MS = 450;    // no section is built this soon after a key

// Hourglass: full = on the parapet, empty = in the Map. The bottom sand "falls" (scaleY) when the app is set down.
const HOURGLASS = '<svg class="set-glass" viewBox="0 0 24 32" aria-hidden="true">'
  + '<path class="g-frame" d="M4 2.5h16M4 29.5h16M6.5 2.5c0 8 5.5 10 5.5 13.5S6.5 21.5 6.5 29.5M17.5 2.5c0 8-5.5 10-5.5 13.5s5.5 5.5 5.5 13.5"/>'
  + '<path class="g-top" d="M8 5h8c0 4-4 6.5-4 9.5C12 11.5 8 9 8 5z"/>'
  + '<path class="g-bot" d="M7.5 27.5h9c0-5-4.5-8-4.5-11.5C12 19.5 7.5 22.5 7.5 27.5z"/></svg>';
// The preview is the Parapet itself at a fixed scale: its strip (.set-pv-stone, 52.1 cqw wide: the right page's text
// width) shows the real screen's band around the dock, so every size in it is the Parapet's own times PV_SCALE.
// Logos: home.js LOGO_H 3.6 and LOGO_W_MAX 12 (cqw of the screen). The pictures (assets/settings/) are cut from the
// real ones, never redrawn: the band y 680-920 of castle.jpg at 1000 x 125 px, and the owl sheet's perched cell.
const PV_SCALE = 0.521;

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export default {
  root: null, ctx: null, rub: 0, level: 'left', row: 0, items: [], axis: 'v', timers: [], reduced: false,
  resetStep: 0, listOff: 0, scrollList: null, sealed: null, busy: false, lastPerch: null, homeAsk: false, onHomeEvent: null, built: false,
  sheets: null,          // the sections built so far, laid out and put away: { id: { id, flow, mark, items, axis, start, H, flowH, measured, masks, more } }
  cur: null,             // the sheet in view
  turnTimer: 0,          // the right page is about to follow the left one
  focusEl: null,         // the line that wears .is-focus
  pvSig: '',             // what the preview's owl was last placed for

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = [];
    this.rub = 0; this.level = 'left'; this.row = 0; this.resetStep = 0; this.listOff = 0; this.scrollList = null;
    this.sealed = new Set(); this.busy = false; this.lastPerch = null; this.homeAsk = false; this.built = false; this.items = [];
    this.sheets = {}; this.cur = null; this.turnTimer = 0; this.focusEl = null; this.pvSig = ''; this.lastKey = 0;
    // The TV answers the HOME role request later (system dialog): the row repaints without a key press, or is built again when it shows.
    this.onHomeEvent = () => {
      if (!this.root || !this.built) return;
      if (RUBRIQUES[this.rub].id === 'home' && !this.homeAsk) this.renderRight('Touche Home');
      else if (this.sheets.home) this.sheets.home.stale = true;
    };
    document.addEventListener('poudlard:home', this.onHomeEvent);
    this.reduced = isReduced();
    root.classList.toggle('is-reduced', this.reduced);
    // Static markup only: no data enters here through innerHTML.
    root.innerHTML = `
      <div class="set-room">
        <div class="set-stars"></div>
        <div class="set-candle"></div>
        <div class="set-book">
          <div class="set-page set-left parchment">
            <div class="set-title engraved">Salle sur Demande</div>
            <ul class="set-rubs"><li class="set-mark"></li></ul>
            <div class="set-folio"></div>
          </div>
          <div class="set-spine"></div>
          <div class="set-page set-right parchment">
            <div class="set-sheet">
              <div class="set-rtitle"></div>
              <div class="set-rsub"></div>
              <div class="set-body"></div>
              <div class="set-msg"></div>
            </div>
            <div class="set-preview">
              <div class="set-pv-label"></div>
              <div class="set-pv-stone">
                <div class="set-pv-row"></div>
                <div class="set-pv-owl"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="keyhint"><span><b>${ARROW.up}${ARROW.down}</b><em></em></span><span><b>OK</b><em></em></span><span><b>${ARROWS_LR}</b><em></em></span><span><b>Retour</b><em></em></span></div>
      </div>`;
    // The router's transition and the pages' opening need the closed style of the layer and of its pages: a
    // style-only read (no layout) of the skeleton, which holds no text to shape yet.
    primeEnter(root);
    // The ledger opens: the left page folds over (rotateY), the right one fades in.
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (getConfig().sounds) ctx.fx.initAudio();
    // The writing comes once its fonts are there (a few milliseconds from the APK), while the pages open: one
    // layout in the right fonts, no synchronous layout in mount(). Keys stay with the router until then.
    await Promise.all([ctx.slice(), fontsReady(SET_FACES, 600)]);
    if (this.root !== root) return;
    root.querySelector('.set-folio').textContent = 'Registre des réglages';
    this.renderRubs();
    this.updateHint();
    // Then a piece per frame: the room's first layout is cut up (each page's text to shape), so no single frame holds it all while the
    // pages swing open.
    await ctx.slice();
    if (this.root !== root) return;
    this.showRub();
    // The section is measured two frames after it is laid out (useSheet); the preview's first style, layout and paint (its seven
    // logos) come in the frame after that, not in the same one.
    await ctx.slice();
    await ctx.slice();
    if (this.root !== root) return;
    this.renderPreview();
    this.readPage();                 // the first section was measured before the preview took its room
    this.built = true;
    this.warmSheets();
  },

  unmount() {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.onHomeEvent) document.removeEventListener('poudlard:home', this.onHomeEvent);
    this.onHomeEvent = null;
    this.items = []; this.root = null; this.scrollList = null; this.sheets = null; this.cur = null; this.focusEl = null;
  },

  // Test bench time multiplier (×3 slow motion).
  k() { return timeK(); },
  // `hold`: reading delay (a message that must stay legible), never shortened in reduced motion.
  later(fn, ms, hold) { const t = setTimeout(fn, ((this.reduced && !hold) ? Math.min(ms, 200) : ms) * this.k()); this.timers.push(t); return t; },

  // ---- Left page --------------------------------------------------------------------------------------------
  // The section's mark (.set-mark: a slip of lighter paper, quiet while the focus is on the other page) goes from line to line
  // by its transform; a line's height is a token of settings.css, so nothing is measured.
  renderRubs() {
    const ul = this.root.querySelector('.set-rubs');
    const mark = ul.querySelector('.set-mark');
    RUBRIQUES.forEach((r) => {
      const li = el('li', 'set-rub');
      li.appendChild(el('span', 'set-rub-label', r.label));
      ul.insertBefore(li, mark);
    });
    this.syncRubs();
  },
  syncRubs() {
    this.root.querySelector('.set-mark').style.transform = `translateY(calc(${this.rub} * var(--rub-h)))`;
    this.root.querySelector('.set-left').classList.toggle('is-away', this.level !== 'left');
  },
  rubEl() { return this.root.querySelectorAll('.set-rub')[this.rub]; },

  // Back to the sections: a single path, which always disarms the "Réinitialiser" (reset) double confirmation.
  toLeft() {
    this.level = 'left';
    if (this.resetStep) { this.resetStep = 0; this.renderRight('Réinitialiser'); }
    if (this.homeAsk) { this.homeAsk = false; this.renderRight('Touche Home'); }
    this.syncFocus();
  },

  // A key on the left page: the mark moves at once; the right page goes, and comes back with the section when the keys
  // stop. That part is the only work of any size, and it is out of the key's task.
  moveRub(n) {
    if (this.homeAsk && this.sheets.home) this.sheets.home.stale = true;   // the question stays behind: it is built again when it shows
    this.rub = n; this.resetStep = 0; this.homeAsk = false;
    this.syncRubs();
    this.root.querySelector('.set-sheet').classList.add('is-turning');
    clearTimeout(this.turnTimer);
    this.turnTimer = this.later(() => this.showRub(), TURN_MS, true);
  },
  // Entering the section before its timer has run.
  flushRub() { if (this.turnTimer) this.showRub(); },

  // Shows the section in place of the last one: its sheet if it was built, and it is built now otherwise.
  showRub() {
    clearTimeout(this.turnTimer); this.turnTimer = 0;
    const r = RUBRIQUES[this.rub];
    this.root.querySelector('.set-rtitle').textContent = r.title;
    this.root.querySelector('.set-rsub').textContent = r.sub;
    const msg = this.root.querySelector('.set-msg'); if (msg) msg.textContent = '';
    // Long sections (TV screens, About) take the preview's room. A class that only changes for them: an attribute set at every
    // move restyled the whole preview each time.
    this.root.querySelector('.set-right').classList.toggle('is-wide', Boolean(r.wide));
    this.listOff = 0;
    let sheet = this.sheets[r.id];
    if (!sheet || sheet.stale || (r.id === 'dock' && sheet.sig !== this.dockSig())) { if (sheet) sheet.flow.remove(); sheet = this.buildSheet(r); }
    else {
      this.grow(sheet, Infinity);                                   // still being prepared: the rest of its rows now
      sheet.items.forEach((it) => { if (it.paint) it.paint(); });   // a row's value may depend on another section's
    }
    this.useSheet(sheet);
    this.root.querySelector('.set-sheet').classList.remove('is-turning');
    this.readPage();
  },
  // The page's height for the section in view (its subtitle, the preview or not): read once laid out, never by a key. A sheet
  // measured in the background was measured under another section's title.
  readPage() {
    const root = this.root, sheet = this.cur;
    frames(2, 120).then(() => { if (this.root === root && this.cur === sheet && sheet.flow.isConnected) sheet.H = sheet.flow.parentElement.clientHeight; });
  },

  // After the room has opened: the other sections are built, laid out and painted out of sight (settings.css .is-away: opacity 0
  // on a layer of their own, everything else kept), one piece per idle moment and none while the keys are going; then measured and
  // given their logos. The next key finds each of them whole and painted: a section's move only changes two opacities.
  warmSheets() {
    const root = this.root;
    const idle = (fn) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 60); };
    // Waits for the keys to have stopped, then for an idle moment, and again if a key came in between.
    const whenQuiet = (fn) => {
      if (this.root !== root) return;
      const wait = WARM_QUIET_MS - (performance.now() - this.lastKey);
      if (wait > 0) { this.later(() => whenQuiet(fn), wait, true); return; }
      idle(() => { if (this.root === root) { if (performance.now() - this.lastKey < WARM_QUIET_MS) whenQuiet(fn); else fn(); } });
    };
    // Each piece is styled and laid out in the frame after it, before the next one (a sheet rebuilt meanwhile is left behind).
    const then = (sheet, fn) => frames(1, 60).then(() => whenQuiet(() => (this.sheets[sheet.id] === sheet ? fn() : next())));
    const next = () => {
      const r = RUBRIQUES.find((x) => x.id !== 'home' && !this.sheets[x.id]);
      if (!r) return;
      const sheet = this.buildSheet(r, true);
      const rows = () => {
        if (this.grow(sheet, ROWS_PER_STEP)) { then(sheet, rows); return; }
        // The layout read a frame after the last piece, clean by then; then its logos, one per idle moment.
        then(sheet, () => {
          this.measure(sheet);
          // Its SVG document is parsed here, in the idle moment (a style-only read), not in the frame after, where a key may be.
          const masks = () => {
            if (this.cur !== sheet) sheet.masks.splice(0, MASKS_PER_STEP).forEach(([m, src]) => { this.setMask(m, src); void getComputedStyle(m).webkitMaskImage; });   // in view: flushMasks
            if (sheet.masks.length && this.cur !== sheet) then(sheet, masks); else whenQuiet(next);
          };
          masks();
        });
      };
      then(sheet, rows);
    };
    this.after(1200, () => whenQuiet(next));
  },
  after(ms, fn) { const root = this.root; this.later(() => { if (this.root === root) fn(); }, ms, true); },

  // ---- Right page -------------------------------------------------------------------------------------------
  // Each section renders navigable "items": { id, el, key(action) → true (consumed) | 'exit' (back to the sections) | false }.
  // `axis`: 'v' (up/down) or 'h' (left/right). The single focus is set by syncFocus().
  // A section is laid in a sliding sheet (.set-flow): when it is taller than the page, the sheet slides (transform) to
  // keep the focused line in view, never a scrollbar, never a line hidden under the preview.
  // A section may leave part of its lines to later (`more`: functions that each add a piece, in order, to its own `items`): built
  // in the background (`lazy`, warmSheets), they come a few per idle moment; otherwise all at once. Built out of sight (.is-away);
  // useSheet shows it. `data-rub` is set before the sheet enters the page and never changes (settings.css).
  buildSheet(r, lazy) {
    const flow = el('div', 'set-flow is-away');
    flow.dataset.rub = r.id;
    this.root.querySelector('.set-body').appendChild(flow);
    const sheet = { id: r.id, flow, mark: null, items: [], axis: 'v', start: 0, H: 0, flowH: 0, measured: false, masks: [], more: [], sig: r.id === 'dock' ? this.dockSig() : '' };
    this.building = sheet;
    const spec = this['rub_' + r.id](flow);
    this.building = null;
    sheet.items = spec.items; sheet.axis = spec.axis || 'v'; sheet.start = typeof spec.start === 'number' ? spec.start : 0;
    sheet.more = spec.more || [];
    sheet.mark = el('i', 'set-focus');
    flow.appendChild(sheet.mark);
    this.sheets[r.id] = sheet;
    if (!lazy) this.grow(sheet, Infinity);
    return sheet;
  },
  // Adds up to `n` of a sheet's pending pieces; true if some are still to come.
  grow(sheet, n) {
    if (!sheet.more.length) return false;
    this.building = sheet;
    sheet.more.splice(0, n).forEach((add) => add());
    this.building = null;
    return sheet.more.length > 0;
  },
  dockSig() { const c = getConfig(); return JSON.stringify([c.dock, c.hidden]); },
  useSheet(sheet, keep) {
    this.cur = sheet;
    Object.values(this.sheets).forEach((x) => x.flow.classList.toggle('is-away', x !== sheet));
    sheet.flow.style.transform = `translateY(${this.listOff}px)`;
    this.scrollList = sheet.flow;
    this.items = sheet.items; this.axis = sheet.axis;
    // Restore the focus on an id (after a parapet change), otherwise on the requested position.
    let idx = sheet.start;
    if (keep != null) { const f = this.items.findIndex((it) => it.id === keep); if (f >= 0) idx = f; }
    this.row = Math.min(Math.max(0, idx), Math.max(0, this.items.length - 1));
    this.syncFocus();
    const root = this.root;
    this.flushMasks(sheet);
    if (!sheet.measured) frames(2, 120).then(() => { if (this.root === root && this.cur === sheet) { this.measure(sheet); this.syncFocus(); this.keepVisible(true); } });
    else this.keepVisible(true);
  },
  // A section changed: it is built again, in place.
  renderRight(keep) {
    const r = RUBRIQUES[this.rub];
    const msg = this.root.querySelector('.set-msg'); if (msg) msg.textContent = '';
    const old = this.sheets[r.id];
    const sheet = this.buildSheet(r);
    if (old) old.flow.remove();
    this.useSheet(sheet, keep);
  },
  // The lines' places in their sheet, read once, the layout being clean by then; a move only uses them.
  measure(sheet) {
    if (sheet.measured || !sheet.flow.isConnected) return;
    sheet.measured = true;
    const flow = sheet.flow, body = flow.parentElement;
    sheet.H = body.clientHeight; sheet.flowH = flow.scrollHeight;
    sheet.pad = Math.round(body.clientWidth * 0.01);
    let h0 = 0;
    sheet.items.forEach((it) => {
      let top = 0; for (let n = it.el; n && n !== flow; n = n.offsetParent) top += n.offsetTop;
      it.top = top; it.h = it.el.offsetHeight;
      it.bottom = top + it.h;
      if (it.note) it.bottom = Math.max(it.bottom, it.note.offsetTop + it.note.offsetHeight);   // a line's note is read with it
      if (!h0 && (it.el.classList.contains('set-row') || it.el.classList.contains('set-app'))) h0 = it.h;
    });
    sheet.h0 = h0;
    if (h0) sheet.mark.style.height = `${h0}px`;
  },
  // What was measured may no longer hold: read again once the page is laid out, the other sections when they show.
  remeasure() {
    Object.values(this.sheets).forEach((x) => { x.measured = false; });
    const root = this.root, sheet = this.cur;
    sheet.waiting = true;                                           // the key that brought us here does not read the layout for it
    frames(2, 120).then(() => {
      sheet.waiting = false;
      if (this.root !== root || this.cur !== sheet) return;
      this.measure(sheet);
      this.placeFocus();
      this.keepVisible();
    });
  },
  syncFocus() {
    const it = this.level === 'right' ? this.items[this.row] : null;
    const next = it ? it.el : null;
    if (this.focusEl !== next) {
      if (this.focusEl) this.focusEl.classList.remove('is-focus');
      if (next) next.classList.add('is-focus');
      this.focusEl = next;
    }
    this.syncRubs();
    this.updateHint();
    this.placeFocus();
    this.placePreviewOwl();
  },
  // The mark on the right page: what the lifted row stands on, on the rows and the parapet list (a button or a seal
  // carries its own focus). Only its transform moves; it fades in where the focus lands from the left page.
  placeFocus() {
    const sheet = this.cur; if (!sheet || !sheet.mark) return;
    const it = this.level === 'right' ? this.items[this.row] : null;
    if (sheet.waiting) return;
    if (it && !sheet.measured) this.measure(sheet);
    const on = Boolean(it && sheet.h0 && (it.el.classList.contains('set-row') || it.el.classList.contains('set-app')));
    if (on) {
      const was = sheet.mark.classList.contains('is-on');
      if (!was) sheet.mark.style.transition = 'none';
      sheet.mark.style.transform = `translateY(${it.top}px) scaleY(${(it.h / sheet.h0).toFixed(3)})`;
      if (!was) { const m = sheet.mark; frames(2, 100).then(() => { m.style.transition = ''; }); }
    }
    sheet.mark.classList.toggle('is-on', on);
  },

  // "label ... value" row with a wax seal that presses on every change.
  enumRow(parent, label, options, get, set, noteFn) {
    const row = el('div', 'set-row');
    row.appendChild(el('span', 'set-row-label', label));
    const val = el('span', 'set-row-val');
    const left = el('i', 'set-arrow set-arrow-l', '‹'), right = el('i', 'set-arrow set-arrow-r', '›');
    const value = el('b', 'set-row-value');
    val.append(left, value, right);
    row.appendChild(val);
    parent.appendChild(row);
    let note = null;
    if (noteFn) { note = el('div', 'set-note'); parent.appendChild(note); }
    let lastValue = null, lastNote = null;
    const idx = () => Math.max(0, options.findIndex((o) => o[0] === get()));
    const paint = () => {
      const i = idx();
      if (options[i][1] !== lastValue) { lastValue = options[i][1]; value.textContent = lastValue; }
      left.classList.toggle('is-off', i === 0);
      right.classList.toggle('is-off', i === options.length - 1);
      if (note) { const t = noteFn(options[i][0]); if (t !== lastNote) { lastNote = t; note.textContent = t; } }
    };
    paint();
    const change = (i) => {
      set(options[i][0]);
      paint();
      this.writeIn(value); if (note) this.writeIn(note);
      this.ctx.fx.chime(1319, 0.03);
      this.placePreviewOwl();                       // the preview reacts (owl absent, etc.)
      this.remeasure();                             // its note may now take another line, "Taille du texte" moves everything
    };
    return {
      id: label, el: row, paint, note,
      key: (a) => {
        const i = idx();
        if (a === 'left') { if (i === 0) return 'exit'; change(i - 1); return true; }
        if (a === 'right') { if (i < options.length - 1) change(i + 1); else this.nudge(row); return true; }
        if (a === 'ok') { change((i + 1) % options.length); return true; }
        return false;
      },
    };
  },

  // Quill-drawn button (frame).
  button(parent, label, onOk, cls) {
    const b = el('div', 'set-btn' + (cls ? ' ' + cls : ''));
    b.appendChild(el('span', null, label));
    parent.appendChild(b);
    return { id: label, el: b, key: (a) => (a === 'ok' ? (onOk(b), true) : false) };
  },

  // App logo in ink (ivory would not read on parchment); fallback: initials in quill.
  inkLogo(id, h) {
    const L = logoOf(id);
    const box = el('span', 'set-inklogo');
    box.style.height = h + 'cqw';
    if (!L) { box.classList.add('is-text'); box.textContent = (appById(id) || { name: '?' }).name.slice(0, 2); box.style.width = h * 1.6 + 'cqw'; return box; }
    box.style.width = Math.min(h * 2.6, h * L.ratio) + 'cqw';
    const m = el('i');
    if (L.luma) m.classList.add('luma');
    box.appendChild(m);
    if (this.building) this.building.masks.push([m, L.src]); else this.setMask(m, L.src);
    return box;
  },

  setMask(m, src) { m.style.webkitMaskImage = `url("${src}")`; m.classList.add('is-set'); },
  // A sheet's logos get their pictures once it shows, one per frame (MASKS_PER_STEP).
  flushMasks(sheet) {
    const root = this.root;
    const step = () => {
      if (this.root !== root || this.cur !== sheet || !sheet.masks.length) return;
      sheet.masks.splice(0, MASKS_PER_STEP).forEach(([m, src]) => this.setMask(m, src));
      if (sheet.masks.length) requestAnimationFrame(step);
    };
    if (sheet.masks.length) requestAnimationFrame(step);
  },

  // ---- Section: Home key (Free My TV's "Home Screen" row) -----------------------------------------------------
  // First line, one button: « Revenir à l’accueil de la télé » (openTvHome), the plain way out. Then one row, two
  // answers. Giving the key back from the row asks a confirmation (focus on "Non"); taking it asks the system, which
  // answers with a hint (the TV's own dialog, or "press Home"). In the mock-up the row is read-only.
  rub_home(body) {
    const mode = Platform.homeMode();
    const mock = !Platform.isTV() || mode === 'simulated';
    const dev = Platform.device();
    if (dev.phone) {
      body.appendChild(el('p', 'set-text', 'Pas une télé : la touche Home n’est pas demandée.'));
      return { items: [], axis: 'v', start: 0 };
    }
    if (this.homeAsk) {
      body.appendChild(el('p', 'set-text set-ask', 'Rendre l’accueil d’origine ?'));
      body.appendChild(el('p', 'set-text set-note-dim', 'La touche Home rouvrira l’accueil de la télé. Poudlard TV reste dans la liste des applis.'));
      const btns = el('div', 'set-btns'); body.appendChild(btns);
      const items = [
        this.button(btns, 'Oui', () => { this.homeAsk = false; this.giveHome(); }, 'set-btn-nox'),
        this.button(btns, 'Non', () => { this.homeAsk = false; this.renderRight('Touche Home'); }),
      ];
      return { items, axis: 'h', start: 1 };
    }
    const out = this.tvHomeButton(body, mode);
    if (dev.fireTv) {               // Fire TV never hands the Home key over: no row, one honest note
      body.appendChild(el('p', 'set-text', HOME_HINT.fire));
      return { items: [out], axis: 'v', start: 0 };
    }
    if (mode === 'reverted') {      // the guard gave the key back after three crashes: say so, OK asks again
      body.appendChild(el('p', 'set-text', 'Rendue après trois pannes : la touche Home est à l’accueil d’origine.'));
      return { items: [out, this.button(body, 'Redemander la touche Home', () => { this.takeHome(); this.later(() => this.root && this.renderRight('Redemander la touche Home'), 600, true); })], axis: 'v', start: 0 };
    }
    // `homePending`: the key was asked for and the system has not answered yet (the row shows the wish, the
    // message band the hint); the 'poudlard:home' event then repaints the truth.
    this.homePending = null;
    const row = this.enumRow(body, 'Touche Home', HOME_MODES, () => this.homePending || (mode === 'original' ? 'original' : 'poudlard'), (v) => {
      if (v === 'original') { this.homeAsk = true; this.renderRight(); return; }
      this.takeHome();
    }, (v) => (mock ? HOME_NOTE_MOCK : this.homePending ? 'La télé décide : lisez le message en bas de page.' : v === 'poudlard' ? 'Poudlard répond à la touche Home.' : 'L’accueil d’origine répond à la touche Home. OK ou la flèche gauche pour la rendre à Poudlard.'));
    if (mock) {
      row.el.classList.add('is-off');
      const nudge = () => { this.nudge(row.el); this.say(HOME_NOTE_MOCK); return true; };
      row.key = (a) => (a === 'left' ? 'exit' : (a === 'right' || a === 'ok') ? nudge() : false);
    }
    body.appendChild(el('div', 'set-note set-note-dim', 'Rien n’est désactivé sur la télé : désinstaller Poudlard TV rend toujours la touche Home à l’accueil d’origine.'));
    return { items: [out, row], axis: 'v', start: 0 };
  },
  // The way-out button and its note, read with it (measure: `note`). One press, no confirmation: nothing is lost,
  // Poudlard TV stays in the app list and the row below takes the key again.
  tvHomeButton(body, mode) {
    const out = this.button(body, TV_HOME, () => {
      const r = openTvHome(mode);
      if (mode === 'simulated' || !Platform.isTV()) { this.nudge(out.el); this.say(r.text); return; }
      if (r.ok) this.ctx.fx.whoosh();
      this.renderRight(TV_HOME);        // the row below now says who holds the key
      this.say(r.text);
    });
    out.note = el('div', 'set-note set-note-dim', TV_HOME_NOTE(mode));
    body.appendChild(out.note);
    return out;
  },
  takeHome() {
    const r = Platform.setHome('poudlard');
    if (r.status === 'failed') { this.say(r.error); return; }
    this.homePending = 'poudlard';
    this.say(HOME_HINT[r.hint] || HOME_HINT['press-home']);
  },
  giveHome() {
    const r = Platform.setHome('original');
    this.renderRight('Touche Home');
    if (r.status === 'failed') { this.say(r.error); return; }
    this.ctx.fx.whoosh();
    this.say('La touche Home revient à l’accueil d’origine.');
  },

  // ---- Section: the TV's own settings (Free My TV's "TV Settings" entry) --------------------------------------
  rub_tv(body) {
    const dev = Platform.device();
    if (/samsung/i.test(dev.manufacturer) && dev.sdk && dev.sdk < 28) {   // Free My TV field report: the menu freezes those sets
      body.appendChild(el('p', 'set-text', 'Sur cette Samsung, utilisez la touche Réglages de la télécommande (le menu fige la télé depuis une appli).'));
      return { items: [], axis: 'v', start: 0 };
    }
    const items = TV_SCREENS.map(([key, label]) => this.button(body, label, () => this.openSystem(key)));
    return { items, axis: 'v', start: 0 };
  },
  openSystem(key, arg) {
    const r = Platform.openSystem(key, arg);
    if (r.status === 'simulated') { this.say(TV_ONLY); return; }
    if (r.status === 'failed') { this.say(r.error); return; }
    this.ctx.fx.chime(1319, 0.03);
  },

  // ---- Section: Parapet and apps ----------------------------------------------------------------------------
  rub_dock(body) {
    const c = getConfig();
    // On the TV, the catalog apps it does not have are left out (the parapet's own entries always stay, so a
    // slot held by an app the TV lacks can be freed here); the mock-up (installed() is null) lists the catalog.
    const inst = Platform.installed();
    const absent = (a) => Boolean(inst && a.pkg && !inst.has(a.pkg));
    const apps = allApps().filter((a) => a.onDock || a.custom || !absent(a));
    const onDock = c.dock.map((id) => apps.find((a) => a.id === id)).filter(Boolean);
    const others = apps.filter((a) => !a.onDock);
    const items = [];
    const list = el('div', 'set-list');
    body.appendChild(list);
    const head = el('div', 'set-list-head');
    head.appendChild(el('span', null, 'Sur le parapet'));
    head.appendChild(el('span', 'set-count', `${onDock.length} sur ${DOCK_MAX}`));
    list.appendChild(head);
    if (!onDock.length) list.appendChild(el('div', 'set-empty', 'Le parapet est vide : la Carte garde tout.'));
    const mk = (a, pos) => {
      const row = el('div', 'set-app' + (a.onDock ? ' is-on' : '') + (a.hidden ? ' is-hidden' : ''));
      row.dataset.id = a.id;
      row.appendChild(el('span', 'set-app-rank', a.onDock ? String(pos + 1) : ''));
      row.appendChild(this.inkLogo(a.id, 1.5));
      row.appendChild(el('span', 'set-app-name', a.name));
      // Tag: "absente" (the TV does not have it), "cachée" (ink faded to 35%); a hand-added app (V4) also carries "perso".
      const tag = [absent(a) ? 'absente' : a.hidden ? 'cachée' : '', a.custom ? 'perso' : ''].filter(Boolean).join(' · ');
      if (tag) row.appendChild(el('span', 'set-app-hidden', tag));
      const g = el('span', 'set-app-glass'); g.innerHTML = HOURGLASS; row.appendChild(g);
      if (this.sealed.has(a.id)) row.appendChild(el('i', 'set-rowseal wax-seal is-sealed'));   // kept seals survive the re-render
      return row;
    };
    // The rows come as pieces (buildSheet `more`), in list order: ROWS_PER_STEP per idle moment when prepared in the background.
    const add = (a, pos) => { const row = mk(a, pos); list.appendChild(row); items.push({ id: a.id, el: row, key: (k) => this.dockKey(a.id, k, row) }); };
    const pieces = onDock.map((a, n) => () => add(a, n));
    pieces.push(() => {
      const head2 = el('div', 'set-list-head');
      head2.appendChild(el('span', null, 'Dans la Carte du Maraudeur'));
      list.appendChild(head2);
    });
    others.forEach((a) => pieces.push(() => add(a, -1)));
    return { items, axis: 'v', start: 0, more: pieces };
  },
  dockKey(id, action, row) {
    const c = getConfig();
    const pos = c.dock.indexOf(id);
    if (action === 'ok') {
      if (pos < 0 && c.dock.length >= DOCK_MAX) {
        this.say('Le parapet est plein : retirez d’abord une appli.');
        this.nudge(row);
        return true;
      }
      // Two beats: 1) the existing row toggles, the sand falls (or drains) in its hourglass, the seal presses;
      // 2) after the fall, the list recomposes and the row slides to its new block (FLIP).
      const adding = pos < 0;
      row.classList.toggle('is-on', adding);
      this.sealed.add(id);
      this.press(this.sealOf(row));
      if (adding) this.ctx.fx.chime(1568, 0.03); else this.ctx.fx.whoosh();
      updateConfig({ dock: adding ? [...c.dock, id] : c.dock.filter((x) => x !== id) });
      this.renderPreview();
      this.busy = true;
      this.later(() => { this.busy = false; if (this.root) this.flipRebuild(id); }, SAND_MS);
      return true;
    }
    if (action === 'longok') {
      // Hide / reveal in the Map: only for an app that is not on the parapet.
      if (pos >= 0) { this.say('Retirez-la d’abord du parapet pour la cacher.'); this.nudge(row); return true; }
      const wasHidden = c.hidden.includes(id);
      updateConfig({ hidden: wasHidden ? c.hidden.filter((x) => x !== id) : [...c.hidden, id] });
      this.sealed.add(id);
      this.renderRight(id);
      const r = this.items[this.row] && this.items[this.row].el;
      if (r) { this.press(this.sealOf(r)); this.writeIn(r.querySelector('.set-app-hidden')); this.writeIn(r.querySelector('.set-app-name')); }
      this.ctx.fx.chime(wasHidden ? 1319 : 880, 0.03);
      return true;
    }
    if (action === 'left' || action === 'right') {
      if (pos < 0) { if (action === 'left') return 'exit'; this.nudge(row); return true; }
      const to = pos + (action === 'left' ? -1 : 1);
      if (to < 0 || to >= c.dock.length) { this.nudge(row); return true; }
      const dock = c.dock.slice();
      [dock[pos], dock[to]] = [dock[to], dock[pos]];
      updateConfig({ dock });
      this.sealed.add(id);
      this.swapRows(pos, to);
      this.cur.sig = this.dockSig();
      this.press(this.sealOf(row)); this.writeIn(row.querySelector('.set-app-rank'));
      this.ctx.fx.chime(1175, 0.025);
      return true;
    }
    return false;
  },
  // Its seal, drawn the first time it is pressed.
  sealOf(row) {
    let seal = row.querySelector('.set-rowseal');
    if (!seal) { seal = el('i', 'set-rowseal wax-seal'); row.appendChild(seal); }
    return seal;
  },
  // Two neighbours of the parapet change places: no rebuild, nothing measured. The rows are of one height: they swap their
  // places in the list and their ranks, and slide there from where they were (transform). The preview does the same.
  swapRows(a, b) {
    const hi = Math.min(a, b), lo = Math.max(a, b);
    const upper = this.items[hi], lower = this.items[lo];
    lower.el.after(upper.el);
    this.items[hi] = lower; this.items[lo] = upper;
    const rankU = upper.el.querySelector('.set-app-rank'), rankL = lower.el.querySelector('.set-app-rank');
    rankU.textContent = String(lo + 1); rankL.textContent = String(hi + 1);
    const dy = upper.top === undefined ? 0 : lower.top - upper.top;
    if (upper.top !== undefined) { const t = upper.top; upper.top = lower.top; lower.top = t; upper.bottom = upper.top + upper.h; lower.bottom = lower.top + lower.h; }
    this.row = b;
    if (dy && !this.reduced) {
      const k = this.k(), o = { duration: SETTLE_MS * k, easing: ARRIVE, composite: 'add' };
      upper.el.animate([{ transform: `translateY(${-dy}px)` }, { transform: 'translateY(0)' }], o);
      lower.el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], o);
    }
    const slots = this.root.querySelectorAll('.set-pv-app');
    if (slots[hi] && slots[lo]) { slots[lo].after(slots[hi]); this.pvSig = ''; this.pvMeasure = null; }
    this.placeFocus();
    this.keepVisible();
    this.placePreviewOwl();
  },
  // A place in the list changed: the section is built again, and each moved row slides from where it was (transform only).
  flipRebuild(id) {
    const before = new Map(this.items.map((it) => [it.id, it.top]));
    this.renderRight(id);
    this.renderPreview();
    if (this.reduced) return;
    const sheet = this.cur;
    this.measure(sheet);
    this.placeFocus();
    this.keepVisible();
    this.items.forEach((it) => {
      const was = before.get(it.id);
      if (was == null || was === it.top) return;
      it.el.animate([{ transform: `translateY(${was - it.top}px)` }, { transform: 'translateY(0)' }], { duration: SETTLE_MS * this.k(), easing: ARRIVE, composite: 'add' });
    });
  },
  // Ephemeral message written in quill, placed at the bottom of the page (outside the sliding list: always visible).
  say(text) {
    const m = this.root.querySelector('.set-msg'); if (!m) return;
    m.textContent = text; this.writeIn(m);
    // Reading time grows with the sentence (the TV's own messages can be long): 2.6 s at least, 9 s at most.
    this.later(() => { if (m.textContent === text) m.textContent = ''; }, Math.min(9000, Math.max(2600, 1200 + text.length * 55)), true);
  },
  // Stop: small sideways refusal, composited with the focus transform (the row does not "jump").
  nudge(row) {
    if (this.reduced || !row) return;
    row.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-.4cqw)' }, { transform: 'translateX(.3cqw)' }, { transform: 'translateX(0)' }], { duration: 220 * this.k(), composite: 'add' });
  },

  // ---- Section: House ---------------------------------------------------------------------------------------
  rub_house(body) {
    const c = getConfig();
    const wrap = el('div', 'set-houses');
    body.appendChild(wrap);
    const items = [];
    const ids = Object.keys(HOUSES);
    ids.forEach((id) => {
      const h = HOUSES[id];
      const card = el('div', 'set-house' + (c.house === id ? ' is-on' : ''));
      card.style.setProperty('--wax', h.wax);
      card.style.setProperty('--house-glow', h.glow);
      const seal = el('div', 'set-house-seal wax-seal');
      seal.appendChild(el('span', 'set-house-letter', h.name[0]));
      card.appendChild(seal);
      card.appendChild(el('div', 'set-house-name', h.name));
      card.appendChild(el('div', 'set-house-state', c.house === id ? 'Votre maison' : ''));
      wrap.appendChild(card);
      items.push({
        id, el: card,
        key: (a) => {
          if (a !== 'ok') return false;
          updateConfig({ house: id });                 // main.js tints --wax and --house-glow via onConfigChange
          this.cur.start = ids.indexOf(id);
          wrap.querySelectorAll('.set-house').forEach((x) => { x.classList.toggle('is-on', x === card); x.querySelector('.set-house-state').textContent = x === card ? 'Votre maison' : ''; });
          this.press(seal); this.writeIn(card.querySelector('.set-house-state'));
          this.ctx.fx.chime(1046, 0.035);
          this.renderPreview();
          return true;
        },
      });
    });
    body.appendChild(el('div', 'set-note', c.house ? 'Un seul sceau à la fois. OK pour en changer.' : 'Aucune maison choisie : la cire reste rouge de Gryffondor.'));
    return { items, axis: 'h', start: Math.max(0, ids.indexOf(c.house)) };
  },

  // ---- Section: Owl and sounds ------------------------------------------------------------------------------
  rub_owl(body) {
    const items = [
      this.enumRow(body, 'Chouette', OWL, () => getConfig().owl, (v) => updateConfig({ owl: v }),
        (v) => ({ vive: 'Elle vole à chaque pas et se pose sur l’appli.', calme: 'Elle ne vole que pour les longs trajets ; sinon, un fondu.', absente: 'Le médaillon s’allume seul. Elle reste à la volière.' })[v]),
      this.enumRow(body, 'Sons', YESNO, () => getConfig().sounds, (v) => { updateConfig({ sounds: v }); if (v) this.ctx.fx.initAudio(); },
        (v) => (v ? 'Une clochette par pas, un accord à l’allumage ; la musique de fond se règle juste en dessous.' : 'Silence complet, musique comprise.')),
      // Background music: defensive read (config.music may not exist yet → 'Auto'), sound.js follows live.
      this.enumRow(body, 'Musique de fond', MUSIC, () => getConfig().music || 'auto', (v) => { updateConfig({ music: v }); this.ctx.fx.ambient(v); },
        (v) => MUSIC_NOTE[v]),
      this.enumRow(body, 'Musique en veille', MUSIC_NOX, () => getConfig().musicNox || 'pause', (v) => { updateConfig({ musicNox: v }); if (this.ctx.fx.ambientHold && v === 'continue') this.ctx.fx.ambientHold(false, 'nox'); },
        (v) => (v === 'continue' ? 'Le château s’endort, la musique continue, très bas.' : 'Quand le château s’endort, la musique se tait ; elle reprend au réveil.')),
    ];
    return { items, axis: 'v', start: 0 };
  },

  // ---- Section: Motion and energy ---------------------------------------------------------------------------
  rub_motion(body) {
    // The ambience row says when reduced motion holds it still: the two reduced-motion rows repaint its note.
    let ambiance = null;
    const reflow = () => { this.reduced = isReduced(); this.root.classList.toggle('is-reduced', this.reduced); if (ambiance) ambiance.paint(); };
    // A motion set here is the person's own choice (`motionChosen`): no automatic migration may ever change it again.
    const motion = this.enumRow(body, 'Mouvement', MOTION, () => getConfig().motion, (v) => { updateConfig({ motion: v, motionChosen: true }); reflow(); }, (v) => MOTION_NOTE[v]);
    // Saved through updateConfig like every row: the Parapet (onConfigChange) starts or stops its two loops itself.
    ambiance = this.enumRow(body, 'Ambiance vivante', AMBIANCE, () => getConfig().ambiance || 'calme', (v) => updateConfig({ ambiance: v }), AMBIANCE_NOTE);
    const items = [
      motion,
      ambiance,
      this.enumRow(body, 'Ciel', SKY, () => getConfig().sky || 'auto', (v) => updateConfig({ sky: v }),
        (v) => (v === 'auto' ? 'Crépuscule, nuit, nuit profonde, aube : le ciel suit l’heure.' : 'Une nuit claire, toujours.')),
      this.enumRow(body, 'Suivre le système', FOLLOW, () => getConfig().motionSystem || 'follow', (v) => { updateConfig({ motionSystem: v }); reflow(); },
        (v) => (v === 'follow'
          ? (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Le système demande des animations réduites : Poudlard les réduit aussi.' : 'Si le système demande des animations réduites, Poudlard les réduit aussi.')
          : 'Le réglage du système est ignoré : seule la ligne « Mouvement » compte.')),
      this.enumRow(body, 'Taille du texte', TEXT, () => getConfig().text || 'normal', (v) => updateConfig({ text: v }),
        (v) => (v === 'grand' ? 'Toutes les écritures un quart plus grandes.' : 'La taille prévue pour trois mètres.')),
    ];
    return { items, axis: 'v', start: 0 };
  },

  // ---- Section: Idle ----------------------------------------------------------------------------------------
  rub_idle(body) {
    const items = [this.enumRow(body, 'Nox après', IDLE, () => getConfig().idleSeconds, (v) => updateConfig({ idleSeconds: v }),
      (v) => (v ? 'Les fenêtres du château s’éteignent une à une, l’horloge change de coin. Une touche réveille tout.' : 'La télé ne s’endort jamais d’elle-même.'))];
    return { items, axis: 'v', start: 0 };
  },

  // ---- Section: Classic mode --------------------------------------------------------------------------------
  rub_classic(body) {
    body.appendChild(el('p', 'set-text', 'Le mode classique garde le même parapet, le même ordre et les mêmes applis, sans château, sans chouette, sans décor. Retour maintenu deux secondes rallume Poudlard.'));
    body.appendChild(el('p', 'set-text set-ask', 'Passer en mode classique ?'));
    const btns = el('div', 'set-btns'); body.appendChild(btns);
    const items = [
      this.button(btns, 'Oui, Nox', () => this.goClassic(), 'set-btn-nox'),
      this.button(btns, 'Non', () => this.toLeft()),
    ];
    return { items, axis: 'h', start: 1 };   // focus starts on "Non": never a switch by accident
  },
  goClassic() {
    updateConfig({ mode: 'classique' });
    this.ctx.fx.whoosh();
    this.ctx.router.replace('classic', {}, 'fade');
  },

  // ---- Section: About ---------------------------------------------------------------------------------------
  rub_about(body) {
    const facts = el('div', 'set-facts'); body.appendChild(facts);
    const mode = Platform.homeMode();
    const homeLabel = mode === 'simulated' ? 'Maquette' : mode === 'reverted' ? 'Rendue après trois pannes' : (HOME_MODES.find((m) => m[0] === mode) || HOME_MODES[1])[1];
    const version = Platform.version();
    const dev = Platform.device();
    [['Réseau', 'Aucune connexion, aucune donnée collectée.'], ['Version', version ? `Télé ${version} · ${VERSION}` : VERSION], ['Touche Home', homeLabel],
      ...(dev.sdk ? [['Télé', `${dev.manufacturer} ${dev.model} · ${androidName(dev.sdk)}`]] : []),
      ['Veille', 'Celle de la télé reste la sienne : Poudlard ne garde jamais l’écran allumé.'],
      ['Lancement', 'Par intent explicite, sur des applis connues seulement.'], ['Réversible', 'L’accueil d’origine reste installé ; rien n’est désactivé.']]
      .forEach(([k, v]) => { const f = el('div', 'set-fact'); f.appendChild(el('span', 'set-fact-k', k)); f.appendChild(el('span', 'set-fact-v', v)); facts.appendChild(f); });
    const acts = el('div', 'set-acts'); body.appendChild(acts);
    const note = el('div', 'set-anote'); body.appendChild(note);
    const corner = el('i', 'set-rowseal wax-seal set-seal-corner');
    this.resetStep = 0;
    const exitsBtn = this.button(acts, 'Les issues de secours', () => { this.press(corner); this.ctx.router.go('sorting', { page: 3, only: true }, 'fade'); });
    const resetBtn = this.button(acts, 'Réinitialiser', (b) => {
      // Double confirmation: the label changes twice before wiping. Back, Left or Menu cancel at any time.
      this.resetStep += 1;
      const label = b.querySelector('span');
      if (this.resetStep === 1) { label.textContent = 'Tout effacer ? OK pour confirmer'; this.writeIn(label); note.textContent = 'Parapet, chouette, veille : tout revient à l’état neuf.'; this.writeIn(note); return; }
      if (this.resetStep === 2) { label.textContent = 'Dernière fois : OK efface tout'; this.writeIn(label); b.classList.add('set-btn-nox'); return; }
      resetConfig();
      this.resetStep = 0; this.sealed.clear();
      this.ctx.fx.whoosh();
      Object.values(this.sheets).forEach((x) => { if (x !== this.cur) x.flow.remove(); });
      this.sheets = { [this.cur.id]: this.cur };
      this.renderRight('Réinitialiser'); this.renderPreview();
      this.say('Registre effacé. La Lettre d’admission reviendra au prochain allumage.');
    });
    const items = [
      exitsBtn,
      resetBtn,
      this.button(acts, 'Relancer la Lettre d’admission', () => { this.ctx.router.replace('sorting', {}, 'fade'); }),
    ];
    body.appendChild(corner);
    return { items, axis: 'v', start: 0 };
  },

  // ---- Miniature preview of the parapet ---------------------------------------------------------------------
  renderPreview() {
    const row = this.root.querySelector('.set-pv-row');
    row.textContent = '';
    const dock = getConfig().dock;
    // The counter lives here too: the preview is always visible, even once the list has slid.
    const n = dock.length;
    this.root.querySelector('.set-pv-label').textContent = `Le Parapet, en direct · ${n ? `${n} ${n > 1 ? 'applis' : 'appli'} sur ${DOCK_MAX}` : 'aucune appli'}`;
    this.pvSig = ''; this.pvMeasure = null;
    row.classList.toggle('is-few', n > 0 && n <= 3);              // 1 to 3 apps: packed closer, as on the Parapet
    if (!n) { row.appendChild(el('span', 'set-pv-empty', 'Le parapet est vide')); this.placePreviewOwl(); return; }
    dock.forEach((id) => {
      const L = logoOf(id);
      const slot = el('div', 'set-pv-app'); slot.dataset.id = id;
      if (L) {
        const box = logoBox(L, 3.6 * PV_SCALE, 12 * PV_SCALE);  // the Parapet's own logo box, scaled
        slot.style.width = box.w.toFixed(2) + 'cqw'; slot.style.height = box.h.toFixed(2) + 'cqw';
        const logo = el('div', 'app-logo' + (L.luma ? ' luma' : ''));
        logo.style.setProperty('--m', `url("${L.src}")`);
        // One masked layer, not the parapet's five (relief offsets of 0.1 cqw do not show at this size): each masked
        // layer paints its SVG logo on the main thread, and thirty of them made the room's first paint ~2× longer.
        logo.innerHTML = '<i class="l-base"></i>';
        slot.appendChild(logo);
      } else {
        slot.style.width = '3cqw'; slot.style.height = '1.9cqw';
        slot.appendChild(el('span', 'set-pv-text', (appById(id) || { name: '?' }).name.slice(0, 3)));
      }
      row.appendChild(slot);
    });
    this.placePreviewOwl();
  },
  // The miniature owl perches above the focused app if it is on the parapet; otherwise it stays on its
  // last perch. The logo only lifts for a parapet app that is actually in focus.
  // Nothing happens unless that changes; the logos' places are read once, in an animation frame, when the row is drawn.
  placePreviewOwl() {
    const root = this.root; if (!root) return;
    const owl = root.querySelector('.set-pv-owl'); if (!owl) return;
    const c = getConfig();
    const gone = c.owl === 'absente' || !c.dock.length;
    const cur = this.level === 'right' && RUBRIQUES[this.rub].id === 'dock' && this.items[this.row] ? this.items[this.row].id : null;
    const onDock = Boolean(cur && c.dock.includes(cur));
    const id = onDock ? cur : (this.lastPerch && c.dock.includes(this.lastPerch) ? this.lastPerch : c.dock[0]);
    const sig = `${gone}|${onDock}|${id}`;
    if (sig === this.pvSig) return;
    this.pvSig = sig;
    owl.classList.toggle('is-gone', gone);
    requestAnimationFrame(() => {
      if (!this.root) return;
      const slots = this.root.querySelectorAll('.set-pv-app');
      if (!this.pvMeasure) {
        const row = slots.length ? slots[0].parentElement : null;
        this.pvMeasure = { w: owl.offsetWidth, h: owl.offsetHeight, cq: this.root.clientWidth, top: row ? row.offsetTop : 0, slots: new Map() };
        slots.forEach((s) => this.pvMeasure.slots.set(s.dataset.id, { x: row.offsetLeft + s.offsetLeft + s.offsetWidth / 2, top: s.offsetTop, h: s.offsetHeight }));
      }
      slots.forEach((s) => s.classList.toggle('is-lit', onDock && s.dataset.id === id));
      const m = this.pvMeasure, p = m.slots.get(id);
      if (!p) return;
      this.lastPerch = id;
      // Perched on the logo's top edge, as on the Parapet: the row and the owl share the strip's coordinates.
      // A lit logo is lifted (settings.css: translateY(-.32cqw) scale(1.14), offsets ignore transforms): she rides it.
      const lift = onDock && !this.reduced ? p.h * 0.07 + m.cq * 0.0032 : 0;
      const top = m.top + p.top - lift - m.h + p.h * 0.06;
      owl.style.transform = `translate(${Math.round(p.x - m.w / 2)}px, ${Math.max(0, Math.round(top))}px)`;   // never cut by the strip's top
    });
  },

  // ---- Signatures: quill writing, pressed seal --------------------------------------------------------------
  // `i`: writing rank (0, 1, 2...) to write several lines one after another.
  // Played with the Web Animations API: restarting it needs no forced layout (the old remove-class / offsetWidth /
  // add-class trick laid the whole page out synchronously, three times per section). Opacity and transform only;
  // `backwards` fill, so nothing stays in effect once written.
  writeIn(node, i = 0) {
    if (!node || !node.animate) return;
    if (node._write) node._write.cancel();
    const k = this.k();
    node._write = this.reduced
      ? node.animate([{ offset: 0, opacity: 0 }], { duration: 200 * k, easing: 'ease', fill: 'backwards' })
      : node.animate([{ offset: 0, opacity: 0, transform: 'translateX(-.6cqw)' }], { duration: SETTLE_MS * k, delay: i * 90 * k, easing: ARRIVE, fill: 'backwards' });
  },
  press(seal) {
    if (!seal) return;
    seal.classList.add('is-sealed');
    if (seal._press) seal._press.cancel();
    const end = seal.classList.contains('set-house-seal') ? 'scale(1.06)' : 'none';
    seal._press = this.reduced
      ? seal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 * this.k() })
      : seal.animate([{ transform: 'scale(1.3)', opacity: 0 }, { opacity: 1, offset: 0.35 }, { transform: end, opacity: 1 }], { duration: 200 * this.k(), easing: ARRIVE });
  },

  // ---- Key hint at the bottom of the screen -----------------------------------------------------------------
  // Written only when it changes: rewriting the same words would lay the strip out and paint it again at every move.
  updateHint() {
    const h = this.root.querySelector('.keyhint'); if (!h) return;
    const spans = h.querySelectorAll('span');
    const [a, b, c, d] = h.querySelectorAll('em');
    const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
    // A key whose hint would repeat another one (Left does what Back does) is left out, never written twice.
    const show = (span, on) => { const v = on ? '' : 'none'; if (span.style.display !== v) span.style.display = v; };
    show(spans[0], true);
    if (this.level === 'left') { put(a, 'Rubrique'); put(b, 'Entrer'); show(spans[2], false); put(d, 'Quitter'); return; }
    const id = RUBRIQUES[this.rub].id;
    put(a, 'Ligne');
    if (this.axis === 'h') show(spans[0], false);                 // nothing to say for up and down: left out, never "Nothing"
    // The hint follows the focused line: a button (the way back to the TV's home, the TV screens) opens, and has no value.
    const it = this.items && this.items[this.row], btn = Boolean(it && it.el && it.el.classList.contains('set-btn'));
    put(b, id === 'dock' ? 'Poser · Retirer' : id === 'house' ? 'Choisir' : (id === 'tv' || (btn && id === 'home')) ? 'Ouvrir' : (id === 'classic' || id === 'about') ? 'Valider' : 'Changer');
    // Third key: what Left / Right do here. A button (TV screens, About, the way home) only goes back with Left, as Back does.
    show(spans[2], !(id === 'tv' || id === 'about' || btn));
    put(c, id === 'dock' ? 'Rang' : this.axis === 'h' ? 'Choisir' : 'Valeur');
    put(d, 'Rubriques');
  },

  // Slide the list to keep the focused row visible (transform, no scroll), with the places measured once (measure()).
  // The message band, at the bottom of the page, is reserved: a focused row is never beneath it.
  // Every section uses it (the eleven TV screens, the parapet list, the long notes of "À propos"). `instant`: no slide.
  keepVisible(instant) {
    const list = this.scrollList, sheet = this.cur; if (!list || !sheet || !list.isConnected || sheet.waiting) return;
    const it = this.level === 'right' ? this.items[this.row] : null;
    if (!it) {
      if (this.listOff !== 0 || !this.items[this.row]) { this.listOff = 0; list.style.transform = 'translateY(0px)'; }
      return;
    }
    if (!sheet.measured) this.measure(sheet);
    void instant;
    const msg = this.root.querySelector('.set-msg');
    const H = sheet.H - (msg && msg.textContent ? msg.offsetHeight : 0);
    const maxOff = Math.min(0, H - sheet.flowH);                    // never slide further than the last line
    let off = this.listOff;
    if (it.bottom + off > H - sheet.pad) off = H - sheet.pad - it.bottom; else if (it.top + off < sheet.pad) off = sheet.pad - it.top;
    off = Math.round(Math.max(Math.min(0, off), maxOff));
    if (off === this.listOff) return;
    this.listOff = off;
    list.style.transform = `translateY(${off}px)`;
  },

  // ---- Leaving ----------------------------------------------------------------------------------------------
  leave() {
    this.ctx.fx.whoosh();
    if (this.ctx.router.canGoBack()) this.ctx.router.back('fade');
    else this.ctx.router.go('home', {}, 'fade');
  },

  // ---- Keys -------------------------------------------------------------------------------------------------
  onKey(action, ctx) {
    void ctx;
    this.lastKey = performance.now();
    if (action === 'okdown') { const it = this.level === 'right' && this.items[this.row]; if (it && it.el && !this.busy) it.el.classList.add('is-press'); return true; }
    { const it = this.items[this.row]; if (it && it.el) it.el.classList.remove('is-press'); }
    if (this.busy) return true;                                   // the sand is falling: 320 ms without keys
    if (action === 'longback') {                                  // the Parapet asks "Nox ?" (never a silent switch); classic mode has its grid
      if (getConfig().mode === 'classique') this.ctx.router.replace('classic', {}, 'fade');
      else this.ctx.router.go('home', { askClassic: true }, 'fade');
      return true;
    }
    if (action === 'home') { this.ctx.fx.whoosh(); return false; }   // the router goes to the mode's home, the stack cleared
    if (action === 'menu') { if (this.level === 'right') this.toLeft(); else this.leave(); return true; }

    if (this.level === 'left') {
      if (action === 'up' || action === 'down') {
        const n = this.rub + (action === 'up' ? -1 : 1);
        if (n < 0 || n >= RUBRIQUES.length) { this.nudge(this.rubEl()); return true; }
        this.moveRub(n);
        this.ctx.fx.chime(988, 0.02);
        return true;
      }
      if (action === 'right' || action === 'ok') {
        this.flushRub();
        if (!this.items.length) return true;
        this.level = 'right'; this.syncFocus(); this.keepVisible();
        return true;
      }
      if (action === 'left' || action === 'back') { this.leave(); return true; }
      return true;
    }

    // Right level: the focused item has priority, then generic navigation along the axis.
    if (action === 'back') {
      if (RUBRIQUES[this.rub].id === 'about' && this.resetStep) { this.resetStep = 0; this.renderRight('Réinitialiser'); return true; }
      if (this.homeAsk) { this.homeAsk = false; this.renderRight('Touche Home'); return true; }   // the question closes, the row stays
      this.toLeft(); return true;
    }
    const it = this.items[this.row];
    const res = it ? it.key(action) : false;
    if (res === 'exit') { this.toLeft(); return true; }
    if (res === true) { this.keepVisible(); return true; }
    const move = (d) => {
      const n = this.row + d;
      if (n < 0 || n >= this.items.length) { if (it) this.nudge(it.el); return; }
      this.row = n; this.syncFocus(); this.keepVisible();
      this.ctx.fx.chime(1175, 0.015);
    };
    if (this.axis === 'v') {
      if (action === 'up') { move(-1); return true; }
      if (action === 'down') { move(1); return true; }
      if (action === 'left') { this.toLeft(); return true; }
      return true;
    }
    if (action === 'left') { if (this.row === 0) this.toLeft(); else move(-1); return true; }
    if (action === 'right') { move(1); return true; }
    return true;
  },
};
