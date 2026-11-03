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
