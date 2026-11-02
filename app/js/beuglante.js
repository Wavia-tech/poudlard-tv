// Beuglante : le message d'erreur du launcher. Une enveloppe rouge (la seule chose rouge vif de l'interface)
// glisse du bas de l'écran, tremble quatre fois, délivre son message en IM Fell, puis se consume d'elle-même.
//
//   beuglante(host, { message, action?: { label, onChoose } }) → { close() }
//
// - `message` : texte contrôlé (constantes, noms du CATALOG) ; il est posé en textContent, jamais en innerHTML.
// - `action`  : au plus une option, prise en compte seulement si elle a un libellé ET une fonction `onChoose`
//               (sinon elle est ignorée : jamais une ligne « OK · … » qui ne fait rien). Si elle existe, la
//               Beuglante prend la main sur les touches (Input.setHandler) : OK la choisit, Retour referme sans
//               rien faire, le reste est avalé. En se fermant, elle rend la main au routeur (Router.refocus()).
//               Sans action, aucune touche n'est capturée : l'écran dessous continue.
// - Une seule Beuglante à la fois : en ouvrir une seconde consume la première immédiatement.
// - Mouvement : transform et opacité seulement. Avec isReduced() : fondu 200 ms, pas de tremblement, pas de montée.

import { Input } from './input.js';
import { Router } from './router.js';
import { isReduced } from './config.js';

const SLIDE_MS = 450;     // montée depuis le bas
const SHAKE_MS = 640;     // quatre tremblements (±1.5°)
const LIFE_MS = 4000;     // durée de vie avant de se consumer
const BURN_MS = 700;      // fondu de consumation (opacité + légère montée)
const REDUCED_FADE_MS = 200;

let current = null;       // la Beuglante affichée, s'il y en a une

// Facteur de temps du banc d'essai (ralenti ×3) : les minuteurs JS suivent les durées CSS.
function timeScale(host) {
  const k = Number(getComputedStyle(host).getPropertyValue('--k'));
  return Number.isFinite(k) && k > 0 ? k : 1;
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

  // Une action n'existe que complète : libellé + fonction. Sinon, pas de ligne d'action ni de prise de touches.
  const act = action && action.label && typeof action.onChoose === 'function' ? action : null;

  const reduced = isReduced();
  const k = timeScale(host);
  const el = build(message, act);
  if (reduced) el.classList.add('is-reduced');
  host.appendChild(el);
  // Force le premier calcul de style dans l'état « avant » (hors écran, ou opacité 0) : sans cette lecture,
  // la classe is-in posée dans le rAF serait le premier style calculé et la glissade ne se jouerait pas.
  void el.offsetWidth;

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
      // Consumation : opacité + légère montée, puis retrait du DOM.
      el.classList.remove('is-in', 'is-shake');
      el.classList.add('is-burn');
      setTimeout(() => el.remove(), (reduced ? REDUCED_FADE_MS : BURN_MS) * k);
    },
  };
  current = handle;

  // Prise de touches : seulement si une action est proposée.
  if (act) {
    tookInput = true;
    Input.setHandler((a) => {
      if (closed) return true;
      if (a === 'ok') {
        handle.close();
        try { act.onChoose(); } catch (e) { /* l'action a échoué : la Beuglante est déjà refermée, rien à casser */ }
        return true;
      }
      if (a === 'back') { handle.close(); return true; }
      return true;   // toute autre touche est avalée tant que l'enveloppe est à l'écran
    });
  }

  // Chorégraphie : glisse du bas, tremble, vit, se consume.
  requestAnimationFrame(() => {
    if (closed) return;
    el.classList.add('is-in');
    if (!reduced) later(() => el.classList.add('is-shake'), SLIDE_MS);
    later(() => el.classList.remove('is-shake'), SLIDE_MS + SHAKE_MS);
  });
  later(() => handle.close(), LIFE_MS);

  return handle;
}
