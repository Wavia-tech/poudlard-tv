// Entry point: load the config, install input handling, register the screens, start.
import { loadConfig, getConfig, updateConfig, onConfigChange, HOUSES } from './config.js';
import { Input } from './input.js';
import { Router } from './router.js';
import { Fx } from './fx.js';
import { Platform } from './platform.js';
import { SCREENS } from './screens/index.js';

const stage = document.getElementById('stage');
let config = loadConfig();
// No automatic economy any more. Version 0.2 put every low-RAM TV (under 2 GB: the owner's 1.3 GB TV) in economy motion
// with a calm owl on its first run, and economy counts as reduced motion: plain fades, no flight, no fly-by, a 300 ms
// boot. The motion is now compositor-only and the Parapet costs nothing at rest, so the full motion is the default
// everywhere. A TV that still carries that automatic pair (economie + calme, set together by 0.2) is put back on
// 'auto' + 'vive' once; a choice made afterwards in the Room of Requirement is never touched again.
const ECO_UNDONE = 'poudlard-tv.eco-auto-undone';
try {
  if (!localStorage.getItem(ECO_UNDONE)) {
    if (config.firstRunDone && config.motion === 'economie' && config.owl === 'calme' && Platform.device().lowRam) config = updateConfig({ motion: 'auto', owl: 'vive' });
    localStorage.setItem(ECO_UNDONE, '1');
  }
} catch (e) { /* storage unavailable: nothing to undo */ }

// Sound is armed only once the boot sequence is over (or on the first key): enabling it starts sound.js's start-up
// unlock, whose AudioContext and reverb take one long frame on the TV's weak cores (about 600 ms measured at CPU x4),
// so it must never land inside the 1.3 s Lumos boot. The Parapet says when its boot is over ('poudlard:booted' on
// window); other first screens (the Letter, classic mode) and a boot that never reports are covered by a timer.
let audioArmed = false;
const AUDIO_ARM_MS = 1700, AUDIO_ARM_MAX_MS = 5000;
function armAudio() {
  if (audioArmed) return;
  audioArmed = true;
  themed = null;                 // the next applyTheme passes the sound on again
  Fx.configure({ sound: getConfig().sounds });
}
const armWhenIdle = () => { if (typeof requestIdleCallback === 'function') requestIdleCallback(armAudio, { timeout: 600 }); else armAudio(); };

// Called on every config change, lastApp at each Lumos included: only what changed is written. An attribute on <html>
// rewritten, even to the same value, can restyle the whole page in the frames of the light.
let themed = null;
function applyTheme(c) {
  const html = document.documentElement;
  const set = (k, v) => { if (html.dataset[k] !== v) html.dataset[k] = v; };
  set('mode', c.mode);
  set('house', c.house || 'none');
  set('motion', c.motion);
  set('text', c.text || 'normal');
  set('motionSystem', c.motionSystem || 'follow');
  // The house palette is CSS (base.css, html[data-house]): nothing inline. HOUSES stays the source of the names.
  void HOUSES;
  const key = `${c.motion}|${Boolean(c.sounds && audioArmed)}`;
  if (key === themed) return;
  themed = key;
  Fx.configure({ dust: c.motion === 'auto', sound: c.sounds && audioArmed, calm: c.motion !== 'auto' });
  Fx.setRate(c.motion === 'economie' ? 66 : 33);
}

applyTheme(config);
onConfigChange(applyTheme);
Input.install();
Fx.mount(stage);
if (config.firstRunDone && config.mode !== 'classique') {
  window.addEventListener('poudlard:booted', armWhenIdle, { once: true });
  setTimeout(armWhenIdle, AUDIO_ARM_MAX_MS);
} else setTimeout(armWhenIdle, AUDIO_ARM_MS);
Input.onActivity(armAudio);
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
armIdle();

// Lumos can never freeze: an error anywhere releases the keys and settles the active screen; the page going hidden
// (the launched app took the screen) settles too, and keys pressed in that app are dropped when the page comes back.
let lastFatal = '';
const fatals = [];        // timestamps of the same error message: three within 60 s count as a crash for the TV's guard
function countFatal(msg) {
  const now = Date.now();
  if (msg !== lastFatal) fatals.length = 0;
  fatals.push(now);
  while (fatals.length && now - fatals[0] > 60000) fatals.shift();
  if (fatals.length >= 3) { fatals.length = 0; Platform.fatal(msg); }
}
function releaseAll(message) {
  try { const s = SCREENS[Router.current()]; if (s && s.settle) s.settle(); } catch (e) { /* the screen could not settle: the keys are freed below anyway */ }
  Input.release();
  if (message) import('./beuglante.js').then((m) => m.beuglante(stage, { message })).catch(() => {});
}
window.addEventListener('error', (e) => { const msg = String(e && e.message || e); countFatal(msg); if (msg === lastFatal) return; lastFatal = msg; console.error('fatal', e.error || e); releaseAll('Un sortilège a raté. Tout est relâché.'); });
window.addEventListener('unhandledrejection', (e) => { console.error('fatal', e.reason); releaseAll('Un sortilège a raté. Tout est relâché.'); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(idleTimer); releaseAll(null); }
  else { Input.flush(); armIdle(); }
});

// Memory pressure: the Android shell relays onTrimMemory as a 'poudlard:trim' window event (detail: { level }, the
// ComponentCallbacks2 level when known). The effects drop their particles and canvas backing; the active screen
// drops what it can through its optional trim(level) (the Parapet parks the owl and frees the Nox starfield).
window.addEventListener('poudlard:trim', (e) => {
  const level = e && e.detail && typeof e.detail.level === 'number' ? e.detail.level : 80;
  try { Fx.trim(); } catch (err) { /* nothing to free */ }
  try { const s = SCREENS[Router.current()]; if (s && s.trim) s.trim(level); } catch (err) { console.error('trim', err); }
});

// Background music: starts on the first user gesture (the browser requires it), follows the setting and the Sound button.
let ambientStarted = false;
function startAmbient() {
  const c = getConfig();
  if (!c.sounds || !Fx.ambient) return;
  armAudio();
  Fx.initAudio();
  Fx.ambient(c.music || 'auto');
  ambientStarted = true;
}
Input.onActivity(() => { if (!ambientStarted) startAmbient(); });
// Only a change of the sound or of the music touches the music (not lastApp at each Lumos, nor any other setting).
let heard = `${config.sounds}|${config.music}`;
onConfigChange((c) => {
  const now = `${c.sounds}|${c.music}`;
  if (now === heard || !Fx.ambient) return;
  heard = now;
  if (!c.sounds) { Fx.ambient('aucune'); ambientStarted = false; } else if (ambientStarted) Fx.ambient(c.music || 'auto');
});

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
