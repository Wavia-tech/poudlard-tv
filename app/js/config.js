// Launcher configuration: app catalog, Library collections, settings, validated local storage.
// No data ever leaves the device. Everything read from storage goes through `sanitize()`.

export const HOUSES = {
  gryffondor: { name: 'Gryffondor', wax: '#7a1f1f', glow: '#ffb457' },
  serpentard: { name: 'Serpentard', wax: '#1f4a2e', glow: '#9fe3b8' },
  serdaigle: { name: 'Serdaigle', wax: '#1f3a6b', glow: '#9fc4ff' },
  poufsouffle: { name: 'Poufsouffle', wax: '#8a6a1c', glow: '#ffe28a' },
};

// Catalog: stable id, display name, category, Android package (for the real launcher), deep-link scheme when known.
// `input`: HDMI input for Passages (consoles, set-top boxes); the real launcher reads it through TvInputManager.
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
  { id: 'ps5', name: 'PlayStation 5', cat: 'passage', input: 'HDMI 1' },
  { id: 'ps4', name: 'PlayStation 4', cat: 'passage', input: 'HDMI 2' },
  { id: 'xbox', name: 'Xbox', cat: 'passage', input: 'HDMI 3' },
  { id: 'switch', name: 'Switch', cat: 'passage', input: 'HDMI 4' },
];
const IDS = new Set(CATALOG.map((a) => a.id));
const isKnownId = (id) => IDS.has(id) || /^c_\d{1,6}$/.test(id);
export const DOCK_MAX = 8;

// Library collections. `symbol`: motif engraved on the cover; `app`: the app that owns the title;
// `content`: identifier for the deep link (never a URL typed on screen).
export const LIBRARY = [
  {
    // `url`: the film's page on Max (links supplied by Corentin). Only the hosts in URL_HOSTS are accepted by platform.js.
    id: 'hp', title: 'Harry Potter', background: 'library', items: [
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
    id: 'fb', title: 'Les Animaux fantastiques', background: 'newyork', items: [
      { n: 1, title: 'Les Animaux fantastiques', year: 2016, symbol: 'suitcase', color: '#1d3b4a', app: 'max', content: 'fb1' },
      { n: 2, title: 'Les Crimes de Grindelwald', year: 2018, symbol: 'skull', color: '#2a2a2a', app: 'max', content: 'fb2' },
      { n: 3, title: 'Les Secrets de Dumbledore', year: 2022, symbol: 'phoenix', color: '#3d2f1a', app: 'max', content: 'fb3' },
    ],
  },
];

export const DEFAULT_CONFIG = Object.freeze({
  version: 3,
  mode: 'poudlard',             // 'poudlard' | 'classique'
  house: null,                  // null until the Admission Letter has been completed
  dock: ['netflix', 'prime', 'disney', 'canal', 'max', 'appletv', 'youtube', 'ps5'],   // order = display order, 8 max
  hidden: [],                   // apps hidden from the Map (never lost: they can be shown again)
  owl: 'vive',                  // 'vive' | 'calme' | 'absente'
  sounds: false,
  music: 'auto',                // background music: 'auto' (personal file if present, otherwise celesta) | 'celesta' | 'aucune'
  motion: 'auto',               // 'auto' | 'reduit' | 'economie'
  idleSeconds: 0,               // sleep (Nox); 0 = never (Corentin's choice: sleep OFF by default)
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
  const known = new Set([...IDS, ...c.custom.map((a) => a.id)]);
  if (raw.mode === 'classique') c.mode = 'classique';
  if (typeof raw.house === 'string' && HOUSES[raw.house]) c.house = raw.house;
  if (Array.isArray(raw.dock)) c.dock = idList(raw.dock, known, DOCK_MAX);
  if (Array.isArray(raw.hidden)) c.hidden = idList(raw.hidden, known).filter((id) => !c.dock.includes(id));
  if (['vive', 'calme', 'absente'].includes(raw.owl)) c.owl = raw.owl;
  if (typeof raw.sounds === 'boolean') c.sounds = raw.sounds;
  if (['auto', 'celesta', 'aucune'].includes(raw.music)) c.music = raw.music;
  if (['auto', 'reduit', 'economie'].includes(raw.motion)) c.motion = raw.motion;
  if (Number.isInteger(raw.idleSeconds) && raw.idleSeconds >= 0 && raw.idleSeconds <= 3600) c.idleSeconds = raw.idleSeconds;
  if (typeof raw.lastApp === 'string' && known.has(raw.lastApp)) c.lastApp = raw.lastApp;
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
    // Migration: before version 3, sleep defaulted to 90 s; Corentin wants it disabled.
    if (parsed && typeof parsed === 'object' && !(Number(parsed.version) >= 3)) { parsed.idleSeconds = 0; parsed.version = 3; }
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
export function appById(id) { return byId[id] || (current.custom.find((a) => a.id === id) ? customApp(current.custom.find((a) => a.id === id)) : null); }
export function dockApps() { return current.dock.map(appById).filter(Boolean); }
// Every known app (catalog, then custom additions), with its state (on the Parapet / hidden).
export function allApps() {
  return [...CATALOG, ...current.custom.map(customApp)].map((a) => ({ ...a, onDock: current.dock.includes(a.id), hidden: current.hidden.includes(a.id) }));
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
// Reduced motion: decided by the interface setting only. On a TV, the system accessibility setting
// (prefers-reduced-motion) must not freeze Hedwig (Hedwige) without the user knowing.
export function isReduced() {
  return current.motion !== 'auto';
}
