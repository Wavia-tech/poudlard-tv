// Hedwig (Hedwige): the home-screen cursor, and an animal. Real generated photos (cut out), cross-faded slowly,
// never switched on a timer tick. She has weight (a crouch before take-off, a settle on landing), depth (she grows a
// touch at the apex, her shadow thins while she is in the air), a hint of a bank into each turn, a flare with the
// wings forward before the talons touch, two feathers after a long flight.
// At rest she is STILL: no breathing loop, no idle timer. She only moves on an event (a flight, a glance toward the
// bar, a nod at the edge, a startle, sleep and wake), so the Parapet costs nothing when nobody touches the remote.
//
// Poses come from ONE sprite sheet (assets/owl-sheet.webp, built by tools/cutout_owl.py --sheet): a grid of equal
// cells, `cols` per row, read left to right then top to bottom in `cells` order, the ivory rim baked in (no CSS
// filter). Two layers show the current and the previous cell and swap opacities: one texture, two elements, zero filter.
//   createOwl(host, { sheet, cells: ['perch','look','sleep','up','down','glide','land'], cols: 4, feather?, size, reduced })
// `cols` defaults to the number of cells (the former one-row sheet). A missing sheet hides the owl (never a broken
// image); a missing pose falls back to the closest one. stop() parks her (memory pressure).
//
// Flight model (flyTo): the path is a Catmull-Rom spline through a handful of waypoints, re-sampled by arc length so
// the speed profile is a single ease (slow push-off, cruise, long deceleration). It plays as ONE Web Animation with
// dense keyframes (transform only, compositor side). The pose schedule is a timeline of timers at fixed offsets of
// the flight, every change a cross-fade of 180 ms or more, never two changes closer than 230 ms. No rAF loop here:
// the shared scene clock (Fx.tick) stays the only one.

const FALLBACK = { look: 'perch', sleep: 'perch', glide: 'up', land: 'up', down: 'up', up: 'perch' };
const FEATHERS = 2;
const SAMPLES = 36;              // keyframes of a flight
const FLAP_MS = 230;             // one pose of the wing beat (up or down); a full beat is 460 ms
const FADE_FLAP = 180, FADE_GLIDE = 240, FADE_LAND = 220, FADE_SETTLE = 240;

