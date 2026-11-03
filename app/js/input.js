// Input: keyboard (mock-up), Android TV remote (D-pad), on-screen remote.
// Everything becomes an action: left, right, up, down, ok, back, menu, longok (OK held 700 ms), longback (Back held 2 s),
// plus `okdown` (the OK key goes down: the screens add .is-press to the focused element; never queued).
// While a screen is "busy" (Lumos), key presses are queued and replayed, never lost.

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Enter: 'ok', ' ': 'ok', Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
  m: 'menu', M: 'menu', ContextMenu: 'menu', Home: 'home', MediaPlayPause: 'ok',
};
const REPEAT_MS = 110;       // remotes auto-repeat very fast: smooth it out
const LONG_OK_MS = 700;
const LONG_BACK_MS = 2000;

let handler = null;
let lastAt = 0, lastAction = '';
const holds = { ok: { timer: 0, fired: false, long: 'longok', ms: LONG_OK_MS }, back: { timer: 0, fired: false, long: 'longback', ms: LONG_BACK_MS } };
const activity = new Set();
let queue = null;            // null = pass-through; array = queue

function dispatch(action) {
  if (action === 'okdown') { if (!queue && handler) handler(action); return; }   // cosmetic: never queued, never activity
  activity.forEach((fn) => fn(action));
  if (queue) { if (queue.length < 4) queue.push(action); return; }
  if (handler) handler(action);
}
const inField = (e) => e.target && e.target.closest && e.target.closest('input, textarea, button.dev');

export const Input = {
  setHandler(fn) { handler = fn; },
  onActivity(fn) { activity.add(fn); return () => activity.delete(fn); },
  press(action) { dispatch(action); },
  // Queue: hold() during a blocking animation, release() replays the keys received meanwhile.
  hold() { if (!queue) queue = []; },
  release() { const q = queue || []; queue = null; q.forEach((a) => handler && handler(a)); },

  install() {
    document.addEventListener('keydown', (e) => {
      if (inField(e)) return;
      const action = KEYMAP[e.key];
      if (!action) return;
      e.preventDefault();
      const h = holds[action];
      if (h) {                                  // OK and Back fire on release, unless held long
        if (!e.repeat && !h.timer) {
          if (action === 'ok') dispatch('okdown');   // the press itself (focus.css .is-press), before any hold timer
          h.timer = setTimeout(() => { h.fired = true; h.timer = 0; dispatch(h.long); }, h.ms);
        }
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
    // On-screen remote: any button carrying data-action
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-action]');
      if (b) dispatch(b.dataset.action);
    });
  },
};
