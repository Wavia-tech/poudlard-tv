// House crests: original engraved line work, no official coat of arms. One achievement for the four houses:
// a knight's helm, light mantling, a heraldic shield with the house beast, a ribbon with the name.
// Two stroke weights only (`.rim/.beast/.helm` heavy, `.fine/.mantle/.banner` fine; `.stripe` is the badger's
// band, `.dot` is filled), so the beast still reads at 3.6 cqw on a TV.
// Colours come from CSS (home.css, sorting.css): --wax / --house-glow / --gold-light on the Parapet, ink on parchment.
// Used by the Parapet (under the clock), the Admission Letter and the settings. Shared viewBox: 0 0 64 80.
export const VIEWBOX = '0 0 64 80';
// Shield: a heater shield, flat top at y 22, point at y 61.
export const SHIELD = 'M15 22h34v20c0 11-8 17-17 22C23 59 15 53 15 42z';
const SHIELD_INNER = 'M18.5 25.5h27v16c0 9-6.5 14-13.5 18.5C25 55.5 18.5 50.5 18.5 41.5z';
// Knight's helm, frontal: a short, wide barrel whose base rests on the shield's top edge (y 22, the shield's rim width
// 15..49 less a hair), a shallow domed crown, the sight slit, the breaths, a short crest spike: one piece with the shield.
const HELM = '<path class="helm" d="M17.5 22v-4.2c0-4 5.6-6.6 14.5-6.6s14.5 2.6 14.5 6.6V22z"/><path class="helm fine" d="M21 17.6h22M26.5 14.6h11M32 11.2V8.8"/>';
// Mantling: one scroll each side, from the shield's top corner down to a curl; mirrored (x' = 64 - x).
const MANTLE_L = 'M15 23c-4.6-2-8.8-.4-9 3-.2 2.6 2 4 3.8 5.8 2.4 2.2 2.6 5.2.4 8-2 2.6-2.4 5.4-.2 7.6 1.4 1.4 3.4 1.6 5.4.8M9.4 46.2c-1.6 1-1.4 3 .2 3.8';
const MANTLE_R = 'M49 23c4.6-2 8.8-.4 9 3 .2 2.6-2 4-3.8 5.8-2.4 2.2-2.6 5.2-.4 8 2 2.6 2.4 5.4.2 7.6-1.4 1.4-3.4 1.6-5.4.8M54.6 46.2c1.6 1 1.4 3-.2 3.8';
// Ribbon under the shield: a gently bowed band with folded ends.
const BANNER = '<path class="banner" d="M13 63.6c7 1.8 31 1.8 38 0v8.6c-7-1.8-31-1.8-38 0z"/><path class="banner fine" d="M13 63.6l-4.5 2.6 4.5 2.8-4 2.3 4 1.3M51 63.6l4.5 2.6-4.5 2.8 4 2.3-4 1.3"/>';

// Lion's mane: drawn by hand, not a ring. Seven pointed flame-tufts on the crown and the sides only, each a sharp
// tongue with a hollow between two tips, and a smooth jaw that closes under the face in a short beard: a mane, not a
// sun. Read from the chin, up the left side, over the crown, down the right.
const MANE = 'M32 56.5c-3.5-.5-7-2.5-9-5.5-2 .5-4 .5-5-.5 1.5-1.5 2.5-3 2.5-4.5-2 1.5-3.5-.5-4-2 2 0 3.5-1 4-2.5 0-3.5-.5-5.5-.5-7 2 1 3.5 .5 4.5-.5-.5-3-.5-5 0-6 2 1.5 3.5 2 4.5 1.5-3-1.5-1.5-3.5 0-4.5 1.5 1 3 3 4.5 4.5 1.5-1.5 3-2 4.5-1.5 .5 1 .5 3 0 6 1 1 2.5 1.5 4.5 .5 0 1.5-.5 3.5-.5 7 .5 1.5 2 2.5 4 2.5-.5 1.5-2 3.5-4 2 0 1.5 1 3 2.5 4.5-1 1-3 1-5 .5-2 3-5.5 5-9 5.5z';

