// The Admission Letter (Lettre d'admission): first run, four parchment pages written in IM Fell.
// 1) Choose your house  2) Your spells (the parapet apps)  3) Does Hedwig come along?  4) The emergency exits
// (how to leave Poudlard from the remote alone; on the TV, the button that asks for the Home key).
// Nothing is saved before "Lumos" (or "Rester en mode classique" / stay in classic mode): the draft lives here.
// Back = previous page, never a forced exit. If no app is ticked, the parapet gets YouTube.
// Passages (consoles, HDMI) and hand-added apps (V4) already on the parapet are not in the Letter:
// they are kept as they are (the spell grid remains the catalog's, and fits on the sheet).
// Params: { page, only } opens one page alone (Settings → À propos → "Les issues de secours"): Back returns,
// nothing is saved, the classic-mode link is not offered.
import { CATALOG, HOUSES, DOCK_MAX, getConfig, updateConfig, allApps, appById, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';
import { HOME_HINT } from './settings.js';

const PRESET = ['netflix', 'prime', 'disney', 'youtube', 'canal', 'max'];   // six pre-ticked, in this order
const FALLBACK_DOCK = ['youtube'];
const OWL = [['vive', 'Vive'], ['calme', 'Calme'], ['absente', 'Absente']];
const YESNO = [[true, 'Oui'], [false, 'Non']];
const STEPS = ['I · La maison', 'II · Les sortilèges', 'III · Hedwige', 'IV · Les issues de secours'];
const LAST = STEPS.length - 1;
// The four ways out, [key, effect]. Original copy: the keys of the remote, nothing else.
const EXITS = [
  ['Retour maintenu 2 s', 'mode classique, sans décor ni chouette'],
  ['Touche Réglages', 'les réglages de la télé (ou Salle sur Demande → Réglages de la télé)'],
  ['Salle sur Demande → Accueil de la télé', 'rendre la touche Home à l’accueil d’origine'],
  ['Retour maintenu 6 s', 'l’écran de secours de la télé'],
];
const isPassage = (id) => { const a = CATALOG.find((x) => x.id === id); return Boolean(a && a.cat === 'passage'); };
// Kept outside the Letter: a Passage, or a hand-added app (id c_<n>, see config.js).
const isKept = (id) => isPassage(id) || /^c_\d{1,6}$/.test(String(id));

// Crests: simple quill strokes, no official coat of arms. Same shield outline for all four.
const SHIELD = 'M10 6h44v30c0 15-11 25-22 31C21 61 10 51 10 36z';
const BEASTS = {
  gryffondor: '<circle cx="32" cy="35" r="9"/><path d="M32 20l2 5M32 20l-2 5M43 26l-4 3M21 26l4 3M47 35h-5M17 35h5M43 44l-4-3M21 44l4-3M32 50l2-5M32 50l-2-5"/><circle class="dot" cx="28.5" cy="33" r="1.1"/><circle class="dot" cx="35.5" cy="33" r="1.1"/><path d="M32 36l-1.5 2.2h3zM30 41c1.3 1 2.7 1 4 0"/>',
  serpentard: '<path d="M22 52c0-9 20-7 20-16s-20-6-20-15c0-6 7-8 13-6"/><circle cx="37" cy="14" r="3.2"/><path d="M40 13l5-1.5M45 11.5l-1.5 2.5M45 11.5l2.5.5"/><circle class="dot" cx="36" cy="13" r=".8"/>',
  serdaigle: '<path d="M12 38c8-12 15-14 20-10 5-4 12-2 20 10M15 45c6-6 11-8 17-6 6-2 11 0 17 6"/><circle cx="32" cy="22" r="5"/><path d="M34 25l3 4-3.5.5"/><circle class="dot" cx="30.5" cy="21" r=".9"/>',
  poufsouffle: '<ellipse cx="32" cy="36" rx="13" ry="17"/><path d="M26 20v33M38 20v33"/><circle class="dot" cx="26" cy="34" r="1.1"/><circle class="dot" cx="38" cy="34" r="1.1"/><path d="M32 42l-2 2.5h4zM28 48c2.5 2 5.5 2 8 0"/>',
};
const shieldSvg = (id) => `<svg class="sort-shield-svg" viewBox="0 0 64 72" aria-hidden="true"><path class="rim" d="${SHIELD}"/><path class="rim inner" d="M14 10h36v26c0 12-9 20-18 25C23 56 14 48 14 36z"/><g class="beast">${BEASTS[id] || ''}</g></svg>`;
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13l5 5L20 6"/></svg>';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default {
  root: null, ctx: null, page: 0, grid: [], r: 0, c: 0, cm: 0, d: null, kept: [], room: DOCK_MAX, timers: [], reduced: false, done: false, turning: false, armed: false, only: false,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = []; this.done = false; this.turning = false; this.armed = false;
    this.only = Boolean(ctx.params && ctx.params.only);
    this.reduced = isReduced();
    root.classList.toggle('is-reduced', this.reduced);
    // Draft: taken from the settings if the Letter is relaunched, otherwise the values of a brand-new TV.
    // Passages and added apps on the parapet have no tick box in the Letter: set aside, put back at the end.
    const c = getConfig();
    this.kept = c.firstRunDone ? c.dock.filter(isKept) : [];
    this.room = Math.max(1, DOCK_MAX - this.kept.length);
    this.d = c.firstRunDone
      ? { house: c.house, dock: c.dock.filter((id) => !isKept(id)), owl: c.owl, sounds: c.sounds }
      : { house: null, dock: PRESET.filter((id) => CATALOG.some((a) => a.id === id)), owl: 'vive', sounds: false };
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
        <div class="keyhint"><span><b>◀▶▲▼</b><em>Choisir</em></span><span><b>OK</b><em></em></span><span><b>Retour</b><em>Page précédente</em></span></div>
      </div>`;
    this.paintSeal();
    this.page = this.only ? clamp(Number(ctx.params.page) || 0, 0, LAST) : 0;
    if (this.only) root.querySelector('.sort-foot').style.display = 'none';   // one page alone: Back returns, nothing is saved
    this.render();
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (c.sounds || this.d.sounds) ctx.fx.initAudio();
  },

  unmount() { this.timers.forEach(clearTimeout); this.timers = []; this.grid = []; this.root = null; },

  k() { return Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1; },
  // `hold`: reading delay (a message that must stay legible), never shortened in reduced motion.
  later(fn, ms, hold) { const t = setTimeout(fn, ((this.reduced && !hold) ? Math.min(ms, 200) : ms) * this.k()); this.timers.push(t); return t; },

  // The letter's seal takes the colour of the draft's house (HOUSES constants, never a free value).
  paintSeal(press) {
    const seal = this.root.querySelector('.sort-seal');
    const h = this.d.house ? HOUSES[this.d.house] : null;
    seal.style.setProperty('--wax', h ? h.wax : '#7a1f1f');
    seal.querySelector('span').textContent = h ? h.name[0] : 'P';
    if (press) { seal.classList.remove('is-press'); void seal.offsetWidth; seal.classList.add('is-press'); }
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
    sheet.classList.remove('is-turn'); void sheet.offsetWidth; sheet.classList.add('is-turn');
    this.updateHint();
  },

  // Page I: the house.
  page0(sheet, line) {
    line(el('h2', 'sort-title', 'Choisissez votre maison'));
    line(el('p', 'sort-text', 'Votre téléviseur a été admis. Choisissez votre maison et vos sortilèges.'));
    line(el('p', 'sort-text', 'La cire de votre maison scellera chaque réglage.'));
    const row = line(el('div', 'sort-shields'));
    const items = [];
    Object.keys(HOUSES).forEach((id) => {
      const h = HOUSES[id];
      const card = el('div', 'sort-shield' + (this.d.house === id ? ' is-on' : ''));
      card.style.setProperty('--wax', h.wax);
      card.style.setProperty('--house-glow', h.glow);
      card.innerHTML = shieldSvg(id);
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
    seal.classList.remove('is-press'); void seal.offsetWidth; seal.classList.add('is-press');
    const t = w.querySelector('.sort-wax-text');
    t.textContent = this.d.house === id ? `Cire de ${h.name}, votre maison.` : `Cire de ${h.name}.`;
    this.writeIn(t);
  },

  // Page II: the spells (parapet apps).
  page1(sheet, line) {
    line(el('h2', 'sort-title', 'Vos sortilèges'));
    line(el('p', 'sort-text', `Les applis cochées prendront place sur le parapet, dans l’ordre où vous les cochez. ${DOCK_MAX} au plus ; les autres restent dans la Carte du Maraudeur.`));
    if (this.kept.length) {
      const names = this.kept.map((id) => (appById(id) || { name: '?' }).name).join(', ');
      const what = this.kept.every(isPassage) ? 'Vos Passages' : 'Vos Passages et applis ajoutées';
      line(el('p', 'sort-text sort-text-dim', `${what} (${names}) gardent leur place sur le parapet et comptent dans les ${DOCK_MAX}.`));
    }
    const count = line(el('div', 'sort-count'));
    const grid = line(el('div', 'sort-grid'));
    // The catalog only: hand-added apps (V4) keep their place through `kept`, and the grid fits on the sheet.
    const apps = allApps().filter((a) => a.cat !== 'passage' && !a.custom);
    const COLS = 5;      // same column count as .sort-grid (sorting.css): "down" lands on the cell right below
    let row = [];
    apps.forEach((a, n) => {
      const cell = el('div', 'sort-cell' + (this.d.dock.includes(a.id) ? ' is-on' : ''));
      const box = el('span', 'sort-box'); box.innerHTML = CHECK; cell.appendChild(box);
      cell.appendChild(this.inkLogo(a.id, 1.5));
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
    const msg = line(el('div', 'sort-msg'));
    const foot = line(el('div', 'sort-btns'));
    const next = el('div', 'sort-btn'); next.appendChild(el('span', null, 'Continuer')); foot.appendChild(next);
    this.grid.push([{ el: next, ok: () => this.turn(2) }]);
    this.paintCount();
    void count; void msg;
  },
  paintCount() {
    const c = this.root.querySelector('.sort-count'); if (!c) return;
    const n = this.d.dock.length + this.kept.length;      // kept Passages count
    const full = this.d.dock.length >= this.room;
    c.textContent = this.d.dock.length === 0 ? 'Aucun sortilège : le parapet recevra YouTube, jamais le vide.' : `${n} sortilège${n > 1 ? 's' : ''} sur ${DOCK_MAX}${full ? ' — le parapet est plein' : ''}`;
    this.writeIn(c);
  },

  // Page III: Hedwig and the sounds.
  page2(sheet, line) {
    line(el('h2', 'sort-title', 'Hedwige vous accompagne ?'));
    line(el('p', 'sort-text', 'Elle se pose sur l’appli choisie et s’envole à chaque pas. Calme, elle ne vole que pour les longs trajets. Absente, le médaillon s’allume seul.'));
    this.grid.push([this.enumLine(line, 'Hedwige', OWL, () => this.d.owl, (v) => { this.d.owl = v; })]);
    this.grid.push([this.enumLine(line, 'Sons', YESNO, () => this.d.sounds, (v) => { this.d.sounds = v; if (v) this.ctx.fx.initAudio(); })]);
    line(el('p', 'sort-text sort-text-dim', 'Les sons sont des clochettes synthétisées, jamais de musique. Tout se change plus tard dans la Salle sur Demande.'));
    const foot = line(el('div', 'sort-btns'));
    const next = el('div', 'sort-btn'); next.appendChild(el('span', null, 'Continuer')); foot.appendChild(next);
    this.grid.push([{ el: next, ok: () => this.turn(3) }]);
    this.r = 2;   // focus starts on "Continuer": three OK presses are enough for a brand-new TV
  },

  // Page IV: the emergency exits, then (on the TV) the button that asks for the Home key, then Lumos.
  page3(sheet, line) {
    line(el('h2', 'sort-title', 'Les issues de secours'));
    line(el('p', 'sort-text', 'Poudlard ne retient personne. Quatre gestes de la télécommande suffisent, à tout moment :'));
    EXITS.forEach(([key, effect]) => {
      const p = line(el('p', 'sort-text sort-keys'));
      p.appendChild(el('b', null, key));
      p.appendChild(el('span', null, effect));
    });
    const onTV = Platform.isTV() && Platform.homeMode() !== 'simulated';
    const note = line(el('p', 'sort-text sort-text-dim', onTV
      ? 'La touche Home est encore à l’accueil d’origine : Poudlard peut la demander maintenant, ou plus tard dans la Salle sur Demande.'
      : 'Désinstaller Poudlard TV rend toujours la télé telle qu’elle était : rien n’est désactivé.'));
    const foot = line(el('div', 'sort-btns'));
    if (onTV && Platform.homeMode() !== 'poudlard') {
      const ask = el('div', 'sort-btn'); ask.appendChild(el('span', null, 'Faire de Poudlard l’accueil')); foot.appendChild(ask);
      this.grid.push([{ el: ask, ok: () => {
        const r = Platform.setHome('poudlard');
        note.textContent = r.status === 'failed' ? r.error : (HOME_HINT[r.hint] || HOME_HINT['press-home']);
        this.writeIn(note);
        this.ctx.fx.chime(1319, 0.03);
      } }]);
      this.r = this.grid.length - 1;                       // focus starts on the button
    }
    const lumos = el('div', 'sort-btn sort-lumos'); lumos.appendChild(el('span', null, this.only ? 'Fermer' : 'Lumos')); foot.appendChild(lumos);
    this.grid.push([{ el: lumos, ok: () => (this.only ? this.ctx.router.back('fade') : this.finish()) }]);
    if (!(onTV && Platform.homeMode() !== 'poudlard')) this.r = this.grid.length - 1;   // otherwise Lumos: two presses for a new TV
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

  // Ink logo: official, or the monogram of a hand-added app (fallback: initials).
  inkLogo(id, h) {
    const app = appById(id);
    const L = LOGOS[id] || (app ? monogram(app.name) : null);
    const box = el('span', 'sort-inklogo');
    box.style.height = h + 'cqw';
    if (!L) { box.classList.add('is-text'); box.textContent = (app || { name: '?' }).name.slice(0, 2); box.style.width = h * 1.6 + 'cqw'; return box; }
    box.style.width = Math.min(h * 2.4, h * L.ratio) + 'cqw';
    const m = el('i'); m.style.setProperty('--m', `url("${L.src}")`); if (L.luma) m.classList.add('luma');
    box.appendChild(m);
    return box;
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
    this.page = clamp(p, 0, LAST);
    const sheet = this.root.querySelector('.sort-sheet');
    sheet.classList.add('is-leave');
    this.ctx.fx.whoosh();
    this.later(() => { if (!this.root) return; sheet.classList.remove('is-leave'); this.render(); this.turning = false; }, 260);
  },

  // ---- End: Lumos, or classic mode --------------------------------------------------------------------------
  // The final parapet = the ticked spells (or YouTube if none), then the kept Passages, 8 at most.
  finalDock() {
    const chosen = this.d.dock.length ? this.d.dock.slice() : FALLBACK_DOCK.slice();
    return [...chosen, ...this.kept].slice(0, DOCK_MAX);
  },
  finish() {
    if (this.done) return; this.done = true;
    const dock = this.finalDock();
    const btn = this.root.querySelector('.sort-lumos'), rr = this.root.getBoundingClientRect(), b = btn.getBoundingClientRect();
    this.ctx.fx.lumos(this.root, b.left - rr.left + b.width / 2, b.top - rr.top + b.height / 2, 900);
    this.ctx.fx.arpeggio();
    btn.classList.add('is-lit');
    this.later(() => {
      // "Lumos" picks Hogwarts: the Letter can be relaunched from classic mode.
      updateConfig({ firstRunDone: true, mode: 'poudlard', house: this.d.house, dock, owl: this.d.owl, sounds: this.d.sounds });
      this.ctx.router.replace('home', { boot: true }, 'fade');
    }, 450);
  },
  stayClassic() {
    if (this.done) return; this.done = true;
    const patch = { firstRunDone: true, mode: 'classique', dock: this.finalDock(), owl: this.d.owl, sounds: this.d.sounds };
    if (this.d.house) patch.house = this.d.house;
    updateConfig(patch);
    this.ctx.fx.whoosh();
    this.ctx.router.replace('classic', {}, 'fade');
  },

  // ---- Signatures -------------------------------------------------------------------------------------------
  writeIn(node) { if (!node) return; node.classList.remove('sort-write'); void node.offsetWidth; node.classList.add('sort-write'); },
  // Stop: small sideways refusal, composited with the focus transform (the letter does not straighten, the crest does not drop).
  nudge(node) {
    if (this.reduced || !node) return;
    node.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-.35cqw)' }, { transform: 'translateX(.3cqw)' }, { transform: 'translateX(0)' }], { duration: 220 * this.k(), composite: 'add' });
  },
  say(text) {
    const m = this.root.querySelector('.sort-msg'); if (!m) return;
    m.textContent = text; this.writeIn(m);
    this.later(() => { if (m.textContent === text) m.textContent = ''; }, 2600, true);
  },
  updateHint() {
    const h = this.root.querySelector('.keyhint'); if (!h) return;
    const it = this.grid[this.r] && this.grid[this.r][this.c];
    const okEm = h.querySelectorAll('em')[1];
    const cls = it ? it.el.className : '';
    okEm.textContent = cls.includes('sort-shield') ? 'Choisir' : cls.includes('sort-cell') ? 'Cocher' : cls.includes('sort-enum') ? 'Changer' : cls.includes('sort-lumos') ? (this.only ? 'Fermer' : 'Allumer') : 'Valider';
    const back = h.querySelectorAll('span')[2];
    back.style.opacity = (this.page > 0 || this.only) ? '' : '0';
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
    if (action === 'back') { if (this.page > 0) this.turn(this.page - 1); else this.nudge(this.root.querySelector('.sort-letter')); return true; }
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
