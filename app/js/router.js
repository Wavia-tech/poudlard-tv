// Screen router. A screen = { mount(root, ctx), unmount(), onKey(action) -> bool, onLeave?(transition),
// ready?/sceneReady? (a promise: its first frame is decoded), onEnter?(transition), neighbours?(), revisit?(params) }.
// One active screen at a time; a stack for "back"; transitions through CSS classes (fade, down, iris, snuff, pan-down,
// pan-up). `onLeave` lets the leaving screen play its own flourish. The screen's ctx carries `transition`, the move it
// arrives by ('fade' under reduced motion, whatever was asked).
//
// The pan: one vertical camera move, for everything that stacks (the Parapet, then each shop window under it). The layers
// hang on one element, the camera (.camera, base.css, the parent of every screen layer), each opaque and exactly one screen
// from the next; only the camera moves, on --ease-camera for --t-pan, so nothing can tear between them. Nothing fades but
// what carries .pan-fade, and that fades by itself: it never travels or scales with anything but its own picture.
//
// The neighbours: a key must be answered in its own frame, so what a pan shows is mounted, decoded and rasterised before the
// key. A screen says who stands next to it (neighbours(): { 'pan-down': { name, params }, 'pan-up': { name, params } }), and
// once the screen has settled and the keys have stopped the router mounts them one at a time, one screen away (.is-near), where
// nothing draws them, a piece per frame (ctx.slice()), the pieces waiting while a key is being answered. Once whole, a neighbour
// stands in place for a few frames, all but invisible (.is-prep: a layer on screen is what gets rasterised; any key sends it
// away at once), then goes back. The layer a pan leaves stays mounted when the new screen names it as a neighbour. A pan to a
// neighbour only sets one transform in the key's task.
// A key never waits for a mount: a screen that says `progressive` (the Parapet, the shop) is shown as it is, its opaque picture
// first, its first piece built in the key's task and the others in the next frames, while the camera already moves. Any
// other screen is mounted first, and the last key pressed meanwhile is kept and played as soon as the move has started.
//
// Behind: the Parapet stays mounted, off screen and paused, while the Map or the Room of Requirement is open (`behind`, one
// screen above, .is-near), so that closing them starts at once and only moves layers; it follows the config by itself
// (home.js) and is let go on memory pressure (Router.trim()) or for any other screen.
//
// Finished transitions: a CSS transition that has ended stays attached to its element until the next garbage collection, and until
// then the next transition of the same property on that element is refused by the compositor ("incompatible animations", measured:
// it holds every time a focus comes back to an element, and a forced collection clears it). It then runs on the main thread, with a
// main frame, a style pass and a commit at every frame of the move, for all the document's animations. So each one is cancelled
// as it ends, which changes nothing on screen (settleTransitions).
//
// The lists read from the TV (Platform) are not read per mount: a bridge call is a synchronous trip to another process,
// about 170-280 ms on the TV (installedApps). main.js has them read again when the page comes back from another app.
// A navigation asked for while another move plays waits and goes right after it, the last one winning, except a pan over a
// pan, which retargets at once from where the camera is. Once every pan is over, the camera and the layers go back to zero
// together, which changes nothing on screen. Any other move first lets the neighbours go.

import { Input } from './input.js';
import { isReduced } from './config.js';

const screens = new Map();
const stack = [];
let active = null;      // { name, key, screen, el, ctx, at }
let stage = null;
let ctx = null;
let camera = null;      // the element every screen layer hangs on
let slot = 0;           // where the camera is heading, in screens: the active layer's place on it (0 at rest)
const place = (n) => (n ? `translateY(${n * 100}%)` : '');
const keyOf = (name, params) => `${name}:${(params && params.collection) || ''}`;

