// Mode classique (« le lundi matin ») : un launcher ordinaire, lisible par n'importe qui, sans chouette ni décor.
// Même configuration que Poudlard (parapet, ordre, applis masquées) : seule la couche de présentation change.
//
// Grille 6 par ligne, tuiles de pierre 16:9, lignes par catégorie : Parapet · Vidéo · Jeux · Autres · Passages,
// puis une dernière ligne « Réglages » et « Lumos » (rallumer Poudlard). Une catégorie de plus de 6 applis est
// découpée en plusieurs lignes visuelles (la première porte le titre) : `this.rows` correspond toujours à ce
// qui est affiché, et la navigation D-pad suit l'écran.
// Focus = cadre ivoire + scale 1.06 en 150 ms, rien d'autre : c'est voulu.
//
// Entrée depuis Poudlard : la seule transition longue de cet écran (900 ms). La bougie s'éteint, une fumée
// monte sur la nuit, la grille apparaît dessous. Rien de tout cela en mouvement réduit, ni au démarrage de la TV.
//
// Touches : D-pad (mémoire de colonne), OK lance, OK long → Rappeltout, haut sur la première ligne → Réglages,
// Retour : rien (pas de piège), Retour long ou « Lumos » → mode Poudlard.

import { getConfig, updateConfig, allApps, removeCustomApp, DOCK_MAX, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { Input } from '../input.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { beuglante } from '../beuglante.js';

const COLS = 6;                  // tuiles par ligne visuelle (la grille CSS a le même nombre de colonnes)
const BANNER_MS = 1200;          // bandeau « Ouverture de X » en maquette
const BRIDGE_MS = 3000;          // sur la TV : le temps que l'appli prenne l'écran
const SMOKE_MS = 900;            // la bascule Poudlard → classique
const SMOKE_GRID_AT = 350;       // la grille apparaît sous la fumée à ce moment-là
const PUFFS = 5;                 // volutes de fumée

// Libellés des catégories, dans l'ordre d'affichage. Une catégorie vide n'apparaît pas.
const CATEGORIES = [
  ['video', 'Vidéo'],
  ['jeux', 'Jeux'],
  ['autres', 'Autres'],
  ['perso', 'Perso'],          // applis ajoutées à la main (V4, config.custom)
  ['passage', 'Passages'],
];

// Glyphes des deux tuiles spéciales (SVG inline, traits ivoire) : une plume pour Réglages, une bougie pour Lumos.
const GLYPHS = {
  settings: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M38 8c-9 1-17 8-21 18l-3 9 9-3c10-4 17-12 18-21z"/><path d="M14 35 9 40"/><path d="M22 22l8 8"/></svg>',
  lumos: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6c-4 6-6 9-6 13a6 6 0 0 0 12 0c0-4-2-7-6-13z"/><path d="M18 26h12v14H18z"/><path d="M12 40h24"/></svg>',
};

// Le module Rappeltout est écrit en parallèle par un collègue : import dynamique, et si tout manque, on ignore.
// On garde aussi `dismissRappeltout` pour refermer une sphère ouverte au démontage de l'écran.
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

// Découpe une liste en tranches de COLS. La première tranche porte le titre, les suivantes sont des
// lignes de continuation (classe .cls-row-cont, sans titre, collées à la précédente).
function sliceRows(title, items, extra = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += COLS) {
    out.push({ title, items: items.slice(i, i + COLS), cont: i > 0, ...extra });
  }
  return out;
}

