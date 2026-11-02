// La Carte du Maraudeur : toutes les applis sur un parchemin qui se déplie, les Passages (consoles, entrées HDMI),
// la chandelle « Réglages ». C'est ici qu'on épingle, retire, masque, affiche et déplace ce qui est sur le parapet,
// et qu'on ajoute l'appli de son choix (V4) : une dernière pièce « Ajouter une appli » ouvre une formule à écrire.
//
// Grammaire : flèches dans la grille (mémoire de colonne par ligne) · OK lance (Lumos en version encre) ·
// OK long ou Menu : Rappeltout de l'appli · Retour, bas depuis la dernière ligne, haut depuis la première : « Méfait accompli »
// puis retour au Parapet. Toute modification passe par updateConfig / addCustomApp / removeCustomApp (config.js) : rien d'autre n'écrit.
//
// Chorégraphie d'ouverture : l'écran glisse d'abord en place (transition `down` du routeur, 700 ms) ; SEULEMENT ENSUITE
// la classe `is-in` est posée sur la section et le parchemin se déplie, la formule s'écrit, l'encre apparaît, puis les
// empreintes marchent (650 ms plus tard). Sans `is-in`, map.css garde tout replié et invisible.
//
// Applis ajoutées (config.custom) : catégorie 'perso', logo = monogram(app.name) quand LOGOS[app.id] manque. Elles
// viennent dans la grille après le catalogue, avant les Passages, suivies du cartouche en pointillés « Ajouter une appli ».
// Leur Rappeltout propose en plus « Supprimer cette appli ».
//
// La formule à écrire (.map-spell) : un clavier D-pad dessiné à l'encre (lettres, chiffres, espace, Effacer, « C'est fait »),
// le nom s'écrit à la plume en IM Fell au-dessus, lettre par lettre (masque gauche→droite), 20 caractères au plus.
// Retour efface la dernière lettre ; Retour sur un champ vide annule. Sur la vraie TV, si Platform.installed() renvoie
// une liste, on propose d'abord ces applis (sphère Rappeltout) ; en maquette la liste est nulle : on écrit le nom.
//
// Paramètres acceptés (facultatifs) : ctx.params.app  = id de l'appli en focus sur le parapet (focus initial) ;
//                                     ctx.params.from = { x, y } fractions (0..1) de l'écran d'où partent les empreintes.

import { allApps, appById, getConfig, updateConfig, addCustomApp, removeCustomApp, isReduced, DOCK_MAX } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { rappeltout, dismissRappeltout } from '../rappeltout.js';
import { beuglante } from '../beuglante.js';

const COLS = 5;              // colonnes de la grille
const ROWS_VISIBLE = 3;      // lignes visibles par page (pages suivantes vers le bas)
const STEPS = 6;             // empreintes par trajet
const STEP_GAP = 40;         // ms entre deux empreintes
const REVEAL_GAP = 40;       // ms entre deux cartouches à l'ouverture
const ENTER_MS = 700;        // durée de la transition d'écran du routeur (TRANSITION_MS, non exporté) : on attend l'arrivée
const WALK_AFTER_MS = 650;   // la marche part quand le parchemin est déplié et l'encre posée
const INTENT_MS = 350;       // l'intent part à 350 ms (blueprint Lumos) ; jusque-là, Retour annule
const FRAME_W = 14, FRAME_H = 7;   // cadre du cartouche en cqw (map.css : 14 × 7, en haut du cartouche de 14 × 10)
const CUSTOM_MAX = 12;       // applis ajoutées à la main, au plus (sanitize() tranche au même nombre)
const NAME_MAX = 20;         // caractères d'un nom écrit à la plume (NAME_RE de config.js)
const SEAL_MS = 520;         // le sceau se presse, puis la formule se referme et l'appli apparaît
const TOAST_MS = 2200;       // durée d'une plaque de laiton informative
// Même forme qu'un package Android accepté par sanitize() (PKG_RE de config.js) : on ne propose jamais un package
// que la config retirerait en silence (l'appli serait alors créée sans chemin).
const PKG_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const FORMULA = 'Je jure solennellement que mes intentions sont mauvaises';
const MISCHIEF = 'Méfait accompli';
const KEYHINT_BROWSE = '<span><b>◀ ▶ ▲ ▼</b>Parcourir</span><span><b>OK</b>Ouvrir</span><span><b>OK long</b>Rappeltout</span><span><b>Retour</b>Parapet</span>';
const KEYHINT_MOVE = '<span><b>◀ ▶</b>Déplacer</span><span><b>OK</b>Poser</span><span><b>Retour</b>Annuler</span>';
const KEYHINT_SPELL = '<span><b>◀ ▶ ▲ ▼</b>Lettre</span><span><b>OK</b>Écrire</span><span><b>Retour</b>Effacer · Annuler</span>';

