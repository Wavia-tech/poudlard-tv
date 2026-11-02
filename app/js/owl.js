// Hedwige : le curseur de l'accueil, et un animal. Vraies photos générées (détourées), fondues entre elles
// selon l'avancement du vol, jamais commutées au temps. Elle a un poids (accroupissement avant le décollage),
// une profondeur (elle grandit au milieu de l'arche, son ombre court sur la pierre) et une vie au repos
// (regard, clignement, ébrouement, sommeil pendant Nox).
//
// Poses attendues dans `poses` (chemins d'images, toutes calées sur les serres, vue de trois-quarts tournée vers la droite) :
//   perch (posée, regard caméra) · look (tête tournée) · sleep (yeux fermés) · up (vol ailes hautes) · down (vol ailes basses)
//   glide (plané) · land (atterrissage). Une pose manquante retombe sur la plus proche ; aucune image cassée n'est jamais affichée.

const FALLBACK = { look: 'perch', sleep: 'perch', glide: 'up', land: 'up', down: 'up', up: 'perch' };

export function createOwl(host, opts) {
  const { poses, size = 110, reduced = () => false } = opts;
  const el = document.createElement('div');
  el.className = 'owl';
  el.style.setProperty('--owl-size', size + 'px');
  el.innerHTML = '<div class="owl-shadow"></div><div class="owl-dir"><div class="owl-depth"><div class="owl-poses"></div></div></div>';
  const dir = el.querySelector('.owl-dir'), depth = el.querySelector('.owl-depth'), posesEl = el.querySelector('.owl-poses'), shadow = el.querySelector('.owl-shadow');
  const imgs = {};
  const available = new Set();
  for (const [name, src] of Object.entries(poses)) {
    const img = document.createElement('img');
    img.className = `owl-pose owl-pose-${name}`; img.alt = ''; img.draggable = false;
    img.addEventListener('load', () => available.add(name));
    img.addEventListener('error', () => { img.remove(); delete imgs[name]; });
    img.src = src;
    posesEl.appendChild(img);
    imgs[name] = img;
  }
  host.appendChild(el);

  let state = 'idle', pose = null, facing = 'right';   // pose = null : la première showPose() affiche vraiment
  let pos = { x: 0, y: 0 };
  let flight = null, flightRaf = 0, timers = [];
  let idleTimer = 0, lastDir = 'right';

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const resolvePose = (name) => { let n = name; while (n && !imgs[n]) n = FALLBACK[n]; return n || 'perch'; };

  function showPose(name, ms = 60) {
    const n = resolvePose(name);
    if (n === pose) return;
    pose = n;
    const k = reduced() ? 1 : ms;
    for (const [key, img] of Object.entries(imgs)) {
      img.style.transitionDuration = k + 'ms';
      img.style.opacity = key === n ? '1' : '0';
    }
  }
  function setState(s) { state = s; el.dataset.state = s; }
  function setFacing(f) { facing = f; dir.style.transform = f === 'left' ? 'scaleX(-1)' : ''; }
  function place(x, y) { pos = { x, y }; el.style.transform = `translate(${x}px, ${y}px)`; }
  function currentPos() { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: m.m41, y: m.m42 }; }

  // ---- Vie au repos ----
  function idleLife() {
    clearTimeout(idleTimer);
    if (reduced()) return;
    const beat = () => {
      if (state !== 'idle') return;
      const r = Math.random();
      if (r < 0.45) {                                   // regard vers la dernière direction
        setFacing(lastDir);
        showPose('look', 300);
        idleTimer = setTimeout(() => { if (state === 'idle') { showPose('perch', 300); } idleTimer = setTimeout(beat, 2500 + Math.random() * 4000); }, 1000 + Math.random() * 2000);
        return;
      }
      if (r < 0.85) {                                   // clignement, parfois double
        const blink = (n) => { showPose('sleep', 90); setTimeout(() => { showPose('perch', 120); if (n > 1) setTimeout(() => blink(n - 1), 160); }, 110); };
        blink(Math.random() < 0.25 ? 2 : 1);
      } else {                                          // ébrouement
        depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-in-out' });
      }
      idleTimer = setTimeout(beat, 3000 + Math.random() * 6000);
    };
    idleTimer = setTimeout(beat, 1500 + Math.random() * 3000);
  }

  // ---- Vol vers un point (coin haut-gauche du conteneur) ----
  function flyTo(x, y, o = {}) {
    clearTimers();
    cancelAnimationFrame(flightRaf);
    const from = currentPos();
    if (flight) { flight.commitStyles(); flight.cancel(); flight = null; }
    const dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { place(x, y); setState('idle'); return Promise.resolve(); }
    if (reduced()) {                                    // fondu : pas de vol
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      later(() => { place(x, y); el.style.opacity = '1'; later(() => { el.style.transition = ''; setState('idle'); idleLife(); }, 220); }, 200);
      return new Promise((r) => later(r, 450));
    }
    const k = o.timeScale || 1;
    const H = o.arena ? o.arena.h : 600;
    const lift = Math.min(H * 0.3, 30 + dist * 0.35);
    const dur = Math.min(700, 420 + dist * 0.4) * k;
    const short = dist < 300;
    lastDir = dx < 0 ? 'left' : 'right';
    setFacing(lastDir);
    setState('fly');
    el.dataset.phase = 'crouch';
    showPose('perch', 40);
    // Accroupissement 80 ms, puis l'arche.
    const tilt = (dx < 0 ? -1 : 1) * 8;
    const tr = (px, py, rot = 0) => ({ transform: `translate(${px}px, ${py}px) rotate(${rot}deg)` });
    flight = el.animate([
      tr(from.x, from.y, 0),
      { ...tr(from.x, from.y + 4, 0), offset: 0.08 },
      { ...tr(from.x + dx * 0.12, from.y - lift * 0.55, -tilt * 0.5), offset: 0.22 },
      { ...tr(from.x + dx * 0.55, Math.min(from.y, y) - lift, tilt * 0.4), offset: 0.55 },
      { ...tr(x - dx * 0.03, y - lift * 0.22, tilt), offset: 0.82 },
      { ...tr(x, y - H * 0.02, 3), offset: 0.9 },
      tr(x, y, 0),
    ], { duration: dur, easing: 'cubic-bezier(.42,.05,.3,1)', fill: 'forwards' });
    depth.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)', offset: 0.1 }, { transform: 'scale(1.18)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: dur, easing: 'ease-in-out' });
    // L'ombre court sur la pierre : elle s'étire quand la chouette monte.
    shadow.animate([
      { transform: 'translateX(0) scaleX(1)', opacity: 0.55 },
      { transform: `translateX(${dx * 0.5}px) scaleX(1.6)`, opacity: 0.2, offset: 0.5 },
      { transform: `translateX(${dx}px) scaleX(1)`, opacity: 0.55 },
    ], { duration: dur, easing: 'cubic-bezier(.42,.05,.3,1)' });

    // Choix de la pose par l'avancement du trajet, pas par le temps.
    const anim = flight;
    let lastFlap = 0;
    const loop = () => {
      if (flight !== anim) return;
      const t = (anim.currentTime || 0) / dur;
      if (t < 0.08) { el.dataset.phase = 'crouch'; }
      else if (t < 0.15) { el.dataset.phase = 'takeoff'; showPose('up', 60); }
      else if (t < 0.85) {
        el.dataset.phase = 'cruise';
        if (short) showPose('down', 60);
        else if (t > 0.42 && t < 0.6) showPose('glide', 90);
        else { const now = performance.now(); if (now - lastFlap > 130 * k) { lastFlap = now; showPose(pose === 'up' ? 'down' : 'up', 60); } }
      } else { el.dataset.phase = 'land'; showPose('land', 60); }
      flightRaf = requestAnimationFrame(loop);
    };
    flightRaf = requestAnimationFrame(loop);

    return new Promise((resolve) => {
      anim.onfinish = () => {
        if (flight !== anim) return;
        cancelAnimationFrame(flightRaf);
        anim.commitStyles(); anim.cancel(); flight = null;
        place(x, y);
        setState('land');
        if (o.onLand) o.onLand();
        later(() => { showPose('perch', 120); setState('idle'); idleLife(); resolve(); }, 180 * k);
      };
    });
  }

  function teleport(x, y) {
    clearTimers(); cancelAnimationFrame(flightRaf);
    if (flight) { flight.cancel(); flight = null; }
    place(x, y); showPose('perch', 1); setState('idle'); idleLife();
  }

  // Butée : elle ne bouge pas, petit hochement de tête.
  function nod() {
    if (reduced()) return;
    depth.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(4deg)', offset: 0.5 }, { transform: 'rotate(0deg)' }], { duration: 240, easing: 'ease-in-out' });
  }

  // Lumos : elle décolle verticalement hors cadre pendant que la lumière monte.
  function liftOff(ms = 500) {
    clearTimers(); clearTimeout(idleTimer);
    setState('fly'); showPose('up', 60);
    const from = currentPos();
    const k = reduced() ? 0.2 : 1;
    later(() => showPose('down', 60), 130 * k); later(() => showPose('up', 60), 260 * k); later(() => showPose('down', 60), 390 * k);
    flight = el.animate([{ transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 }, { transform: `translate(${from.x}px, ${from.y - 600}px)`, opacity: 0 }], { duration: ms * k, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    return new Promise((r) => later(r, ms * k));
  }
  // Retour de hors cadre vers un point (après Lumos, après la grue).
  function comeBack(x, y, ms = 600) {
    if (flight) { flight.cancel(); flight = null; }
    el.style.opacity = '1';
    place(x, y - 500);
    return flyTo(x, y, { arena: { h: 1200 } });
  }

  // Nox : elle rentre la tête et dort ; au réveil, elle ouvre les yeux et cligne.
  function sleep() { clearTimeout(idleTimer); setState('sleep'); showPose('sleep', 400); depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }], { duration: 800, fill: 'forwards', easing: 'ease-out' }); }
  function wake() { setState('idle'); depth.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 400, fill: 'forwards' }); showPose('perch', 200); later(() => { showPose('sleep', 90); later(() => showPose('perch', 120), 110); }, 600); idleLife(); }

  function hide() { el.style.opacity = '0'; }
  function show() { el.style.opacity = '1'; }
  function destroy() { clearTimers(); clearTimeout(idleTimer); cancelAnimationFrame(flightRaf); if (flight) flight.cancel(); el.remove(); }

  showPose('perch', 1);
  setState('idle');
  idleLife();
  return { el, flyTo, teleport, nod, liftOff, comeBack, sleep, wake, hide, show, destroy, setFacing, get state() { return state; }, get pos() { return pos; }, size: () => ({ w: el.offsetWidth, h: el.offsetHeight }) };
}