export const BEASTS = {
  // Lion: a lion's face, frontal. Flame-tuft mane, round ears, a stern V brow, a straight closed muzzle.
  gryffondor: `<path d="${MANE}"/><path d="M25.6 38.4c0-4.2 2.8-6.8 6.4-6.8s6.4 2.6 6.4 6.8c0 2.8-.8 4.8-2.2 6.2-1.1 1.1-2.6 1.6-4.2 1.6s-3.1-.5-4.2-1.6c-1.4-1.4-2.2-3.4-2.2-6.2z"/><path d="M26.8 34.6c-1.6-1.4-1.6-3.6 0-4.4 1.2-.6 2.6 0 3.4 1.2M37.2 34.6c1.6-1.4 1.6-3.6 0-4.4-1.2-.6-2.6 0-3.4 1.2"/><path d="M27.4 36.2l4.6 1.6 4.6-1.6"/><circle class="dot" cx="29.4" cy="39.2" r="1"/><circle class="dot" cx="34.6" cy="39.2" r="1"/><path class="dot" d="M30.6 41.4h2.8L32 43z"/><path d="M32 43v1.2M28.6 44.6h6.8"/>`,
  // Serpent: three confident bends from the tail to a raised head, tongue out.
  serpentard: '<path d="M21.5 52.5c-2.5-3.5 2-6 10-7s10.5-3.5 7.5-6.5-10-1.5-13-4.5 1-8 8-8"/><path d="M34 26.5c3.4-1.4 7.4.3 7.6 3 .2 2.5-3.6 3.6-7.1 2.2"/><path class="fine" d="M41.6 29.3l3.8-.4M45.4 28.9l1.4-1.2M45.4 28.9l1.3 1.2"/><circle class="dot" cx="38.4" cy="28.6" r=".9"/>',
  // Raven: perched in profile, facing right. A heavy beak, a folded wing, the tail trailing, two legs on a perch.
  serdaigle: '<path d="M34.6 27.4c3-.8 5.8.6 6.6 2.8l6.4 1.6-6.6.6c-.6 2.4-2.4 3.8-4.8 4.4-3.4.8-6 3-7.6 6.6l-6.2 8.2 3.6-8.6c-2.6-.6-4.4-2.6-4.4-5.4 0-5 4.2-9 9-10z"/><path class="fine" d="M35.2 36.6c-3 .2-5.6 2-7.2 5.2M31.6 44.6l-.8 5.2M34.8 44.2l.4 5.6M23 50.2h20"/><circle class="dot" cx="38.6" cy="30.4" r=".9"/>',
  // Badger: walking in profile, facing right. A low body, a wedge head, the dark band from snout to ear.
  poufsouffle: '<path d="M45.4 41.6C44.6 38.8 42.2 36 38.4 35 31.8 33.4 22.4 35.2 19.8 42 18.4 45.6 20.4 48.4 24.4 48.4H39.6C42.8 48.4 44.8 45.8 45.4 41.6z"/><path class="stripe" d="M44.4 41.4L37.2 37.2"/><path d="M36.4 35.2c.2-1.6 1.6-2.4 3-1.8M24.8 48.4v4.2M28.6 48.4v4.2M35.8 48.4v4.2M39.8 48.4v4"/><path class="fine" d="M19.8 42c-2-.4-3.2.6-3.4 2.2"/><circle class="dot" cx="44.5" cy="41.6" r=".9"/>',
};
const NAMES = { gryffondor: 'Gryffondor', serpentard: 'Serpentard', serdaigle: 'Serdaigle', poufsouffle: 'Poufsouffle' };

// Full SVG: helm, mantling, shield + beast, ribbon with the house name. `cls`: class set on the <svg>.
export function crestSvg(id, cls = 'crest') {
  const name = NAMES[id] || '';
  const size = Math.min(5.2, 36 / Math.max(1, name.length * 0.8)).toFixed(2);   // the longest name still fits the ribbon
  return `<svg class="${cls}" viewBox="${VIEWBOX}" aria-hidden="true">${HELM}<path class="mantle" d="${MANTLE_L}"/><path class="mantle" d="${MANTLE_R}"/><path class="rim" d="${SHIELD}"/><path class="rim inner" d="${SHIELD_INNER}"/><g class="beast">${BEASTS[id] || ''}</g>${BANNER}<text class="banner-text" x="32" y="69.6" text-anchor="middle" font-size="${size}">${name}</text></svg>`;
}

// The official crests, when present: app/assets/crest-<house>.webp, cut out from the reference image and kept out
// of the public repository (same rule as the app logos, see .gitignore). mountCrest() puts the picture in `host`
// and falls back to the drawn achievement above if the file is missing, so the public tree still shows a crest.
const CREST_FILE = { gryffondor: 'gryffondor', serpentard: 'serpentard', poufsouffle: 'poufsouffle', serdaigle: 'serdaigle' };
export function mountCrest(host, id, cls) {
  const file = CREST_FILE[id];
  if (!file) { host.innerHTML = crestSvg(id, cls); return; }
  host.innerHTML = `<img class="${cls} is-img" src="assets/crest-${file}.webp" alt="" draggable="false">`;
  host.firstElementChild.onerror = () => { host.innerHTML = crestSvg(id, cls); };
}
