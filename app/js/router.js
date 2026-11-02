// Routeur d'écrans. Un écran = { mount(root, ctx), unmount(), onKey(action) -> bool, resume?() }.
// Un seul écran actif ; une pile pour "retour" ; transitions par classes CSS (fade, up, down, iris).

import { Input } from './input.js';

const screens = new Map();
const stack = [];
let active = null;      // { name, screen, el }
let stage = null;
let ctx = null;
let busy = false;

const TRANSITION_MS = 700;

function makeLayer(name) {
  const el = document.createElement('section');
  el.className = `screen screen-${name}`;
  el.dataset.screen = name;
  return el;
}

let pending = null;   // dernière navigation demandée pendant une transition : jouée juste après

async function swap(name, params, transition, push) {
  const def = screens.get(name);
  if (!def) return;
  if (busy) { pending = { name, params, transition, push }; return; }
  busy = true;
  const el = makeLayer(name);
  el.classList.add(`enter-${transition}`);
  stage.appendChild(el);
  const prev = active;
  const instance = typeof def === 'function' ? def() : def;
  const screenCtx = { ...ctx, params: params || {}, router: Router };     // le même contexte pour mount() et onKey()
  active = { name, screen: instance, el, ctx: screenCtx };
  Input.setHandler(null);                       // pendant le montage, les touches sont ignorées (jamais envoyées à un écran à moitié construit)
  if (prev && push) stack.push(prev.name);
  // La transition démarre tout de suite ; le montage (qui peut attendre des images) ne la retarde pas.
  requestAnimationFrame(() => {
    el.classList.remove(`enter-${transition}`);
    if (prev) prev.el.classList.add(`leave-${transition}`);
  });
  try { await instance.mount(el, screenCtx); }
  catch (e) { el.innerHTML = '<div class="screen-error"><div class="engraved">Un sortilège a raté</div><div class="small-caps">Retour</div></div>'; console.error(`écran ${name}`, e); }
  if (active && active.el === el) Router.refocus();
  setTimeout(() => {
    if (prev) { try { prev.screen.unmount && prev.screen.unmount(); } catch (e) { /* écran déjà démonté */ } prev.el.remove(); }
    busy = false;
    if (pending) { const p = pending; pending = null; swap(p.name, p.params, p.transition, p.push); }
  }, TRANSITION_MS);
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
  // Les écrans peuvent demander à repasser la main à l'écran actif (ex. après une fenêtre de confirmation).
  refocus() { Input.setHandler((a) => { if (!active || !active.screen.onKey) return; if (!active.screen.onKey(a, active.ctx) && a === 'back' && active.name !== 'home') Router.go('home', {}, 'fade'); }); },
};
