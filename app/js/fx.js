// Shared effects: ONE scene clock, gold dust (canvas), the Lumos flash, and the soundtrack (delegated to sound.js:
// a synthesized celesta for the cues, an original background score or a personal file; no audio file is distributed).
// Everything respects `prefers-reduced-motion` and the "motion: calme" setting.
//
// The clock: a single requestAnimationFrame for the whole interface, gated to 33 ms (30 fps) or 66 ms in economy
// mode and during Nox (Fx.setRate). Screens register callbacks with Fx.tick(fn) / Fx.untick(fn) instead of
// running their own loop (the Parapet's window flicker does this). The dust is the first callback and only
// clears its canvas while a particle is alive. The canvas backing store is capped at 960 px wide (dpr 0.5 on a
// 1080p stage): the dust is soft anyway, and a weak TV WebView has one canvas to composite, not two per frame.
import { Sound } from './sound.js';

let canvas = null, ctx2d = null, W = 0, H = 0;
const parts = [];
let enabled = { dust: true, sound: false, calm: false };
let raf = 0;
let lastMove = -1e9;     // timestamp (ms) of the last `move` played through chime(), to merge the legacy chords
const ticks = new Set(); // callbacks (now, dt) run on each gated frame
let rate = 33;           // ms between two frames
let lastFrame = 0;
let dirty = false;       // the dust canvas needs a clear on the next frame

const glow = document.createElement('canvas');
glow.width = glow.height = 32;
{
  const g = glow.getContext('2d');
  // A soft mote: the core is already translucent, the falloff long (no hard bright centre).
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,240,205,0.85)');
  rg.addColorStop(0.35, 'rgba(255,200,120,0.35)');
  rg.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || enabled.calm;

function resize() {
  if (!canvas) return;
  const r = canvas.parentElement.getBoundingClientRect();
  W = r.width; H = r.height;
  const dpr = W >= 1600 ? 0.5 : Math.min(window.devicePixelRatio || 1, 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  dirty = true;
}

// Ambient motes: a handful, slow, small and faint, drifting like dust in a sunbeam. Each one rises barely, sways
// sideways on its own phase (SWAY px/s at most) and breathes a slow twinkle; it fades in over the first quarter of its
// life and out over the rest, so none ever pops.
const AMBIENT_MAX = 9;
const SWAY = 3;
let last = 0;
function drawDust(now, dt) {
  if (!ctx2d || !W) return;
  if (!enabled.dust || reduced()) { if (parts.length || dirty) { parts.length = 0; ctx2d.clearRect(0, 0, W, H); dirty = false; } return; }
  if (parts.filter((p) => p.amb).length < AMBIENT_MAX) {
    parts.push({ amb: true, x: Math.random() * W, y: H * (0.5 + Math.random() * 0.55), vx: (Math.random() - 0.5) * 1.6, vy: -(1 + Math.random() * 2.5),
      life: 0, max: 14 + Math.random() * 10, s: 0.35 + Math.random() * 0.55, ph: Math.random() * Math.PI * 2 });
  }
  if (!parts.length && !dirty) return;
  ctx2d.clearRect(0, 0, W, H); dirty = false;
  ctx2d.globalCompositeOperation = 'lighter';
  const t = now / 1000;
  for (let j = parts.length - 1; j >= 0; j--) {
    const p = parts[j];
    p.life += dt;
    if (p.life > p.max) { parts.splice(j, 1); continue; }
    const sway = p.amb ? Math.sin(t * 0.45 + p.ph) * SWAY : 0;
    p.vy += (p.g || 0) * dt; p.x += (p.vx + sway) * dt; p.y += p.vy * dt;
    const k = p.life / p.max;
    const tw = p.amb ? 0.7 + 0.3 * Math.sin(t * 1.3 + p.ph) : 1;
    ctx2d.globalAlpha = (k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75) * (p.amb ? 0.22 : 0.45) * tw;
    const s = p.s * W / 900;
    ctx2d.drawImage(glow, p.x - s * 3, p.y - s * 3, s * 6, s * 6);
  }
  ctx2d.globalAlpha = 1;
  ctx2d.globalCompositeOperation = 'source-over';
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (now - lastFrame < rate) return;
  const dt = Math.min(0.05, (now - last) / 1000); last = now; lastFrame = now;
  drawDust(now, dt);
  for (const fn of ticks) { try { fn(now, dt); } catch (e) { ticks.delete(fn); console.error('tick', e); } }
}

export const Fx = {
  // `host`: the full-screen element the particle canvas is placed on.
  mount(host) {
    canvas = document.createElement('canvas');
    canvas.className = 'fx-dust';
    ctx2d = canvas.getContext('2d');
    host.appendChild(canvas);
    new ResizeObserver(resize).observe(host);
    resize();
    if (!raf) raf = requestAnimationFrame(frame);
  },
  // The scene clock: one callback per animated thing, all on the same gated frame.
  tick(fn) { ticks.add(fn); return () => ticks.delete(fn); },
  untick(fn) { ticks.delete(fn); },
  // 33 ms by default; 66 ms in economy mode or during Nox.
  setRate(ms) { rate = Math.max(16, ms | 0); },
  rate() { return rate; },
  // `sound`: mutes or unmutes the cues instantly (sound.js handles the 30 ms mute and stops the notes in flight).
  configure(opts) {
    enabled = { ...enabled, ...opts };
    if (opts && 'sound' in opts) Sound.setEnabled(!!opts.sound);
  },
  size() { return { W, H }; },

  // Dust burst at a point (coordinates within the host): a few motes lifted and settling, not a spray.
  burst(x, y, n = 12, power = 60) {
    if (!enabled.dust || reduced()) return;
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, v = power * (0.25 + Math.random() * 0.75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.35, g: power * 0.6, life: 0, max: 1 + Math.random() * 1.2, s: 0.5 + Math.random() * 1.1, ph: 0 });
    }
  },

  // "Lumos": a halo that grows from a point and slowly floods the screen, more a dawn than a flash.
  lumos(host, x, y, ms = 900) {
    const el = document.createElement('div');
    el.className = 'fx-lumos';
    host.appendChild(el);
    const tr = (s) => `translate(${x}px, ${y}px) scale(${s})`;
    const anim = el.animate([
      { opacity: 0.55, transform: tr(0.2) }, { opacity: 0.45, transform: tr(5), offset: 0.4 }, { opacity: 0, transform: tr(30) }
    ], { duration: reduced() ? 1 : ms * 1.6, easing: 'cubic-bezier(.35,.3,.2,1)' });
    anim.onfinish = () => el.remove();
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
  chime(freq = 1046, gain = 0.035) {
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
