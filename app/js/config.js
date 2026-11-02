// Configuration du launcher : catalogue d'applis, collections de la Bibliothèque, réglages, stockage local validé.
// Aucune donnée ne quitte l'appareil. Tout ce qui est lu du stockage passe par `sanitize()`.

export const HOUSES = {
  gryffondor: { name: 'Gryffondor', wax: '#7a1f1f', glow: '#ffb457' },
  serpentard: { name: 'Serpentard', wax: '#1f4a2e', glow: '#9fe3b8' },
  serdaigle: { name: 'Serdaigle', wax: '#1f3a6b', glow: '#9fc4ff' },
  poufsouffle: { name: 'Poufsouffle', wax: '#8a6a1c', glow: '#ffe28a' },
};

// Catalogue : id stable, nom affiché, catégorie, package Android (pour le vrai launcher), schéma de lien profond si connu.
// `input` : entrée HDMI pour les Passages (consoles, box) ; le vrai launcher la lit via TvInputManager.
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

// Collections de la Bibliothèque. `symbol` : motif gravé sur la couverture ; `app` : appli qui possède le titre ;
// `content` : identifiant pour le lien profond (jamais une URL saisie à l'écran).
export const LIBRARY = [
  {
    // `url` : page du film sur Max (liens fournis par Corentin). Seuls les hôtes de URL_HOSTS sont acceptés par platform.js.
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
  house: null,                  // null tant que la Lettre d'admission n'est pas passée
  dock: ['netflix', 'prime', 'disney', 'canal', 'max', 'appletv', 'youtube', 'ps5'],   // ordre = ordre d'affichage, 8 max
  hidden: [],                   // applis cachées de la Carte (jamais perdues : on peut les réafficher)
  owl: 'vive',                  // 'vive' | 'calme' | 'absente'
  sounds: false,
  music: 'auto',                // musique de fond : 'auto' (fichier personnel si présent, sinon célesta) | 'celesta' | 'aucune'
  motion: 'auto',               // 'auto' | 'reduit' | 'economie'
  idleSeconds: 0,               // veille (Nox) ; 0 = jamais (choix de Corentin : veille OFF par défaut)
  lastApp: null,
  firstRunDone: false,
  library: { hidden: [], apps: {} },   // titres masqués ('collection:content') et appli choisie par titre
  custom: [],                          // applis ajoutées à la main : { id: 'c_<n>', name, pkg? } ; logo = monogramme
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

// Ne garde que des valeurs connues et bien typées : un stockage corrompu ou étranger ne peut rien injecter.
export function sanitize(raw) {
  const c = structuredClone(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return c;
  // Applis ajoutées à la main : nom court et sobre, package Android optionnel et bien formé, 12 au plus.
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
    // Migration : avant la version 3, la veille valait 90 s par défaut ; Corentin la veut désactivée.
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
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) { /* stockage indisponible : on garde en mémoire */ }
  listeners.forEach((fn) => fn(current));
  return current;
}

export function resetConfig() { return updateConfig(structuredClone(DEFAULT_CONFIG)); }
export function onConfigChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const byId = Object.fromEntries(CATALOG.map((a) => [a.id, a]));
// Une appli ajoutée à la main a la catégorie 'perso' et pas de logo officiel (voir monogram.js).
const customApp = (a) => ({ ...a, cat: 'perso', custom: true });
export function appById(id) { return byId[id] || (current.custom.find((a) => a.id === id) ? customApp(current.custom.find((a) => a.id === id)) : null); }
export function dockApps() { return current.dock.map(appById).filter(Boolean); }
// Toutes les applis connues (catalogue puis ajouts), avec leur état (sur le parapet / cachée).
export function allApps() {
  return [...CATALOG, ...current.custom.map(customApp)].map((a) => ({ ...a, onDock: current.dock.includes(a.id), hidden: current.hidden.includes(a.id) }));
}
// Ajoute une appli à la main et la pose sur le parapet s'il reste une place. Retourne son id.
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
// Mouvement réduit : décidé par le réglage de l'interface seulement. Sur une TV, le réglage d'accessibilité
// du système (prefers-reduced-motion) ne doit pas figer Hedwige à l'insu de l'utilisateur.
export function isReduced() {
  return current.motion !== 'auto';
}
