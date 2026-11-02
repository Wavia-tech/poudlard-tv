// Logos des applications : fichier d'exemple, volontairement vide.
//
// Le dépôt public ne distribue aucun logo officiel (ce sont des marques, voir AVERTISSEMENT.md).
// Le vrai fichier, `assets/logos.js`, est ignoré par Git. Pour l'obtenir :
//
//   1. Copiez ce fichier :   cp app/assets/logos.example.js app/assets/logos.js
//      (la maquette démarre alors avec des monogrammes à la place des logos)
//   2. Pour un usage strictement privé, assemblez vos propres logos avec `node tools/logos-build.mjs <dossier> [ids-luma]`
//      (SVG monochromes blancs, un par id du CATALOG de js/config.js), qui écrit `assets/logos.js` au format ci-dessous.
//      Procédure détaillée : tools/README.md.
//
// Format attendu par les écrans :
//   LOGOS[id] = { src: 'data:image/svg+xml;base64,…', ratio: largeur / hauteur, luma: true | false }
//   - `src`   : SVG blanc sur fond transparent, encodé en data URI ; il sert de masque CSS (ivoire gravé, or en relief).
//   - `ratio` : proportion de la boîte du logo (1 = carré). Les écrans fixent la hauteur et déduisent la largeur.
//   - `luma`  : true si le SVG est un aplat plein (logo sur fond coloré) et doit être masqué par luminance.
//
// Repli : quand LOGOS[id] n'existe pas, chaque écran appelle monogram(name) (js/monogram.js), qui dessine l'initiale de
// l'application dans un cercle, au même format. L'interface fonctionne donc entièrement sans ce fichier rempli.
// Sur Android TV, le pont window.Android expose aussi l'icône que chaque application fournit au système
// (appIcon(pkg), pas encore appelée par les écrans dans cette version ; voir tools/README.md).
export const LOGOS = {};