// The time each move keeps its leaving layer, in ms: the longest of its two layers' transitions in base.css, and a
// short margin.
const MOVE_MS = { fade: 620, down: 720, iris: 720, snuff: 620, 'pan-down': 670, 'pan-up': 670 };
const REDUCED_MS = 240;       // a fade under reduced motion (base.css: 200 ms)
const PANS = new Set(['pan-down', 'pan-up']);
const OPPOSITE = { 'pan-down': 'pan-up', 'pan-up': 'pan-down' };
// The longest a move waits for its screen's pictures before it starts anyway.
const READY_MAX_MS = 1200;
// How long after the last move, or the last key, the neighbours start to be mounted, ms.
const NEAR_AFTER_MS = 700;
// A piece of a neighbour's mount waits this long after a key.
const QUIET_MS = 450;
// The screens the Parapet stays behind.
const KEEP_BEHIND = new Set(['map', 'settings']);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Right after the next frame: what a piece of a mount changes is styled in the frame after, and no piece shares a frame with
// another. A hidden page has no frames: the timer goes on without them.
const afterFrame = () => new Promise((resolve) => {
  let done = false; const end = () => { if (!done) { done = true; resolve(); } };
  requestAnimationFrame(() => setTimeout(end, 0)); setTimeout(end, 120);
});
const frames = (n) => new Promise((r) => { const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); });
// The test bench's slow motion (--k, base.css): the leaving layer stays as long as its transition.
const slow = () => (document.documentElement.dataset.slow === '1' ? 3 : 1);
// A screen's "first frame decoded" promise: Ollivanders' `ready`, the Parapet's `sceneReady`.
function readyOf(instance) {
  const p = instance && (instance.ready || instance.sceneReady);
  return p && typeof p.then === 'function' ? p : null;
}

function settleTransitions(root) {
  root.addEventListener('transitionrun', (e) => {
    if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
    for (const a of e.target.getAnimations()) if (!a.onfinish && a.transitionProperty === e.propertyName) a.onfinish = () => a.cancel();
  });
}

function makeLayer(name) {
  const el = document.createElement('section');
  el.className = `screen screen-${name}`;
  el.dataset.screen = name;
  return el;
}

let pending = null;     // the last navigation asked for while it could not start: played as soon as it can
let mounting = false;   // a screen the key is waiting for is being built or decoded: its move has not started
let moving = 0;         // moves in flight
let panning = false;    // every move in flight is a pan
let keptKey = null;     // the last key pressed during a mount
const leaving = [];     // the keys of the screens on their way out
const near = new Map(); // 'pan-down' | 'pan-up' -> a neighbour: { name, key, screen, el, ctx, at, done, prepared }
let nearTimer = 0;
let behind = null;      // the Parapet, parked while the Map or the Room of Requirement is open: { name, key, screen, el, ctx, at }
let lastKeyAt = -1e9;   // the last key, whoever got it
let prepping = null;    // the neighbour standing in place for its raster

// Lets a neighbour go: taken off the screen at once, unmounted now.
function dropNear(dir) {
  const n = near.get(dir); if (!n) return;
  near.delete(dir);
  n.dropped = true;
  if (prepping === n) prepping = null;
  try { if (n.screen.unmount) n.screen.unmount(); } catch (e) { /* already gone */ }
  n.el.remove();
}
function dropAllNear() { [...near.keys()].forEach(dropNear); }
// The same in a key's task: off the strip at once, and its pictures and its DOM let go after the move. Not a screen that is one object
// (the Parapet), which may be mounted again at once.
function dropAllNearLater() {
  [...near.keys()].forEach((dir) => {
    const n = near.get(dir);
    if (screens.get(n.name) === n.screen) { dropNear(dir); return; }
    near.delete(dir);
    n.dropped = true;
    if (prepping === n) prepping = null;
    n.el.style.display = 'none';
    setTimeout(() => { try { if (n.screen.unmount) n.screen.unmount(); } catch (e) { /* already gone */ } n.el.remove(); }, (MOVE_MS.down + 100) * slow());
  });
}

function dropBehind() {
  const n = behind; if (!n) return;
  behind = null;
  try { if (n.screen.unmount) n.screen.unmount(); } catch (e) { /* already gone */ }
  n.el.remove();
}
// The key is first: whoever stands in place for its raster goes back to its place, in the key's task.
function unprep() {
  const n = prepping; if (!n) return;
  prepping = null;
  n.el.classList.remove('is-prep'); n.el.classList.add('is-near');
  n.el.style.transform = place(n.at);
}

