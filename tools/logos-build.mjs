// Assemble un fichier `app/assets/logos.js` (usage privé, ignoré par Git) à partir d'un dossier de SVG blancs.
//
// Usage : node tools/logos-build.mjs <dossier-de-svg> [ids-luma]
//         node tools/logos-build.mjs ./mes-logos canal,max,tf1,m6
//
//   <dossier-de-svg> : un fichier <id>.svg par application, l'id étant celui du CATALOG de app/js/config.js
//                      (netflix.svg, prime.svg, …). SVG blanc (fill="#ffffff") sur fond transparent.
//   [ids-luma]       : liste d'ids séparés par des virgules dont le SVG est un aplat plein (logo posé sur un fond
//                      coloré) et doit être masqué par luminance plutôt que par alpha. Facultatif.
//
// Le fichier est écrit à `app/assets/logos.js`, résolu depuis l'emplacement de ce script : la commande marche
// depuis n'importe quel répertoire courant, et sous bash, PowerShell ou cmd (aucun guillemet exotique).
// Le dépôt public ne distribue aucun logo (marques, voir AVERTISSEMENT.md) : ce script sert seulement à
// reconstruire le sien, chez soi, à partir de sources dont on respecte les conditions d'utilisation.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));            // tools/
const target = resolve(here, '..', 'app', 'assets', 'logos.js');  // app/assets/logos.js, quel que soit le cwd

const dir = process.argv[2];
if (!dir) {
  console.error('Usage : node tools/logos-build.mjs <dossier-de-svg> [ids-luma séparés par des virgules]');
  process.exit(1);
}
const dirAbs = resolve(dir);
let isDir = false;
try { isDir = statSync(dirAbs).isDirectory(); } catch (e) { isDir = false; }
if (!isDir) { console.error(`Dossier introuvable : ${dirAbs}`); process.exit(1); }

const luma = new Set((process.argv[3] || '').split(',').map((s) => s.trim()).filter(Boolean));
// Un id d'application : lettres minuscules et chiffres seulement (comme dans CATALOG). Tout autre nom de fichier est ignoré.
const ID_OK = /^[a-z0-9]+$/;

const out = {};
for (const f of readdirSync(dirAbs).filter((f) => f.toLowerCase().endsWith('.svg')).sort()) {
  const id = basename(f, '.svg');
  if (!ID_OK.test(id)) { console.warn(`ignoré (nom non conforme) : ${f}`); continue; }
  const svg = readFileSync(join(dirAbs, f), 'utf8');
  // Proportion de la boîte : largeur / hauteur du viewBox ; 1 (carré) si le SVG n'en a pas.
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg);
  const parts = vb ? vb[1].trim().split(/\s+/).map(Number) : [];
  const w = parts.length === 4 && parts[2] > 0 ? parts[2] : 24;
  const h = parts.length === 4 && parts[3] > 0 ? parts[3] : 24;
  out[id] = {
    ratio: Math.round((w / h) * 100) / 100,
    luma: luma.has(id),
    src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
  };
}

const count = Object.keys(out).length;
if (!count) { console.error(`Aucun fichier .svg dans ${dirAbs}`); process.exit(1); }

const header = '// Logos des applications : fichier PRIVÉ, ignoré par Git, produit par tools/logos-build.mjs.\n'
  + '// Ne pas redistribuer (marques). Format : LOGOS[id] = { src: data URI du SVG blanc, ratio: largeur / hauteur, luma: masque par luminance }.\n';
writeFileSync(target, header + 'export const LOGOS = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(`${count} logo(s) écrit(s) dans ${target}`);
