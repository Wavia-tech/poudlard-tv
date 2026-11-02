// Rappeltout : le menu contextuel partagé. Une sphère de verre posée sur un fond assombri, quelques lignes
// en EB Garamond, haut/bas pour choisir, OK pour prendre, Retour pour reposer la sphère.
// Il prend la main sur les touches (Input.setHandler) le temps de l'affichage et la rend au routeur (Router.refocus()).
//
//   rappeltout(host, { title, options: [{ id, label, disabled? }], anchor?: { x, y, edge? } }) → Promise<string|null>
//
// `host`   : l'élément plein écran de l'écran appelant (la sphère et le voile y sont ajoutés).
// `anchor` : point (px, relatifs à `host`) près duquel poser la sphère ; sans ancre, elle se pose au centre.
//            `edge: 'below'` pose le HAUT de la sphère sur l'ancre (sous un médaillon ou un cartouche) au lieu de la centrer.
// La ligne choisie porte `is-on` (pas `is-focus` : l'écran appelant garde son unique focus sous le voile).
// Résout l'`id` de l'option choisie, ou `null` si l'utilisateur annule (Retour, Menu, Home) ou si un autre
// Rappeltout, ou `dismissRappeltout()`, vient fermer celui-ci (démontage de l'écran, par exemple).

import { Input } from './input.js';
import { Router } from './router.js';
import { Fx } from './fx.js';
import { isReduced } from './config.js';

let open = null;   // le Rappeltout affiché, s'il y en a un : { finish(id) }

// Facteur de temps du banc d'essai (ralenti ×3), lu sur l'hôte.
const timeScale = (el) => Number(getComputedStyle(el).getPropertyValue('--k')) || 1;

export function rappeltout(host, { title = '', options = [], anchor = null } = {}) {
  if (open) open.finish(null);                       // un seul Rappeltout à la fois
  return new Promise((resolve) => {
    const reduced = isReduced();
    const k = timeScale(host);
    const opts = options.filter((o) => o && typeof o.id === 'string');

    // ---- DOM (tout le texte passe par textContent : jamais de HTML construit avec des libellés) ----
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
    if (!lines.length) {                              // jamais une sphère vide : la ligne de repli reçoit le focus (OK refuse)
      const li = document.createElement('div');
      li.className = 'rpt-line is-disabled';
      li.textContent = 'Rien à faire ici';
      body.appendChild(li);
      lines.push(li);
    }
    orb.appendChild(body);
    host.appendChild(veil);
    host.appendChild(orb);

    // ---- Position : sous l'ancre si possible, toujours entièrement dans l'hôte, exprimée en cqw ----
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
    if (ax !== null && ay !== null) {                 // la sphère grandit depuis le point d'ancrage (borné à sa boîte)
      const ox = Math.min(100, Math.max(0, Math.round((ax - x) / ow * 100)));
      const oy = Math.min(100, Math.max(0, Math.round((ay - y) / oh * 100)));
      orb.style.transformOrigin = `${ox}% ${oy}%`;
    }

    // ---- Ligne choisie ----
    let i = 0;
    const paint = () => lines.forEach((li, n) => li.classList.toggle('is-on', n === i));
    paint();

    // ---- Fermeture (une seule fois) ----
    let done = false;
    const finish = (id) => {
      if (done) return;
      done = true;
      if (open === me) open = null;
      Router.refocus();                               // l'écran reprend les touches immédiatement
      veil.classList.remove('is-on');
      orb.classList.remove('is-on');
      orb.classList.add('is-off');
      setTimeout(() => { veil.remove(); orb.remove(); }, (reduced ? 200 : 180) * k);
      resolve(id);
    };
    const me = { finish };
    open = me;

    // ---- Touches ----
    Input.setHandler((action) => {
      if (done) return true;
      if (action === 'up' && i > 0) { i--; paint(); Fx.chime(1319, 0.025); return true; }
      if (action === 'down' && i < lines.length - 1) { i++; paint(); Fx.chime(1175, 0.025); return true; }
      if (action === 'ok' || action === 'longok') {
        const o = opts[i];
        if (!o || o.disabled) {                       // la sphère refuse d'un petit frisson
          body.classList.remove('is-refuse'); void body.offsetWidth; body.classList.add('is-refuse');
          Fx.chime(440, 0.03);
          return true;
        }
        Fx.chime(1568, 0.035);
        finish(o.id);
        return true;
      }
      if (action === 'back' || action === 'menu' || action === 'home' || action === 'longback') { finish(null); return true; }
      return true;                                    // gauche/droite : rien, mais la touche est consommée
    });

    // ---- Apparition ----
    requestAnimationFrame(() => { veil.classList.add('is-on'); orb.classList.add('is-on'); });
  });
}

// Ferme le Rappeltout ouvert, s'il y en a un (résout `null`). À appeler au démontage d'un écran.
export function dismissRappeltout() { if (open) open.finish(null); }