// Builds a screen in its own layer at a place of the strip, and says when it is whole, its pictures decoded and rasterised. The
// first piece of mount() runs on the caller's task; a screen cuts the rest with ctx.slice(). `urgent`: the camera is coming.
function build(name, params, transition, at, urgent) {
  const def = screens.get(name);
  const el = makeLayer(name);
  el.classList.add('is-strip', 'is-near');
  el.style.transform = place(at);
  camera.appendChild(el);
  const instance = typeof def === 'function' ? def() : def;
  const n = { name, key: keyOf(name, params), screen: instance, el, ctx: null, at, done: false, failed: null, prepared: null, urgent, dropped: false };
  // A piece waits for its frame; a neighbour's also for the keys and the moves to be over.
  const slice = async () => {
    await afterFrame();
    while (!n.urgent && !n.dropped && (moving || mounting || document.hidden || performance.now() - lastKeyAt < QUIET_MS)) await wait(QUIET_MS / 2);
  };
  const screenCtx = { ...ctx, params: params || {}, router: Router, transition, prepared: true, slice };
  n.ctx = screenCtx;
  let mount;
  try { mount = Promise.resolve(instance.mount(el, screenCtx)); } catch (e) { mount = Promise.reject(e); }
  mount = mount.catch((e) => { n.failed = e || new Error('mount'); });
  const ready = readyOf(instance);
  n.prepared = Promise.all([mount, ready ? ready.catch(() => {}) : null]).then(async () => {
    if (n.dropped) return;
    if (!n.urgent) await slice();
    if (n.dropped) return;
    // Still waiting off screen: it stands in place for a moment, all but invisible, so that its layers reach the GPU.
    if (!n.urgent && near.get(n.dir) === n) {
      prepping = n;
      el.style.transform = place(slot);
      el.classList.add('is-prep'); el.classList.remove('is-near');
    }
    if (instance.warm) { try { await instance.warm(); } catch (e) { /* its first use will do it */ } }
    await frames(2);
    if (prepping === n) unprep();
    el.classList.remove('is-hold');
    n.done = true;
  });
  return n;
}

// The neighbours of the screen in place, one at a time, once it has settled and the keys have stopped.
function scheduleNear(ms = NEAR_AFTER_MS) { clearTimeout(nearTimer); nearTimer = setTimeout(fillNear, ms * slow()); }
function fillNear() {
  if (!active || mounting || moving || isReduced() || !stage.isConnected) return;
  if (document.hidden) return;                            // Router.wake() asks again
  if (Input.held()) { scheduleNear(); return; }
  if (KEEP_BEHIND.has(active.name)) return;               // the Map and the Room of Requirement stand alone, over the Parapet
  const on = active;
  const ready = readyOf(on.screen);
  const want = on.screen.neighbours ? on.screen.neighbours() : {};
  for (const dir of [...near.keys()]) if (!want[dir] || keyOf(want[dir].name, want[dir].params) !== near.get(dir).key) dropNear(dir);
  const go = () => {
    if (active !== on || mounting || moving) return;      // the camera went on while this waited: `want` is another screen's
    if ([...near.values()].some((n) => !n.done)) return;  // one at a time: the one being built asks for the next
    for (const dir of PANS) {
      const w = want[dir];
      if (!w || near.has(dir) || !screens.has(w.name) || leaving.includes(keyOf(w.name, w.params))) continue;
      const n = build(w.name, w.params, dir, slot + (dir === 'pan-down' ? 1 : -1), false);
      n.dir = dir;
      near.set(dir, n);
      n.prepared.then(() => { if (!n.dropped && near.get(dir) === n) scheduleNear(60); });   // the other one, if any
      return;
    }
  };
  if (ready) ready.then(go, go); else go();
}

// Whether a navigation can start now. Under reduced motion a pan is a fade: it waits like one.
function canStart(name, params, transition) {
  if (mounting) return false;
  if (!moving) return true;
  if (!PANS.has(transition) || !panning || isReduced()) return false;
  const key = keyOf(name, params);
  return !leaving.includes(key) && !(active && active.key === key);
}
function startPending() {
  if (!pending || !canStart(pending.name, pending.params, pending.transition)) return;
  const p = pending; pending = null;
  if (active && active.key === keyOf(p.name, p.params)) return;   // it is already there
  swap(p.name, p.params, p.transition, p.push);
}

