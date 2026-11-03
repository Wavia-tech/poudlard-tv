// The Room of Requirement (Salle sur Demande): the settings, on a large ledger open as a double-page spread.
// Left page: the sections. Right page: the section's content, and at the bottom a miniature preview
// of the parapet that recomposes live. Every change is saved immediately (updateConfig), written in quill
// and confirmed with a pressed wax seal. Two levels, never more.
// Holding Back for 2 s brings up classic mode from here too (the blueprint's reversibility rule).
import { HOUSES, DOCK_MAX, getConfig, updateConfig, resetConfig, allApps, appById, isReduced } from '../config.js';
import { Platform } from '../platform.js';
import { LOGOS } from '../../assets/logos.js';
import { monogram } from '../monogram.js';

// App logo: official (LOGOS) or, for a hand-added app (V4), its monogram. Null if the id is unknown.
const logoOf = (id) => LOGOS[id] || (appById(id) ? monogram(appById(id).name) : null);

// Sections of the left page (display order). The first two are the Free My TV pair: who answers the Home key,
// and the TV's own settings screens (Poudlard opens them, changes nothing itself).
const RUBRIQUES = [
  { id: 'home', label: 'Accueil de la télé', title: 'La touche Home', sub: 'Qui répond à la touche Home : Poudlard ou l’accueil d’origine de la télé.' },
  { id: 'tv', label: 'Réglages de la télé', title: 'La télé elle-même', sub: 'Ses propres menus : image, son, réseau, télécommandes. Poudlard n’y change rien.' },
  { id: 'dock', label: 'Parapet et applis', title: 'Le Parapet', sub: 'OK pose ou retire une appli ; Gauche et Droite changent son rang ; OK maintenu la cache dans la Carte.' },
  { id: 'house', label: 'Maison', title: 'Votre maison', sub: 'La cire, la bougie et le liseré prennent sa couleur.' },
  { id: 'owl', label: 'Chouette et sons', title: 'Hedwige', sub: 'Elle est le curseur du parapet. Les sons sont des clochettes, la musique une valse très basse.' },
  { id: 'motion', label: 'Mouvement et énergie', title: 'Mouvement', sub: 'Pour une télé qui rame, ou pour les yeux fatigués.' },
  { id: 'idle', label: 'Veille', title: 'Nox', sub: 'Sans touche, le château s’endort et seule l’heure veille.' },
  { id: 'classic', label: 'Mode classique', title: 'Le lundi matin', sub: 'Un accueil ordinaire, même parapet, sans décor ni chouette.' },
  { id: 'about', label: 'À propos', title: 'Poudlard TV', sub: 'Un objet privé, hors ligne, réversible.' },
];

