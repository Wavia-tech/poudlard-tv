// Launcher configuration: app catalog, Library collections, settings, validated local storage.
// No data ever leaves the device. Everything read from storage goes through `sanitize()`.

// House colours: the same four tokens as base.css (html[data-house]); kept here for the previews drawn before a choice.
export const HOUSES = {
  gryffondor: { name: 'Gryffondor', wax: '#7a1f1f', glow: '#ffb457', ink: '#3a1810', night: '#140a0c' },
  serpentard: { name: 'Serpentard', wax: '#1f4a2e', glow: '#9fe3b8', ink: '#10261a', night: '#07130d' },
  serdaigle: { name: 'Serdaigle', wax: '#1f3a6b', glow: '#9fc4ff', ink: '#101c33', night: '#070e1c' },
  poufsouffle: { name: 'Poufsouffle', wax: '#8a6a1c', glow: '#ffe28a', ink: '#2c2008', night: '#120e04' },
};

// Catalog: stable id, display name, category, Android package (for the real launcher), deep-link scheme when known.
// `input`: HDMI input for Passages (consoles, set-top boxes); the real launcher reads it through TvInputManager.
// Passages are `in<port>`: on the TV the Map lists the real ports (Platform.inputs()) under the same ids, and
// `config.passages[id].name` holds the name the person gave a port. The mock-up shows four generic consoles.
export const CATALOG = [
  { id: 'netflix', name: 'Netflix', cat: 'video', pkg: 'com.netflix.ninja', deeplink: 'nflx://www.netflix.com/title/{id}' },
  { id: 'prime', name: 'Prime Video', cat: 'video', pkg: 'com.amazon.amazonvideo.livingroom' },
  { id: 'disney', name: 'Disney+', cat: 'video', pkg: 'com.disney.disneyplus' },
  { id: 'canal', name: 'Canal+', cat: 'video', pkg: 'com.canal.android.canal' },
  { id: 'max', name: 'Max', cat: 'video', pkg: 'com.wbd.stream', deeplink: 'https://play.max.com/{id}' },
  { id: 'appletv', name: 'Apple TV', cat: 'video', pkg: 'com.apple.atve.androidtv.appletv' },
  { id: 'paramount', name: 'Paramount+', cat: 'video', pkg: 'com.cbs.ott' },
  { id: 'youtube', name: 'YouTube', cat: 'video', pkg: 'com.google.android.youtube.tv' },
  { id: 'francetv', name: 'france.tv', cat: 'video', pkg: 'fr.francetv.pluzz' },
  { id: 'tf1', name: 'TF1+', cat: 'video', pkg: 'fr.tf1.player' },
  { id: 'm6', name: 'M6+', cat: 'video', pkg: 'fr.m6.m6replay' },
  { id: 'arte', name: 'Arte', cat: 'video', pkg: 'tv.arte.plus7' },
  { id: 'crunchyroll', name: 'Crunchyroll', cat: 'video', pkg: 'com.crunchyroll.crunchyroid' },
  { id: 'dazn', name: 'DAZN', cat: 'video', pkg: 'com.dazn' },
  { id: 'twitch', name: 'Twitch', cat: 'autres', pkg: 'tv.twitch.android.app' },
  { id: 'spotify', name: 'Spotify', cat: 'autres', pkg: 'com.spotify.tv.android' },
  { id: 'deezer', name: 'Deezer', cat: 'autres', pkg: 'deezer.android.tv' },
  { id: 'plex', name: 'Plex', cat: 'autres', pkg: 'com.plexapp.android' },
  { id: 'in1', name: 'Console 1', cat: 'passage', input: 'HDMI 1' },
  { id: 'in2', name: 'Console 2', cat: 'passage', input: 'HDMI 2' },
  { id: 'in3', name: 'Console 3', cat: 'passage', input: 'HDMI 3' },
  { id: 'in4', name: 'Console 4', cat: 'passage', input: 'HDMI 4' },
];
const IDS = new Set(CATALOG.map((a) => a.id));
const PASSAGE_RE = /^in\d{1,2}$/;                 // a real HDMI port of the TV may go beyond the four of the mock-up
const isKnownId = (id) => IDS.has(id) || /^c_\d{1,6}$/.test(id) || PASSAGE_RE.test(id);
export const DOCK_MAX = 8;
export const PASSAGES_MAX = 12;
// Ids of the passages before config version 4 (named consoles): kept so an old parapet keeps its HDMI entries.
const OLD_PASSAGES = { ps5: 'in1', ps4: 'in2', xbox: 'in3', switch: 'in4' };

