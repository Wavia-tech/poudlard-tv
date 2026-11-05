// Howler (Beuglante): the launcher's error message. A red envelope (the only bright red thing in the interface)
// slides up from the bottom of the screen, shakes four times, delivers its message in IM Fell, then burns itself up.
//
//   beuglante(host, { message, action?: { label, onChoose } }) → { close() }
//
// - `message`: controlled text (constants, CATALOG names); it is set as textContent, never as innerHTML.
// - `action` : at most one option, taken into account only if it has a label AND an `onChoose` function
//              (otherwise it is ignored: never an "OK · …" line that does nothing). If present, the
//              Howler takes over the keys (Input.setHandler): OK chooses it, Back closes without doing
//              anything, everything else is swallowed. On closing, it hands the keys back to the router (Router.refocus()).
//              Without an action, no key is captured: the screen underneath carries on.
// - Only one Howler at a time: opening a second one burns the first immediately.
// - The message is shown whole, on as many lines as it needs (never truncated): the TV's own sentence (Platform's
//   `error`, e.g. "Netflix n'est pas installée sur cette télé.") is read as it comes. The lifetime grows with its
//   length (reading time), and with an action it stays a little longer still.
// - Motion: the shared curve, transform and opacity only, once on arrival; nothing runs while it waits. With isReduced():
//   200 ms fade, no shaking, no slide-up.

import { Input } from './input.js';
import { Router } from './router.js';
import { isReduced } from './config.js';

const ARRIVE = 'cubic-bezier(.32,.72,0,1)';   // --ease-arrive (base.css)
const SLIDE_MS = 450;     // slide up from the bottom
const SHAKE_MS = 640;     // four shakes (±1.5°)
const LIFE_MS = 4000;     // shortest lifetime before burning up
const LIFE_MAX_MS = 11000;
const READ_MS = 60;       // per character of the message (reading from the couch)
const ACTION_MS = 2500;   // extra time when an action is offered (read, then decide)
const BURN_MS = 500;      // burn-up fade (opacity + slight rise)
const REDUCED_FADE_MS = 200;

let current = null;       // the Howler on display, if any

// Test-bench time factor (×3 slow motion): JS timers follow the CSS durations.
// Read from the attribute (base.css: --k is 3 under :root[data-slow="1"]), not getComputedStyle(), which forced a
// style recalculation of the page each time a Howler opened.
function timeScale(host) {
  void host;
  return document.documentElement.dataset.slow === '1' ? 3 : 1;
}

function build(message, action) {
  const root = document.createElement('div');
  root.className = 'beuglante';
  root.setAttribute('role', 'alert');

  const env = document.createElement('div');
  env.className = 'beuglante-env';

  const flap = document.createElement('div');
  flap.className = 'beuglante-flap';
  const seal = document.createElement('div');
  seal.className = 'beuglante-seal';

  const paper = document.createElement('div');
  paper.className = 'beuglante-paper';
  const msg = document.createElement('div');
  msg.className = 'beuglante-msg';
  msg.textContent = String(message || 'Quelque chose a mal tourné.');
  paper.appendChild(msg);

  env.append(flap, seal, paper);

  if (action) {
    const act = document.createElement('div');
    act.className = 'beuglante-act';
    const key = document.createElement('b');
    key.textContent = 'OK';
    const label = document.createElement('span');
    label.textContent = String(action.label);
    const dismiss = document.createElement('i');
    dismiss.textContent = 'Retour · ignorer';
    act.append(key, label, dismiss);
    env.appendChild(act);
  }

  root.appendChild(env);
  return root;
}

export function beuglante(host, { message, action } = {}) {
  if (!host) return { close() {} };
  if (current) current.close();

  // An action only exists when complete: label + function. Otherwise, no action line and no key capture.
  const act = action && action.label && typeof action.onChoose === 'function' ? action : null;

  const reduced = isReduced();
  const k = timeScale(host);
  const el = build(message, act);
  if (reduced) el.classList.add('is-reduced');
  host.appendChild(el);
  // In its place from the start; the arrival is an animation towards it, which needs nothing read from the page.
  const arrival = el.animate ? el.animate(
    reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: 'translate(-50%, 140%)' }, { transform: 'translate(-50%, 0)' }],
    { duration: (reduced ? REDUCED_FADE_MS : SLIDE_MS) * k, easing: reduced ? 'ease' : ARRIVE },
  ) : null;

  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms * k));
  let closed = false;
  let tookInput = false;

  const handle = {
    close() {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      timers.length = 0;
      if (current === handle) current = null;
      if (tookInput) { tookInput = false; Router.refocus(); }
      // Burn-up: opacity + slight rise, then removal from the DOM.
      if (arrival) arrival.cancel();
      el.classList.remove('is-shake');
      el.classList.add('is-burn');
      setTimeout(() => el.remove(), (reduced ? REDUCED_FADE_MS : BURN_MS) * k);
    },
  };
  current = handle;

  // Key capture: only if an action is offered.
  if (act) {
    tookInput = true;
    Input.setHandler((a) => {
      if (closed) return true;
      if (a === 'ok') {
        handle.close();
        try { act.onChoose(); } catch (e) { /* the action failed: the Howler is already closed, nothing to break */ }
        return true;
      }
      if (a === 'back') { handle.close(); return true; }
      return true;   // every other key is swallowed while the envelope is on screen
    });
  }

  // Choreography: slide up from the bottom, shake, live, burn.
  if (!reduced) later(() => el.classList.add('is-shake'), SLIDE_MS);
  later(() => el.classList.remove('is-shake'), SLIDE_MS + SHAKE_MS);
  const text = String(message || '');
  later(() => handle.close(), Math.min(LIFE_MAX_MS, Math.max(LIFE_MS, 1500 + text.length * READ_MS) + (act ? ACTION_MS : 0)));

  return handle;
}