// CSS cubic-bezier evaluated in JS (Newton on x), so the arc-length re-sampling can use the same ease as the CSS.
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
// Catmull-Rom through the waypoints, `steps` points per segment.
function spline(pts, steps) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const q = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      out.push([q(0), q(1)]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}
// The point of a polyline at a fraction of its arc length.
function alongPath(poly, cum, u) {
  const L = cum[cum.length - 1] * u;
  let i = 1; while (i < cum.length - 1 && cum[i] < L) i++;
  const a = poly[i - 1], b = poly[i], seg = cum[i] - cum[i - 1];
  const f = seg > 0 ? (L - cum[i - 1]) / seg : 0;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

export function createOwl(host, opts) {
  const { sheet, cells = [], feather = null, size = 110, reduced = () => false } = opts;
  const cols = Math.max(1, Math.min(cells.length || 1, opts.cols || cells.length || 1));
  const rows = Math.max(1, Math.ceil((cells.length || 1) / cols));
  const el = document.createElement('div');
  el.className = 'owl';
  el.style.setProperty('--owl-size', size + 'px');
  el.innerHTML = '<div class="owl-shadow"></div><div class="owl-dir"><div class="owl-depth"><div class="owl-poses"><div class="owl-layer"></div><div class="owl-layer"></div></div></div></div><div class="owl-feathers"></div>';
  const dir = el.querySelector('.owl-dir'), depth = el.querySelector('.owl-depth'), posesEl = el.querySelector('.owl-poses'), shadow = el.querySelector('.owl-shadow');
  const layers = [...el.querySelectorAll('.owl-layer')];
  const feathersEl = el.querySelector('.owl-feathers');
  const index = Object.fromEntries(cells.map((n, i) => [n, i]));
  let ready = false;
  if (sheet) {
    const probe = new Image();
    probe.onload = () => { ready = true; el.classList.add('is-ready'); };
    probe.onerror = () => { el.classList.add('is-missing'); };
    probe.src = sheet;
    layers.forEach((l) => { l.style.backgroundImage = `url("${sheet}")`; l.style.backgroundSize = `${cols * 100}% ${rows * 100}%`; });
  } else {
    el.classList.add('is-missing');
  }
  host.appendChild(el);

  let state = 'idle', pose = null, facing = 'right', front = 0;   // pose = null: the first showPose() really displays
  let pos = { x: 0, y: 0 };
  let flight = null, timers = [];
  let lastDir = 'right';

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const resolvePose = (name) => { let p = name; while (p && !(p in index)) p = FALLBACK[p]; return p in index ? p : cells[0]; };

  // The hidden layer takes the new cell, then the two layers swap opacities (a cross-fade of `ms`).
  function showPose(name, ms = 180) {
    const p = resolvePose(name);
    if (p === pose) return;
    pose = p;
    const k = reduced() ? 1 : ms;
    const back = 1 - front;
    const c = index[p] % cols, r = Math.floor(index[p] / cols);
    layers[back].style.backgroundPosition = `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`;
    layers[back].style.transitionDuration = k + 'ms'; layers[front].style.transitionDuration = k + 'ms';
    layers[back].style.opacity = '1'; layers[front].style.opacity = '0';
    posesEl.style.transitionDuration = (reduced() ? 1 : Math.max(k, 200)) + 'ms';   // the cell box follows (owl.css .is-perched)
    posesEl.classList.toggle('is-perched', p === 'perch' || p === 'look' || p === 'sleep');
    front = back;
  }
  function setState(s) { state = s; el.dataset.state = s; }
  function setFacing(f) { facing = f; dir.style.transform = f === 'left' ? 'scaleX(-1)' : ''; }
  function place(x, y) { pos = { x, y }; el.style.transform = `translate(${x}px, ${y}px)`; }
  function currentPos() { const m = new DOMMatrixReadOnly(getComputedStyle(el).transform); return { x: m.m41, y: m.m42 }; }

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

  // ---- Flight to a point (top-left corner of the container) ----
  // Durations (then × timeScale): a hop (< 300 px) 620 + 0.6·d ms (≈ 745 ms between two neighbours); a leap
  // 760 + 0.5·d ms, 1400 ms at most. Arc: push-off, apex at 42 % of the way, descent, flare, touch.
  function flyTo(x, y, o = {}) {
    clearTimers();
    const from = currentPos();
    if (flight) { flight.commitStyles(); flight.cancel(); flight = null; }
    const dx = x - from.x, dy = y - from.y, dist = Math.hypot(dx, dy);
    if (dist < 2) { place(x, y); setState('idle'); return Promise.resolve(); }
    if (reduced()) {                                    // cross-fade: no flight
      el.style.transition = 'opacity 200ms';
      el.style.opacity = '0';
      later(() => { place(x, y); el.style.opacity = '1'; later(() => { el.style.transition = ''; setState('idle'); }, 220); }, 200);
      return new Promise((r) => later(r, 450));
    }
    const k = o.timeScale || 1;
    const H = o.arena ? o.arena.h : 600;
    const short = dist < 300;
    const steep = dy > dist * 0.6;                     // coming down from above (after Lumos, the crane): a swoop, not a climb
    let lift = short ? Math.min(H * 0.1, 14 + dist * 0.14) : Math.min(H * 0.22, 30 + dist * 0.18);
    if (steep) lift *= 0.3;
    const dur = (short ? 620 + dist * 0.6 : Math.min(1400, 760 + dist * 0.5)) * k;
    lastDir = dx < 0 ? 'left' : 'right';
    const sign = dx < 0 ? -1 : 1;
    setFacing(lastDir);
    setState('fly');
    el.dataset.phase = 'crouch';

    // The path: waypoints relative to the start, a spline through them, re-sampled by arc length under one ease.
    const top = Math.min(0, dy) - lift;
    const flare = Math.max(6, lift * 0.3);
    const way = steep
      ? [[0, 0], [dx * 0.12, -lift], [dx * 0.35, dy * 0.3], [dx * 0.6, dy * 0.62], [dx * 0.82, dy * 0.86], [dx * 0.94, dy - flare], [dx, dy]]   // a push up, a long swoop, a flare
      : [[0, 0], [dx * 0.15, top * 0.45], [dx * 0.42, top], [dx * 0.68, top * 0.82 + dy * 0.18], [dx * 0.9, dy - flare], [dx, dy]];
    const poly = spline(way, 24);
    const cum = [0];
    for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    const ease = bezier(short ? 0.35 : 0.42, 0, short ? 0.3 : 0.16, 1);
    const frames = [];
    let prev = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES, u = ease(t);
      const p = alongPath(poly, cum, u);
      // A hint of a bank into the direction of travel (± 4°), and a flare (nose up ~ 4°) just before touching.
      let rot = 0;
      if (prev && i < SAMPLES) rot = Math.max(-4, Math.min(4, Math.atan2(p[1] - prev[1], (p[0] - prev[0]) * sign) * 0.14 * 180 / Math.PI)) * sign;
      if (u > 0.8) rot -= sign * 4 * Math.sin(Math.PI * (u - 0.8) / 0.2);
      if (i === SAMPLES) rot = 0;
      frames.push({ transform: `translate(${(from.x + p[0]).toFixed(1)}px, ${(from.y + p[1]).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`, offset: t });
      prev = p;
    }
    flight = el.animate(frames, { duration: dur, easing: 'linear', fill: 'forwards' });
    // Weight: a crouch before the push-off, a touch bigger at the apex, a soft squash as the talons take the stone.
    depth.animate([
      { transform: 'scale(1)' }, { transform: 'scale(1.02, .965)', offset: 0.06, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: `scale(${short ? 1.02 : 1.045})`, offset: 0.45, easing: 'cubic-bezier(.4,0,.3,1)' },
      { transform: 'scale(1)', offset: 0.92, easing: 'cubic-bezier(.3,0,.2,1)' }, { transform: 'scale(1.025, .975)', offset: 0.97 }, { transform: 'scale(1)' },
    ], { duration: dur + FADE_SETTLE * k, easing: 'linear' });
    // The shadow stays under her (it travels with the element) but thins and fades while she is in the air.
    shadow.animate([
      { transform: 'scale(1)', opacity: 0.55 }, { transform: `scale(${short ? 0.8 : 0.66}, .9)`, opacity: short ? 0.3 : 0.16, offset: 0.45 }, { transform: 'scale(1)', opacity: 0.55 },
    ], { duration: dur, easing: 'cubic-bezier(.4,0,.3,1)' });

    // Pose timeline (ms from take-off). Take-off at 8 %: wings up. Beats of FLAP_MS until the climb ends (62 % of a hop,
    // 58 % of a leap), never within 160 ms of the glide. Leaps glide over the apex; hops hold the level wings. Wings
    // forward (land) at 78 %, perch 200 ms after the touch. All cross-fades ≥ 180 ms.
    const climbEnd = dur * (short ? 0.62 : 0.58), landAt = dur * 0.78;
    let t = dur * 0.08, p = 'up';
    const sched = [];
    while (t < climbEnd - 160 * k) { sched.push([t, p, FADE_FLAP]); p = p === 'up' ? 'down' : 'up'; t += FLAP_MS * k; }
    if (!short) sched.push([climbEnd, 'glide', FADE_GLIDE]);
    sched.push([landAt, 'land', FADE_LAND]);
    const anim = flight;
    sched.forEach(([at, name, fade], i) => later(() => {
      if (flight !== anim) return;
      el.dataset.phase = i === 0 ? 'takeoff' : name === 'land' ? 'land' : name === 'glide' ? 'glide' : 'cruise';
      showPose(name, fade * k);
    }, at));

    return new Promise((resolve) => {
      anim.onfinish = () => {
        if (flight !== anim) return;
        anim.commitStyles(); anim.cancel(); flight = null;
        place(x, y);
        setState('land');
        if (!short) dropFeathers();
        if (o.onLand) o.onLand();
        later(() => { showPose('perch', FADE_SETTLE * k); }, 200 * k);
        later(() => { setState('idle'); resolve(); }, (200 + FADE_SETTLE) * k);
      };
    });
  }

  function teleport(x, y) {
    clearTimers();
    if (flight) { flight.cancel(); flight = null; }
    place(x, y); showPose('perch', 1); setState('idle');
  }

  // Hitting the edge: she does not move, just a small tilt of the head. Twice within 600 ms: a startled hop.
  let lastNod = 0;
  function nod() {
    if (reduced()) return;
    const now = performance.now();
    if (now - lastNod < 600) { lastNod = 0; startle(); return; }
    lastNod = now;
    depth.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(3deg)', offset: 0.45 }, { transform: 'rotate(0deg)' }], { duration: 360, easing: 'cubic-bezier(.4,0,.3,1)' });
  }
  // Something went wrong (a Howler, a refused edge): a crouch, a small hop, wings up for a beat.
  function startle() {
    if (reduced() || state !== 'idle') return;
    depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02, .93)', offset: 0.3 }, { transform: 'translateY(-.8cqw) scale(1.01)', offset: 0.62 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,0,.2,1)' });
    showPose('up', 160);
    later(() => { if (state === 'idle') showPose('perch', 220); }, 280);
  }
  // A glance toward the bar (above) or back to the camera.
  function lookAt(where) {
    if (state !== 'idle') return;
    if (where === 'up') { setFacing(lastDir); showPose('look', 360); } else showPose('perch', 360);
  }

  // Lumos: she takes off vertically out of frame while the light rises. Two slow beats, then she is gone.
  function liftOff(ms = 500) {
    clearTimers();
    setState('fly');
    const from = currentPos();
    const k = reduced() ? 0.2 : 1;
    showPose('up', 160 * k);
    later(() => showPose('down', 180 * k), 230 * k); later(() => showPose('up', 180 * k), 460 * k);
    depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02, .965)', offset: 0.18 }, { transform: 'scale(1)' }], { duration: ms * k, easing: 'cubic-bezier(.3,0,.2,1)' });
    flight = el.animate([
      { transform: `translate(${from.x}px, ${from.y}px)`, opacity: 1 },
      { transform: `translate(${from.x}px, ${from.y + 2}px)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${from.x}px, ${from.y - 600}px)`, opacity: 0 },
    ], { duration: ms * k, easing: 'cubic-bezier(.55,0,.75,.3)', fill: 'forwards' });
    return new Promise((r) => later(r, ms * k));
  }
  // Return from out of frame to a point (after Lumos, after the crane shot): a swoop down, a flare, a settle.
  function comeBack(x, y, o = {}) {
    if (flight) { flight.cancel(); flight = null; }
    el.style.opacity = '1';
    place(x, y - 500);
    return flyTo(x, y, { arena: { h: 1200 }, onLand: o.onLand });
  }

  // Nox: she tucks her head in and sleeps (owl.css holds the .97 scale of the sleep state, static); on waking, she
  // opens her eyes, then blinks once, slowly. No breathing loop in either state.
  function sleep() { clearTimers(); setState('sleep'); showPose('sleep', 600); depth.animate([{ transform: 'scale(1)' }, { transform: 'scale(.97)' }], { duration: 1200, easing: 'cubic-bezier(.4,0,.3,1)' }); }
  function wake() { setState('idle'); depth.animate([{ transform: 'scale(.97)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'cubic-bezier(.3,0,.2,1)' }); showPose('perch', 320); later(() => { showPose('sleep', 110); later(() => showPose('perch', 170), 120); }, 900); }

  // Parks her where she is, every animation and timer dropped (memory pressure): perched (or asleep), still.
  function stop() {
    clearTimers();
    if (flight) { try { flight.commitStyles(); } catch (e) { /* not rendered */ } flight.cancel(); flight = null; }
    el.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    feathersEl.textContent = '';
    if (state !== 'sleep') { showPose('perch', 1); setState('idle'); }
  }
  function hide() { el.style.opacity = '0'; }
  function show() { el.style.opacity = '1'; }
  function destroy() { clearTimers(); if (flight) flight.cancel(); el.remove(); }

  showPose('perch', 1);
  setState('idle');
  return { el, flyTo, teleport, nod, startle, lookAt, liftOff, comeBack, sleep, wake, stop, hide, show, destroy, setFacing, get state() { return state; }, get pos() { return pos; }, get ready() { return ready; }, size: () => ({ w: el.offsetWidth, h: el.offsetHeight }) };
}