// Library collections, each shown as a shop window (ollivanders.js). `scene`: the generated backdrop, its size in
// pixels and one selection polygon per film (top-left, top-right, bottom-right, bottom-left, image pixels);
// `app`: the app that owns the title; `url`: the film's page (host allow-list in platform.js), never typed on screen.
export const LIBRARY = [
  {
    // `url`: the film's page on Max (links supplied by the owner). Only the hosts in URL_HOSTS are accepted by platform.js.
    id: 'hp', title: 'Harry Potter', background: 'library',
    alsoWith: ['canal'],          // other apps offered by the Remembrall ("Ouvrir avec Canal+"): the app opens, the film is searched inside
    scene: { image: 'assets/ollivanders.webp', w: 1672, h: 941, boxes: [
      [[248, 318], [338, 313], [350, 790], [162, 790]], [[340, 318], [438, 313], [506, 790], [352, 790]], [[556, 322], [674, 318], [686, 790], [520, 790]], [[708, 322], [820, 318], [852, 790], [690, 790]],
      [[861, 322], [977, 318], [1020, 790], [858, 790]], [[1011, 322], [1135, 318], [1200, 790], [1030, 790]], [[1195, 320], [1285, 316], [1370, 790], [1180, 790]], [[1340, 322], [1440, 318], [1565, 790], [1385, 790]],
    ] },
    items: [
      { n: 1, title: "À l'école des sorciers", year: 2001, symbol: 'stone', color: '#7a2328', app: 'max', content: 'hp1', url: "https://www.max.com/fr/fr/search?q=Harry+Potter+à+l'école+des+sorciers" },
      { n: 2, title: 'La Chambre des secrets', year: 2002, symbol: 'serpent', color: '#25492c', app: 'max', content: 'hp2', url: 'https://www.max.com/fr/fr/search?q=Harry+Potter+et+la+Chambre+des+secrets' },
      { n: 3, title: "Le Prisonnier d'Azkaban", year: 2004, symbol: 'timeturner', color: '#4a2f5c', app: 'max', content: 'hp3', url: "https://www.max.com/fr/fr/search?q=Harry+Potter+et+le+Prisonnier+d'Azkaban" },
      { n: 4, title: 'La Coupe de feu', year: 2005, symbol: 'goblet', color: '#8a4f1c', app: 'max', content: 'hp4', url: 'https://www.max.com/fr/fr/search?q=Harry+Potter+et+la+Coupe+de+feu' },
      { n: 5, title: "L'Ordre du Phénix", year: 2007, symbol: 'phoenix', color: '#1f3d6b', app: 'max', content: 'hp5', url: "https://www.max.com/fr/fr/search?q=Harry+Potter+et+l'Ordre+du+Phénix" },
      { n: 6, title: 'Le Prince de sang-mêlé', year: 2009, symbol: 'vial', color: '#3d4a26', app: 'max', content: 'hp6', url: 'https://www.max.com/fr/fr/search?q=Harry+Potter+et+le+Prince+de+sang-mêlé' },
      { n: 7, title: 'Les Reliques de la Mort, 1re partie', year: 2010, symbol: 'locket', color: '#5c1f3a', app: 'max', content: 'hp7', url: 'https://www.max.com/fr/fr/search?q=Harry+Potter+et+les+Reliques+de+la+Mort+Partie+1' },
      { n: 8, title: 'Les Reliques de la Mort, 2e partie', year: 2011, symbol: 'wand', color: '#2b2b45', app: 'max', content: 'hp8', url: 'https://www.max.com/fr/fr/search?q=Harry+Potter+et+les+Reliques+de+la+Mort+Partie+2' },
    ],
  },
  {
    id: 'fb', title: 'Les Animaux fantastiques', background: 'newyork',
    scene: { image: 'assets/beasts.webp', w: 1024, h: 576, boxes: [
      [[45, 262], [345, 262], [345, 500], [45, 500]], [[368, 252], [662, 252], [662, 500], [368, 500]], [[682, 262], [978, 262], [978, 506], [682, 506]],
    ] },
    items: [
      // Netflix title pages (ids read from netflix.com, November 2026); availability depends on the country.
      { n: 1, title: 'Les Animaux fantastiques', year: 2016, symbol: 'suitcase', color: '#1d3b4a', app: 'netflix', content: 'fb1', url: 'https://www.netflix.com/title/80111501' },
      { n: 2, title: 'Les Crimes de Grindelwald', year: 2018, symbol: 'skull', color: '#2a2a2a', app: 'netflix', content: 'fb2', url: 'https://www.netflix.com/title/80997275' },
      { n: 3, title: 'Les Secrets de Dumbledore', year: 2022, symbol: 'phoenix', color: '#3d2f1a', app: 'netflix', content: 'fb3', url: 'https://www.netflix.com/title/81516447' },
    ],
  },
];

