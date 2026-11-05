// Shared effects: ONE scene clock, gold dust bursts (canvas), the Lumos flash, and the soundtrack (delegated to sound.js:
// a synthesized celesta for the cues, an original background score or the music file, assets/music/ambiance.ogg).
// Everything respects `prefers-reduced-motion` and the "motion: calme" setting.
//
// Nothing moves when nothing happens. The scene clock is a single requestAnimationFrame that runs ONLY while it has
// work: a tick callback registered with Fx.tick(fn), or a dust particle still alive. When the last callback is removed
// and the last particle dies, the loop stops (no rAF scheduled at all) and the dust canvas is hidden; the next
// Fx.tick() or Fx.burst() restarts it. Work is gated to 33 ms (30 fps) or 66 ms in economy mode and during Nox
// (Fx.setRate). There is no ambient dust any more: only short bursts (Lumos, the owl landing), a few motes that settle
// and die within 2.2 s.
//
// The dust canvas is created on the first burst and its backing store is capped at 960 px wide (the motes are soft);
// Fx.trim() (main.js, on the shell's 'poudlard:trim') drops every particle and frees the backing store.
import { Sound } from './sound.js';

let host = null, canvas = null, ctx2d = null, W = 0, H = 0, ro = null;
const parts = [];
let enabled = { dust: true, sound: false, calm: false };
let raf = 0;
let lastMove = -1e9;     // timestamp (ms) of the last `move` played through chime(), to merge the legacy chords
const ticks = new Set(); // callbacks (now, dt) run on each gated frame
let rate = 33;           // ms between two frames
let lastFrame = 0, last = 0;
let dirty = false;       // the dust canvas holds pixels that must be cleared

let glow = null;
function glowSprite() {
  if (glow) return glow;
  glow = document.createElement('canvas');
  glow.width = glow.height = 32;
  const g = glow.getContext('2d');
  // A soft mote: the core is already translucent, the falloff long (no hard bright centre).
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,240,205,0.85)');
  rg.addColorStop(0.35, 'rgba(255,200,120,0.35)');
  rg.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
  return glow;
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || enabled.calm;

function resize() {
  if (!host) return;
  const r = host.getBoundingClientRect();
  W = r.width; H = r.height;
  if (canvas && parts.length) sizeCanvas();      // otherwise the backing store is sized when a burst needs it
}
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 960 / Math.max(1, W));
  const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
  if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function ensureCanvas() {
  if (!host) return false;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.className = 'fx-dust';
    canvas.style.display = 'none';
    ctx2d = canvas.getContext('2d');
    host.appendChild(canvas);
  }
  if (!W) resize();
  if (!W) return false;
  sizeCanvas();
  canvas.style.display = '';
  return true;
}
function hideCanvas() {
  if (!canvas) return;
  if (dirty) { ctx2d.clearRect(0, 0, W, H); dirty = false; }
  canvas.style.display = 'none';
}

