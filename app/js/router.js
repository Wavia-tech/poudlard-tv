// Screen router. A screen = { mount(root, ctx), unmount(), onKey(action) -> bool, onLeave?(transition), diveOrigin?() }.
// One active screen at a time; a stack for "back"; transitions through CSS classes (fade, up, down, iris, crane,
// uncrane, snuff, dive, undive). `onLeave` lets the leaving screen play its own flourish (the owl lifts off, the
// candle goes out). The screen's ctx carries `transition`, the move it arrives by.
// The dive (Parapet -> Ollivanders): the camera flies into a lit window of the castle. The leaving screen zooms toward
// the point its diveOrigin() gives ({x, y} CSS px in the stage; the centre without it) and fades in the last third,
// the shop settles in from that same point. The undive is the reverse: the shop recedes into the window while the
// Parapet starts zoomed into it and pulls back. Transform and opacity only (base.css); the origin is the only inline
// style, set before the move and dropped with it.

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
  if (transition !== 'fade' && isReduced()) transition = 'fade';   // reduced motion (setting or system): plain fades
  const el = makeLayer(name);
  el.classList.add(`enter-${transition}`);
  const prev = active;
  // The dive: both layers share the window's point as their transform origin (set before the first frame).
  const dive = DIVES.has(transition) && prev;
  if (dive) {
    el.dataset.via = transition;      // the entering layer's timing (base.css), dropped once the move is over
    if (transition === 'dive') {
      const p = diveOrigin(prev.screen, null);
      diveAt = { x: p.x / (stage.clientWidth || 1), y: p.y / (stage.clientHeight || 1) };
      setOrigin(prev.el, p); setOrigin(el, p);
    } else {
      const p = diveOrigin(null, diveAt);
      setOrigin(prev.el, p); setOrigin(el, p);
    }
  }
  stage.appendChild(el);
  const instance = typeof def === 'function' ? def() : def;
  const screenCtx = { ...ctx, params: params || {}, router: Router, transition };     // the same context for mount() and onKey()
  active = { name, screen: instance, el, ctx: screenCtx };
  Input.setHandler(null);                       // while mounting, keys are ignored (never sent to a half-built screen)
  if (prev && push) stack.push(prev.name);
  Platform.refresh();                           // the lists read from the TV are re-read once per screen
  if (prev && prev.screen.onLeave) { try { prev.screen.onLeave(transition); } catch (e) { /* the leaving screen's flourish failed: no matter */ } }
  // The transition starts right away; mounting (which may wait for images) does not delay it.
  requestAnimationFrame(() => {
    if (dive) void getComputedStyle(el).transform;   // the start state is resolved, so the move always plays
    el.classList.remove(`enter-${transition}`);
    if (prev) prev.el.classList.add(`leave-${transition}`);
  });
  // The undive: the Parapet's own window, once its synchronous mount has laid it out (else the dive's point stays).
  let mounting;
  try { mounting = instance.mount(el, screenCtx); } catch (e) { mounting = Promise.reject(e); }
  if (dive && transition === 'undive' && typeof instance.diveOrigin === 'function') {
    const p = diveOrigin(instance, diveAt); setOrigin(prev.el, p); setOrigin(el, p);
  }
  try { await mounting; }
  catch (e) { el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`screen ${name}`, e); }
  if (active && active.el === el) Router.refocus();
  setTimeout(() => {
    if (prev) { try { prev.screen.unmount && prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); }
    if (dive && el.isConnected) { delete el.dataset.via; el.style.transformOrigin = ''; }
    busy = false;
    if (pending) { const p = pending; pending = null; swap(p.name, p.params, p.transition, p.push); }
  }, TRANSITION_MS + (OVERLAP_MS[transition] || 0));
}

export const Router = {
  init(stageEl, context) { stage = stageEl; ctx = context; },
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