export const DEFAULT_CONFIG = Object.freeze({
  version: 4,
  mode: 'poudlard',             // 'poudlard' | 'classique'
  house: null,                  // null until the Admission Letter has been completed
  dock: ['netflix', 'prime', 'disney', 'canal', 'max', 'appletv', 'youtube', 'in1'],   // order = display order, 8 max
  passages: {},                 // names given to HDMI ports: { in2: { name: 'Salon' } }
  hidden: [],                   // apps hidden from the Map (never lost: they can be shown again)
  owl: 'vive',                  // 'vive' | 'calme' | 'absente'
  sounds: false,
  music: 'auto',                // background music: 'auto' (personal file if present, otherwise celesta) | 'fichier' (the file) | 'celesta' | 'aucune'
  musicNox: 'pause',            // during Nox (sleep): 'pause' the music | 'continue' it
  motion: 'auto',               // 'auto' | 'reduit' | 'economie'
  sky: 'auto',                  // the Parapet's sky: 'auto' (dusk, night, deep night, dawn by the hour) | 'nuit' (always a clear night)
  motionSystem: 'follow',       // 'follow' the system's reduced-motion flag | 'ignore' it
  text: 'normal',               // 'normal' | 'grand' (every type token × 1.25)
  homeNagAt: 0,                 // when the Parapet last offered to ask the Home key back after a TV update (once a day)
  idleSeconds: 0,               // sleep (Nox); 0 = never (sleep OFF by default, by design)
  lastApp: null,
  firstRunDone: false,
  library: { hidden: [], apps: {} },   // hidden titles ('collection:content') and the app chosen per title
  custom: [],                          // apps added by hand: { id: 'c_<n>', name, pkg? }; logo = monogram
});
const NAME_RE = /^[\p{L}\p{N} .+'&-]{1,20}$/u;
const PKG_RE = /^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/;
const CONTENT_KEYS = new Set(LIBRARY.flatMap((c) => c.items.map((it) => `${c.id}:${it.content}`)));

const KEY = 'poudlard-tv.config';
const listeners = new Set();
let current = structuredClone(DEFAULT_CONFIG);

const idList = (v, known, max = Infinity) => {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).filter((id) => typeof id === 'string' && known.has(id) && !seen.has(id) && seen.add(id)).slice(0, max);
};