// Enumerated values: [config value, displayed label]. Labels are constants, never data.
const OWL = [['vive', 'Vive'], ['calme', 'Calme'], ['absente', 'Absente']];
const YESNO = [[true, 'Oui'], [false, 'Non']];
const MOTION = [['auto', 'Auto'], ['reduit', 'Réduit'], ['economie', 'Économie']];
const SKY = [['auto', 'Selon l’heure'], ['nuit', 'Nuit claire']];
const FOLLOW = [['follow', 'Oui'], ['ignore', 'Non']];
const TEXT = [['normal', 'Normale'], ['grand', 'Grande']];
// Background music (sound.js): 'auto' = personal file (assets/music/ambiance.ogg, .mp3 or .m4a, not in the repo,
// see docs/MUSIC.md) if it exists, otherwise the celesta waltz. The notes speak to the person holding the
// remote: never a file path on screen.
const MUSIC = [['fichier', 'Ambiance Poudlard'], ['celesta', 'Célesta'], ['auto', 'Auto'], ['aucune', 'Aucune']];
const MUSIC_NOX = [['pause', 'Se tait'], ['continue', 'Continue']];
const MUSIC_NOTE = { fichier: 'Votre ambiance (assets/music/ambiance.mp3), en boucle, très bas. Si le fichier manque, la valse de célesta prend le relais.', auto: 'Votre ambiance si le fichier est là, sinon la valse de célesta.', celesta: 'Une valse lente de célesta, harpe et cordes, composée pour le parapet. Jamais un thème des films.', aucune: 'Les clochettes seulement, sans musique.' };
const MOTION_NOTE = { auto: 'Vol de la chouette, parallaxe, grain, scintillement : tout.', reduit: 'Fondus de 200 ms, rien de plus. Aussi forcé par le système si demandé.', economie: 'Sans grain ni particules ; scintillement ralenti, parallaxe sur un plan.' };
const IDLE = [[90, '1,5 min'], [180, '3 min'], [300, '5 min'], [600, '10 min'], [0, 'Jamais']];
const VERSION = 'Maquette 0.2 · novembre 2026';   // equals android:versionName (AndroidManifest.xml); CHANGELOG.md
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
// The TV's own screens, in Free My TV's order (Apps.SYSTEM keys). Shared with classic mode and the Map.
export const TV_SCREENS = [
  ['settings', 'Tous les réglages'], ['wifi', 'Réseau et Wi-Fi'], ['bluetooth', 'Télécommande et Bluetooth'], ['picture', 'Image'],
  ['sound', 'Son'], ['apps', 'Applications'], ['date', 'Date et heure'], ['language', 'Langue'], ['accessibility', 'Accessibilité'],
  ['update', 'Mise à jour'], ['about', 'À propos de la télé'],
];
export const TV_ONLY = 'Sur la télé seulement.';
const SAND_MS = 320;          // the sand falls through the hourglass before the list recomposes

// Hourglass: full = on the parapet, empty = in the Map. The bottom sand "falls" (scaleY) when the app is set down.
const HOURGLASS = '<svg class="set-glass" viewBox="0 0 24 32" aria-hidden="true">'
  + '<path class="g-frame" d="M4 2.5h16M4 29.5h16M6.5 2.5c0 8 5.5 10 5.5 13.5S6.5 21.5 6.5 29.5M17.5 2.5c0 8-5.5 10-5.5 13.5s5.5 5.5 5.5 13.5"/>'
  + '<path class="g-top" d="M8 5h8c0 4-4 6.5-4 9.5C12 11.5 8 9 8 5z"/>'
  + '<path class="g-bot" d="M7.5 27.5h9c0-5-4.5-8-4.5-11.5C12 19.5 7.5 22.5 7.5 27.5z"/></svg>';