function drawDust(dt) {
  if (!ctx2d || !W || !parts.length) return;
  ctx2d.clearRect(0, 0, W, H);
  ctx2d.globalCompositeOperation = 'lighter';
  const sprite = glowSprite();
  for (let j = parts.length - 1; j >= 0; j--) {
    const p = parts[j];
    p.life += dt;
    if (p.life > p.max) { parts.splice(j, 1); continue; }
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const k = p.life / p.max;
    ctx2d.globalAlpha = (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * 0.45;
    const s = p.s * W / 900;
    ctx2d.drawImage(sprite, p.x - s * 3, p.y - s * 3, s * 6, s * 6);
  }
  ctx2d.globalAlpha = 1;
  ctx2d.globalCompositeOperation = 'source-over';
  dirty = true;
  if (!parts.length) hideCanvas();
}

// One frame of the scene clock. Reschedules itself only while there is work left.
function frame(now) {
  raf = 0;
  if (!ticks.size && !parts.length) { hideCanvas(); return; }
  raf = requestAnimationFrame(frame);
  if (now - lastFrame < rate) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; lastFrame = now;
  drawDust(dt);
  for (const fn of ticks) { try { fn(now, dt); } catch (e) { ticks.delete(fn); console.error('tick', e); } }
  if (!ticks.size && !parts.length) { cancelAnimationFrame(raf); raf = 0; hideCanvas(); }
}
function wake() {
  if (raf) return;
  last = lastFrame = performance.now() - rate;   // the first frame runs at once, with a sane dt
  raf = requestAnimationFrame(frame);
}

export const Fx = {
  // `el`: the full-screen element the particle canvas is placed on (created on the first burst).
  mount(el) {
    host = el;
    if (ro) ro.disconnect();
    ro = new ResizeObserver(resize); ro.observe(host);
    resize();
  },
  // The scene clock: one callback per animated thing, all on the same gated frame. The loop runs only while at
  // least one callback is registered (or a mote is alive): unregister as soon as the animation is over.
  tick(fn) { ticks.add(fn); wake(); return () => Fx.untick(fn); },
  untick(fn) { ticks.delete(fn); },
  // 33 ms by default; 66 ms in economy mode or during Nox.
  setRate(ms) { rate = Math.max(16, ms | 0); },
  rate() { return rate; },
  // True while the scene clock has a frame scheduled (tests: at idle it must read false).
  running() { return Boolean(raf); },
  // `sound`: mutes or unmutes the cues instantly (sound.js handles the 30 ms mute and stops the notes in flight).
  configure(opts) {
    enabled = { ...enabled, ...opts };
    if (opts && 'sound' in opts) Sound.setEnabled(!!opts.sound);
    if (!enabled.dust || reduced()) parts.length = 0;
  },
  size() { if (!W) resize(); return { W, H }; },
  // Memory pressure (the TV's onTrimMemory, relayed by main.js): every particle dropped, the canvas backing freed.
  trim() {
    parts.length = 0;
    if (canvas) { canvas.width = canvas.height = 1; canvas.style.display = 'none'; dirty = false; }
    glow = null;
    if (!ticks.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  },

  // Dust burst at a point (coordinates within the host): a few motes lifted and settling, not a spray. They die
  // within 2.2 s and the scene clock stops with the last one. 24 motes alive at most.
  burst(x, y, n = 12, power = 60) {
    if (!enabled.dust || reduced() || !ensureCanvas()) return;
    n = Math.min(n, 24 - parts.length);
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, v = power * (0.25 + Math.random() * 0.75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35, g: power * 0.6, life: 0, max: 1 + Math.random() * 1.2, s: 0.5 + Math.random() * 1.1 });
    }
    if (parts.length) wake(); else hideCanvas();
  },

  // "Lumos": a halo that grows from a point and slowly floods the screen, more a dawn than a flash.
  lumos(el, x, y, ms = 900) {
    const halo = document.createElement('div');
    halo.className = 'fx-lumos';
    el.appendChild(halo);
    const tr = (s) => `translate(${x}px, ${y}px) scale(${s})`;
    const anim = halo.animate([
      { opacity: 0.55, transform: tr(0.2) }, { opacity: 0.45, transform: tr(5), offset: 0.4 }, { opacity: 0, transform: tr(30) }
    ], { duration: reduced() ? 1 : ms * 1.6, easing: 'cubic-bezier(.35,.3,.2,1)' });
    anim.onfinish = () => halo.remove();
    this.burst(x, y, 16, 70);
  },

  // ----- Soundtrack (see sound.js) -----
  // May be called when a screen mounts: without a user gesture, sound.js only installs its listeners and will create
  // the context on the first gesture (nothing plays before). After a gesture, builds the audio graph (idempotent) and
  // starts the background music according to config.music ('auto' by default: personal file if present, otherwise celesta).
  initAudio() { Sound.init(); },

  // Background music: 'auto' | 'celesta' | 'aucune' (the config.music values), or null to follow the config again
  // (see sound.js). Called by the "Musique de fond" row of the Settings. An explicit mode overrides config.music
  // until the next call. Returns false if the mode is unknown. Muted together with the sound
  // (configure({ sound: false })): no need to call ambient('aucune') for that.
  ambient(mode) { return Sound.ambient(mode); },

  // Puts the music on hold without touching the mode: ambientHold(true, 'nox') when entering sleep,
  // ambientHold(false, 'nox') on wake; 'launch' around Platform.launch. Reasons stack; the music resumes
  // when the last one is lifted. Returns the number of reasons still active.
  ambientHold(on, reason) { return Sound.ambientHold(on, reason); },

  // Plays a cue by name: move · enter · return · lumos · nox · wake · error · toggle · confirm.
  // opts.dir: 1 (right / up) or −1 (left / down) for `move`.
  cue(name, opts = { dir: 1 }) { return Sound.cue(name, opts); },

  // Legacy aliases, kept for the screens that already call them (home, map, library, settings, sorting, rappeltout).
  // chime(freq): maps the old bell to the V3 screen grammar:
  //   ≥ 1500 Hz (1568)            → `confirm`: validation (OK on an option, addition, confirmed move, checkmark)
  //   1100–1499 Hz (1175, 1319…)  → `move` to the right / up
  //   900–1099 Hz (988, 1046)     → `move` to the left / down
  //   600–899 Hz (659, 784, 880)  → `toggle`: cancel, leaving a mode, hiding (a single dry note, not a step)
  //   < 600 Hz (440)              → `toggle`: hitting the edge, "nothing to do"
  // Two `move` cues less than 40 ms apart (the old chords `chime(1046); chime(1318); chime(1568)`) make a single step.
  chime(freq = 1046) {
    if (freq >= 1500) return Sound.cue('confirm');
    if (freq < 900) return Sound.cue('toggle');
    const t = performance.now();
    if (t - lastMove < 40) return false;
    lastMove = t;
    return Sound.cue('move', { dir: freq >= 1100 ? 1 : -1 });
  },
  // arpeggio(): the launch (Lumos).
  arpeggio() { return Sound.cue('lumos'); },
  // whoosh(): ALWAYS the rising `return` phrase ("going back up to the Parapet"). A screen that descends into a
  // sub-screen must call cue('enter'), and removing an app cue('toggle'): the alias does not guess the direction.
  whoosh() { return Sound.cue('return'); },
};
