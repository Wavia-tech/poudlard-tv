// Hedwig (Hedwige): the home-screen cursor, and an animal. Real generated photos (cut out), cross-faded
// according to flight progress, never switched on a timer. She has weight (a crouch before take-off),
// depth (she grows in the middle of the arc, her shadow runs across the stone), banking (she rolls into each
// segment of the flight), feathers that fall when she lands, a startle when something goes wrong, glances
// toward the bar, and a life at rest (glances, blinks, ruffling, sleep during Nox).
//
// Poses come from ONE sprite sheet (assets/owl-sheet.webp, built by tools/cutout_owl.py --sheet): one row of
// equal cells, in `cells` order, the ivory rim baked in (no CSS filter). Two layers show the current and the
// previous cell and swap opacities: one texture, two elements, zero filter.
//   createOwl(host, { sheet, cells: ['perch','look','sleep','up','down','glide','land'], feather?, size, reduced })
// A missing sheet hides the owl (never a broken image); a missing pose falls back to the closest one.

const FALLBACK = { look: 'perch', sleep: 'perch', glide: 'up', land: 'up', down: 'up', up: 'perch' };
const FEATHERS = 3;

export function createOwl(host, opts) {
  const { sheet, cells = [], feather = null, size = 110, reduced = () => false } = opts;
  const el = document.createElement('div');
  el.className = 'owl';
  el.style.setProperty('--owl-size', size + 'px');
  el.innerHTML = '<div class="owl-shadow"></div><div class="owl-dir"><div class="owl-depth"><div class="owl-poses"><div class="owl-layer"></div><div class="owl-layer"></div></div></div></div><div class="owl-feathers"></div>';
  const dir = el.querySelector('.owl-dir'), depth = el.querySelector('.owl-depth'), posesEl = el.querySelector('.owl-poses'), shadow = el.querySelector('.owl-shadow');
  const layers = [...el.querySelectorAll('.owl-layer')];
  const feathersEl = el.querySelector('.owl-feathers');
  const index = Object.fromEntries(cells.map((n, i) => [n, i]));
  const n = Math.max(1, cells.length);
  let ready = false;
  if (sheet) {
    const probe = new Image();
    probe.onload = () => { ready = true; el.classList.add('is-ready'); };
    probe.onerror = () => { el.classList.add('is-missing'); };
    probe.src = sheet;
    layers.forEach((l) => { l.style.backgroundImage = `url("${sheet}")`; l.style.backgroundSize = `${n * 100}% 100%`; });
  } else {
    el.classList.add('is-missing');
  }
  host.appendChild(el);

  let state = 'idle', pose = null, facing = 'right', front = 0;   // pose = null: the first showPose() really displays
  let pos = { x: 0, y: 0 };
  let flight = null, flightRaf = 0, timers = [];
  let idleTimer = 0, lastDir = 'right';

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const resolvePose = (name) => { let p = name; while (p && !(p in index)) p = FALLBACK[p]; return p in index ? p : cells[0]; };

  // The hidden layer takes the new cell, then the two layers swap opacities (60-120 ms cross-fade).
  function showPose(name, ms = 60) {
    const p = resolvePose(name);
    if (p === pose) return;
    pose = p;
    const k = reduced() ? 1 : ms;
    const back = 1 - front;
    layers[back].style.backgroundPosition = n > 1 ? `${(index[p] / (n - 1)) * 100}% 0` : '0 0';
    layers[back].style.transitionDuration = k + 'ms'; layers[front].style.transitionDuration = k + 'ms';
    layers[back].style.opacity = '1'; layers[front].style.opacity = '0';
    posesEl.classList.toggle('is-perched', p === 'perch' || p === 'look' || p === 'sleep');
    front = back;
  }
  function setState(s) { state = s; el.dataset.state = s; }
  function setFacing(f) { facing = f; dir.style.transform = f === 'left' ? 'scaleX(-1)' : ''; }
  function place(x, y) { pos = { x, y }; el.style.transform = `translate(${x}px, ${y}px)`; }
  function currentPos() { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: m.m41, y: m.m42 }; }

  // ---- Life at rest ----
  function idleLife() {
    clearTimeout(idleTimer);
    if (reduced()) return;
    const beat = () => {
      if (state !== 'idle') return;
      const r = Math.random();
      if (r < 0.45) {                                   // glance toward the last direction
        setFacing(lastDir);
        showPose('look', 300);
        idleTimer = setTimeout(() => { if (state === 'idle') { showPose('perch', 300); } idleTimer = setTimeout(beat, 2500 + Math.random() * 4000); }, 1000 + Math.random() * 2000);
        return;
      }
      if (r < 0.85) {                                   // blink, sometimes double
        const blink = (c) => { showPose('sleep', 90); setTimeout(() => { showPose('perch', 120); if (c > 1) setTimeout(() => blink(c - 1), 160); }, 110); };
        blink(Math.random() < 0.25 ? 2 : 1);
      } else {                                          // ruffling
        depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-in-out' });
      }
      idleTimer = setTimeout(beat, 3000 + Math.random() * 6000);
    };
    idleTimer = setTimeout(beat, 1500 + Math.random() * 3000);
  }

  // ---- Feathers: three small ones fall and turn when she lands ----
  function dropFeathers() {
    if (!feather || reduced()) return;
    for (let i = 0; i < FEATHERS; i++) {
      const f = document.createElement('i');
      f.className = 'owl-feather';
      f.style.backgroundImage = `url("${feather}")`;
      f.style.left = `${35 + i * 15}%`;
      feathersEl.appendChild(f);
      const sx = (i - 1) * 2 + (Math.random() - 0.5), rot = (i % 2 ? 1 : -1) * (30 + Math.random() * 20);
      const a = f.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 0.9 },
        { transform: `translate(${sx * 0.6}cqw, 3cqw) rotate(${rot * 0.6}deg)`, opacity: 0.8, offset: 0.5 },
        { transform: `translate(${sx}cqw, 6cqw) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 900 + i * 120, easing: 'cubic-bezier(.2,.6,.3,1)', delay: i * 60 });
      a.onfinish = () => f.remove();
    }
  }

  // ---- Flight to a point (top-left corner of the container) ----
  // Banking: the roll of each segment comes from its own direction (atan2 × 0.35, ±12° at most), so a long
  // climb and a short hop do not lean the same way.
  function flyTo(x, y, o = {}) {
    clearTimers();
    cancelAnimationFrame(flightRaf);
    const from = currentPos();
    if (flight) { flight.commitStyles(); flight.cancel(); flight = null; }
    const dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { place(x, y); setState('idle'); return Promise.resolve(); }
    if (reduced()) {                                    // cross-fade: no flight
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
    // Waypoints of the arc; the roll of each is the direction of the segment that reaches it, mirrored by facing.
    const pts = [
      [from.x, from.y], [from.x, from.y + 4], [from.x + dx * 0.12, from.y - lift * 0.55], [from.x + dx * 0.55, Math.min(from.y, y) - lift],
      [x - dx * 0.03, y - lift * 0.22], [x, y - H * 0.02], [x, y],
    ];
    const offsets = [0, 0.08, 0.22, 0.55, 0.82, 0.9, 1];
    const sign = dx < 0 ? -1 : 1;
    const bank = (i) => {
      if (i === 0 || i === pts.length - 1) return 0;
      const ang = Math.atan2(pts[i][1] - pts[i - 1][1], (pts[i][0] - pts[i - 1][0]) * sign);
      return Math.max(-12, Math.min(12, ang * 0.35 * 180 / Math.PI)) * sign;
    };
    const frames = pts.map((p, i) => ({ transform: `translate(${p[0]}px, ${p[1]}px) rotate(${bank(i).toFixed(1)}deg)`, offset: offsets[i] }));
    flight = el.animate(frames, { duration: dur, easing: 'cubic-bezier(.42,.05,.3,1)', fill: 'forwards' });
    depth.animate([{ transform: 'scale(.96)' }, { transform: 'scale(1)', offset: 0.1 }, { transform: 'scale(1.18)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: dur, easing: 'ease-in-out' });
    // The shadow runs across the stone: it stretches as the owl climbs.
    shadow.animate([
      { transform: 'translateX(0) scaleX(1)', opacity: 0.55 },
      { transform: `translateX(${dx * 0.5}px) scaleX(1.6)`, opacity: 0.2, offset: 0.5 },
      { transform: `translateX(${dx}px) scaleX(1)`, opacity: 0.55 },
    ], { duration: dur, easing: 'cubic-bezier(.42,.05,.3,1)' });

    // Pose chosen by progress along the path, not by time.
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
        if (!short) dropFeathers();
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

  // Hitting the edge: she does not move, just a small nod of the head. Twice within 600 ms: a startled hop.
  let lastNod = 0;
  function nod() {
    if (reduced()) return;
    const now = performance.now();
    if (now - lastNod < 600) { lastNod = 0; startle(); return; }
    lastNod = now;
    depth.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(4deg)', offset: 0.5 }, { transform: 'rotate(0deg)' }], { duration: 240, easing: 'ease-in-out' });
  }
  // Something went wrong (a Howler, a refused edge): a crouch, a hop, wings up for a beat.
  function startle() {
    if (reduced() || state !== 'idle') return;
    depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(.92)', offset: 0.3 }, { transform: 'translateY(-1cqw) scale(1.02)', offset: 0.65 }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
    showPose('up', 60);
    later(() => { if (state === 'idle') showPose('perch', 120); }, 180);
  }
  // A glance toward the bar (above) or back to the camera.
  function lookAt(where) {
    if (state !== 'idle') return;
    if (where === 'up') { setFacing(lastDir); showPose('look', 250); } else showPose('perch', 250);
  }

  // Lumos: she takes off vertically out of frame while the light rises.
  function liftOff(ms = 500) {
    clearTimers(); clearTimeout(idleTimer);
    setState('fly'); showPose('up', 60);
    const from = currentPos();
    const k = reduced() ? 0.2 : 1;
    later(() => showPose('down', 60), 130 * k); later(() => showPose('up', 60), 260 * k); later(() => showPose('down', 60), 390 * k);
    flight = el.animate([{ transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 }, { transform: `translate(${from.x}px, ${from.y - 600}px)`, opacity: 0 }], { duration: ms * k, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' });
    return new Promise((r) => later(r, ms * k));
  }
  // Return from out of frame to a point (after Lumos, after the crane shot).
  function comeBack(x, y, o = {}) {
    if (flight) { flight.cancel(); flight = null; }
    el.style.opacity = '1';
    place(x, y - 500);
    return flyTo(x, y, { arena: { h: 1200 }, onLand: o.onLand });
  }

  // Nox: she tucks her head in and sleeps; on waking, she opens her eyes and blinks.
  function sleep() { clearTimeout(idleTimer); setState('sleep'); showPose('sleep', 400); depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }], { duration: 800, fill: 'forwards', easing: 'ease-out' }); }
  function wake() { setState('idle'); depth.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 400, fill: 'forwards' }); showPose('perch', 200); later(() => { showPose('sleep', 90); later(() => showPose('perch', 120), 110); }, 600); idleLife(); }

  function hide() { el.style.opacity = '0'; }
  function show() { el.style.opacity = '1'; }
  function destroy() { clearTimers(); clearTimeout(idleTimer); cancelAnimationFrame(flightRaf); if (flight) flight.cancel(); el.remove(); }

  showPose('perch', 1);
  setState('idle');
  idleLife();
  return { el, flyTo, teleport, nod, startle, lookAt, liftOff, comeBack, sleep, wake, hide, show, destroy, setFacing, get state() { return state; }, get pos() { return pos; }, get ready() { return ready; }, size: () => ({ w: el.offsetWidth, h: el.offsetHeight }) };
}
