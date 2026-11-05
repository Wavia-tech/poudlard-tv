// Remembrall (Rappeltout): the shared context menu. A glass sphere resting on a lightly dimmed backdrop, a few lines
// in EB Garamond, up/down to choose, OK to take, Back to put the sphere down.
// Motion: the shared curve, transform and opacity only. The sphere is measured once, in the frame after the key, and a
// mark goes from line to line by its transform: a move reads no layout.
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
// From the attribute (base.css: --k is 3 under :root[data-slow="1"]): getComputedStyle() forced a style recalculation.
const timeScale = (el) => { void el; return document.documentElement.dataset.slow === '1' ? 3 : 1; };

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
    // The lines sit in a window (.rpt-list) over a track (.rpt-track): when the sphere cannot grow any more, the
    // track slides (transform) to keep the chosen line in view.
    const list = document.createElement('div');
    list.className = 'rpt-list';
    const track = document.createElement('div');
    track.className = 'rpt-track';
    list.appendChild(track);
    body.appendChild(list);
    const lines = opts.map((o) => {
      const li = document.createElement('div');
      li.className = 'rpt-line' + (o.disabled ? ' is-disabled' : '');
      li.textContent = o.label || o.id;
      track.appendChild(li);
      return li;
    });
    if (!lines.length) {                              // never an empty sphere: the fallback line takes the focus (OK refuses)
      const li = document.createElement('div');
      li.className = 'rpt-line is-disabled';
      li.textContent = 'Rien à faire ici';
      track.appendChild(li);
      lines.push(li);
    }
    const mark = document.createElement('i');            // the chosen line's mark: a soft wash and the star, one layer
    mark.className = 'rpt-mark';
    track.prepend(mark);
    orb.appendChild(body);
    host.appendChild(veil);
    host.appendChild(orb);

    // ---- Chosen line ----
    let i = 0;
    let off = 0;
    let windowed = false;
    let view = 0;
    let places = null;                                  // [{ top, h }] of the lines, once measured
    const paint = (instant) => {
      lines.forEach((li, n) => li.classList.toggle('is-on', n === i));
      if (!places) return;
      const p = places[i];
      if (instant) mark.style.transition = 'none';
      mark.style.transform = `translateY(${p.top}px) scaleY(${(p.h / places[0].h).toFixed(3)})`;
      if (instant) { void getComputedStyle(mark).transform; mark.style.transition = ''; }
      if (!windowed) return;
      if (p.top + p.h - off > view) off = p.top + p.h - view;
      else if (p.top < off) off = p.top;
      track.style.transform = `translateY(${-off}px)`;
    };
    paint();

    // The sphere's size and place, in the frame after the key: the layout of its text is done once, there.
    const place = () => {
    // ---- Size: a sphere just large enough for its text (the text block fits inside the circle), never larger
    // than the screen. Long labels wrap (rappeltout.css caps a line's width); if even the largest sphere cannot hold
    // every line, it becomes a rounded glass pane and the lines scroll in their window. ----
    const W = host.clientWidth || 1, H = host.clientHeight || 1;
    const cq = W / 100;
    const margin = W * 0.02;
    const maxD = H - 2 * margin;
    const bw = body.offsetWidth, bh = body.offsetHeight;
    const D = Math.max(17 * cq, Math.hypot(bw, bh) + 2 * cq, bw + 5.6 * cq, bh + 4.4 * cq);
    if (D <= maxD) {
      orb.style.width = (D / cq).toFixed(2) + 'cqw';
    } else {
      orb.classList.add('is-tall');
      orb.style.width = ((bw + 5.6 * cq) / cq).toFixed(2) + 'cqw';
      if (bh + 4.4 * cq > maxD) {
        windowed = true;
        list.style.maxHeight = ((maxD - 4.4 * cq - (bh - list.offsetHeight)) / cq).toFixed(2) + 'cqw';
        list.classList.add('is-window');
      }
    }

    // ---- Position: below the anchor when possible, always fully inside the host, expressed in cqw ----
    const ow = orb.offsetWidth, oh = orb.offsetHeight;
    const ax = anchor && Number.isFinite(anchor.x) ? anchor.x : null;
    const ay = anchor && Number.isFinite(anchor.y) ? anchor.y : null;
    const below = Boolean(anchor && anchor.edge === 'below' && ay !== null);
    let x = ax !== null ? ax - ow / 2 : (W - ow) / 2;
    let y = ay !== null ? (below ? ay : ay - oh / 2) : (H - oh) / 2;
    x = Math.min(Math.max(x, margin), W - ow - margin);
    y = Math.min(Math.max(y, margin), H - oh - margin);
    orb.style.left = (x / W * 100).toFixed(2) + 'cqw';
    orb.style.top = (y / W * 100).toFixed(2) + 'cqw';
    if (ax !== null && ay !== null) {                 // the sphere grows from the anchor point (clamped to its box)
      const ox = Math.min(100, Math.max(0, Math.round((ax - x) / ow * 100)));
      const oy = Math.min(100, Math.max(0, Math.round((ay - y) / oh * 100)));
      orb.style.transformOrigin = `${ox}% ${oy}%`;
    }

    view = list.clientHeight;
    places = lines.map((li) => ({ top: li.offsetTop, h: li.offsetHeight }));
    mark.style.height = `${places[0].h}px`;
    paint(true);
    veil.classList.add('is-on');
    orb.classList.add('is-on');
    };

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
          if (!reduced && body.animate) body.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-1.5deg)', offset: 0.25 }, { transform: 'rotate(1.5deg)', offset: 0.75 }, { transform: 'rotate(0)' }], { duration: 240 * k, easing: 'ease-in-out' });
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
    requestAnimationFrame(() => { if (!done) place(); });
  });
}

// Closes the open Remembrall, if any (resolves `null`). To be called when a screen unmounts.
export function dismissRappeltout() { if (open) open.finish(null); }
