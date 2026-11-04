// Screen router. A screen = { mount(root, ctx), unmount(), onKey(action) -> bool, onLeave?(transition), diveOrigin?(),
// ready?/sceneReady? (a promise: its first frame is decoded), onEnter?(visual) }.
// One active screen at a time; a stack for "back"; transitions through CSS classes (fade, up, down, iris, crane,
// uncrane, snuff, dive, undive). `onLeave` lets the leaving screen play its own flourish (the owl lifts off, the
// candle goes out). The screen's ctx carries `transition`, the move it arrives by, and `visual`, the move actually
// played (on a low-RAM TV the cross-fade 'xfade' stands for a dive or an undive).
// The dive (Parapet -> Ollivanders): the camera flies into a lit window of the castle. The leaving screen zooms toward
// the point its diveOrigin() gives ({x, y} CSS px in the stage; the centre without it) and fades in the last third,
// the shop settles in from that same point. The undive is the reverse: the shop recedes into the window while the
// Parapet starts zoomed into it and pulls back. Transform and opacity only (base.css); the origin is the only inline
// style, set before the move and dropped with it.
// Prepared moves (dive, undive): the next screen is first mounted in an invisible layer at rest (.is-prep: no scale,
// so its own layout reads are true; composited, so it is rasterised before it shows), and the move starts only once
// that screen's pictures are decoded (its `ready` or `sceneReady` promise, READY_MAX_MS at most) and two frames have
// gone by. The leaving screen's onLeave flourish plays at once, so the key is answered while the pictures decode.
// The prepared screen hears onEnter(visual) when its move starts (ctx.prepared tells it that it will).
// On a low-RAM TV (Platform.device().lowRam, html[data-lowram="1"]) a dive or an undive is a 200 ms cross-fade:
// scaling two full-screen layers 3.5x makes such a TV re-rasterise them at that scale (frames of 1 s and more).

import { Input } from './input.js';
import { Platform } from './platform.js';
import { isReduced } from './config.js';

const screens = new Map();
const stack = [];
let active = null;      // { name, screen, el }
let stage = null;
let ctx = null;
let busy = false;

const TRANSITION_MS = 700;
// Camera moves keep the previous layer a little longer so the two screens overlap. The dive's shop settles at 830 ms
// and the undive's Parapet at 850 ms (base.css): the leaving layer goes, and the next move may start, after that.
const OVERLAP_MS = { crane: 120, uncrane: 120, dive: 140, undive: 150 };
const DIVES = new Set(['dive', 'undive']);
// The low-RAM cross-fade: its leaving layer goes after XFADE_MS (base.css: 200 ms, and a short margin).
const XFADE_MS = 240;
// The longest a prepared move waits for its screen's pictures before it starts anyway.
const READY_MAX_MS = 1200;
const lowRam = () => document.documentElement.dataset.lowram === '1';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
// A screen's "first frame decoded" promise: Ollivanders' `ready`, the Parapet's `sceneReady`.
function readyOf(instance) {
  const p = instance && (instance.ready || instance.sceneReady);
  return p && typeof p.then === 'function' ? p : null;
}
let diveAt = null;    // the last dive's point, as fractions of the stage: the undive pulls back out of the same window

// The point a dive goes into, in CSS px of the stage: the screen's own diveOrigin() when it answers with a point
// inside the stage, else the point of the last dive (undive), else the centre.
function diveOrigin(screen, fallback) {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
  let p = null;
  try { p = screen && typeof screen.diveOrigin === 'function' ? screen.diveOrigin() : null; } catch (e) { p = null; }
  if (p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h) return { x: p.x, y: p.y };
  if (fallback) return { x: fallback.x * w, y: fallback.y * h };
  return { x: w / 2, y: h / 2 };
}
const setOrigin = (el, p) => { el.style.transformOrigin = `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`; };

function makeLayer(name) {
  const el = document.createElement('section');
  el.className = `screen screen-${name}`;
  el.dataset.screen = name;
  return el;
}

let pending = null;   // last navigation requested during a transition: played right after it