// Le clavier de la formule : quatre rangées de dix touches, puis trois touches larges. Les libellés sont des constantes.
// Une touche = un caractère (`ch`) ou une action (`id` : space, erase, done). `w` : largeur en cqw des touches larges.
const KEY_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
  ['K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'],
  ['U', 'V', 'W', 'X', 'Y', 'Z', '+', '-', '.', '&'],
  [{ id: 'space', label: 'Espace', w: 17 }, { id: 'erase', label: 'Effacer', w: 17 }, { id: 'done', label: 'C’est fait', w: 25.6 }],
];

// Cartouche dessiné à la plume : un rectangle qui tremble un peu, un double filet, quatre traits de coin.
const FRAME_SVG = `<svg class="map-frame" viewBox="0 0 200 120" preserveAspectRatio="none" aria-hidden="true">
  <path class="map-frame-outer" d="M8 6 C60 3.5 140 8.5 192 6 C194.5 40 193 80 192 114 C140 116.5 60 111.5 8 114 C5.5 80 7 40 8 6 Z"/>
  <path class="map-frame-inner" d="M13 11 C60 9 140 13 187 11 C189 40 188 80 187 109 C140 111 60 107 13 109 C11 80 12 40 13 11 Z"/>
  <path class="map-frame-corners" d="M3 2 l6 6 M197 2 l-6 6 M3 118 l6 -6 M197 118 l-6 -6"/>
</svg>`;
// Trait de plume qui souligne le nom (pathLength normalisé : dasharray 100).
const UNDERLINE_SVG = `<svg class="map-underline" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true">
  <path pathLength="100" d="M2 3.4 C 22 1.2, 48 5.2, 70 2.6 S 92 3.8, 98 2.8"/></svg>`;
// La chandelle « Réglages » : bougie, coulures, bobèche, flamme (allumée en focus).
const CANDLE_SVG = `<svg class="map-candle" viewBox="0 0 60 80" aria-hidden="true">
  <path class="map-candle-flame" d="M30 12 C23.5 21 23 29 30 34 C37 29 36.5 21 30 12 Z"/>
  <path class="map-candle-wick" d="M30 34 v4"/>
  <path class="map-candle-body" d="M22 38 h16 v30 h-16 Z M22 44 c-2.5 3 -1 8 1.5 10 M38 50 c2.2 2 2.2 6 .5 8"/>
  <path class="map-candle-dish" d="M12 68 h36 l-5 7 h-26 Z"/>
</svg>`;
// La plume du cartouche « Ajouter une appli » : une penne, ses barbes, le bec et une goutte d'encre.
const QUILL_SVG = `<svg class="map-quill" viewBox="0 0 60 80" aria-hidden="true">
  <path class="map-quill-feather" d="M49 5 C35 9 23 23 18 43 C16 51 15 57 14 63 C23 59 33 49 39 37 C44 27 48 15 49 5 Z"/>
  <path class="map-quill-barbs" d="M45 13 C37 19 31 29 25 43 M41 23 L31 27 M37 33 L27 37 M33 43 L24 48"/>
  <path class="map-quill-nib" d="M14 63 L10 73 M12 68 L16 67"/>
  <path class="map-quill-ink" d="M5 76 c3 -1.2 6 -.2 9 1.2"/>
</svg>`;
// Une empreinte de pied à l'encre (symbole réutilisé par <use>) : orteils en haut, pointe vers le haut.
const DEFS_SVG = `<svg class="map-defs" width="0" height="0" aria-hidden="true"><defs>
  <symbol id="map-foot" viewBox="0 0 20 32">
    <path d="M3.5 14 C3.5 11 6 8.5 10 8.5 S16.5 11 16.5 14 C16.5 17 14.5 18.5 14.5 21 C14.5 23 15 24 15 26 C15 29 13 31 10 31 S5 29 5 26 C5 24 5.5 23 5.5 21 C5.5 18.5 3.5 17 3.5 14 Z"/>
    <circle cx="4" cy="7.2" r="1.5"/><circle cx="6.8" cy="4.6" r="1.8"/><circle cx="10.2" cy="3.4" r="2.1"/><circle cx="13.8" cy="4.4" r="1.8"/><circle cx="16.6" cy="6.8" r="1.4"/>
  </symbol>
</defs></svg>`;

