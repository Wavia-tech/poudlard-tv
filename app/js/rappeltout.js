// Remembrall (Rappeltout): the shared context menu. A glass sphere resting on a darkened backdrop, a few lines
// in EB Garamond, up/down to choose, OK to take, Back to put the sphere down.
// It takes over the keys (Input.setHandler) while displayed and hands them back to the router (Router.refocus()).
//
//   rappeltout(host, { title, options: [{ id, label, disabled? }], anchor?: { x, y, edge? } }) → Promise<string|null>
//
// `host`   : the full-screen element of the calling screen (the sphere and the veil are added to it).
// `anchor` : point (px, relative to `host`) near which the sphere is placed; without an anchor, it sits in the center.
//            `edge: 'below'` places the TOP of the sphere on the anchor (under a medallion or a cartouche) instead of centering it.
// The chosen line carries `is-on` (not `is-focus`: the calling screen keeps its single focus under the veil).
// Resolves with the `id` of the chosen option, or `null` if the user cancels (Back, Menu, Home) or if another
// Remembrall, or `dismissRappeltout()`, closes this one (when the screen unmounts, for instance).

import { Input } from './input.js';
import { Router } from './router.js';
import { Fx } from './fx.js';
import { isReduced } from './config.js';

let open = null;   // the Remembrall on display, if any: { finish(id) }

// Test-bench time factor (×3 slow motion), read from the host.
const timeScale = (el) => Number(getComputedStyle(el).getPropertyValue('--k')) || 1;

export function rappeltout(host, { title = '', options = [], anchor = null } = {}) {
  if (open) open.finish(null);                       // only one Remembrall at a time
  return new Promise((resolve) => {
    const reduced = isReduced();
    const k = timeScale(host);
    const opts = options.filter((o) => o && typeof o.id === 'string');

    // ---- DOM (all text goes through textContent: never HTML built from labels) ----
    const veil = document.createElement('div');
    veil.className = 'rpt-veil';
    const orb = document.createElement('div');
    orb.className = 'rpt-orb' + (reduced ? ' is-reduced' : '');
    const body = document.createElement('div');
    body.className = 'rpt-body';
    const h = document.createElement('div');
    h.className = 'rpt-title';
    h.textContent = title;
    body.appendChild(h);
    const lines = opts.map((o) => {
      const li = document.createElement('div');
      li.className = 'rpt-line' + (o.disabled ? ' is-disabled' : '');
      li.textContent = o.label || o.id;
      body.appendChild(li);
      return li;
    });
    if (!lines.length) {                              // never an empty sphere: the fallback line takes the focus (OK refuses)
      const li = document.createElement('div');
      li.className = 'rpt-line is-disabled';
      li.textContent = 'Rien à faire ici';
      body.appendChild(li);
      lines.push(li);
    }
    orb.appendChild(body);
    host.appendChild(veil);
    host.appendChild(orb);

    // ---- Position: below the anchor when possible, always fully inside the host, expressed in cqw ----
    const W = host.clientWidth || 1, H = host.clientHeight || 1;
    const ow = orb.offsetWidth, oh = orb.offsetHeight;
    const ax = anchor && Number.isFinite(anchor.x) ? anchor.x : null;
    const ay = anchor && Number.isFinite(anchor.y) ? anchor.y : null;
    const below = Boolean(anchor && anchor.edge === 'below' && ay !== null);
    let x = ax !== null ? ax - ow / 2 : (W - ow) / 2;
    let y = ay !== null ? (below ? ay : ay - oh / 2) : (H - oh) / 2;
    const margin = W * 0.02;
    x = Math.min(Math.max(x, margin), W - ow - margin);
    y = Math.min(Math.max(y, margin), H - oh - margin);
    orb.style.left = (x / W * 100).toFixed(2) + 'cqw';
    orb.style.top = (y / W * 100).toFixed(2) + 'cqw';
    if (ax !== null && ay !== null) {                 // the sphere grows from the anchor point (clamped to its box)
      const ox = Math.min(100, Math.max(0, Math.round((ax - x) / ow * 100)));
      const oy = Math.min(100, Math.max(0, Math.round((ay - y) / oh * 100)));
      orb.style.transformOrigin = `${ox}% ${oy}%`;
    }

    // ---- Chosen line ----
    let i = 0;
    const paint = () => lines.forEach((li, n) => li.classList.toggle('is-on', n === i));
    paint();

    // ---- Closing (only once) ----
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      if (open === me) open = null;
      Router.refocus();                               // the screen takes the keys back immediately
      veil.classList.remove('is-on');
      orb.classList.remove('is-on');
      orb.classList.add('is-off');
      setTimeout(() => { veil.remove(); orb.remove(); }, (reduced ? 200 : 180) * k);
      resolve(id);
    };
    const me = { finish };
    open = me;

    // ---- Keys ----
    Input.setHandler((action) => {
      if (done) return true;
      if (action === 'up' && i > 0) { i--; paint(); Fx.chime(1319, 0.025); return true; }
      if (action === 'down' && i < lines.length - 1) { i++; paint(); Fx.chime(1175, 0.025); return true; }
      if (action === 'ok' || action === 'longok') {
        const o = opts[i];
        if (!o || o.disabled) {                       // the sphere refuses with a little shiver
          body.classList.remove('is-refuse'); void body.offsetWidth; body.classList.add('is-refuse');
          Fx.chime(440, 0.03);
          return true;
        }
        Fx.chime(1568, 0.035);
        finish(o.id);
        return true;
      }
      if (action === 'back' || action === 'menu' || action === 'home' || action === 'longback') { finish(null); return true; }
      return true;                                    // left/right: nothing, but the key is consumed
    });

    // ---- Appearance ----
    requestAnimationFrame(() => { veil.classList.add('is-on'); orb.classList.add('is-on'); });
  });
}

// Closes the open Remembrall, if any (resolves `null`). To be called when a screen unmounts.
export function dismissRappeltout() { if (open) open.finish(null); }