async function swap(name, params, transition, push) {
  if (!screens.has(name)) return;
  if (!canStart(name, params, transition)) { pending = { name, params, transition, push }; return; }
  pending = null;         // the last one asked for wins
  clearTimeout(nearTimer);
  const prev = active;
  const asked = transition;
  if (transition !== 'fade' && isReduced()) transition = 'fade';   // reduced motion (setting or system): plain fades
  const pan = PANS.has(transition) && Boolean(prev);
  const key = keyOf(name, params);
  if (pan) await startPan(name, params, transition, push, prev, key);
  else if (behind && behind.key === key) reveal(params, transition, push, prev);
  else await startOther(name, params, transition, push, prev, key, PANS.has(asked) && Boolean(prev));
  Router.refocus();
  const k = keptKey; keptKey = null;
  if (k) { if (Input.held()) Input.press(k); else routeKey(k); }
  startPending();
}

// The pan: the neighbour if it stands there (nothing but a transform, in the key's own task), else the screen is built: a
// progressive one shows at once, as far as it has got; any other one first.
async function startPan(name, params, transition, push, prev, key) {
  const d = transition === 'pan-down' ? 1 : -1, back = OPPOSITE[transition];
  if (behind && behind.key === key) { dropNear(transition); near.set(transition, behind); behind = null; }
  let n = near.get(transition);
  if (n && n.key !== key) { dropNear(transition); n = null; }
  near.delete(transition);
  keptKey = null;
  if (prev && push) stack.push(prev.name);
  // What the leaving screen says now is the first thing it does: its flourish plays while the camera moves.
  if (prev.screen.onLeave) { try { prev.screen.onLeave(transition); } catch (e) { /* the flourish failed: no matter */ } }
  if (n && n.screen.revisit) {
    try { n.screen.revisit(params || {}); } catch (e) { /* its state stays as it was */ }
  } else if (!n) {
    if (near.has(back) && near.get(back).key === key) dropNear(back);   // one instance of a screen at a time
    n = build(name, params, transition, slot + d, true);
  }
  n.urgent = true;
  if (prepping === n) prepping = null;
  active = { name, key, screen: n.screen, el: n.el, ctx: n.ctx, at: n.at };
  n.ctx.params = params || {};
  if (!n.done && !n.screen.progressive) {
    mounting = true;
    Input.setHandler((a) => { if (a !== 'okdown') keptKey = a; });
    await Promise.race([n.prepared, wait(READY_MAX_MS)]);
    mounting = false;
  }
  if (n.failed) { n.el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`screen ${name}`, n.failed); }
  if (!n.done) n.el.classList.add('is-hold');             // what it adds to its chrome waits for the end of its mount
  // What was on the far side of the leaving layer is two screens away now: it goes when the camera has passed. The leaving
  // layer stays one screen behind if the new screen names it, and goes too if not.
  const far = near.get(back);
  near.delete(back);
  if (far) { far.dropped = true; leaving.push(far.key); }
  const want = n.screen.neighbours ? n.screen.neighbours() : {};
  const keep = Boolean(want[back]) && keyOf(want[back].name, want[back].params) === prev.key;
  if (keep) near.set(back, { name: prev.name, key: prev.key, screen: prev.screen, el: prev.el, ctx: prev.ctx, at: prev.at, done: true, dir: back });
  else leaving.push(prev.key);
  slot += d;
  n.at = slot;
  active.at = slot;
  n.el.style.transform = place(slot);
  n.el.classList.add('is-strip');
  n.el.classList.remove('is-prep', 'is-near', 'leave-pan-down', 'leave-pan-up');
  n.el.dataset.via = transition;
  delete prev.el.dataset.via;
  prev.el.classList.add('is-strip', `leave-${transition}`);
  if (typeof n.screen.onEnter === 'function') { try { n.screen.onEnter(transition); } catch (e) { /* the move plays anyway */ } }
  camera.classList.add('is-panning');
  camera.style.transform = place(-slot);
  panning = panning || !moving;
  moving += 1;
  setTimeout(() => {
    if (!keep) { try { if (prev.screen.unmount) prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); leaving.splice(leaving.indexOf(prev.key), 1); }
    if (far) { try { if (far.screen.unmount) far.screen.unmount(); } catch (e) { /* gone */ } far.el.remove(); leaving.splice(leaving.indexOf(far.key), 1); }
    moving -= 1;
    if (!moving) { settleStrip(); panning = false; scheduleNear(); }
    startPending();
  }, (MOVE_MS[transition] || 700) * slow());
}