async function swap(name, params, transition, push) {
  const def = screens.get(name);
  if (!def) return;
  if (busy) { pending = { name, params, transition, push }; return; }
  busy = true;
  const prev = active;
  // Dive and undive are prepared (head of this file), under reduced motion too (they are plain fades then).
  const prepared = DIVES.has(transition) && Boolean(prev);
  if (transition !== 'fade' && isReduced()) transition = 'fade';   // reduced motion (setting or system): plain fades
  const visual = DIVES.has(transition) && lowRam() ? 'xfade' : transition;
  const el = makeLayer(name);
  el.classList.add(prepared ? 'is-prep' : `enter-${visual}`);
  // The dive's point is read now, while the Parapet is still as the viewer sees it.
  let origin = null;
  if (prepared && visual === 'dive') {
    origin = diveOrigin(prev.screen, null);
    diveAt = { x: origin.x / (stage.clientWidth || 1), y: origin.y / (stage.clientHeight || 1) };
  }
  stage.appendChild(el);
  const instance = typeof def === 'function' ? def() : def;
  const screenCtx = { ...ctx, params: params || {}, router: Router, transition, visual, prepared };   // the same context for mount() and onKey()
  active = { name, screen: instance, el, ctx: screenCtx };
  Input.setHandler(null);                       // while mounting, keys are ignored (never sent to a half-built screen)
  if (prev && push) stack.push(prev.name);
  Platform.refresh();                           // the lists read from the TV are re-read once per screen
  if (prev && prev.screen.onLeave) { try { prev.screen.onLeave(transition); } catch (e) { /* the leaving screen's flourish failed: no matter */ } }
  const play = () => requestAnimationFrame(() => {
    if (DIVES.has(visual)) void getComputedStyle(el).transform;   // the start state is resolved, so the move always plays
    el.classList.remove(`enter-${visual}`);
    if (prev) prev.el.classList.add(`leave-${visual}`);
  });
  // An unprepared move starts right away; mounting (which may wait for images) does not delay it.
  if (!prepared) play();
  // A prepared move mounts after one frame has gone out: the leaving screen's flourish (the Parapet's front fading,
  // its windows lighting up; the shop's label going) is committed first and plays on the compositor while the next
  // screen is built.
  if (prepared) { await frames(2); await wait(0); }
  let mounting, failed = null;
  try { mounting = Promise.resolve(instance.mount(el, screenCtx)); } catch (e) { mounting = Promise.reject(e); }
  mounting = mounting.catch((e) => { failed = e || new Error('mount'); });
  if (prepared) {
    const ready = readyOf(instance);
    await Promise.all([Promise.race([Promise.all([mounting, ready ? ready.catch(() => {}) : null]), wait(READY_MAX_MS)]), frames(2)]);
    if (DIVES.has(visual)) {
      // The undive's point: the Parapet's own window, now that it is laid out (else the dive's point stays).
      if (visual === 'undive') origin = diveOrigin(instance, diveAt);
      setOrigin(prev.el, origin); setOrigin(el, origin);
    }
    if (visual !== 'fade') el.dataset.via = visual;   // the entering layer's timing (base.css), dropped once the move is over
    // The start state goes on while .is-prep still holds the transitions off, then the layer is handed to the move.
    el.classList.add(`enter-${visual}`);
    void getComputedStyle(el).opacity;
    el.classList.remove('is-prep');
    if (typeof instance.onEnter === 'function') { try { instance.onEnter(visual); } catch (e) { /* the screen's arrival failed: the move plays anyway */ } }
    play();
  }
  await mounting;
  if (failed) { el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`screen ${name}`, failed); }
  if (active && active.el === el) Router.refocus();
  setTimeout(() => {
    if (prev) { try { prev.screen.unmount && prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); }
    if (el.isConnected && el.dataset.via) { delete el.dataset.via; el.style.transformOrigin = ''; }
    busy = false;
    if (pending) { const p = pending; pending = null; swap(p.name, p.params, p.transition, p.push); }
  }, visual === 'xfade' ? XFADE_MS : TRANSITION_MS + (OVERLAP_MS[visual] || 0));
}

export const Router = {
  init(stageEl, context) {
    stage = stageEl; ctx = context;
    try { if (Platform.device().lowRam) document.documentElement.dataset.lowram = '1'; } catch (e) { /* no device information: full moves */ }
  },
  register(name, screen) { screens.set(name, screen); },
  current() { return active ? active.name : null; },
  // `go` pushes the current screen for Back, unless it is already on top of the stack (Map → home → Map never grows it).
  go(name, params, transition = 'fade') { const top = stack[stack.length - 1]; return swap(name, params, transition, !(active && top === active.name)); },
  activeScreen() { return active ? active.screen : null; },
  replace(name, params, transition = 'fade') { stack.length = 0; return swap(name, params, transition, false); },
  back(transition = 'fade') {
    const name = stack.pop();
    if (name) return swap(name, {}, transition, false);
    return Promise.resolve();
  },
  canGoBack() { return stack.length > 0; },
  // Screens can ask to hand the keys back to the active screen (e.g. after a confirmation dialog).
  // Home: the screen's onHome() when it has one (the Parapet resets itself), otherwise the home of the current mode.
  refocus() {
    Input.setHandler((a) => {
      if (!active || !active.screen.onKey) return;
      if (a === 'home' && !(active.screen.onHome && active.screen.onHome())) {
        if (active.screen.onKey(a, active.ctx)) return;
        const mode = ctx && ctx.config ? ctx.config().mode : 'poudlard';
        Router.replace(mode === 'classique' ? 'classic' : 'home', {}, 'fade');
        return;
      }
      if (a === 'home') return;
      if (!active.screen.onKey(a, active.ctx) && a === 'back' && active.name !== 'home') Router.go('home', {}, 'fade');
    });
  },
};