// Nom lisible tiré d'un package Android (vrai launcher) : dernier segment, sans ponctuation, initiale en capitale,
// 20 caractères au plus. Ne produit que des caractères acceptés par sanitize() (NAME_RE), sinon « Appli ».
function pkgLabel(pkg) {
  const seg = String(pkg || '').split('.').pop() || '';
  const clean = seg.replace(/_/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, NAME_MAX).trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Appli';
}

// Un nom est « pris » s'il est déjà sur la Carte, à la casse près (catalogue et applis ajoutées).
function nameTaken(name) {
  const n = String(name).trim().toLowerCase();
  return allApps().some((a) => String(a.name).toLowerCase() === n);
}

// Nom libre à partir d'un libellé proposé : « App », puis « App 2 », « App 3 »… (toujours ≤ 20 caractères).
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
  move: null,            // mode Déplacer : { id, order:[ids], items:{ id: élément } } ou null
  spell: null,           // formule à écrire : { name, r, c, cm, rows:[[{ id?, ch?, el }]], busy } ou null
  stepsBatch: null,      // empreintes du dernier trajet (retirées au suivant)
  launching: null,       // lancement en cours : { app, sent, intentTimer, endTimer, held } ou null
  toastTimer: 0,         // plaque de laiton informative (hors lancement)

  // ---------------------------------------------------------------- montage
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

    // Grille.
    this.rows = this.buildRows();
    this.renderRows();

    // Focus initial : l'appli du parapet d'où l'on vient, sinon la dernière lancée, sinon la première.
    const wanted = (ctx.params && typeof ctx.params.app === 'string') ? ctx.params.app : getConfig().lastApp;
    const pos = this.findCell((cell) => cell.kind === 'app' && cell.app.id === wanted) || { r: 0, c: 0 };
    this.setFocus(pos.r, pos.c, { walkFrom: null, instant: true });

    // Les empreintes partent de l'endroit où l'on était sur le parapet (fractions de l'écran), par défaut le dock.
    const from = (ctx.params && ctx.params.from && Number.isFinite(ctx.params.from.x) && Number.isFinite(ctx.params.from.y))
      ? ctx.params.from : { x: 0.5, y: 0.78 };
    const W = root.clientWidth || 1;
    const start = { x: from.x * 100, y: from.y * (root.clientHeight || W * 9 / 16) / W * 100 };

    // La mise en scène attend que l'écran soit en place : fin de la transition du routeur (transform), ou minuterie de secours.
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
    if (this.launching && this.launching.held) Input.release();   // jamais une file d'attente orpheline
    this.launching = null;
    dismissRappeltout();
    this.rows = [];
    this.stepsBatch = null;
    this.move = null;
    this.spell = null;
    this.root = null;
  },

  // Minuterie qui respecte le ralenti du banc d'essai (--k) et s'annule au démontage.
  k() { return Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1; },
  after(ms, fn) { const t = setTimeout(() => { if (this.root) fn(); }, ms * this.k()); this.timers.push(t); return t; },

  // Ciel de secours derrière le parchemin : la Nuit et quelques étoiles, dessinées une fois (aucune boucle).
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

  // ---------------------------------------------------------------- données
  // Lignes de la grille : les applis du catalogue (cachées comprises, en encre pâle), puis les applis ajoutées à la main,
  // puis le cartouche « Ajouter une appli », puis « Les Passages », puis la chandelle Réglages en dernière pièce.
  // Les applis du catalogue non installées (vrai launcher) ne sont pas dessinées ; les applis ajoutées à la main
  // restent toujours visibles (leur package peut avoir été désinstallé : on doit pouvoir les supprimer d'ici),
  // en encre pâlie comme « caché » (classe is-absent, map.css) ; leur lancement finit en Beuglante douce.
  buildRows() {
    const inst = Platform.installed();
    const all = allApps().filter((a) => a.custom || !inst || !a.pkg || inst.has(a.pkg));
    const catalog = all.filter((a) => a.cat !== 'passage' && !a.custom).map((a) => ({ kind: 'app', app: a }));
    const custom = all.filter((a) => a.custom).map((a) => ({ kind: 'app', app: a }));
    const apps = [...catalog, ...custom, { kind: 'add' }];
    const passages = all.filter((a) => a.cat === 'passage').map((a) => ({ kind: 'app', app: a }));
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

  findCell(pred) {
    for (let r = 0; r < this.rows.length; r++) {
      const c = this.rows[r].cells.findIndex(pred);
      if (c >= 0) return { r, c };
    }
    return null;
  },
  cellAt(r, c) { const row = this.rows[r]; return row ? row.cells[c] || null : null; },
  focusedCell() { return this.cellAt(this.r, this.c); },

  // ---------------------------------------------------------------- rendu
  // `quiet` : reconstruction après un ajout ou une suppression, l'écran étant déjà en place : les cartouches existants
  // n'ont pas à se révéler de nouveau (classe is-quiet), seul le cartouche `fresh` (id d'appli) apparaît à l'encre.
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
        const el = cell.kind === 'candle' ? this.renderCandle() : cell.kind === 'add' ? this.renderAdd() : this.renderApp(cell.app);
        el.dataset.r = r; el.dataset.c = c;
        const isFresh = Boolean(fresh && cell.kind === 'app' && cell.app.id === fresh);
        if (quiet && !isFresh) el.classList.add('is-quiet');
        if (isFresh) el.classList.add('is-fresh');                                       // apparaît sans le délai d'ouverture
        el.style.setProperty('--d', isFresh ? '0ms' : `${index * REVEAL_GAP}ms`);            // révélation en cascade
        el.style.setProperty('--dr', `${(total - 1 - index) * (150 / Math.max(1, total - 1))}ms`);   // effacement inverse, 350 ms en tout
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
    const L = LOGOS[app.id] || monogram(app.name);                     // appli ajoutée : son monogramme
    el.innerHTML = `${FRAME_SVG}<div class="map-ink-logo"></div><div class="map-name"></div><div class="map-sub"></div>${UNDERLINE_SVG}<div class="wax-seal map-seal"></div><div class="map-tag"></div>`;
    const logo = el.querySelector('.map-ink-logo');
    if (L && L.src) {
      logo.style.setProperty('--m', `url("${L.src}")`);
      if (L.luma) logo.classList.add('luma');
      logo.style.width = Math.min(10, Math.max(1, 3.4 * (L.ratio || 1))).toFixed(2) + 'cqw';
    } else {                                                             // pas de logo : l'initiale à la plume
      logo.classList.add('no-mask');
      logo.textContent = (app.name || '?').charAt(0);
    }
    el.querySelector('.map-name').textContent = app.name;
    el.querySelector('.map-sub').textContent = app.input ? app.input : app.custom ? 'Perso' : '';
    el.querySelector('.map-tag').textContent = 'caché';
    // Appli ajoutée dont le package n'est plus sur la TV : dessinée quand même (pour pouvoir la supprimer), en encre pâlie.
    const inst = Platform.installed();
    if (app.custom && inst && app.pkg && !inst.has(app.pkg)) el.classList.add('is-absent');
    return el;
  },

  renderCandle() {
    const el = document.createElement('div');
    el.className = 'map-cell map-candle-cell';
    el.innerHTML = `${FRAME_SVG}<div class="map-candle-halo"></div>${CANDLE_SVG}<div class="map-name"></div>${UNDERLINE_SVG}`;
    el.querySelector('.map-name').textContent = 'Réglages';
    return el;
  },

  // « Ajouter une appli » : le même cartouche, mais en pointillés (map.css), et une plume à la place du logo.
  renderAdd() {
    const el = document.createElement('div');
    el.className = 'map-cell map-add-cell';
    el.innerHTML = `${FRAME_SVG}${QUILL_SVG}<div class="map-name"></div>${UNDERLINE_SVG}`;
    el.querySelector('.map-name').textContent = 'Ajouter une appli';
    return el;
  },

  // Sceau de cire (sur le parapet) et encre pâlie (caché), relus depuis la config après chaque changement.
  refreshStates(pressedId) {
    const state = Object.fromEntries(allApps().map((a) => [a.id, a]));
    this.rows.forEach((row) => row.cells.forEach((cell) => {
      if (cell.kind !== 'app' || !cell.el) return;
      const s = state[cell.app.id] || {};
      cell.el.classList.toggle('on-dock', Boolean(s.onDock));
      cell.el.classList.toggle('is-hidden', Boolean(s.hidden));
      if (pressedId === cell.app.id) {                                    // le sceau se presse une fois
        const seal = cell.el.querySelector('.map-seal');
        seal.classList.remove('is-pressed'); void seal.offsetWidth; seal.classList.add('is-pressed');
      }
    }));
  },

  // Reconstruit la grille (ajout ou suppression d'une appli) sans rejouer l'ouverture, et repose le focus :
  // sur l'appli `fresh` si elle est donnée, sinon au plus près de l'ancienne position.
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

  // Plaque de laiton informative (hors lancement : pendant Lumos, c'est launch() qui tient la plaque).
  say(text, ms = TOAST_MS) {
    const toast = this.root.querySelector('.map-toast');
    if (this.busy || !toast) return;
    clearTimeout(this.toastTimer);
    toast.textContent = text;
    toast.classList.add('is-on');
    this.toastTimer = this.after(ms, () => { if (!this.busy) toast.classList.remove('is-on'); });
  },

  // ---------------------------------------------------------------- focus et pages
  setFocus(r, c, { walkFrom = undefined, instant = false } = {}) {
    const from = walkFrom === undefined ? this.focusCenter() : walkFrom;
    this.rows.forEach((row) => row.cells.forEach((cell) => cell.el && cell.el.classList.remove('is-focus')));
    this.r = r; this.c = c; this.mem[r] = c;
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.add('is-focus');
    this.scrollTo(r, instant);
    if (!instant && from) this.walk(from, this.focusCenter());
  },

  // Fenêtre de 3 lignes : la ligne en focus reste visible, les lignes glissent verticalement (translate en cqw).
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

  // Centre du CADRE du cartouche en focus, en cqw (coordonnées de l'écran), une fois le glissement de page accompli.
  // Le cadre est un <svg> (pas d'offsetLeft/offsetTop sur un SVGElement) : il occupe le haut du cartouche, 14 × 7 cqw,
  // soit la largeur du cartouche et la moitié de sa hauteur ; on le déduit des offsets HTML du cartouche.
  focusCenter() {
    const cell = this.focusedCell();
    if (!cell || !cell.el || !this.root) return null;
    const W = this.root.clientWidth || 1;
    const rowsEl = this.root.querySelector('.map-rows');
    const grid = this.root.querySelector('.map-grid');
    const sheet = this.root.querySelector('.map-sheet');
    // Position calculée depuis les offsets (indépendante de la transition en cours sur .map-rows).
    const topRow = this.rows[this.top];
    const shift = topRow && topRow.el ? topRow.el.offsetTop : 0;
    const fw = cell.el.offsetWidth, fh = fw * (FRAME_H / FRAME_W);
    const x = sheet.offsetLeft + grid.offsetLeft + rowsEl.offsetLeft + cell.el.parentElement.offsetLeft + cell.el.offsetLeft + fw / 2;
    const y = sheet.offsetTop + grid.offsetTop + rowsEl.offsetTop - shift + cell.el.parentElement.offsetTop + cell.el.offsetTop + fh / 2;
    return { x: x / W * 100, y: y / W * 100 };
  },

  // Même point en pixels (pour Fx.lumos et l'ancre du Rappeltout).
  focusCenterPx() {
    const p = this.focusCenter(); if (!p) return { x: 0, y: 0 };
    const W = this.root.clientWidth || 1;
    return { x: p.x * W / 100, y: p.y * W / 100 };
  },

  // ---------------------------------------------------------------- les empreintes
  // Six empreintes encrées, alternées pied gauche / pied droit, qui marchent de `from` jusqu'au BORD du cadre visé (cqw),
  // 40 ms entre deux pas, puis s'effacent. Un trajet nouveau efface le précédent. Rien en mouvement réduit.
  walk(from, to) {
    if (!this.root || this.reduced || !from || !to) return;
    if (!Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) return;
    const layer = this.root.querySelector('.map-steps');
    if (this.stepsBatch) { this.stepsBatch.forEach((s) => s.remove()); this.stepsBatch = null; }
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;                                   // un pas sur place ne se dessine pas
    const ux = dx / dist, uy = dy / dist;                   // direction de marche
    const px = -uy, py = ux;                                // perpendiculaire (écart entre les deux pieds)
    const angle = Math.atan2(dy, dx) * 180 / Math.PI + 90;  // le pied pointe vers le haut dans son dessin
    // Distance du centre du cadre à son bord dans la direction d'arrivée : les pas s'arrêtent juste avant le filet.
    const edge = Math.min(FRAME_W / 2 / Math.max(1e-3, Math.abs(ux)), FRAME_H / 2 / Math.max(1e-3, Math.abs(uy)));
    const end = Math.max(0, dist - edge - 0.6);
    if (end < 1) return;                                    // déjà au pied du cartouche
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

  // Butée : le cartouche se cale contre le bord (petit recul), la carte ne boucle pas.
  // L'animation WAAPI remplace la valeur CSS du transform : on garde donc le scale(1.04) du focus dans chaque image clé.
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
  // OK sur une appli : Lumos en version encre (la pièce s'illumine à la bougie), un seul accord de clochettes,
  // la plaque de laiton à 300 ms, l'intent à 350 ms. Jusqu'à l'intent, Retour annule (la lumière se résorbe) ;
  // après, les touches sont mises en file (Input.hold) et rejouées à la fin, jamais perdues.
  launch() {
    const cell = this.focusedCell();
    if (!cell || this.busy) return;
    if (cell.kind === 'candle') { this.ctx.fx.chime(988, 0.04); this.ctx.router.go('settings', {}, 'iris'); return; }
    if (cell.kind === 'add') { this.openSpell(); return; }
    const app = cell.app;
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
    fx.chime(1046, 0.04); fx.chime(1318, 0.03); fx.chime(1568, 0.025);     // un accord, pas un arpège
    toast.textContent = app.input ? `Passage vers ${app.input}` : `Ouverture de ${app.name}`;

    const L = { app, sent: false, held: false, intentTimer: 0, endTimer: 0 };
    this.launching = L;
    const settle = () => {                                   // la lumière se résorbe, l'écran reprend la main
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
      updateConfig({ lastApp: app.id });
      const inst = Platform.installed();
      const gone = Boolean(inst && app.pkg && !inst.has(app.pkg));
      const result = gone ? 'simulated' : Platform.launch(app);
      if (Platform.isTV() && result === 'simulated') {       // la TV n'a pas pris la main : Beuglante douce, pas de plaque
        settle();
        const message = app.cat === 'passage' || app.input ? "Cette source n'est pas raccordée."
          : app.custom && !app.pkg ? 'La Carte ne connaît pas le chemin de cette appli.'
            : `${app.name} n'est plus installé.`;
        beuglante(this.root, { message });
        return;
      }
      L.held = true; Input.hold();                           // dès l'intent parti, les touches attendent et seront rejouées
      L.endTimer = this.after((result === 'bridge' ? 4000 : 2200) - INTENT_MS, settle);
    });
  },

  // Retour pendant la fenêtre de 350 ms : l'intent n'est pas parti, on éteint tout.
  cancelLaunch() {
    const L = this.launching;
    if (!L || L.sent) return false;
    clearTimeout(L.intentTimer);
    L.settle();
    this.ctx.fx.chime(659, 0.02);
    return true;
  },

  // OK long ou Menu : la sphère Rappeltout de l'appli en focus, posée sous le cartouche.
  async contextMenu() {
    const cell = this.focusedCell();
    if (!cell || cell.kind !== 'app' || this.busy || this.menuOpen) return;
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
    if (cell.app.custom) options.push({ id: 'remove', label: 'Supprimer cette appli' });   // une appli ajoutée peut repartir
    const p = this.focusCenterPx();
    const W = this.root.clientWidth || 1;
    this.menuOpen = true;
    this.ctx.fx.chime(1319, 0.03);
    // Ancre : le bord bas du cadre (3,5 cqw sous son centre) plus un souffle ; `edge: 'below'` pose le HAUT de la sphère là.
    const choice = await rappeltout(this.root, { title: cell.app.name, options, anchor: { x: p.x, y: p.y + W * (FRAME_H / 2 + 0.4) / 100, edge: 'below' } });
    this.menuOpen = false;
    if (!this.root || !choice) return;
    this.apply(choice, id);
  },

  // Applique un choix du Rappeltout. Tout passe par updateConfig : sanitize() garantit dock ≤ DOCK_MAX et dock ∩ hidden = ∅.
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
    } else if (choice === 'remove') {
      // L'appli ajoutée quitte la Carte, le parapet et les cachées (removeCustomApp) ; la grille se resserre.
      const app = appById(id);
      if (!app || !app.custom) return;
      removeCustomApp(id);
      this.rebuildRows(null);
      this.ctx.fx.whoosh();
      this.say(`${app.name} quitte la Carte`);
    }
  },

  // ---------------------------------------------------------------- la formule à écrire (ajouter une appli)
  // OK sur « Ajouter une appli ». Sur la vraie TV, si la liste des applis installées est connue, on la propose d'abord
  // (sphère Rappeltout : jusqu'à huit packages encore inconnus, puis « Écrire le nom à la plume ») ; sinon, le clavier.
  openSpell() {
    if (this.spell || this.busy || this.menuOpen || this.move) return;
    if (!this.arrived) return;                           // le parchemin n'est pas encore déplié : la plume attend
    if (getConfig().custom.length >= CUSTOM_MAX) { this.say('La Carte garde douze formules au plus.'); this.ctx.fx.chime(440, 0.03); return; }
    const inst = Platform.installed();
    if (inst && inst.size) { this.chooseInstalled(inst); return; }
    this.openKeyboard();
  },

  async chooseInstalled(inst) {
    const known = new Set(allApps().map((a) => a.pkg).filter(Boolean));
    // Seuls les packages bien formés (ceux que sanitize() gardera) et encore inconnus de la Carte sont proposés.
    const candidates = [...inst].filter((p) => typeof p === 'string' && PKG_RE.test(p) && !known.has(p)).slice(0, 8);
    const options = candidates.map((p) => ({ id: `pkg:${p}`, label: pkgLabel(p) }));
    options.push({ id: 'write', label: 'Écrire le nom à la plume' });
    const p = this.focusCenterPx();
    const W = this.root.clientWidth || 1;
    this.menuOpen = true;
    this.ctx.fx.chime(1319, 0.03);
    const choice = await rappeltout(this.root, { title: 'Applis installées', options, anchor: { x: p.x, y: p.y + W * (FRAME_H / 2 + 0.4) / 100, edge: 'below' } });
    this.menuOpen = false;
    if (!this.root || !choice) return;
    if (choice === 'write') { this.openKeyboard(); return; }
    const pkg = choice.slice(4);
    // Même garde que « C'est fait » : jamais deux cartouches au même nom ; on suffixe (« App 2 ») plutôt que refuser.
    const name = freeName(pkgLabel(pkg));
    if (!name) { this.say('La Carte a déjà ce nom trop de fois.'); this.ctx.fx.chime(440, 0.03); return; }
    this.commitApp(name, pkg);
  },

  // Le clavier se dessine une fois par ouverture ; la grille pâlit derrière (classe is-spell sur la section).
  openKeyboard() {
    const panel = this.root.querySelector('.map-spell');
    const keys = this.root.querySelector('.map-spell-keys');
    keys.textContent = '';
    this.root.querySelector('.map-spell-name').textContent = '';
    this.root.querySelector('.map-spell-msg').textContent = '';
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
        el.style.setProperty('--d', `${index * 18}ms`);                             // apparition en cascade
        el.style.setProperty('--rot', `${(((index * 7) % 5) - 2) * 0.35}deg`);      // tremblé de la main, fixe par touche
        rowEl.appendChild(el);
        row.push(key);
        index++;
      });
      keys.appendChild(rowEl);
      rows.push(row);
    });
    this.spell = { name: '', r: 1, c: 0, cm: 0, rows, busy: false };
    // Un seul focus à la fois (contrat) : le cartouche « Ajouter » rend sa classe au clavier ; closeSpell() la lui rend.
    const cell = this.focusedCell();
    if (cell && cell.el) cell.el.classList.remove('is-focus');
    this.root.classList.add('is-spell');
    panel.classList.add('is-open', 'is-dealing');                                   // la donne des touches, une seule fois
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
    // Le focus revient au cartouche de la grille (sans marche ni glissement : rien n'a bougé).
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

  // Compteur et état de « C'est fait » (pâle tant que rien n'est écrit).
  paintSpell() {
    const s = this.spell; if (!s) return;
    this.root.querySelector('.map-spell-count').textContent = `${s.name.length} / ${NAME_MAX}`;
    const done = s.rows[s.rows.length - 1].find((k) => k.id === 'done');
    if (done) done.el.classList.toggle('is-off', !s.name.trim());
  },

  // Une lettre de plus : un <span> par caractère, révélé par un masque gauche→droite (map.css).
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

  // « C'est fait » : le nom est vérifié (non vide, pas déjà sur la Carte), le sceau se presse, puis l'appli est ajoutée.
  confirmSpell() {
    const s = this.spell;
    const name = s.name.trim();
    const done = s.rows[s.rows.length - 1].find((k) => k.id === 'done');
    if (!name) { this.nudge('right', done && done.el); this.ctx.fx.chime(440, 0.03); return; }
    if (nameTaken(name)) {
      this.root.querySelector('.map-spell-msg').textContent = 'Cette appli est déjà sur la Carte.';
      this.nudge('right', done && done.el); this.ctx.fx.chime(440, 0.03);
      return;
    }
    s.busy = true;
    const seal = this.root.querySelector('.map-spell-seal');
    seal.classList.remove('is-pressed'); void seal.offsetWidth; seal.classList.add('is-pressed');
    this.ctx.fx.chime(1046, 0.04); this.ctx.fx.chime(1318, 0.03); this.ctx.fx.chime(1568, 0.025);
    this.after(this.reduced ? 200 : SEAL_MS, () => {
      if (!this.spell) return;
      this.closeSpell();
      seal.classList.remove('is-pressed');
      this.commitApp(name);
    });
  },

  // addCustomApp (config.js) pose l'appli sur le parapet s'il reste une place ; la grille se reconstruit, le nouveau
  // cartouche apparaît à l'encre avec son monogramme, son sceau se presse, et la plaque dit où elle est.
  commitApp(name, pkg) {
    const id = addCustomApp(name, pkg);
    const app = appById(id);                            // sans champ onDock (seul allApps() le pose) : on lit la config
    if (!app) { this.say('La plume a tremblé : rien n’a été ajouté.'); this.ctx.fx.chime(440, 0.03); return; }
    this.rebuildRows(id);
    this.refreshStates(id);
    const onDock = getConfig().dock.includes(id);
    if (!onDock) this.say('Le parapet est plein, la Carte la garde');
    else this.say(`${app.name} rejoint le parapet`);
    this.ctx.fx.chime(1568, 0.04);
  },

  // Touches pendant la formule : flèches sur le clavier (mémoire de colonne, rangées de longueurs différentes mises à
  // l'échelle), OK écrit, Retour efface puis annule, Menu / Retour long annulent, Home annule ET ramène au Parapet.
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
    if (action === 'home') { this.cancelSpell(); this.leave(); return true; }   // Home ramène toujours à l'accueil
    if (action === 'longback' || action === 'menu') { this.cancelSpell(); return true; }
    return true;
  },

  // ---------------------------------------------------------------- mode Déplacer
  // Le parapet se dessine en miniature au bas de la carte ; gauche/droite échange l'appli avec sa voisine (les deux
  // glissent, FLIP 300 ms), OK pose (updateConfig({ dock })), Retour annule sans rien écrire.
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

  // Dessine la rangée une fois ; les éléments sont ensuite réordonnés (jamais reconstruits) pour que le glissement se voie.
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

  // FLIP : on note la place de chaque miniature, on réordonne le DOM selon `order`, puis chaque miniature déplacée
  // part de son ancienne place (translateX) et glisse vers la nouvelle en 300 ms.
  reflowParapet() {
    const m = this.move;
    const row = this.root.querySelector('.map-parapet-row');
    const before = {};
    m.order.forEach((id) => { const it = m.items[id]; if (it) before[id] = it.offsetLeft; });
    m.order.forEach((id) => { const it = m.items[id]; if (it) row.appendChild(it); });   // appendChild déplace : l'ordre du DOM suit `order`
    if (this.reduced) return;
    const k = this.k();
    m.order.forEach((id) => {
      const it = m.items[id]; if (!it || before[id] === undefined) return;
      const dx = before[id] - it.offsetLeft;
      if (Math.abs(dx) < 1) return;
      const lift = id === m.id ? ' translateY(-.7cqw)' : '';          // la tenue garde son élévation pendant le glissement
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
    return true;                                            // haut/bas : rien pendant qu'on tient une appli
  },

  exitMove() {
    this.move = null;
    this.rows.forEach((row) => row.cells.forEach((cell) => cell.el && cell.el.classList.remove('is-moving')));
    this.root.classList.remove('is-move');
    this.root.querySelector('.map-parapet').classList.remove('is-open');
    this.root.querySelector('.keyhint').innerHTML = KEYHINT_BROWSE;
  },

  // ---------------------------------------------------------------- sortie
  // « Méfait accompli » : la formule se réécrit, l'encre s'efface dans l'ordre inverse (350 ms), le parchemin se replie,
  // et le Parapet remonte (transition `up`).
  leave() {
    if (this.leaving) return;
    this.leaving = true;
    dismissRappeltout();
    if (this.spell) this.closeSpell();
    if (this.stepsBatch) { this.stepsBatch.forEach((s) => s.remove()); this.stepsBatch = null; }
    this.ctx.fx.whoosh();
    // Mouvement réduit, ou Retour avant même que l'écran soit en place (rien n'est encore déplié) : on repart sans mise en scène.
    if (this.reduced || !this.arrived) { this.ctx.router.go('home', {}, 'up'); return; }
    const root = this.root;
    const formula = root.querySelector('.map-formula');
    root.classList.add('is-leaving');                       // la classe d'abord : la réécriture prend la cadence de sortie
    formula.textContent = MISCHIEF;
    formula.style.animation = 'none'; void formula.offsetWidth; formula.style.animation = '';
    this.after(420, () => this.ctx.router.go('home', {}, 'up'));
  },

  // ---------------------------------------------------------------- touches
  onKey(action, ctx) {
    if (this.leaving || this.menuOpen) return true;
    if (this.busy) {                                         // pendant Lumos : Retour annule tant que l'intent n'est pas parti
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
      if (nr < 0 || nr >= this.rows.length) { this.leave(); return true; }    // haut depuis la première, bas depuis la dernière : le Parapet
      const target = this.rows[nr];
      const nc = Math.min(this.mem[nr] !== undefined ? this.mem[nr] : this.c, target.cells.length - 1);   // mémoire par ligne, jamais de diagonale
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
