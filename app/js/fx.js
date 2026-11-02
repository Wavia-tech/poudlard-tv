// Effets partagés : poussière d'or (canvas), éclat Lumos, et la bande-son (déléguée à sound.js : célesta
// synthétisé pour les cues, musique de fond originale ou fichier personnel ; aucun fichier audio distribué).
// Tout respecte `prefers-reduced-motion` et le réglage "motion: calme".
import { Sound } from './sound.js';

let canvas = null, ctx2d = null, W = 0, H = 0;
const parts = [];
let enabled = { dust: true, sound: false, calm: false };
let raf = 0;
let lastMove = -1e9;     // horodatage (ms) du dernier `move` joué via chime(), pour fondre les anciens accords

const glow = document.createElement('canvas');
glow.width = glow.height = 32;
{
  const g = glow.getContext('2d');
  const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  rg.addColorStop(0, 'rgba(255,236,190,1)');
  rg.addColorStop(0.3, 'rgba(255,190,90,0.55)');
  rg.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 32, 32);
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || enabled.calm;

function resize() {
  if (!canvas) return;
  const r = canvas.parentElement.getBoundingClientRect();
  W = r.width; H = r.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let last = 0;
function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!ctx2d || !W) return;
  ctx2d.clearRect(0, 0, W, H);
  if (!enabled.dust || reduced()) { parts.length = 0; return; }
  if (parts.filter((p) => p.amb).length < 40) {
    parts.push({ amb: true, x: Math.random() * W, y: H * (0.5 + Math.random() * 0.55), vx: (Math.random() - 0.5) * 6, vy: -(5 + Math.random() * 12), life: 0, max: 5 + Math.random() * 6, s: 0.6 + Math.random() * 1.3 });
  }
  ctx2d.globalCompositeOperation = 'lighter';
  const t = now / 1000;
  for (let j = parts.length - 1; j >= 0; j--) {
    const p = parts[j];
    p.life += dt;
    if (p.life > p.max) { parts.splice(j, 1); continue; }
    p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    const k = p.life / p.max;
    const tw = p.amb ? 0.5 + 0.5 * Math.sin(t * 5 + j) : 1;
    ctx2d.globalAlpha = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.9 * tw;
    const s = p.s * W / 900;
    ctx2d.drawImage(glow, p.x - s * 3, p.y - s * 3, s * 6, s * 6);
  }
  ctx2d.globalAlpha = 1;
  ctx2d.globalCompositeOperation = 'source-over';
}

export const Fx = {
  // `host` : l'élément plein écran sur lequel poser le canvas de particules.
  mount(host) {
    canvas = document.createElement('canvas');
    canvas.className = 'fx-dust';
    ctx2d = canvas.getContext('2d');
    host.appendChild(canvas);
    new ResizeObserver(resize).observe(host);
    resize();
    if (!raf) raf = requestAnimationFrame(frame);
  },
  // `sound` : coupe ou remet les cues instantanément (sound.js gère le mute en 30 ms et l'arrêt des notes en cours).
  configure(opts) {
    enabled = { ...enabled, ...opts };
    if (opts && 'sound' in opts) Sound.setEnabled(!!opts.sound);
  },
  size() { return { W, H }; },

  // Jet de poussière à un point (coordonnées dans le host).
  burst(x, y, n = 24, power = 90) {
    if (!enabled.dust || reduced()) return;
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2, v = power * (0.3 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.4, g: power * 0.9, life: 0, max: 0.6 + Math.random() * 0.8, s: 0.8 + Math.random() * 1.8 });
    }
  },

  // Éclat "Lumos" : un halo qui grandit depuis un point puis envahit l'écran.
  lumos(host, x, y, ms = 900) {
    const el = document.createElement('div');
    el.className = 'fx-lumos';
    host.appendChild(el);
    const tr = (s) => `translate(${x}px, ${y}px) scale(${s})`;
    const anim = el.animate([
      { opacity: 1, transform: tr(0.2) }, { opacity: 1, transform: tr(6), offset: 0.35 }, { opacity: 0, transform: tr(40) }
    ], { duration: reduced() ? 1 : ms, easing: 'ease-out' });
    anim.onfinish = () => el.remove();
    this.burst(x, y, 60, 140);
  },

  // ----- Bande-son (voir sound.js) -----
  // Peut être appelé au montage d'un écran : sans geste utilisateur, sound.js pose seulement ses écouteurs et créera
  // le contexte au premier geste (rien ne sonne avant). Après un geste, crée le graphe audio (idempotent) et met la
  // musique de fond en route selon config.music ('auto' par défaut : fichier personnel s'il existe, sinon célesta).
  initAudio() { Sound.init(); },

  // Musique de fond : 'auto' | 'celesta' | 'aucune' (les valeurs de config.music), ou null pour suivre à nouveau la
  // config (voir sound.js). Appelé par la rangée « Musique de fond » des Réglages. Un mode explicite remplace
  // config.music jusqu'au prochain appel. Retourne false si le mode est inconnu. Coupée avec le son
  // (configure({ sound: false })) : inutile d'appeler ambient('aucune') pour cela.
  ambient(mode) { return Sound.ambient(mode); },

  // Mise en attente de la musique sans toucher au mode : ambientHold(true, 'nox') à l'entrée en veille,
  // ambientHold(false, 'nox') au réveil ; 'launch' autour de Platform.launch. Les raisons se cumulent ; la musique
  // reprend quand la dernière est levée. Retourne le nombre de raisons encore actives.
  ambientHold(on, reason) { return Sound.ambientHold(on, reason); },

  // Joue un cue par son nom : move · enter · return · lumos · nox · wake · error · toggle · confirm.
  // opts.dir : 1 (droite / montant) ou −1 (gauche / descendant) pour `move`.
  cue(name, opts = { dir: 1 }) { return Sound.cue(name, opts); },

  // Alias historiques, gardés pour les écrans qui les appellent déjà (home, map, library, settings, sorting, rappeltout).
  // chime(freq) : traduit l'ancienne clochette d'après la grammaire des écrans V3 :
  //   ≥ 1500 Hz (1568)            → `confirm` : validation (OK sur une option, ajout, déplacement validé, coche)
  //   1100–1499 Hz (1175, 1319…)  → `move` vers la droite / le haut
  //   900–1099 Hz (988, 1046)     → `move` vers la gauche / le bas
  //   600–899 Hz (659, 784, 880)  → `toggle` : annulation, sortie d'un mode, masquage (une note sèche, pas un pas)
  //   < 600 Hz (440)              → `toggle` : butée, « rien à faire »
  // Deux `move` à moins de 40 ms (anciens accords `chime(1046); chime(1318); chime(1568)`) ne font qu'un seul pas.
  chime(freq = 1046, gain = 0.035) {
    if (freq >= 1500) return Sound.cue('confirm');
    if (freq < 900) return Sound.cue('toggle');
    const t = performance.now();
    if (t - lastMove < 40) return false;
    lastMove = t;
    return Sound.cue('move', { dir: freq >= 1100 ? 1 : -1 });
  },
  // arpeggio() : le lancement (Lumos).
  arpeggio() { return Sound.cue('lumos'); },
  // whoosh() : TOUJOURS la phrase montante `return` (« on remonte vers le Parapet »). Un écran qui descend dans
  // un sous-écran doit appeler cue('enter'), et un retrait d'appli cue('toggle') : l'alias ne devine pas le sens.
  whoosh() { return Sound.cue('return'); },
};
