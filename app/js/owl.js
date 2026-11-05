// Hedwig (Hedwige): the home-screen cursor, and an animal. Real generated photos (cut out); a change of pose is a hard cut between
// two opaque cut-outs, never a cross-fade (two pairs of wings on the screen read as a ghost). She has weight (a settle on landing), depth (she grows a touch in the air, her shadow thins while
// she flies), a hint of a bank into each turn, wings forward before the talons touch, two feathers after a long flight.
// At rest she is STILL: no breathing loop, no idle timer. She only moves on an event (a flight, a glance toward the
// bar, a nod at the edge, a startle, sleep and wake), so the Parapet costs nothing when nobody touches the remote.
//
// Poses come from ONE sprite sheet (assets/owl-sheet.webp, built by tools/cutout_owl.py --sheet): a grid of equal
// cells, `cols` per row, read left to right then top to bottom in `cells` order, no rim, edges choked and pulled toward the night (no CSS
// filter). One element per pose, each its own compositor layer, made once: a change of pose is two opacities set at once, no paint, no raster.
//   createOwl(host, { sheet, cells: ['perch','look','sleep','up','down','glide','land'], cols: 4, feather?, size, reduced })
// `cols` defaults to the number of cells (the former one-row sheet). A missing sheet hides the owl (never a broken
// image); a missing pose falls back to the closest one. stop() parks her (memory pressure).
//
// Flight model (flyTo): she is always exactly where a sum of moves says, and nothing is ever read from the page. Each flyTo adds a
// move from the previous target to the new one, on the one curve for arrivals (--ease-arrive: she answers at once and takes her
// time to land), with a small arc over it; the moves still under way keep running under it. So a key pressed mid-flight never
// stops her and never makes her jump: her position and her speed carry over. It plays as ONE Web Animation sampled from that sum
// (dense keyframes, transform only, compositor side), started from the frame already on screen. Pose changes are a few timers at
// fixed offsets of the last move. No rAF loop here: the shared scene clock (Fx.tick) stays the only one.

const FALLBACK = { look: 'perch', sleep: 'perch', glide: 'up', land: 'up', down: 'up', up: 'perch' };
const FEATHERS = 2;
const SETTLE_MS = 200;           // on the perch, before she counts as idle again
const SPEED = 0.08;              // ms per px of a move, over HOP_MS: the flight goes with the focus (320 ms), not after it
const HOP_MS = 320, MAX_MS = 380;
const LONG_PX = 300;             // beyond this a move is a leap: it glides, and feathers fall when it lands

// CSS cubic-bezier evaluated in JS (Newton on x), the same as the browser's: the arrival curve (--ease-arrive, base.css).
function bezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break; t -= (calc(t, x1, x2) - x) / s; }
    return calc(Math.max(0, Math.min(1, t)), y1, y2);
  };
}
const ARRIVE = bezier(0.32, 0.72, 0, 1);