// Back to the Parapet that stood behind: it is in place under the leaving layer in the key's task, and only that layer moves.
function reveal(params, transition, push, prev) {
  dropAllNear();
  settleStrip();
  const n = behind; behind = null;
  keptKey = null;
  if (prev && push) stack.push(prev.name);
  if (prev.screen.onLeave) { try { prev.screen.onLeave(transition); } catch (e) { /* no matter */ } }
  prev.el.classList.remove('is-strip');
  n.at = 0;
  n.el.classList.remove('is-near');
  n.el.style.transform = '';
  active = { name: n.name, key: n.key, screen: n.screen, el: n.el, ctx: n.ctx, at: 0 };
  n.ctx.params = params || {};
  if (n.screen.revisit) { try { n.screen.revisit(params || {}); } catch (e) { /* its state stays as it was */ } }
  if (n.screen.onEnter) { try { n.screen.onEnter(transition); } catch (e) { /* the move plays anyway */ } }
  prev.el.classList.add(`leave-${transition}`);
  moving += 1;
  leaving.push(prev.key);
  setTimeout(() => {
    try { if (prev.screen.unmount) prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); leaving.splice(leaving.indexOf(prev.key), 1);
    moving -= 1;
    if (!moving) { panning = false; scheduleNear(); }
    startPending();
  }, (isReduced() ? REDUCED_MS : MOVE_MS[transition] || 700) * slow());
}

// Every other move: the neighbours go, the camera is at zero, and the layers play their classes. The Parapet stays behind
// the Map and the Room of Requirement.
async function startOther(name, params, transition, push, prev, key, prepared) {
  mounting = true;
  dropAllNearLater();
  settleStrip();
  if (!KEEP_BEHIND.has(name)) dropBehind();
  const keepPrev = Boolean(prev) && prev.name === 'home' && KEEP_BEHIND.has(name) && !behind;
  const def = screens.get(name);
  const el = makeLayer(name);
  el.classList.add(prepared ? 'is-prep' : `enter-${transition}`);
  camera.appendChild(el);
  const instance = typeof def === 'function' ? def() : def;
  const screenCtx = { ...ctx, params: params || {}, router: Router, transition, prepared, slice: afterFrame };   // the same context for mount() and onKey()
  active = { name, key, screen: instance, el, ctx: screenCtx, at: 0 };
  keptKey = null;
  Input.setHandler((a) => { if (a !== 'okdown') keptKey = a; });   // during a mount: never sent to a half-built screen, never lost
  if (prev && push) stack.push(prev.name);
  if (prev) prev.el.classList.remove('is-strip');
  if (prev && prev.screen.onLeave) { try { prev.screen.onLeave(transition, keepPrev); } catch (e) { /* the leaving screen's flourish failed: no matter */ } }
  if (!prepared) requestAnimationFrame(() => {                     // an unprepared move starts right away; its mount may wait for images
    el.classList.remove(`enter-${transition}`);
    if (prev) prev.el.classList.add(`leave-${transition}`);
  });
  let mount, failed = null;
  try { mount = Promise.resolve(instance.mount(el, screenCtx)); } catch (e) { mount = Promise.reject(e); }
  mount = mount.catch((e) => { failed = e || new Error('mount'); });
  if (prepared) {                                                  // a pan under reduced motion: a fade, its pictures decoded first
    const ready = readyOf(instance);
    await Promise.race([Promise.all([mount, ready ? ready.catch(() => {}) : null]), wait(READY_MAX_MS)]);
    await frames(2);
    el.classList.add(`enter-${transition}`); void getComputedStyle(el).opacity;
    if (typeof instance.onEnter === 'function') { try { instance.onEnter(transition); } catch (e) { /* the screen's arrival failed: the move plays anyway */ } }
    el.classList.remove('is-prep', `enter-${transition}`);
    prev.el.classList.add(`leave-${transition}`);
  }
  await mount;
  if (failed) { el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`screen ${name}`, failed); }
  moving += 1;
  if (prev) leaving.push(prev.key);
  setTimeout(() => {
    if (prev) {
      if (keepPrev && !behind && prev.key !== (active && active.key)) {
        // Parked one screen above, nothing of it drawn, until it is called back.
        prev.el.classList.remove(`leave-${transition}`);
        prev.el.classList.add('is-strip', 'is-near');
        prev.el.style.transform = place(-1);
        behind = { name: prev.name, key: prev.key, screen: prev.screen, el: prev.el, ctx: prev.ctx, at: -1, done: true };
        if (prev.screen.onParked) { try { prev.screen.onParked(); } catch (e) { /* it will be as it was */ } }
      } else { try { prev.screen.unmount && prev.screen.unmount(); } catch (e) { /* screen already unmounted */ } prev.el.remove(); }
      leaving.splice(leaving.indexOf(prev.key), 1);
    }
    moving -= 1;
    if (!moving) { panning = false; scheduleNear(); }
    startPending();
  }, (isReduced() ? REDUCED_MS : MOVE_MS[transition] || 700) * slow());
  mounting = false;
}

