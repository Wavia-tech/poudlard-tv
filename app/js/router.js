// Screen router. A screen = { mount(root, ctx), unmount(), onKey(action) -> bool, onLeave?(transition) }.
// One active screen at a time; a stack for "back"; transitions through CSS classes (fade, up, down, iris, crane,
// uncrane, snuff). `onLeave` lets the leaving screen play its own flourish (the owl lifts off, the candle goes out).

import { Input } from './input.js';
import { Platform } from './platform.js';

const screens = new Map();
const stack = [];
let active = null;      // { name, screen, el }
let stage = null;
let ctx = null;
let busy = false;

const TRANSITION_MS = 700;
// Camera moves keep the previous layer a little longer so the two screens overlap.
const OVERLAP_MS = { crane: 120, uncrane: 120 };

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
  if (document.documentElement.dataset.motion && document.documentElement.dataset.motion !== 'auto' && transition !== 'fade') transition = 'fade';   // reduced motion: plain fades
  const el = makeLayer(name);
  el.classList.add(`enter-${transition}`);
  stage.appendChild(el);
  const prev = active;
  const instance = typeof def === 'function' ? def() : def;
  const screenCtx = { ...ctx, params: params || {}, router: Router };     // the same context for mount() and onKey()
  active = { name, screen: instance, el, ctx: screenCtx };
  Input.setHandler(null);                       // while mounting, keys are ignored (never sent to a half-built screen)
  if (prev && push) stack.push(prev.name);
  Platform.refresh();                           // the lists read from the TV are re-read once per screen
  if (prev && prev.screen.onLeave) { try { prev.screen.onLeave(transition); } catch (e) { /* the leaving screen's flourish failed: no matter */ } }
  // The transition starts right away; mounting (which may wait for images) does not delay it.
  requestAnimationFrame(() => {
    el.classList.remove(`enter-${transition}`);
    if (prev) prev.el.classList.add(`leave-${transition}`);
  });
  try { await instance.mount(el, screenCtx); }
  catch (e) { el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`screen ${name}`, e); }
  if (active && active.el === el) Router.refocus();
  setTimeout(() => {
    if (prev) { try { prev.screen.unmount && prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); }
    busy = false;
    if (pending) { const p = pending; pending = null; swap(p.name, p.params, p.transition, p.push); }
  }, TRANSITION_MS + (OVERLAP_MS[transition] || 0));
}

export const Router = {
  init(stageEl, context) { stage = stageEl; ctx = context; },
  register(name, screen) { screens.set(name, screen); },
  current() { return active ? active.name : null; },
  go(name, params, transition = 'fade') { return swap(name, params, transition, true); },
  replace(name, params, transition = 'fade') { stack.length = 0; return swap(name, params, transition, false); },
  back(transition = 'fade') {
    const name = stack.pop();
    if (name) return swap(name, {}, transition, false);
    return Promise.resolve();
  },
  canGoBack() { return stack.length > 0; },
  // Screens can ask to hand the keys back to the active screen (e.g. after a confirmation dialog).
  refocus() { Input.setHandler((a) => { if (!active || !active.screen.onKey) return; if (!active.screen.onKey(a, active.ctx) && a === 'back' && active.name !== 'home') Router.go('home', {}, 'fade'); }); },
};
