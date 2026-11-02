// Entrées : clavier (maquette), télécommande Android TV (D-pad), télécommande à l'écran.
// Tout devient une action : left, right, up, down, ok, back, menu, longok (OK maintenu 700 ms), longback (Retour maintenu 2 s).
// Pendant un écran "occupé" (Lumos), les touches sont mises en file et rejouées, jamais perdues.

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
  m: 'menu', M: 'menu', ContextMenu: 'menu', Home: 'home', MediaPlayPause: 'ok',
};
const REPEAT_MS = 110;       // les télécommandes répètent très vite : on lisse
const LONG_OK_MS = 700;
const LONG_BACK_MS = 2000;

let handler = null;
let lastAt = 0, lastAction = '';
const holds = { ok: { timer: 0, fired: false, long: 'longok', ms: LONG_OK_MS }, back: { timer: 0, fired: false, long: 'longback', ms: LONG_BACK_MS } };
const activity = new Set();
let queue = null;            // null = passe-plat ; tableau = file d'attente

function dispatch(action) {
  activity.forEach((fn) => fn(action));
  if (queue) { if (queue.length < 4) queue.push(action); return; }
  if (handler) handler(action);
}
const inField = (e) => e.target && e.target.closest && e.target.closest('input, textarea, button.dev');

export const Input = {
  setHandler(fn) { handler = fn; },
  onActivity(fn) { activity.add(fn); return () => activity.delete(fn); },
  press(action) { dispatch(action); },
  // File d'attente : hold() pendant une animation bloquante, release() rejoue les touches reçues.
  hold() { if (!queue) queue = []; },
  release() { const q = queue || []; queue = null; q.forEach((a) => handler && handler(a)); },

  install() {
    document.addEventListener('keydown', (e) => {
      if (inField(e)) return;
      const action = KEYMAP[e.key];
      if (!action) return;
      e.preventDefault();
      const h = holds[action];
      if (h) {                                  // OK et Retour se déclenchent au relâchement, sauf appui long
        if (!e.repeat && !h.timer) h.timer = setTimeout(() => { h.fired = true; h.timer = 0; dispatch(h.long); }, h.ms);
        return;
      }
      const now = performance.now();
      if (e.repeat && now - lastAt < REPEAT_MS && action === lastAction) return;
      lastAt = now; lastAction = action;
      dispatch(action);
    });
    document.addEventListener('keyup', (e) => {
      const action = KEYMAP[e.key];
      const h = holds[action];
      if (!h) return;
      clearTimeout(h.timer); h.timer = 0;
      if (h.fired) { h.fired = false; return; }
      if (!inField(e)) dispatch(action);
    });
    window.addEventListener('blur', () => { for (const h of Object.values(holds)) { clearTimeout(h.timer); h.timer = 0; h.fired = false; } });
    // Télécommande à l'écran : tout bouton portant data-action
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-action]');
      if (b) dispatch(b.dataset.action);
    });
  },
};
