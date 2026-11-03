// Entry point: load the config, install input handling, register the screens, start.
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
  // The house palette is CSS (base.css, html[data-house]): nothing inline. HOUSES stays the source of the names.
  void HOUSES;
  Fx.configure({ dust: c.motion === 'auto', sound: c.sounds, calm: c.motion !== 'auto' });
  Fx.setRate(c.motion === 'economie' ? 66 : 33);
}

// Film grain: a noise tile drawn once, then shifted in steps (see shared.css).
function mountGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const img = x.createImageData(128, 128);
  // Centred on the Night (#070B14) ± 12: bright specks on top, dark specks underneath, no blend mode needed.
  for (let i = 0; i < img.data.length; i += 4) { const d = (Math.random() - 0.5) * 24; img.data[i] = 0x07 + d + 30; img.data[i + 1] = 0x0B + d + 30; img.data[i + 2] = 0x14 + d + 30; img.data[i + 3] = 255; }
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

// Sleep (Nox): after idleSeconds without a key press, the home screen falls asleep; any key wakes it.
let idleTimer = 0;
function armIdle() {
  clearTimeout(idleTimer);
  const c = getConfig();
  if (!c.idleSeconds) return;
  idleTimer = setTimeout(() => {
    const cur = Router.current();
    if (c.mode === 'classique') { if (cur === 'classic' && SCREENS.classic.dim) SCREENS.classic.dim(); return; }   // classic: the rows dim, nothing else
    if (cur === 'home' && SCREENS.home.nox) SCREENS.home.nox();
    else if (cur !== 'sorting') Router.replace('home', { nox: true }, 'fade');
  }, c.idleSeconds * 1000);
}
Input.onActivity(armIdle);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(idleTimer); else armIdle(); });
armIdle();

// Background music: starts on the first user gesture (the browser requires it), follows the setting and the Sound button.
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

// First launch: the Admission Letter (Lettre d'admission); afterwards, the Lumos boot then the home screen of the chosen mode.
if (!config.firstRunDone) Router.replace('sorting', {}, 'fade');
else Router.replace(config.mode === 'classique' ? 'classic' : 'home', { boot: true }, 'fade');

// Test-bench tools (outside the TV): fullscreen, slow motion, router access for automated tests.
const dev = document.getElementById('dev');
if (dev) {
  window.__poudlard = { Router, SCREENS, getConfig };
  dev.addEventListener('change', (e) => { if (e.target.id === 'dev-slow') document.documentElement.dataset.slow = e.target.checked ? '1' : ''; });
  const fs = document.getElementById('dev-fs');
  if (fs) fs.addEventListener('click', () => { const p = stage.requestFullscreen && stage.requestFullscreen(); if (p && p.catch) p.catch(() => {}); stage.focus(); });
}