// Keeps only known, well-typed values: corrupted or foreign storage cannot inject anything.
export function sanitize(raw) {
  const c = structuredClone(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return c;
  // Apps added by hand: short, plain name, optional well-formed Android package, 12 at most.
  if (Array.isArray(raw.custom)) {
    const seen = new Set();
    c.custom = raw.custom.filter((a) => a && typeof a === 'object' && /^c_\d{1,6}$/.test(String(a.id)) && NAME_RE.test(String(a.name)) && !seen.has(a.id) && seen.add(a.id))
      .slice(0, 12).map((a) => ({ id: a.id, name: String(a.name).trim(), ...(typeof a.pkg === 'string' && PKG_RE.test(a.pkg) ? { pkg: a.pkg } : {}) }));
  }
  // Named HDMI ports: `in<n>` keys only, a plain short name, 12 at most.
  if (raw.passages && typeof raw.passages === 'object' && !Array.isArray(raw.passages)) {
    for (const [k, v] of Object.entries(raw.passages)) {
      if (Object.keys(c.passages).length >= PASSAGES_MAX) break;
      if (PASSAGE_RE.test(k) && v && typeof v === 'object' && NAME_RE.test(String(v.name))) c.passages[k] = { name: String(v.name).trim() };
    }
  }
  const known = new Set([...IDS, ...c.custom.map((a) => a.id)]);
  const knows = (id) => known.has(id) || PASSAGE_RE.test(id);
  if (raw.mode === 'classique') c.mode = 'classique';
  if (typeof raw.house === 'string' && HOUSES[raw.house]) c.house = raw.house;
  if (Array.isArray(raw.dock)) c.dock = idList(raw.dock, { has: knows }, DOCK_MAX);
  if (Array.isArray(raw.hidden)) c.hidden = idList(raw.hidden, { has: knows }).filter((id) => !c.dock.includes(id));
  if (['vive', 'calme', 'absente'].includes(raw.owl)) c.owl = raw.owl;
  if (typeof raw.sounds === 'boolean') c.sounds = raw.sounds;
  if (['auto', 'fichier', 'celesta', 'aucune'].includes(raw.music)) c.music = raw.music;
  if (['pause', 'continue'].includes(raw.musicNox)) c.musicNox = raw.musicNox;
  if (['auto', 'reduit', 'economie'].includes(raw.motion)) c.motion = raw.motion;
  if (['auto', 'nuit'].includes(raw.sky)) c.sky = raw.sky;
  if (['follow', 'ignore'].includes(raw.motionSystem)) c.motionSystem = raw.motionSystem;
  if (['normal', 'grand'].includes(raw.text)) c.text = raw.text;
  if (Number.isInteger(raw.homeNagAt) && raw.homeNagAt >= 0) c.homeNagAt = raw.homeNagAt;
  if (Number.isInteger(raw.idleSeconds) && raw.idleSeconds >= 0 && raw.idleSeconds <= 3600) c.idleSeconds = raw.idleSeconds;
  if (typeof raw.lastApp === 'string' && knows(raw.lastApp)) c.lastApp = raw.lastApp;
  if (raw.firstRunDone === true) c.firstRunDone = true;
  const lib = raw.library && typeof raw.library === 'object' ? raw.library : {};
  if (Array.isArray(lib.hidden)) c.library.hidden = [...new Set(lib.hidden.filter((k) => typeof k === 'string' && CONTENT_KEYS.has(k)))];
  if (lib.apps && typeof lib.apps === 'object') {
    for (const [k, v] of Object.entries(lib.apps)) if (CONTENT_KEYS.has(k) && typeof v === 'string' && IDS.has(v)) c.library.apps[k] = v;
  }
  return c;
}

export function loadConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    // Migration: before version 3, sleep defaulted to 90 s; it is now disabled by default.
    if (parsed && typeof parsed === 'object' && !(Number(parsed.version) >= 3)) { parsed.idleSeconds = 0; parsed.version = 3; }
    // Migration: before version 4, the passages were named consoles (ps5…); they become HDMI ports (in1…).
    if (parsed && typeof parsed === 'object' && !(Number(parsed.version) >= 4)) {
      const mig = (id) => OLD_PASSAGES[id] || id;
      if (Array.isArray(parsed.dock)) parsed.dock = parsed.dock.map(mig);
      if (Array.isArray(parsed.hidden)) parsed.hidden = parsed.hidden.map(mig);
      if (typeof parsed.lastApp === 'string') parsed.lastApp = mig(parsed.lastApp);
      parsed.version = 4;
      current = sanitize(parsed);
      try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* storage unavailable: migrated in memory only */ }
      return current;
    }
    current = sanitize(parsed);
  } catch (e) {
    current = structuredClone(DEFAULT_CONFIG);
  }
  return current;
}

