// The Admission Letter (Lettre d'admission): first run, four parchment pages written in IM Fell.
// 1) Choose your house  2) Your spells (the parapet apps)  3) Does Hedwig come along?  4) The emergency exits
// (how to leave Poudlard from the remote alone; on the TV, the button that asks for the Home key).
// Nothing is saved before "Lumos" (or "Rester en mode classique" / stay in classic mode): the draft lives here.
// Back = previous page, never a forced exit. If no app is ticked, the parapet gets YouTube (when the TV has it).
// Passages (consoles, HDMI) and hand-added apps (V4) already on the parapet are not in the Letter: they are kept.
// Page II offers what the TV really has: on the TV (Platform.installed() is a Set), the catalog apps whose package is
// installed, then the TV's other apps under the label the TV gives them (a ticked one becomes a hand-added app, c_<n>,
// at the end); never an app the TV does not have, nor a home screen, a VPN or a tool (NOT_A_SPELL). In the mock-up
// (no list), the whole catalog.
// Params: { page, only } opens one page alone (Settings → À propos → "Les issues de secours"): Back returns,
// nothing is saved, the classic-mode link is not offered.
// Layout at TV size (960x540 CSS px at DPR 2, like 1920x1080): every page fits the sheet; fit() tightens the spacing
// (.is-dense, then .is-denser) when a page would run past it (a longer TV note, a wider fallback font).
import { CATALOG, HOUSES, DOCK_MAX, getConfig, updateConfig, allApps, appById, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { mountCrest } from '../crests.js';
import { HOME_HINT, ARROWS_ALL, timeK } from './settings.js';

// Pre-ticked on a brand-new TV: the first six of this list that the TV has, in this order.
const PRESET = ['netflix', 'prime', 'disney', 'youtube', 'max', 'francetv', 'arte', 'molotov', 'm6', 'tf1', 'appletv'];
const PRESET_COUNT = 6;
const FALLBACK_DOCK = ['youtube'];
const CUSTOM_MAX = 12;                      // same cap as sanitize() in config.js
const OFFER_MAX = 24;                       // page II: four rows of six at most
const OWL = [['vive', 'Vive'], ['calme', 'Calme'], ['absente', 'Absente']];
const YESNO = [[true, 'Oui'], [false, 'Non']];
// Page 0 (the house) is no longer shown (8 Nov 2026: no house choice, no crest): the Letter opens on page 1.
const FIRST = 1;
const STEPS = ['', 'I · Les sortilèges', 'II · Hedwige', 'III · Les issues de secours'];
const LAST = STEPS.length - 1;
// The four ways out, [key, effect]: a two-column table, each effect on one line at TV size.
const EXITS = [
  ['Retour maintenu 2 s', 'le mode classique, sans décor ni chouette'],
  ['Retour maintenu 6 s', 'l’écran de secours de la télé'],
  ['Touche Réglages', 'les réglages de la télé'],
  ['Salle sur Demande', 'Accueil de la télé : rendre la touche Home'],
];
const isPassage = (id) => { const a = CATALOG.find((x) => x.id === id); return Boolean(a && a.cat === 'passage'); };
// Kept outside the Letter: a Passage, or a hand-added app (id c_<n>, see config.js).
const isKept = (id) => isPassage(id) || /^c_\d{1,6}$/.test(String(id));
// A label from the TV made acceptable as a hand-added app's name (config.js: letters, digits, space . + ' & -,
// 20 characters at most, cut at a word). Empty when nothing usable is left: that app is not offered.
const NAME_OK = /^[\p{L}\p{N} .+'&-]{1,20}$/u;
function cleanLabel(label) {
  let n = String(label || '').replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N} .+'&-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (n.length > 20) { n = n.slice(0, 21); const cut = n.lastIndexOf(' '); n = (cut > 3 ? n.slice(0, cut) : n.slice(0, 20)).trim(); }
  return NAME_OK.test(n) ? n : '';
}
// Page II offers things to watch. Not offered, even when the TV has them: other home screens (the TV's current home,
// Free My TV, a launcher), VPNs, file managers and other tools. Matched on "<pkg> <label>"; the Map's "Applis
// installées" still lists them, and they can be put on the parapet from there.
const NOT_A_SPELL = [
  /\bio\.freemytv\b/i, /\bfree ?my ?tv\b/i, /launcher|lanceur|home ?screen|\bprojectivy\b|\bwolf ?launcher\b/i,
  /vpn|wireguard|surfshark|\bproxy\b|\btor ?browser\b|\borbot\b/i,
  /file ?(manager|commander|explorer|browser)|\bfiles?\b|\bfichiers\b|x-?plore|\bexplor(er|ateur)\b|\bfx\.?file|total ?commander/i,
  /\bdownloader\b|aftvnews|speed ?test|\bcleaner\b|nettoyeur|send ?files|\bsideload|\btermux\b|\badb\b|\bremote\b|t[ée]l[ée]commande|\bkeyboard\b|\bclavier\b|\bsettings\b|\bparam[eè]tres\b/i,
];
const isSpell = (a, home) => a.pkg !== home && !NOT_A_SPELL.some((re) => re.test(`${a.pkg} ${a.label}`));
// The package of the TV's previous home when platform.js can tell it (Android.originalHome(), shell 0.3), else ''.
function originalHomePkg() {
  try {
    const h = typeof Platform.originalHome === 'function' ? Platform.originalHome() : null;
    return (h && typeof h.pkg === 'string') ? h.pkg : '';
  } catch (e) { return ''; }
}

// Crests: the pictures (or the drawn achievement of crests.js when a picture is missing).
const shield = (card, id) => mountCrest(card, id, 'sort-shield-svg');
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l5 5L20 6"/></svg>';
const ARRIVE = 'cubic-bezier(.32,.72,0,1)';   // --ease-arrive (base.css), for the Web Animations below

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default {
  root: null, ctx: null, page: 0, grid: [], r: 0, c: 0, cm: 0, d: null, kept: [], room: DOCK_MAX, timers: [], reduced: false, done: false, turning: false, armed: false, only: false,
  offer: [],           // page II: [{ id, name }]; id = a catalog id, or 'x:<pkg>' for an installed app outside the catalog
  extras: new Map(),   // 'x:<pkg>' → { name, pkg }
  fitWait: false,
  mounts: 0,           // the router unmounts the previous layer 700 ms after mounting the next: a Letter replaced by a Letter keeps its state

  async mount(root, ctx) {
    this.mounts += 1;
    this.root = root; this.ctx = ctx; this.timers = []; this.done = false; this.turning = false; this.armed = false; this.seenOffer = false;
    this.only = Boolean(ctx.params && ctx.params.only);
    this.reduced = isReduced();
    root.classList.toggle('is-reduced', this.reduced);
    // Draft: taken from the settings if the Letter is relaunched, otherwise the values of a brand-new TV.
    // Passages and added apps on the parapet have no tick box in the Letter: set aside, put back at the end.
    const c = getConfig();
    this.kept = c.firstRunDone ? c.dock.filter(isKept) : [];
    this.room = Math.max(1, DOCK_MAX - this.kept.length);
    this.buildOffer(c);
    // Sounds are on for a new TV: the cues and the background music start with the first gesture (the owner's
    // wish); the "Sons" row of page III, or the Parapet's Sound button, turns them off.
    this.d = c.firstRunDone
      ? { house: c.house, dock: this.draftDock(c), owl: c.owl, sounds: c.sounds }
      : { house: null, dock: this.draftDock(c), owl: 'vive', sounds: true };
    root.innerHTML = `
      <div class="sort-room">
        <div class="sort-stars"></div>
        <div class="sort-candle"></div>
        <div class="sort-letter parchment">
          <div class="sort-seal wax-seal"><span>P</span></div>
          <div class="sort-kicker">Poudlard TV</div>
          <div class="sort-step"></div>
          <div class="sort-sheet"></div>
          <div class="sort-foot"><div class="sort-link"><span>Rester en mode classique</span></div></div>
        </div>
        <div class="keyhint"><span><b>${ARROWS_ALL}</b><em>Choisir</em></span><span><b>OK</b><em></em></span><span><b>Retour</b><em>Page précédente</em></span></div>
      </div>`;
    this.paintSeal();
    this.page = this.only ? clamp(Number(ctx.params.page) || FIRST, FIRST, LAST) : FIRST;
    if (this.only) root.querySelector('.sort-foot').style.display = 'none';   // one page alone: Back returns, nothing is saved
    this.render();
    requestAnimationFrame(() => { if (this.root === root) root.classList.add('is-open'); });
    if (c.sounds || this.d.sounds) ctx.fx.initAudio();
  },

  unmount() { this.mounts = Math.max(0, this.mounts - 1); if (this.mounts > 0) return; this.timers.forEach(clearTimeout); this.timers = []; this.grid = []; this.offer = []; this.extras = new Map(); this.root = null; },

  // The ticks page II starts with: the parapet's spells that are offered (the Letter relaunched), or the preset (a new TV).
  draftDock(c) {
    const offered = new Set(this.offer.map((a) => a.id));
    return c.firstRunDone ? c.dock.filter((id) => !isKept(id) && offered.has(id)) : PRESET.filter((id) => offered.has(id)).slice(0, PRESET_COUNT);
  },
  // The TV's lists were read (main.js, in an idle moment: on a new TV, the first read comes a moment after the Letter opens). Until
  // page II has been shown, its offer and its ticks follow them; afterwards they stay as the person saw them.
  listsRead() {
    if (!this.root || this.only || this.page > FIRST || this.seenOffer) return;
    const c = getConfig();
    this.buildOffer(c);
    this.d.dock = this.draftDock(c);
  },
  // Page II's list. TV: the installed catalog apps (catalog order), then the TV's other apps by label; mock-up: the catalog.
  buildOffer(c) {
    const catalog = allApps().filter((a) => a.cat !== 'passage' && !a.custom);
    const inst = Platform.installed();
    this.extras = new Map();
    if (!inst) { this.offer = catalog.map((a) => ({ id: a.id, name: a.name })); return; }
    const mine = catalog.filter((a) => a.pkg && inst.has(a.pkg));
    const known = new Set([...catalog.map((a) => a.pkg), ...c.custom.map((a) => a.pkg)].filter(Boolean));
    const home = originalHomePkg();
    const others = (Platform.apps() || [])
      .filter((a) => !a.system && !known.has(a.pkg) && isSpell(a, home))
      .map((a) => ({ id: 'x:' + a.pkg, name: cleanLabel(a.label), pkg: a.pkg }))
      .filter((a) => a.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
      .slice(0, Math.max(0, CUSTOM_MAX - c.custom.length));
    others.forEach((a) => this.extras.set(a.id, { name: a.name, pkg: a.pkg }));
    this.offer = [...mine.map((a) => ({ id: a.id, name: a.name })), ...others.map((a) => ({ id: a.id, name: a.name }))].slice(0, OFFER_MAX);
  },

  k() { return timeK(); },
  // `hold`: reading delay (a message that must stay legible), never shortened in reduced motion.
  later(fn, ms, hold) { const t = setTimeout(fn, ((this.reduced && !hold) ? Math.min(ms, 200) : ms) * this.k()); this.timers.push(t); return t; },

  // The letter's seal takes the colour of the draft's house (HOUSES constants, never a free value).
  paintSeal(press) {
    const seal = this.root.querySelector('.sort-seal');
    const h = this.d.house ? HOUSES[this.d.house] : null;
    seal.style.setProperty('--wax', h ? h.wax : '#7a1f1f');
    seal.querySelector('span').textContent = h ? h.name[0] : 'P';
    if (press) this.pressSeal(seal, 'rotate(8deg)');
  },

  // ---- Rendering a page -------------------------------------------------------------------------------------
  // Each page fills `this.grid`: rows of items { el, ok(), lr?(dir) → bool, onFocus?() }.
  render() {
    const sheet = this.root.querySelector('.sort-sheet');
    sheet.textContent = '';
    this.root.querySelector('.sort-step').textContent = STEPS[this.page];
    this.grid = []; this.r = 0; this.c = 0; this.cm = 0;
    let lines = 0;
    const line = (node) => { node.classList.add('sort-line'); node.style.setProperty('--i', String(lines++)); sheet.appendChild(node); return node; };
    this['page' + this.page](sheet, line);
    // The "Rester en mode classique" link is the last navigable row of every page (not when a page is shown alone).
    const link = this.root.querySelector('.sort-link');
    if (!this.only) this.grid.push([{ el: link, ok: () => this.stayClassic() }]);
    this.setFocus(this.r, this.c);
    this.fit();
    if (sheet.animate) sheet.animate(this.reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: 'translateX(1.6cqw) rotateY(-6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: (this.reduced ? 200 : 420) * this.k(), easing: ARRIVE, fill: 'backwards' });
    this.updateHint();
  },
  // Keeps the page inside the sheet: two steps of tighter spacing if the content runs past the sheet's bottom.
  // Measured again once the fonts are ready (the very first layout may still use a fallback font).
  fit() {
    const sheet = this.root && this.root.querySelector('.sort-sheet'); if (!sheet) return;
    sheet.classList.remove('is-dense', 'is-denser');
    // Layout boxes only (offsetTop/offsetHeight ignore transforms): the focused item's scale is not an overflow.
    const over = () => [...sheet.children].some((c) => c.offsetTop + c.offsetHeight > sheet.clientHeight + 1);
    if (over()) sheet.classList.add('is-dense');
    if (over()) sheet.classList.add('is-denser');
    if (!this.fitWait && document.fonts && document.fonts.status !== 'loaded') {
      this.fitWait = true;
      document.fonts.ready.then(() => { this.fitWait = false; if (this.root) this.fit(); });
    }
  },

  // Page I: the house.
  page0(sheet, line) {
    line(el('h2', 'sort-title', 'Choisissez votre maison'));
    line(el('p', 'sort-text', 'Votre téléviseur a été admis. La cire de votre maison scellera chaque réglage.'));
    const row = line(el('div', 'sort-shields'));
    const items = [];
    Object.keys(HOUSES).forEach((id) => {
      const h = HOUSES[id];
      const card = el('div', 'sort-shield' + (this.d.house === id ? ' is-on' : ''));
      card.style.setProperty('--wax', h.wax);
      card.style.setProperty('--house-glow', h.glow);
      shield(card, id);
      card.appendChild(el('div', 'sort-shield-name', h.name));
      row.appendChild(card);
      items.push({
        el: card,
        onFocus: () => { this.previewWax(id); },
        ok: () => {
          if (this.armed) return;                       // a single page turn, even if OK is pressed twice
          this.armed = true;
          this.d.house = id;
          row.querySelectorAll('.sort-shield').forEach((x) => x.classList.toggle('is-on', x === card));
          this.paintSeal(true);
          this.ctx.fx.chime(1046, 0.035);
          this.later(() => { this.armed = false; this.turn(1); }, 380);
        },
      });
    });
    this.grid.push(items);
    const wax = line(el('div', 'sort-wax'));
    wax.appendChild(el('div', 'sort-wax-seal wax-seal'));
    wax.appendChild(el('div', 'sort-wax-text', ''));
    this.c = Math.max(0, Object.keys(HOUSES).indexOf(this.d.house));   // setFocus() will call onFocus → wax preview
    this.cm = this.c;                                                    // the remembered column follows the current house
  },
  // Wax preview: the seal under the crests takes the hovered colour and presses.
  previewWax(id) {
    const h = HOUSES[id]; const w = this.root.querySelector('.sort-wax'); if (!h || !w) return;
    const seal = w.querySelector('.sort-wax-seal');
    seal.style.setProperty('--wax', h.wax);
    this.pressSeal(seal, 'none');
    const t = w.querySelector('.sort-wax-text');
    t.textContent = this.d.house === id ? `Cire de ${h.name}, votre maison.` : `Cire de ${h.name}.`;
    this.writeIn(t);
  },

  // Page II: the spells (parapet apps).
  page1(sheet, line) {
    this.seenOffer = true;
    line(el('h2', 'sort-title', 'Vos sortilèges'));
    line(el('p', 'sort-text', `Cochez jusqu’à ${DOCK_MAX} applis, dans l’ordre du parapet.`));
    if (this.kept.length) {
      const names = this.kept.map((id) => (appById(id) || { name: '?' }).name).join(', ');
      const what = this.kept.every(isPassage) ? 'Vos Passages' : 'Vos Passages et applis ajoutées';
      line(el('p', 'sort-text sort-text-dim', `${what} (${names}) gardent leur place et comptent dans les ${DOCK_MAX}.`));
    }
    line(el('div', 'sort-count'));
    const grid = line(el('div', 'sort-grid'));
    const apps = this.offer;
    if (!apps.length) {
      grid.classList.add('is-empty');
      grid.textContent = 'Aucune appli trouvée sur cette télé : le parapet recevra les vôtres plus tard, depuis la Carte du Maraudeur.';
    }
    // Columns: as few as possible (the widest names), four rows at most. "Down" lands on the cell right below.
    const COLS = Math.min(6, Math.max(4, Math.ceil(apps.length / 4)));
    grid.style.setProperty('--cols', String(COLS));
    grid.classList.toggle('is-narrow', COLS > 4);
    let row = [];
    apps.forEach((a, n) => {
      const cell = el('div', 'sort-cell' + (this.d.dock.includes(a.id) ? ' is-on' : ''));
      const box = el('span', 'sort-box'); box.innerHTML = CHECK; cell.appendChild(box);
      cell.appendChild(el('span', 'sort-cell-name', a.name));
      grid.appendChild(cell);
      row.push({
        el: cell,
        ok: () => {
          const i = this.d.dock.indexOf(a.id);
          if (i >= 0) { this.d.dock.splice(i, 1); cell.classList.remove('is-on'); this.ctx.fx.whoosh(); }
          else if (this.d.dock.length >= this.room) { this.say('Le parapet est plein : décochez d’abord un sortilège.'); this.nudge(cell); return; }
          else { this.d.dock.push(a.id); cell.classList.add('is-on'); this.ctx.fx.chime(1568, 0.03); }
          this.paintCount();
        },
      });
      if (row.length === COLS || n === apps.length - 1) { this.grid.push(row); row = []; }
    });
    const foot = line(el('div', 'sort-btns'));
    const next = el('div', 'sort-btn'); next.appendChild(el('span', null, 'Continuer')); foot.appendChild(next);
    this.grid.push([{ el: next, ok: () => this.turn(2) }]);
    this.paintCount();
  },
  paintCount() {
    const c = this.root.querySelector('.sort-count'); if (!c) return;
    c.classList.remove('is-msg');
    const n = this.d.dock.length + this.kept.length;      // kept Passages count
    const full = this.d.dock.length >= this.room;
    const empty = this.offer.some((a) => a.id === FALLBACK_DOCK[0]) || !Platform.installed()
      ? 'Aucun sortilège : le parapet recevra YouTube, jamais le vide.' : 'Aucun sortilège coché pour l’instant.';
    c.textContent = this.d.dock.length === 0 ? empty : `${n} sortilège${n > 1 ? 's' : ''} sur ${DOCK_MAX}${full ? ' — le parapet est plein' : ''}`;
    this.writeIn(c);
  },

  // Page III: Hedwig and the sounds.
  page2(sheet, line) {
    line(el('h2', 'sort-title', 'Hedwige vous accompagne ?'));
    line(el('p', 'sort-text', 'Elle se pose sur l’appli choisie et s’envole à chaque pas. Calme, elle ne vole que pour les longs trajets. Absente, le médaillon s’allume seul.'));
    this.grid.push([this.enumLine(line, 'Hedwige', OWL, () => this.d.owl, (v) => { this.d.owl = v; })]);
    this.grid.push([this.enumLine(line, 'Sons', YESNO, () => this.d.sounds, (v) => { this.d.sounds = v; if (v) this.ctx.fx.initAudio(); })]);
    line(el('p', 'sort-text sort-text-dim', 'Les sons : une clochette à chaque geste et la musique de fond. Tout se change plus tard dans la Salle sur Demande.'));
    const foot = line(el('div', 'sort-btns'));
    const next = el('div', 'sort-btn'); next.appendChild(el('span', null, 'Continuer')); foot.appendChild(next);
    this.grid.push([{ el: next, ok: () => this.turn(3) }]);
    this.r = 2;   // focus starts on "Continuer": three OK presses are enough for a brand-new TV
  },

  // Page IV: the emergency exits, then (on the TV) the button that asks for the Home key, then Lumos.
  page3(sheet, line) {
    line(el('h2', 'sort-title', 'Les issues de secours'));
    line(el('p', 'sort-text', 'Poudlard ne retient personne. À tout moment, depuis la télécommande :'));
    const table = line(el('div', 'sort-exits'));
    EXITS.forEach(([key, effect]) => { table.appendChild(el('b', 'sort-exit-key', key)); table.appendChild(el('span', 'sort-exit-what', effect)); });
    const onTV = Platform.isTV() && Platform.homeMode() !== 'simulated';
    const ask = onTV && Platform.homeMode() !== 'poudlard';
    const note = line(el('p', 'sort-text sort-text-dim', ask
      ? 'La touche Home mène encore à l’accueil d’origine : Poudlard peut la demander ici, ou plus tard.'
      : 'Désinstaller Poudlard TV rend toujours la télé telle qu’elle était : rien n’est désactivé.'));
    const foot = line(el('div', 'sort-btns'));
    if (ask) {
      const btn = el('div', 'sort-btn'); btn.appendChild(el('span', null, 'Faire de Poudlard l’accueil')); foot.appendChild(btn);
      this.grid.push([{ el: btn, ok: () => {
        const r = Platform.setHome('poudlard');
        note.textContent = r.status === 'failed' ? r.error : (HOME_HINT[r.hint] || HOME_HINT['press-home']);
        this.writeIn(note);
        this.fit();
        this.ctx.fx.chime(1319, 0.03);
      } }]);
    }
    const lumos = el('div', 'sort-btn sort-lumos'); lumos.appendChild(el('span', null, this.only ? 'Fermer' : 'Lumos')); foot.appendChild(lumos);
    // Both buttons on one row: right/left move between them.
    if (ask) this.grid[this.grid.length - 1].push({ el: lumos, ok: () => (this.only ? this.ctx.router.back('fade') : this.finish()) });
    else this.grid.push([{ el: lumos, ok: () => (this.only ? this.ctx.router.back('fade') : this.finish()) }]);
    this.r = this.grid.length - 1;          // focus on the button row: the Home key first on the TV, otherwise Lumos
    this.c = 0; this.cm = 0;
  },
  // "label: option · option · option" row, the current option circled in ink.
  enumLine(line, label, options, get, set) {
    const row = line(el('div', 'sort-enum'));
    row.appendChild(el('span', 'sort-enum-label', label));
    const opts = el('span', 'sort-opts'); row.appendChild(opts);
    const chips = options.map((o) => { const s = el('span', 'sort-opt', o[1]); opts.appendChild(s); return s; });
    const paint = () => { const v = get(); chips.forEach((s, i) => s.classList.toggle('is-on', options[i][0] === v)); };
    paint();
    const idx = () => Math.max(0, options.findIndex((o) => o[0] === get()));
    const change = (i) => { set(options[i][0]); paint(); this.writeIn(chips[i]); this.ctx.fx.chime(1319, 0.03); };
    return {
      el: row,
      ok: () => change((idx() + 1) % options.length),
      lr: (dir) => { const i = idx() + dir; if (i < 0 || i >= options.length) { this.nudge(row); return true; } change(i); return true; },
    };
  },

  // ---- Focus and grid navigation ----------------------------------------------------------------------------
  setFocus(r, c) {
    this.r = clamp(r, 0, this.grid.length - 1);
    this.c = clamp(c, 0, this.grid[this.r].length - 1);
    this.grid.forEach((row, i) => row.forEach((it, j) => it.el.classList.toggle('is-focus', i === this.r && j === this.c)));
    const it = this.grid[this.r][this.c];
    if (it && it.onFocus) it.onFocus();
    this.updateHint();
  },
  moveV(d) {
    const n = this.r + d;
    if (n < 0 || n >= this.grid.length) { this.nudge(this.grid[this.r][this.c].el); return; }
    // Remembered column: the original column is kept while crossing a shorter row.
    const from = this.grid[this.r].length, to = this.grid[n].length;
    let c = this.cm;
    if (to < from) c = Math.round(this.cm / Math.max(1, from - 1) * (to - 1));
    this.setFocus(n, clamp(c, 0, to - 1));
    this.ctx.fx.chime(1175, 0.015);
  },
  moveH(d) {
    const it = this.grid[this.r][this.c];
    if (it.lr && it.lr(d)) return;
    const n = this.c + d;
    if (n < 0 || n >= this.grid[this.r].length) { this.nudge(it.el); return; }
    this.cm = n;                                         // only an explicit sideways step moves the column memory
    this.setFocus(this.r, n);
    this.ctx.fx.chime(1175, 0.015);
  },

  // ---- Turning the page -------------------------------------------------------------------------------------
  turn(p) {
    if (this.turning || this.done) return;
    this.turning = true;
    this.page = clamp(p, FIRST, LAST);
    const sheet = this.root.querySelector('.sort-sheet');
    sheet.classList.add('is-leave');
    this.ctx.fx.whoosh();
    this.later(() => { if (!this.root) return; sheet.classList.remove('is-leave'); this.render(); this.turning = false; }, 260);
  },

  // ---- End: Lumos, or classic mode --------------------------------------------------------------------------
  // The final parapet = the ticked spells (or YouTube if none and the TV has it), then the kept Passages, 8 at most.
  // A ticked app from outside the catalog ('x:<pkg>') becomes a hand-added app (c_<n>, name + package), same patch.
  finalDock() {
    const fallback = FALLBACK_DOCK.filter((id) => !Platform.installed() || this.offer.some((a) => a.id === id));
    const chosen = this.d.dock.length ? this.d.dock.slice() : fallback;
    const custom = getConfig().custom.slice();
    let n = custom.reduce((m, a) => Math.max(m, Number(String(a.id).slice(2)) || 0), 0);
    const dock = [];
    for (const id of chosen) {
      const x = this.extras.get(id);
      if (!x) { dock.push(id); continue; }
      if (custom.length >= CUSTOM_MAX) continue;
      const cid = `c_${++n}`;
      custom.push({ id: cid, name: x.name, pkg: x.pkg });
      dock.push(cid);
    }
    return { dock: [...dock, ...this.kept].slice(0, DOCK_MAX), custom };
  },
  finish() {
    if (this.done) return; this.done = true;
    const { dock, custom } = this.finalDock();
    const btn = this.root.querySelector('.sort-lumos'), rr = this.root.getBoundingClientRect(), b = btn.getBoundingClientRect();
    this.ctx.fx.lumos(this.root, b.left - rr.left + b.width / 2, b.top - rr.top + b.height / 2, 900);
    this.ctx.fx.arpeggio();
    btn.classList.add('is-lit');
    this.later(() => {
      // "Lumos" picks Hogwarts: the Letter can be relaunched from classic mode.
      updateConfig({ firstRunDone: true, mode: 'poudlard', house: this.d.house, custom, dock, owl: this.d.owl, sounds: this.d.sounds });
      this.ctx.router.replace('home', { boot: true }, 'fade');
    }, 450);
  },
  stayClassic() {
    if (this.done) return; this.done = true;
    const { dock, custom } = this.finalDock();
    const patch = { firstRunDone: true, mode: 'classique', custom, dock, owl: this.d.owl, sounds: this.d.sounds };
    if (this.d.house) patch.house = this.d.house;
    updateConfig(patch);
    this.ctx.fx.whoosh();
    this.ctx.router.replace('classic', {}, 'fade');
  },

  // ---- Signatures -------------------------------------------------------------------------------------------
  // Played with Web Animations: restarting one needs no forced layout.
  writeIn(node) {
    if (!node || !node.animate) return;
    if (node._write) node._write.cancel();
    node._write = node.animate(this.reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ opacity: 0, transform: 'translateX(-.4cqw)' }, { opacity: 1, transform: 'none' }], { duration: (this.reduced ? 200 : 300) * this.k(), easing: ARRIVE });
  },
  pressSeal(seal, end) {
    if (!seal.animate) return;
    if (seal._press) seal._press.cancel();
    seal._press = seal.animate(this.reduced
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [{ transform: `${end === 'none' ? '' : end} scale(1.3)` }, { transform: `${end === 'none' ? '' : end} scale(1)` }], { duration: 200 * this.k(), easing: ARRIVE });
  },
  // Stop: small sideways refusal, composited with the focus transform (the letter does not straighten, the crest does not drop).
  nudge(node) {
    if (this.reduced || !node) return;
    node.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-.35cqw)' }, { transform: 'translateX(.3cqw)' }, { transform: 'translateX(0)' }], { duration: 220 * this.k(), composite: 'add' });
  },
  // A refusal, written in the house's wax in place of the count line; then the count comes back.
  say(text) {
    const m = this.root.querySelector('.sort-count'); if (!m) return;
    m.textContent = text; m.classList.add('is-msg'); this.writeIn(m);
    this.later(() => { if (this.root && m.textContent === text) this.paintCount(); }, 2600, true);
  },
  updateHint() {
    const h = this.root.querySelector('.keyhint'); if (!h) return;
    const it = this.grid[this.r] && this.grid[this.r][this.c];
    const okEm = h.querySelectorAll('em')[1];
    const cls = it ? it.el.className : '';
    okEm.textContent = cls.includes('sort-shield') ? 'Choisir' : cls.includes('sort-cell') ? 'Cocher' : cls.includes('sort-enum') ? 'Changer' : cls.includes('sort-lumos') ? (this.only ? 'Fermer' : 'Allumer') : 'Valider';
    const back = h.querySelectorAll('span')[2];
    back.style.opacity = (this.page > FIRST || this.only) ? '' : '0';
    back.querySelector('em').textContent = this.only ? 'Salle sur Demande' : 'Page précédente';
  },

  // ---- Keys -------------------------------------------------------------------------------------------------
  onKey(action, ctx) {
    void ctx;
    if (action === 'okdown') { const it = this.grid[this.r] && this.grid[this.r][this.c]; if (it && !this.done && !this.turning) it.el.classList.add('is-press'); return true; }
    { const it = this.grid[this.r] && this.grid[this.r][this.c]; if (it) it.el.classList.remove('is-press'); }
    if (this.done) return true;
    if (this.turning || this.armed) return true;
    if (this.only && (action === 'back' || action === 'home' || action === 'longback' || action === 'menu')) { this.done = true; this.ctx.router.back('fade'); return true; }
    if (action === 'back') { if (this.page > FIRST) this.turn(this.page - 1); else this.nudge(this.root.querySelector('.sort-letter')); return true; }
    // Long Back: the escape route leads to the "Rester en mode classique" link (never a forced exit).
    if (action === 'longback') { this.cm = 0; this.setFocus(this.grid.length - 1, 0); return true; }
    if (action === 'up') { this.moveV(-1); return true; }
    if (action === 'down') { this.moveV(1); return true; }
    if (action === 'left') { this.moveH(-1); return true; }
    if (action === 'right') { this.moveH(1); return true; }
    if (action === 'ok') { const it = this.grid[this.r][this.c]; if (it) it.ok(); return true; }
    return true;   // menu, long OK, Home: nothing leaves the Letter
  },
};