export function createOwl(host, opts) {
  const { sheet, cells = [], feather = null, size = 110, reduced = () => false } = opts;
  const cols = Math.max(1, Math.min(cells.length || 1, opts.cols || cells.length || 1));
  const rows = Math.max(1, Math.ceil((cells.length || 1) / cols));
  const el = document.createElement('div');
  el.className = 'owl';
  el.style.setProperty('--owl-size', size + 'px');
  el.innerHTML = `<div class="owl-shadow"></div><div class="owl-dir"><div class="owl-depth"><div class="owl-poses">${cells.map(() => '<div class="owl-layer"></div>').join('')}</div></div></div><div class="owl-feathers"></div>`;
  const dir = el.querySelector('.owl-dir'), depth = el.querySelector('.owl-depth'), posesEl = el.querySelector('.owl-poses');
  const layers = Object.fromEntries(cells.map((n, i) => [n, el.querySelectorAll('.owl-layer')[i]]));
  const feathersEl = el.querySelector('.owl-feathers');
  const index = Object.fromEntries(cells.map((n, i) => [n, i]));
  let ready = false;
  if (sheet) {
    const probe = new Image();
    probe.onload = () => { ready = true; el.classList.add('is-ready'); };
    probe.onerror = () => { el.classList.add('is-missing'); };
    probe.src = sheet;
    cells.forEach((n, i) => {
      const c = i % cols, r = Math.floor(i / cols), l = layers[n];
      l.style.backgroundImage = `url("${sheet}")`;
      l.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
      l.style.backgroundPosition = `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`;
    });
  } else {
    el.classList.add('is-missing');
  }
  host.appendChild(el);

  let state = 'idle', pose = null, facing = 'right';   // pose = null: the first showPose() really displays
  let pos = { x: 0, y: 0 };      // where she rests (the target of the moves under way)
  let flight = null, timers = [], moves = [];
  let landing = null;            // the move's end: { onLand, long, resolve }
  let lastDir = 'right';

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const resolvePose = (name) => { let p = name; while (p && !(p in index)) p = FALLBACK[p]; return p in index ? p : cells[0]; };
  const now = () => (document.timeline && document.timeline.currentTime != null ? document.timeline.currentTime : performance.now());

  // One pose at a time: a hard cut. The cell box follows on its own short transition (owl.css .is-perched).
  function showPose(name) {
    const p = resolvePose(name);
    if (p === pose || !layers[p]) return;
    if (pose && layers[pose]) layers[pose].style.opacity = '0';
    layers[p].style.opacity = '1';
    pose = p;
    posesEl.classList.toggle('is-perched', p === 'perch' || p === 'look' || p === 'sleep');
  }
  // A layer at opacity 0 is not rasterised: the first flight would do it, in the middle of the move. Once, the hidden poses show for a few
  // frames at an opacity that cannot be seen; their tiles then stay on the GPU.
  function warm() {
    const hidden = Object.values(layers).filter((l) => l.style.opacity !== '1');
    hidden.forEach((l) => { l.style.opacity = '.004'; });
    return new Promise((resolve) => {
      let n = 3;
      const step = () => {
        if (--n > 0) { requestAnimationFrame(step); return; }
        hidden.forEach((l) => { if (l.style.opacity === '.004') l.style.opacity = '0'; });
        resolve();
      };
      requestAnimationFrame(step);
    });
  }
  function setState(s) { state = s; el.dataset.state = s; }
  function setFacing(f) { facing = f; dir.style.transform = f === 'left' ? 'scaleX(-1)' : ''; }
  function place(x, y) { pos = { x, y }; el.style.transform = `translate(${x}px, ${y}px)`; }

  // ---- Where she is at time t: her target, less what each move still has to cover, plus each move's arc ----
  function at(t) {
    let x = pos.x, y = pos.y;
    for (const m of moves) {
      const tau = Math.min(1, Math.max(0, (t - m.t0) / m.dur));
      if (tau >= 1) continue;
      const u = ARRIVE(tau);
      x -= m.dx * (1 - u);
      y -= m.dy * (1 - u);
      y -= m.lift * Math.sin(Math.PI * u);
    }
    return [x, y];
  }
  function currentPos() { const [x, y] = at(now()); return { x, y }; }
  // Everything under way, as one animation from t0, started from the frame on screen (no pending frame at her old speed).
  function play(t0) {
    const end = moves.reduce((e, m) => Math.max(e, m.t0 + m.dur), t0);
    const dur = Math.max(1, end - t0), n = Math.max(24, Math.min(48, Math.round(dur / 16)));
    const frames = [];
    let prev = at(t0 - 8);
    for (let i = 0; i <= n; i++) {
      const p = at(t0 + (dur * i) / n);
      // A hint of a bank into the direction of travel (± 4°), from her speed; level at the end.
      const rot = i === n ? 0 : Math.max(-4, Math.min(4, (p[0] - prev[0]) * 0.28));
      frames.push({ transform: `translate(${p[0].toFixed(1)}px, ${p[1].toFixed(1)}px) rotate(${rot.toFixed(2)}deg)` });
      prev = p;
    }
    if (flight) { flight.onfinish = null; flight.cancel(); }
    const a = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
    if (document.timeline && document.timeline.currentTime != null) a.startTime = t0;
    flight = a;
    a.onfinish = () => { if (flight === a) touchDown(); };
  }
  function touchDown() {
    if (flight) { flight.onfinish = null; flight.cancel(); flight = null; }
    moves = [];
    place(pos.x, pos.y);
    const l = landing; landing = null;
    if (!l) { setState('idle'); return; }               // a quiet shift: she never left
    setState('land');
    if (l.long) dropFeathers();
    if (l.onLand) l.onLand();
    if (!reduced()) { const a = depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.025, .975)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(.3, .5, .15, 1)' }); a.onfinish = () => a.cancel(); }
    showPose('perch');
    later(() => { setState('idle'); if (l.resolve) l.resolve(); }, SETTLE_MS);
  }

  // ---- Feathers: two small ones drift down and turn after a long flight ----
  function dropFeathers() {
    if (!feather || reduced()) return;
    for (let i = 0; i < FEATHERS; i++) {
      const f = document.createElement('i');
      f.className = 'owl-feather';
      f.style.backgroundImage = `url("${feather}")`;
      f.style.left = `${38 + i * 20}%`;
      feathersEl.appendChild(f);
      const sx = (i ? 1 : -1) * (1.2 + Math.random() * 0.8), rot = (i ? -1 : 1) * (40 + Math.random() * 25);
      const a = f.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 0 },
        { transform: `translate(${sx * 0.3}cqw, 1.2cqw) rotate(${rot * 0.3}deg)`, opacity: 0.55, offset: 0.2 },
        { transform: `translate(${sx * 0.8}cqw, 3.6cqw) rotate(${rot * 0.75}deg)`, opacity: 0.45, offset: 0.6 },
        { transform: `translate(${sx}cqw, 6cqw) rotate(${rot}deg)`, opacity: 0 },
      ], { duration: 1500 + i * 260, easing: 'cubic-bezier(.3,.4,.4,1)', delay: 120 + i * 180 });
      a.onfinish = () => f.remove();
    }
  }

  // ---- Flight to a point (top-left corner of the container). A move: 320 ms + 0.08 ms per px, 380 ms at most (× timeScale).
  // Mid-flight it joins the moves under way; on the perch she takes off the moment the key is pressed. ----
  function flyTo(x, y, o = {}) {
    clearTimers();
    const t0 = now();
    const from = at(t0);
    const dx = x - pos.x, dy = y - pos.y, dist = Math.hypot(x - from[0], y - from[1]);
    if (!moves.length && dist < 2) { place(x, y); setState('idle'); return Promise.resolve(); }
    if (reduced()) {                                    // cross-fade: no flight
      if (flight) { flight.onfinish = null; flight.cancel(); flight = null; }
      moves = []; landing = null;
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      later(() => { place(x, y); el.style.opacity = '1'; later(() => { el.style.transition = ''; setState('idle'); }, 220); }, 200);
      return new Promise((r) => later(r, 450));
    }
    const k = o.timeScale || 1;
    if (o.quiet) {                                      // a few px along the same perch (the logo under her goes up or down): no flight
      moves = moves.filter((m) => t0 < m.t0 + m.dur);
      moves.push({ t0, dur: 240 * k, dx, dy, lift: 0 });
      pos = { x, y };
      play(t0);
      return Promise.resolve();
    }
    const long = dist >= LONG_PX;
    const dur = Math.min(MAX_MS, HOP_MS + dist * SPEED) * k;
    // The arc: small on a hop, less again over a swoop from above, and no more than what she needs on top of the height she has.
    const steep = dy > dist * 0.6;
    let lift = long ? Math.min(90, 30 + dist * 0.12) : Math.min(44, 14 + dist * 0.14);
    if (steep) lift *= 0.3;
    const high = Math.max(0, pos.y - from[1]);
    lift = Math.max(0, lift - high * 0.7);
    moves = moves.filter((m) => t0 < m.t0 + m.dur);
    moves.push({ t0, dur, dx, dy, lift });
    pos = { x, y };
    const dirNow = x - from[0] < -0.5 ? 'left' : x - from[0] > 0.5 ? 'right' : lastDir;
    lastDir = dirNow;
    setFacing(dirNow);
    setState('fly');
    play(t0);
    const prevResolve = landing && landing.resolve;
    return new Promise((resolve) => {
      landing = { onLand: o.onLand, long, resolve: () => { if (prevResolve) prevResolve(); resolve(); } };
      // Poses: one glide, moved by the transform; wings forward before the talons touch; the perch when they do (touchDown).
      showPose('glide');
      later(() => showPose('land'), dur * 0.68);
    });
  }

  function teleport(x, y) {
    clearTimers();
    if (flight) { flight.onfinish = null; flight.cancel(); flight = null; }
    moves = []; landing = null;
    el.style.transition = '';     // a calm owl's cross-fade, cut short
    place(x, y); showPose('perch'); setState('idle');
  }

  // Hitting the edge: she does not move, just a small tilt of the head. Twice within 600 ms: a startled hop.
  let lastNod = 0;
  function nod() {
    if (reduced()) return;
    const t = performance.now();
    if (t - lastNod < 600) { lastNod = 0; startle(); return; }
    lastNod = t;
    depth.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(3deg)', offset: 0.45 }, { transform: 'rotate(0deg)' }], { duration: 360, easing: 'cubic-bezier(.4,0,.3,1)' });
  }
  // Something went wrong (a Howler, a refused edge): a crouch, a small hop, wings up for a beat.
  function startle() {
    if (reduced() || state !== 'idle') return;
    depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02, .93)', offset: 0.3 }, { transform: 'translateY(-.8cqw) scale(1.01)', offset: 0.62 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,0,.2,1)' });
    showPose('up');
    later(() => { if (state === 'idle') showPose('perch'); }, 280);
  }
  // A glance toward the bar (above) or back to the camera.
  function lookAt(where) {
    if (state !== 'idle') return;
    if (where === 'up') { setFacing(lastDir); showPose('look'); } else showPose('perch');
  }

  // Lumos: she takes off vertically out of frame while the light rises. Two slow beats, then she is gone.
  function liftOff(ms = 500) {
    clearTimers();
    const from = currentPos();
    if (flight) { flight.onfinish = null; flight.cancel(); }
    moves = []; landing = null;
    pos = from;
    setState('fly');
    const k = reduced() ? 0.2 : 1;
    showPose('up');
    later(() => showPose('down'), 230 * k); later(() => showPose('up'), 460 * k);
    flight = el.animate([
      { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 },
      { transform: `translate(${from.x}px, ${from.y + 2}px)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${from.x}px, ${from.y - 600}px)`, opacity: 0 },
    ], { duration: ms * k, easing: 'cubic-bezier(.55,0,.75,.3)', fill: 'forwards' });
    return new Promise((r) => later(r, ms * k));
  }
  // Return from out of frame to a point (after Lumos, after Nox, at the end of the boot): a swoop down, a settle.
  function comeBack(x, y, o = {}) {
    clearTimers();
    if (flight) { flight.onfinish = null; flight.cancel(); flight = null; }
    moves = []; landing = null;
    el.style.opacity = '1';
    place(x, y - 500);
    state = 'idle';
    return flyTo(x, y, { onLand: o.onLand });
  }

  // Nox: she tucks her head in and sleeps (owl.css holds the .97 scale of the sleep state, static); on waking, she
  // opens her eyes, then blinks once, slowly. No breathing loop in either state.
  function sleep() { clearTimers(); setState('sleep'); showPose('sleep'); depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }], { duration: 1200, easing: 'cubic-bezier(.4,0,.3,1)' }); }
  function wake() { setState('idle'); depth.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3,0,.2,1)' }); showPose('perch'); later(() => { showPose('sleep'); later(() => showPose('perch'), 120); }, 900); }

  // Parks her where she is, every animation and timer dropped (memory pressure): perched (or asleep), still.
  function stop() {
    clearTimers();
    const p = currentPos();
    if (flight) { flight.onfinish = null; flight.cancel(); flight = null; }
    moves = []; landing = null;
    el.style.transition = '';     // a calm owl's cross-fade, cut short (show() or the next key brings her back)
    place(p.x, p.y);
    el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    feathersEl.textContent = '';
    if (state !== 'sleep') { showPose('perch'); setState('idle'); }
  }
  function hide() { el.style.opacity = '0'; }
  function show() { el.style.opacity = '1'; }
  function destroy() { clearTimers(); if (flight) flight.cancel(); el.remove(); }

  showPose('perch');
  setState('idle');
  return { el, flyTo, teleport, nod, startle, lookAt, liftOff, comeBack, sleep, wake, stop, hide, show, destroy, setFacing, warm, get state() { return state; }, get pos() { return pos; }, get ready() { return ready; }, size: () => ({ w: size, h: size }) };
}
