// Point d'entrée : charge la config, installe les entrées, enregistre les écrans, démarre.
import { loadConfig, getConfig, onConfigChange, HOUSES } from './config.js';
import { Input } from './input.js';
import { Router } from './router.js';
import { Fx } from './fx.js';
import { SCREENS } from './screens/index.js';

const stage = document.getElementById('stage');
const config = loadConfig();

function applyTheme(c) {
  const html = document.documentElement;
  html.dataset.mode = c.mode;
  html.dataset.house = c.house || 'none';
  html.dataset.motion = c.motion;
  const h = c.house ? HOUSES[c.house] : null;
  html.style.setProperty('--wax', h ? h.wax : '#7a1f1f');
  html.style.setProperty('--house-glow', h ? h.glow : '#ffb457');
  Fx.configure({ dust: c.motion === 'auto', sound: c.sounds, calm: c.motion !== 'auto' });
}

// Grain de pellicule : une tuile de bruit dessinée une fois, déplacée par pas (voir shared.css).
function mountGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 90 + Math.random() * 120; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  x.putImageData(img, 0, 0);
  const el = document.createElement('div'); el.className = 'film-grain'; el.style.backgroundImage = `url(${c.toDataURL()})`;
  stage.appendChild(el);
}

applyTheme(config);
onConfigChange(applyTheme);
Input.install();
mountGrain();
Fx.mount(stage);
Router.init(stage, { config: getConfig, fx: Fx });
for (const [name, screen] of Object.entries(SCREENS)) Router.register(name, screen);

// Veille (Nox) : après idleSeconds sans touche, l'accueil s'endort ; une touche le réveille.
let idleTimer = 0;
function armIdle() {
  clearTimeout(idleTimer);
  const c = getConfig();
  if (!c.idleSeconds || c.mode === 'classique') return;
  idleTimer = setTimeout(() => {
    const cur = Router.current();
    if (cur === 'home' && SCREENS.home.nox) SCREENS.home.nox();
    else if (cur !== 'sorting') Router.replace('home', { nox: true }, 'fade');
  }, c.idleSeconds * 1000);
}
Input.onActivity(armIdle);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(idleTimer); else armIdle(); });
armIdle();

// Musique de fond : démarre au premier geste (le navigateur l'exige), suit le réglage et le bouton Son.
let ambientStarted = false;
function startAmbient() {
  const c = getConfig();
  if (!c.sounds || !Fx.ambient) return;
  Fx.initAudio();
  Fx.ambient(c.music || 'auto');
  ambientStarted = true;
}
Input.onActivity(() => { if (!ambientStarted) startAmbient(); });
onConfigChange((c) => { if (!Fx.ambient) return; if (!c.sounds) { Fx.ambient('aucune'); ambientStarted = false; } else if (ambientStarted) Fx.ambient(c.music || 'auto'); });

// Premier lancement : la Lettre d'admission ; ensuite, l'allumage Lumos puis l'accueil du mode choisi.
if (!config.firstRunDone) Router.replace('sorting', {}, 'fade');
else Router.replace(config.mode === 'classique' ? 'classic' : 'home', { boot: true }, 'fade');

// Outils du banc d'essai (hors TV) : plein écran, ralenti, accès au routeur pour les tests automatisés.
const dev = document.getElementById('dev');
if (dev) {
  window.__poudlard = { Router, SCREENS, getConfig };
  dev.addEventListener('change', (e) => { if (e.target.id === 'dev-slow') document.documentElement.dataset.slow = e.target.checked ? '1' : ''; });
  const fs = document.getElementById('dev-fs');
  if (fs) fs.addEventListener('click', () => { const p = stage.requestFullscreen && stage.requestFullscreen(); if (p && p.catch) p.catch(() => {}); stage.focus(); });
}