export default {
  root: null, ctx: null,
  rows: [],          // lignes VISUELLES : [{ title, cont, tail?, items: [{ kind: 'app'|'settings'|'lumos', app?, el }], el }]
  r: 0, c: 0,        // ligne et colonne en focus
  wantCol: 0,        // mémoire de colonne quand on change de ligne
  busy: false,       // bandeau, Rappeltout, bascule ou fumée en cours : touches mises en file (Input.hold)
  held: false,       // vrai tant que nous tenons la file d'attente d'Input
  _off: 0,           // décalage de défilement courant (px)
  timers: [], msg: null, installed: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = [];
    this.busy = false; this.held = false; this._off = 0; this.msg = null;
    this.installed = Platform.installed();   // Set de packages, ou null (maquette : tout est installé)

    root.innerHTML = `
      <div class="cls-clock"><div class="cls-time"></div><div class="cls-date"></div></div>
      <div class="cls-scroll"><div class="cls-rows"></div></div>
      <div class="keyhint"><span><b>▲</b>Réglages</span><span><b>OK</b>Ouvrir</span><span><b>OK long</b>Options</span><span><b>Retour long</b>Poudlard</span></div>
      <div class="cls-banner"><span class="cls-banner-text"></span></div>`;

    this.tick();
    this.timers.push(setInterval(() => this.tick(), 15000));

    // Focus de départ : la dernière appli lancée si elle est sur la grille, sinon la première tuile.
    this.build();
    const last = getConfig().lastApp;
    let found = null;
    this.rows.forEach((row, ri) => row.items.forEach((it, ci) => { if (!found && it.app && it.app.id === last) found = [ri, ci]; }));
    [this.r, this.c] = found || [0, 0];
    this.wantCol = this.c;
    this.focus(true);

    // Bascule Poudlard → classique : la fumée, sauf au démarrage de la TV (params.boot) et en mouvement réduit.
    // home.js et settings.js peuvent le dire explicitement avec { smoke: true } ; sans paramètre, tout montage
    // qui n'est pas un démarrage est une bascule.
    const p = ctx.params || {};
    const smoke = p.smoke === true || (p.smoke !== false && !p.boot);
    if (smoke && !isReduced()) this.smoke();
    else this.enter();
  },

  unmount() {
    this.timers.forEach((t) => { clearInterval(t); clearTimeout(t); });
    this.timers = [];
    if (this.msg) { this.msg.close(); this.msg = null; }
    if (typeof dismissRappeltout === 'function') dismissRappeltout();   // une sphère ouverte ne reste pas orpheline
    this.release();                                                      // jamais de file d'attente laissée fermée
    this.busy = false;
    this.rows = [];
  },

  // Horloge Cinzel + date EB Garamond.
  tick() {
    const now = new Date();
    const t = this.root.querySelector('.cls-time'), d = this.root.querySelector('.cls-date');
    if (t) t.textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (d) d.textContent = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  },

  // Facteur de temps du banc d'essai (ralenti ×3).
  k() {
    const k = Number(getComputedStyle(this.root).getPropertyValue('--k'));
    return Number.isFinite(k) && k > 0 ? k : 1;
  },

  // Occupé : les touches sont mises en file par input.js et rejouées à la fin, jamais perdues.
  hold() { if (!this.held) { this.held = true; Input.hold(); } this.busy = true; },
  release() { this.busy = false; if (this.held) { this.held = false; Input.release(); } },

  // ---- Construction de la grille ---------------------------------------------------------------------------

  // Lignes visuelles à partir de la config partagée : Parapet (dans l'ordre du dock), puis les catégories,
  // puis Réglages / Lumos. Chaque liste est tranchée par COLS pour que `rows` soit exactement ce qui s'affiche.
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

    rows.push({ title: 'Poudlard TV', items: [{ kind: 'settings' }, { kind: 'lumos' }], cont: false, tail: true });
    return rows;
  },

  // Rend (ou re-rend) toutes les lignes. Les noms viennent du CATALOG : textContent partout.
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

  // Tuile d'appli : plaque de pierre 16:9, logo ivoire centré (ou l'initiale en Cinzel si le logo manque), nom dessous.
  // Logo à plat, une seule couche : exception assumée du mode classique (blueprint : « focus = cadre + scale, rien d'autre »).
  tileApp(app) {
    const el = document.createElement('div');
    el.className = 'cls-tile';
    const plate = document.createElement('div');
    plate.className = 'cls-plate';
    const L = LOGOS[app.id] || monogram(app.name);      // appli ajoutée à la main : son monogramme
    if (L && L.src) {
      const box = document.createElement('div');
      box.className = 'cls-icon';
      // Hauteur fixe, largeur = hauteur × ratio, plafonnée à la plaque.
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
    const name = document.createElement('div');
    name.className = 'cls-name';
    name.textContent = app.name;
    el.append(plate, name);
    if (!this.isInstalled(app)) el.classList.add('is-absent');
    return el;
  },

  // Tuiles « Réglages » et « Lumos » : glyphe SVG constant (pas de donnée), nom en EB Garamond.
  tileSpecial(kind) {
    const el = document.createElement('div');
    el.className = 'cls-tile cls-tile-' + kind;
    const plate = document.createElement('div');
    plate.className = 'cls-plate';
    const g = document.createElement('div');
    g.className = 'cls-svg';
    g.innerHTML = GLYPHS[kind] || '';     // constante du module, jamais une donnée
    plate.appendChild(g);
    const name = document.createElement('div');
    name.className = 'cls-name';
    name.textContent = kind === 'settings' ? 'Réglages' : 'Lumos';
    el.append(plate, name);
    return el;
  },

  // Une appli est « installée » si la TV ne dit pas le contraire. Les Passages (HDMI) ne sont pas des packages.
  isInstalled(app) {
    if (!this.installed || !app.pkg) return true;
    return this.installed.has(app.pkg);
  },

  // Entrée de la grille : les lignes se posent en fondu léger, décalées de 40 ms. Rien si mouvement réduit.
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

  // La bascule (900 ms) : un calque de nuit couvre la grille, une braise de bougie en bas s'éteint,
  // des volutes ivoire montent (ellipses en radial-gradient, aucun blur : la douceur est dans le dégradé),
  // le calque se dissipe et la grille apparaît dessous à 350 ms. Transform et opacité seulement, en WAAPI.
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
      // Répartition fixe autour du centre bas (pas d'aléa : la bascule est la même à chaque fois).
      const spread = (i - (PUFFS - 1) / 2) * 7;                   // en cqw, de −14 à +14
      p.style.left = `calc(50% + ${spread}cqw)`;
      p.style.width = (16 + (i % 2) * 6) + 'cqw';
      p.style.height = (9 + (i % 3) * 2) + 'cqw';
      layer.appendChild(p);
      puffs.push(p);
    }
    this.root.appendChild(layer);

    if (!layer.animate) { layer.remove(); this.enter(); return; }   // pas de WAAPI : pas de cinéma

    this.hold();
    const rows = this.root.querySelector('.cls-rows');
    if (rows) rows.style.opacity = '0';                              // la grille attend sous la fumée

    // La braise : la bougie s'éteint en 300 ms.
    ember.animate([{ opacity: .9, transform: 'translate(-50%, 0) scale(1)' }, { opacity: 0, transform: 'translate(-50%, .6cqw) scale(.7)' }],
      { duration: 300 * k, easing: 'ease-in', fill: 'forwards' });

    // Les volutes : montée + dilatation, opacité 0 → .1 → 0, décalées de 80 ms.
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

    // Le calque de nuit se dissipe à partir du moment où la grille apparaît.
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

  // ---- Focus et défilement --------------------------------------------------------------------------------

  current() {
    const row = this.rows[this.r];
    return row ? row.items[this.c] : null;
  },

  // Pose le cadre ivoire sur la tuile courante et fait défiler la ligne dans la fenêtre (transform seul).
  // La ligne en focus reste au-dessus du fondu bas de la fenêtre (2.4 cqw, voir classic.css).
  focus(instant) {
    this.rows.forEach((row, ri) => row.items.forEach((it, ci) => it.el.classList.toggle('is-focus', ri === this.r && ci === this.c)));
    const scroll = this.root.querySelector('.cls-scroll');
    const host = this.root.querySelector('.cls-rows');
    const row = this.rows[this.r];
    if (!scroll || !host || !row || !row.el) return;
    const viewH = scroll.clientHeight;
    const top = row.el.offsetTop, bottom = top + row.el.offsetHeight;
    const pad = Math.round(scroll.clientWidth * 0.006);    // marge pour le scale 1.06
    const fade = Math.round(scroll.clientWidth * 0.024);   // hauteur du fondu bas (.cls-scroll::after)
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
  },

  move(dr, dc) {
    const row = this.rows[this.r];
    if (!row) return false;
    if (dc) {
      const nc = this.c + dc;
      if (nc < 0 || nc >= row.items.length) return false;   // butée : rien, pas de bouclage
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

  // OK sur une appli : si la TV dit qu'elle n'est plus installée, une Beuglante ; sinon Platform.launch.
  // Pendant le bandeau, les touches sont mises en file (Input.hold) et rejouées ensuite.
  launch(app) {
    if (!app) return;
    if (!this.isInstalled(app)) { this.complain(app); return; }
    this.hold();
    updateConfig({ lastApp: app.id });
    const result = Platform.launch(app);
    // Sur la TV, si rien n'a pris l'écran (appli ajoutée sans package, ou package parti entre-temps) : Beuglante, pas de bandeau.
    if (Platform.isTV() && result === 'simulated') {
      this.release();
      const message = app.custom && !app.pkg ? 'La Carte ne connaît pas le chemin de cette appli.' : `${app.name} n'est plus installé.`;
      this.msg = beuglante(this.root, { message });
      return;
    }
    const banner = this.root.querySelector('.cls-banner');
    banner.querySelector('.cls-banner-text').textContent = app.input ? `Passage vers ${app.name}` : `Ouverture de ${app.name}`;
    banner.classList.add('is-in');
    // Sur la TV, l'appli prend l'écran ; en maquette, le bandeau se retire seul après 1,2 s.
    const k = this.k();
    this.timers.push(setTimeout(() => { banner.classList.remove('is-in'); this.release(); }, (result === 'bridge' ? BRIDGE_MS : BANNER_MS) * k));
  },

  // Beuglante « X n'est plus installé. » avec, au plus, une action : retirer du parapet (ou masquer si elle n'y est pas).
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

  // Après un changement de config : on reconstruit et on garde le focus au plus près.
  rebuild() {
    const { r, c } = this;
    this.build();
    this.r = Math.min(r, this.rows.length - 1);
    this.c = Math.min(c, this.rows[this.r].items.length - 1);
    this.wantCol = this.c;
    this.focus(true);
  },

  // OK long : Rappeltout de l'appli (Retirer du parapet / Épingler · Masquer). Si le module manque, on ignore.
  // Le Rappeltout prend lui-même les touches : pas de file d'attente ici, juste `busy`.
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
    if (app.custom) options.push({ id: 'remove', label: 'Supprimer cette appli' });   // une appli ajoutée à la main peut repartir
    const rr = this.root.getBoundingClientRect(), tr = it.el.getBoundingClientRect();
    const anchor = { x: tr.left - rr.left + tr.width / 2, y: tr.top - rr.top + tr.height / 2 };
    this.busy = true;
    let choice = null;
    try { choice = await rappeltout(this.root, { title: app.name, options, anchor }); } catch (e) { choice = null; }
    if (!this.root || !this.root.isConnected) return;   // écran démonté entre-temps : rien à toucher
    this.busy = false;
    if (choice === 'undock') this.undock(app);
    else if (choice === 'pin') this.pin(app);
    else if (choice === 'hide') this.hide(app);
    else if (choice === 'remove' && app.custom) { removeCustomApp(app.id); this.rebuild(); }
  },

  // Rallumer Poudlard : la préférence est persistante, puis l'accueil rejoue l'allumage Lumos.
  toPoudlard() {
    if (this.busy) return;
    this.busy = true;
    updateConfig({ mode: 'poudlard' });
    this.ctx.router.replace('home', { boot: true }, 'fade');
  },

  onKey(action, ctx) {
    if (this.busy) return true;     // (pendant un bandeau ou la fumée, input.js met déjà la touche en file)
    const it = this.current();
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
        else this.launch(it.app);
        return true;
      case 'longok':
        if (it && it.kind === 'app') this.options(it.app);
        return true;
      case 'menu': ctx.router.go('settings', {}, 'iris'); return true;
      case 'longback': this.toPoudlard(); return true;
      case 'back': return true;     // rien : pas de piège
      default: return false;
    }
  },
};
