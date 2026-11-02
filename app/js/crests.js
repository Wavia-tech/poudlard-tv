// Écussons des maisons : traits simples à la plume, sans blason officiel. Même bouclier pour les quatre.
// Utilisés par la Lettre d'admission, le sceau du Parapet et les réglages.
export const SHIELD = 'M10 6h44v30c0 15-11 25-22 31C21 61 10 51 10 36z';
export const BEASTS = {
  gryffondor: '<circle cx="32" cy="35" r="9"/><path d="M32 20l2 5M32 20l-2 5M43 26l-4 3M21 26l4 3M47 35h-5M17 35h5M43 44l-4-3M21 44l4-3M32 50l2-5M32 50l-2-5"/><circle class="dot" cx="28.5" cy="33" r="1.1"/><circle class="dot" cx="35.5" cy="33" r="1.1"/><path d="M32 36l-1.5 2.2h3zM30 41c1.3 1 2.7 1 4 0"/>',
  serpentard: '<path d="M22 52c0-9 20-7 20-16s-20-6-20-15c0-6 7-8 13-6"/><circle cx="37" cy="14" r="3.2"/><path d="M40 13l5-1.5M45 11.5l-1.5 2.5M45 11.5l2.5.5"/><circle class="dot" cx="36" cy="13" r=".8"/>',
  serdaigle: '<path d="M12 38c8-12 15-14 20-10 5-4 12-2 20 10M15 45c6-6 11-8 17-6 6-2 11 0 17 6"/><circle cx="32" cy="22" r="5"/><path d="M34 25l3 4-3.5.5"/><circle class="dot" cx="30.5" cy="21" r=".9"/>',
  poufsouffle: '<ellipse cx="32" cy="36" rx="13" ry="17"/><path d="M26 20v33M38 20v33"/><circle class="dot" cx="26" cy="34" r="1.1"/><circle class="dot" cx="38" cy="34" r="1.1"/><path d="M32 42l-2 2.5h4zM28 48c2.5 2 5.5 2 8 0"/>',
};
// SVG complet (bouclier + animal). `cls` : classe posée sur le <svg>.
export function crestSvg(id, cls = 'crest') {
  return `<svg class="${cls}" viewBox="0 0 64 72" aria-hidden="true"><path class="rim" d="${SHIELD}"/><path class="rim inner" d="M14 10h36v26c0 12-9 20-18 25C23 56 14 48 14 36z"/><g class="beast">${BEASTS[id] || ''}</g></svg>`;
}
