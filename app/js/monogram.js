// Fallback logo for an app added by hand: a monogram (the initial) drawn in SVG,
// usable as a mask exactly like the official logos in assets/logos.js.
const cache = new Map();

export function monogram(name) {
  const letter = (String(name || '?').trim()[0] || '?').toUpperCase();
  if (cache.has(letter)) return cache.get(letter);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#fff" stroke-width="5"/>` +
    `<text x="50" y="68" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-size="56" font-weight="700" fill="#fff">${letter.replace(/[<>&"]/g, '')}</text></svg>`;
  const entry = { src: 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))), ratio: 1, luma: false };
  cache.set(letter, entry);
  return entry;
}

// Equal visual weight for every logo: the box is sized on the logo's AREA, not its height alone, so a wide
// wordmark comes out lower and a square mark larger, and a row reads as one family. `h` is the reference height
// (cqw) of a 1.6:1 logo; the height is clamped to [0.72 h, 1.2 h], the width to `wMax`.
export function logoBox(L, h, wMax = 9.5) {
  const r = Math.max(0.5, Math.min(6, (L && L.ratio) || 1));
  const area = (h * 1.6) * h;
  let bh = Math.sqrt(area / r);
  bh = Math.max(h * 0.68, Math.min(h * 1.3, bh));       // a square mark (a single letter) reads lighter: let it grow more
  let bw = bh * r;
  if (bw > wMax) { bw = wMax; bh = bw / r; }
  const s = Math.max(0.6, Math.min(1.6, (L && L.scale) || 1));   // optical scale (assets/logos.js): equal ink, not equal boxes
  bw *= s; bh *= s;
  return { w: bw, h: bh };
}