// Every pan is over: the camera goes back to zero and every layer on it moves by as much, which changes nothing on screen.
// The layer left behind is a neighbour now: its leaving state becomes its resting one.
function settleStrip() {
  camera.classList.remove('is-panning');
  camera.style.transform = '';
  if (active) {
    delete active.el.dataset.via;
    active.at -= slot;
    active.el.style.transform = place(active.at);
  }
  near.forEach((n) => {
    n.at -= slot;
    n.el.style.transform = place(n.at);
    if (n.done) { n.el.classList.remove('leave-pan-down', 'leave-pan-up'); n.el.classList.add('is-near'); }
  });
  slot = 0;
}

// A key for the active screen. Home: the screen's onHome() when it has one (the Parapet resets itself), otherwise the
// home of the current mode.
function routeKey(a) {
  if (!active || !active.screen.onKey) return;
  if (moving === 0 && !mounting && nearTimer) scheduleNear();     // the keys go first: the neighbours wait for them to stop
  if (a === 'home' && !(active.screen.onHome && active.screen.onHome())) {
    if (active.screen.onKey(a, active.ctx)) return;
    const mode = ctx && ctx.config ? ctx.config().mode : 'poudlard';
    const home = mode === 'classique' ? 'classic' : 'home';
    // Already there: never over itself. A screen that is one object would be mounted, then unmounted by its own leaving layer.
    if (active.name !== home) Router.replace(home, {}, 'fade');
    return;
  }
  if (a === 'home') return;
  if (!active.screen.onKey(a, active.ctx) && a === 'back' && active.name !== 'home') Router.go('home', {}, 'fade');
}

export const Router = {
  init(stageEl, context) {
    stage = stageEl; ctx = context;
    camera = document.createElement('div');
    camera.className = 'camera';
    stage.appendChild(camera);
    Input.onActivity(() => { lastKeyAt = performance.now(); unprep(); });
    settleTransitions(stage);
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
  // Memory pressure: what stands ahead goes, and is built again when the keys have stopped. Nothing waits for it: a move
  // shows its screen as far as it has got.
  trim() {
    if (mounting || moving) return;
    dropAllNear();
    dropBehind();
    scheduleNear(4000);
  },
  // The page is back from another app: the neighbours may have gone.
  wake() { if (!moving && !mounting) scheduleNear(); },
  // Screens can ask to hand the keys back to the active screen (e.g. after a confirmation dialog).
  refocus() { Input.setHandler(routeKey); },
};