// Miniature owl of the preview (ivory silhouette, a single stroke).
const MINI_OWL = '<svg viewBox="0 0 24 28" aria-hidden="true"><path d="M5 9c0-4 3-7 7-7s7 3 7 7v9c0 4-3 7-7 7s-7-3-7-7zM8 4l-2-3M16 4l2-3"/><circle cx="9" cy="10" r="1.3"/><circle cx="15" cy="10" r="1.3"/><path d="M12 12l-1.2 2h2.4z"/></svg>';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export default {
  root: null, ctx: null, rub: 0, level: 'left', row: 0, items: [], axis: 'v', timers: [], reduced: false,
  resetStep: 0, listOff: 0, scrollList: null, sealed: null, busy: false, lastPerch: null, homeAsk: false, onHomeEvent: null,

  async mount(root, ctx) {
    this.root = root; this.ctx = ctx; this.timers = [];
    this.rub = 0; this.level = 'left'; this.row = 0; this.resetStep = 0; this.listOff = 0; this.scrollList = null;
    this.sealed = new Set(); this.busy = false; this.lastPerch = null; this.homeAsk = false;
    // The TV answers the HOME role request later (system dialog): the row repaints without a key press.
    this.onHomeEvent = () => { if (this.root && RUBRIQUES[this.rub].id === 'home' && !this.homeAsk) this.renderRight('Touche Home'); };
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
            <ul class="set-rubs"></ul>
            <div class="set-folio">Registre des réglages</div>
          </div>
          <div class="set-spine"></div>
          <div class="set-page set-right parchment">
            <div class="set-rtitle"></div>
            <div class="set-rsub"></div>
            <div class="set-body"></div>
            <div class="set-msg"></div>
            <div class="set-preview">
              <div class="set-pv-label"></div>
              <div class="set-pv-stone">
                <div class="set-pv-mist"></div>
                <div class="set-pv-glow"></div>
                <div class="set-pv-row"></div>
                <div class="set-pv-owl">${MINI_OWL}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="keyhint"><span><b>▲▼</b><em></em></span><span><b>OK</b><em></em></span><span><b>◀</b><em></em></span><span><b>Retour</b><em></em></span></div>
      </div>`;
    this.renderRubs();
    this.renderRight(undefined, true);
    this.renderPreview();
    this.updateHint();
    // The ledger opens: the left page folds over (rotateY), the right one fades in.
    requestAnimationFrame(() => root.classList.add('is-open'));
    if (getConfig().sounds) ctx.fx.initAudio();
  },

  unmount() {
    this.timers.forEach(clearTimeout); this.timers = [];
    if (this.onHomeEvent) document.removeEventListener('poudlard:home', this.onHomeEvent);
    this.onHomeEvent = null;
    this.items = []; this.root = null; this.scrollList = null;
  },

  // Test bench time multiplier (×3 slow motion).
  k() { return Number(getComputedStyle(this.root).getPropertyValue('--k')) || 1; },
  // `hold`: reading delay (a message that must stay legible), never shortened in reduced motion.
  later(fn, ms, hold) { const t = setTimeout(fn, ((this.reduced && !hold) ? Math.min(ms, 200) : ms) * this.k()); this.timers.push(t); return t; },

  // ---- Left page --------------------------------------------------------------------------------------------
  renderRubs() {
    const ul = this.root.querySelector('.set-rubs');
    ul.textContent = '';
    RUBRIQUES.forEach((r) => {
      const li = el('li', 'set-rub');
      li.appendChild(el('span', 'set-rub-label', r.label));
      li.appendChild(el('i', 'set-quill'));           // the quill stroke under the focused line
      ul.appendChild(li);
    });
    this.syncRubs();
  },
  syncRubs() {
    this.root.querySelectorAll('.set-rub').forEach((li, n) => {
      li.classList.toggle('is-focus', this.level === 'left' && n === this.rub);
      li.classList.toggle('is-active', n === this.rub);
    });
  },
  rubEl() { return this.root.querySelectorAll('.set-rub')[this.rub]; },

  // Back to the sections: a single path, which always disarms the "Réinitialiser" (reset) double confirmation.
  toLeft() {
    this.level = 'left';
    if (this.resetStep) { this.resetStep = 0; this.renderRight('Réinitialiser'); }
    if (this.homeAsk) { this.homeAsk = false; this.renderRight('Touche Home'); }
    this.syncFocus();
  },

  // ---- Right page -------------------------------------------------------------------------------------------
  // Each section renders navigable "items": { id, el, key(action) → true (consumed) | 'exit' (back to the sections) | false }.
  // `axis`: 'v' (up/down) or 'h' (left/right). The single focus is set by syncFocus().
  // `keep`: item id to restore the focus on; `fresh`: we are arriving on the section (title, subtitle
  // and first line are written in quill one after another). A re-render after a change does not write the title.
  renderRight(keep, fresh) {
    const r = RUBRIQUES[this.rub];
    const title = this.root.querySelector('.set-rtitle'), sub = this.root.querySelector('.set-rsub');
    title.textContent = r.title;
    sub.textContent = r.sub;
    const msg = this.root.querySelector('.set-msg'); if (msg) msg.textContent = '';
    const body = this.root.querySelector('.set-body');
    body.textContent = '';
    body.dataset.rub = r.id;
    this.items = []; this.axis = 'v';
    const spec = this['rub_' + r.id](body);
    this.items = spec.items; this.axis = spec.axis || 'v';
    // Restore the focus on an id (after a parapet change), otherwise on the requested position.
    let idx = typeof spec.start === 'number' ? spec.start : 0;
    if (keep != null) { const f = this.items.findIndex((it) => it.id === keep); if (f >= 0) idx = f; }
    this.row = Math.min(Math.max(0, idx), Math.max(0, this.items.length - 1));
    this.syncFocus();
    if (fresh) { this.writeIn(title, 0); this.writeIn(sub, 1); this.writeIn(body.firstElementChild, 2); }
  },
  syncFocus() {
    this.items.forEach((it, n) => it.el.classList.toggle('is-focus', this.level === 'right' && n === this.row));
    this.syncRubs();
    this.updateHint();
    this.placePreviewOwl();
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
    row.appendChild(el('i', 'set-rowseal wax-seal'));
    parent.appendChild(row);
    let note = null;
    if (noteFn) { note = el('div', 'set-note'); parent.appendChild(note); }
    const idx = () => Math.max(0, options.findIndex((o) => o[0] === get()));
    const paint = () => {
      const i = idx();
      value.textContent = options[i][1];
      left.classList.toggle('is-off', i === 0);
      right.classList.toggle('is-off', i === options.length - 1);
      if (note) note.textContent = noteFn(options[i][0]);
    };
    paint();
    const change = (i) => {
      set(options[i][0]);
      paint();
      this.writeIn(value); if (note) this.writeIn(note);
      this.press(row.querySelector('.set-rowseal'));
      this.ctx.fx.chime(1319, 0.03);
      this.placePreviewOwl();                       // the preview reacts (owl absent, etc.)
    };
    return {
      id: label, el: row,
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
    m.style.setProperty('--m', `url("${L.src}")`);
    if (L.luma) m.classList.add('luma');
    box.appendChild(m);
    return box;
  },

  // ---- Section: Home key (Free My TV's "Home Screen" row) -----------------------------------------------------
  // One row, two answers. Giving the key back asks a confirmation (focus on "Non"); taking it asks the system,
  // which answers with a hint (the TV's own dialog, or "press Home"). In the mock-up the row is read-only.
  rub_home(body) {
    const mode = Platform.homeMode();
    const mock = !Platform.isTV() || mode === 'simulated';
    const dev = Platform.device();
    if (dev.fireTv) {               // Fire TV never hands the Home key over: no row, one honest note
      body.appendChild(el('p', 'set-text', HOME_HINT.fire));
      return { items: [], axis: 'v', start: 0 };
    }
    if (dev.phone) {
      body.appendChild(el('p', 'set-text', 'Pas une télé : la touche Home n’est pas demandée.'));
      return { items: [], axis: 'v', start: 0 };
    }
    if (mode === 'reverted') {      // the guard gave the key back after three crashes: say so, OK asks again
      body.appendChild(el('p', 'set-text', 'Rendue après trois pannes : la touche Home est à l’accueil d’origine.'));
      const btns = el('div', 'set-btns'); body.appendChild(btns);
      return { items: [this.button(btns, 'Redemander la touche Home', () => { this.takeHome(); this.later(() => this.root && this.renderRight('Redemander la touche Home'), 600, true); })], axis: 'h', start: 0 };
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
    // `homePending`: the key was asked for and the system has not answered yet (the row shows the wish, the
    // message band the hint); the 'poudlard:home' event then repaints the truth.
    this.homePending = null;
    const row = this.enumRow(body, 'Touche Home', HOME_MODES, () => this.homePending || (mode === 'original' ? 'original' : 'poudlard'), (v) => {
      if (v === 'original') { this.homeAsk = true; this.renderRight(); return; }
      this.takeHome();
    }, (v) => (mock ? HOME_NOTE_MOCK : this.homePending ? 'La télé décide : lisez le message en bas de page.' : v === 'poudlard' ? 'Poudlard répond à la touche Home.' : 'L’accueil d’origine répond à la touche Home. OK ou ▶ pour la rendre à Poudlard.'));
    if (mock) {
      row.el.classList.add('is-off');
      const nudge = () => { this.nudge(row.el); this.say(HOME_NOTE_MOCK); return true; };
      row.key = (a) => (a === 'left' ? 'exit' : (a === 'right' || a === 'ok') ? nudge() : false);
    }
    body.appendChild(el('div', 'set-note set-note-dim', 'Rien n’est désactivé sur la télé : désinstaller Poudlard TV rend toujours la touche Home à l’accueil d’origine.'));
    return { items: [row], axis: 'v', start: 0 };
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
    const apps = allApps();
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
      // Tag: "caché" (hidden, ink faded to 35%); a hand-added app (V4) also carries "perso".
      row.appendChild(el('span', 'set-app-hidden', a.hidden ? (a.custom ? 'caché · perso' : 'caché') : a.custom ? 'perso' : ''));
      const g = el('span', 'set-app-glass'); g.innerHTML = HOURGLASS; row.appendChild(g);
      const seal = el('i', 'set-rowseal wax-seal');
      if (this.sealed.has(a.id)) seal.classList.add('is-sealed');                   // kept seals survive the re-render
      row.appendChild(seal);
      return row;
    };
    onDock.forEach((a, n) => { const row = mk(a, n); list.appendChild(row); items.push({ id: a.id, el: row, key: (k) => this.dockKey(a.id, k, row) }); });
    const head2 = el('div', 'set-list-head');
    head2.appendChild(el('span', null, 'Dans la Carte du Maraudeur'));
    list.appendChild(head2);
    others.forEach((a) => { const row = mk(a, -1); list.appendChild(row); items.push({ id: a.id, el: row, key: (k) => this.dockKey(a.id, k, row) }); });
    // Keep the focused row visible: the list slides (transform), never a scrollbar.
    this.scrollList = list;
    list.style.transform = `translateY(${this.listOff}px)`;
    return { items, axis: 'v', start: 0 };
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
      this.press(row.querySelector('.set-rowseal'));
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
      if (r) { this.press(r.querySelector('.set-rowseal')); this.writeIn(r.querySelector('.set-app-hidden')); this.writeIn(r.querySelector('.set-app-name')); }
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
      this.flipRebuild(id);
      const r = this.items[this.row].el;
      this.press(r.querySelector('.set-rowseal')); this.writeIn(r.querySelector('.set-app-rank'));
      this.ctx.fx.chime(1175, 0.025);
      return true;
    }
    return false;
  },
  // FLIP: measure, rebuild, then each moved row slides from its old position (transform only).
  flipRebuild(id) {
    const before = new Map(this.items.map((it) => [it.id, it.el.offsetTop]));
    this.renderRight(id);
    this.renderPreview();
    this.keepVisible();
    if (this.reduced) return;
    this.items.forEach((it) => {
      const was = before.get(it.id);
      if (was == null || was === it.el.offsetTop) return;
      it.el.animate([{ transform: `translateY(${was - it.el.offsetTop}px)` }, { transform: 'translateY(0)' }], { duration: 300 * this.k(), easing: 'cubic-bezier(.3,.7,.2,1)', composite: 'add' });
    });
  },
  // Ephemeral message written in quill, placed at the bottom of the page (outside the sliding list: always visible).
  say(text) {
    const m = this.root.querySelector('.set-msg'); if (!m) return;
    m.textContent = text; this.writeIn(m);
    this.later(() => { if (m.textContent === text) m.textContent = ''; }, 2600, true);
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
    const items = [
      this.enumRow(body, 'Mouvement', MOTION, () => getConfig().motion, (v) => { updateConfig({ motion: v }); this.reduced = isReduced(); this.root.classList.toggle('is-reduced', this.reduced); }, (v) => MOTION_NOTE[v]),
      this.enumRow(body, 'Ciel', SKY, () => getConfig().sky || 'auto', (v) => updateConfig({ sky: v }),
        (v) => (v === 'auto' ? 'Crépuscule, nuit, nuit profonde, aube : le ciel suit l’heure.' : 'Une nuit claire, toujours.')),
      this.enumRow(body, 'Suivre le système', FOLLOW, () => getConfig().motionSystem || 'follow', (v) => { updateConfig({ motionSystem: v }); this.reduced = isReduced(); this.root.classList.toggle('is-reduced', this.reduced); },
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
      ...(dev.sdk ? [['Télé', `${dev.manufacturer} ${dev.model} · Android ${dev.sdk}`]] : []),
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
      if (this.resetStep === 1) { label.textContent = 'Tout effacer ? OK pour confirmer'; this.writeIn(label); note.textContent = 'Maison, parapet, chouette, veille : tout revient à l’état neuf.'; this.writeIn(note); return; }
      if (this.resetStep === 2) { label.textContent = 'Dernière fois : OK efface tout'; this.writeIn(label); b.classList.add('set-btn-nox'); return; }
      resetConfig();
      this.resetStep = 0; this.sealed.clear();
      this.ctx.fx.whoosh();
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
    this.root.querySelector('.set-pv-label').textContent = `Le parapet, en direct · ${dock.length} sur ${DOCK_MAX}`;
    if (!dock.length) { row.appendChild(el('span', 'set-pv-empty', 'Le parapet est vide')); this.placePreviewOwl(); return; }
    dock.forEach((id) => {
      const L = logoOf(id);
      const slot = el('div', 'set-pv-app'); slot.dataset.id = id;
      if (L) {
        slot.style.width = Math.min(4.2, 1.9 * L.ratio) + 'cqw';
        const logo = el('div', 'app-logo ivory-logo' + (L.luma ? ' luma' : ''));
        logo.style.setProperty('--m', `url("${L.src}")`);
        logo.innerHTML = '<i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i>';
        slot.appendChild(logo);
      } else {
        slot.style.width = '3cqw';
        slot.appendChild(el('span', 'set-pv-text', (appById(id) || { name: '?' }).name.slice(0, 3)));
      }
      row.appendChild(slot);
    });
    this.placePreviewOwl();
  },
  // The miniature owl perches above the focused app if it is on the parapet; otherwise it stays on its
  // last perch. The gold and the candle only light up for a parapet app that is actually in focus.
  placePreviewOwl() {
    const root = this.root; if (!root) return;
    const owl = root.querySelector('.set-pv-owl'), glow = root.querySelector('.set-pv-glow'); if (!owl) return;
    const c = getConfig();
    owl.classList.toggle('is-gone', c.owl === 'absente' || !c.dock.length);
    const cur = this.level === 'right' && RUBRIQUES[this.rub].id === 'dock' && this.items[this.row] ? this.items[this.row].id : null;
    const onDock = Boolean(cur && c.dock.includes(cur));
    const id = onDock ? cur : (this.lastPerch && c.dock.includes(this.lastPerch) ? this.lastPerch : c.dock[0]);
    requestAnimationFrame(() => {
      if (!this.root) return;
      const slot = this.root.querySelector(`.set-pv-app[data-id="${CSS.escape(String(id || ''))}"]`);
      this.root.querySelectorAll('.set-pv-app').forEach((s) => s.classList.toggle('is-lit', onDock && s === slot));
      if (glow) glow.classList.toggle('is-on', onDock && Boolean(slot));
      if (!slot) return;
      this.lastPerch = id;
      const cx = slot.offsetLeft + slot.offsetWidth / 2;
      owl.style.transform = `translateX(${cx - owl.offsetWidth / 2}px)`;
      if (glow) glow.style.transform = `translateX(${cx - glow.offsetWidth / 2}px)`;
    });
  },

  // ---- Signatures: quill writing, pressed seal --------------------------------------------------------------
  // `i`: writing rank (0, 1, 2...) to write several lines one after another.
  writeIn(node, i = 0) {
    if (!node) return;
    node.style.setProperty('--i', String(i));
    node.classList.remove('set-write'); void node.offsetWidth; node.classList.add('set-write');
  },
  press(seal) {
    if (!seal) return;
    seal.classList.add('is-sealed');
    seal.classList.remove('is-press'); void seal.offsetWidth; seal.classList.add('is-press');
  },

  // ---- Key hint at the bottom of the screen -----------------------------------------------------------------
  updateHint() {
    const h = this.root.querySelector('.keyhint'); if (!h) return;
    const spans = h.querySelectorAll('span');
    const [a, b, c, d] = h.querySelectorAll('em');
    spans[0].style.opacity = '';
    if (this.level === 'left') { a.textContent = 'Rubrique'; b.textContent = 'Entrer'; c.textContent = 'Quitter'; d.textContent = 'Quitter'; return; }
    const id = RUBRIQUES[this.rub].id;
    a.textContent = 'Ligne';
    if (this.axis === 'h') spans[0].style.opacity = '0';          // nothing to say for ▲▼: we clear it, we don't write "Nothing"
    b.textContent = id === 'dock' ? 'Poser · Retirer' : id === 'house' ? 'Choisir' : id === 'tv' ? 'Ouvrir' : (id === 'classic' || id === 'about') ? 'Valider' : 'Changer';
    c.textContent = id === 'dock' ? 'Rang ◀▶' : this.axis === 'h' ? 'Choisir ◀▶' : 'Valeur ◀▶';
    d.textContent = 'Rubriques';
  },

  // Slide the parapet list to keep the focused row visible (transform, no scroll).
  // The message band, at the bottom of the page, is reserved: a focused row is never beneath it.
  keepVisible() {
    const list = this.scrollList; if (!list || !this.items[this.row] || RUBRIQUES[this.rub].id !== 'dock') return;
    const body = list.parentElement; const msg = this.root.querySelector('.set-msg');
    const H = body.clientHeight - (msg ? msg.offsetHeight : 0); const r = this.items[this.row].el;
    const top = r.offsetTop, bottom = top + r.offsetHeight;
    let off = this.listOff;
    if (bottom + off > H - 8) off = H - 8 - bottom; else if (top + off < 0) off = -top;
    if (off > 0) off = 0;
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
    if (action === 'okdown') { const it = this.level === 'right' && this.items[this.row]; if (it && it.el && !this.busy) it.el.classList.add('is-press'); return true; }
    { const it = this.items[this.row]; if (it && it.el) it.el.classList.remove('is-press'); }
    if (this.busy) return true;                                   // the sand is falling: 320 ms without keys
    if (action === 'longback') { this.ctx.router.go('home', { askClassic: true }, 'fade'); return true; }   // the Parapet asks "Nox ?" (never a silent switch)
    if (action === 'home') { this.leave(); return true; }
    if (action === 'menu') { if (this.level === 'right') this.toLeft(); else this.leave(); return true; }

    if (this.level === 'left') {
      if (action === 'up' || action === 'down') {
        const n = this.rub + (action === 'up' ? -1 : 1);
        if (n < 0 || n >= RUBRIQUES.length) { this.nudge(this.rubEl()); return true; }
        this.rub = n; this.resetStep = 0; this.homeAsk = false; this.listOff = 0; this.scrollList = null;
        this.renderRight(undefined, true);
        this.ctx.fx.chime(988, 0.02);
        return true;
      }
      if (action === 'right' || action === 'ok') {
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