export function getConfig() { return current; }

export function updateConfig(patch) {
  current = sanitize({ ...current, ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* storage unavailable: keep it in memory */ }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetConfig() { return updateConfig(structuredClone(DEFAULT_CONFIG)); }
export function onConfigChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const byId = Object.fromEntries(CATALOG.map((a) => [a.id, a]));
// An app added by hand has the category 'perso' and no official logo (see monogram.js).
const customApp = (a) => ({ ...a, cat: 'perso', custom: true });
// A passage (HDMI port) wears the name the person gave it; a port beyond the catalog's four is built on the fly.
function passage(id) {
  const base = byId[id] || (PASSAGE_RE.test(id) ? { id, name: `HDMI ${id.slice(2)}`, cat: 'passage', input: `HDMI ${id.slice(2)}` } : null);
  if (!base || base.cat !== 'passage') return base;
  const named = current.passages[id];
  return named ? { ...base, name: named.name } : base;
}
export function appById(id) {
  if (typeof id !== 'string') return null;
  if (PASSAGE_RE.test(id)) return passage(id);
  return byId[id] || (current.custom.find((a) => a.id === id) ? customApp(current.custom.find((a) => a.id === id)) : null);
}
export function dockApps() { return current.dock.map(appById).filter(Boolean); }
// Every known app (catalog, then custom additions), with its state (on the Parapet / hidden).
export function allApps() {
  return [...CATALOG.map((a) => (a.cat === 'passage' ? passage(a.id) : a)), ...current.custom.map(customApp)]
    .map((a) => ({ ...a, onDock: current.dock.includes(a.id), hidden: current.hidden.includes(a.id) }));
}
// Gives a name to an HDMI port (`in<n>`); an empty name removes it.
export function namePassage(id, name) {
  if (!PASSAGE_RE.test(String(id))) return;
  const passages = { ...current.passages };
  if (name && NAME_RE.test(String(name))) passages[id] = { name: String(name).trim() }; else delete passages[id];
  updateConfig({ passages });
}
// Adds an app by hand and places it on the Parapet if there is room left. Returns its id.
export function addCustomApp(name, pkg) {
  const n = current.custom.reduce((m, a) => Math.max(m, Number(a.id.slice(2)) || 0), 0) + 1;
  const id = `c_${n}`;
  const dock = current.dock.length < DOCK_MAX ? [...current.dock, id] : current.dock;
  updateConfig({ custom: [...current.custom, { id, name, ...(pkg ? { pkg } : {}) }], dock });
  return id;
}
export function removeCustomApp(id) {
  updateConfig({ custom: current.custom.filter((a) => a.id !== id), dock: current.dock.filter((x) => x !== id), hidden: current.hidden.filter((x) => x !== id) });
}
// Reduced motion: the interface setting, plus the system's accessibility setting (prefers-reduced-motion) when
// `motionSystem` says to follow it (the default: honest accessibility). "Suivre le système : Non" lets Hedwig fly
// on a TV whose system flag is set without the person knowing.
export function isReduced() {
  if (current.motion !== 'auto') return true;
  return current.motionSystem !== 'ignore' && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
