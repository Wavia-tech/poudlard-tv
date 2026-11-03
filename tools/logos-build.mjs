// Bundles an `app/assets/logos.js` file (private use, ignored by Git) from a folder of white SVGs.
//
// Usage: node tools/logos-build.mjs <svg-folder> [luma-ids]
//        node tools/logos-build.mjs ./my-logos canal,max,tf1,m6
//
//   <svg-folder> : one <id>.svg file per app, the id being the one from CATALOG in app/js/config.js
//                  (netflix.svg, prime.svg, …). White SVG (fill="#ffffff") on a transparent background.
//   [luma-ids]   : comma-separated list of ids whose SVG is a solid fill (a logo on a colored background)
//                  and must be masked by luminance rather than by alpha. Optional.
//
// The file is written to `app/assets/logos.js`, resolved from this script's location: the command works
// from any current directory, and under bash, PowerShell or cmd (no exotic quoting).
// The public repo distributes no logo (trademarks, see DISCLAIMER.md): this script only serves to
// rebuild your own, at home, from sources whose terms of use you respect.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));            // tools/
const target = resolve(here, '..', 'app', 'assets', 'logos.js');  // app/assets/logos.js, whatever the cwd

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node tools/logos-build.mjs <svg-folder> [comma-separated luma-ids]');
  process.exit(1);
}
const dirAbs = resolve(dir);
let isDir = false;
try { isDir = statSync(dirAbs).isDirectory(); } catch (e) { isDir = false; }
if (!isDir) { console.error(`Folder not found: ${dirAbs}`); process.exit(1); }

const luma = new Set((process.argv[3] || '').split(',').map((s) => s.trim()).filter(Boolean));
// An app id: lowercase letters and digits only (as in CATALOG). Any other file name is ignored.
const ID_OK = /^[a-z0-9]+$/;

const out = {};
for (const f of readdirSync(dirAbs).filter((f) => f.toLowerCase().endsWith('.svg')).sort()) {
  const id = basename(f, '.svg');
  if (!ID_OK.test(id)) { console.warn(`ignored (non-conforming name): ${f}`); continue; }
  const svg = readFileSync(join(dirAbs, f), 'utf8');
  // Box proportion: width / height of the viewBox; 1 (square) if the SVG has none.
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
if (!count) { console.error(`No .svg file in ${dirAbs}`); process.exit(1); }

const header = '// App logos: PRIVATE file, ignored by Git, produced by tools/logos-build.mjs.\n'
  + '// Do not redistribute (trademarks). Format: LOGOS[id] = { src: data URI of the white SVG, ratio: width / height, luma: mask by luminance }.\n';
writeFileSync(target, header + 'export const LOGOS = ' + JSON.stringify(out, null, 1) + ';\n');
console.log(`${count} logo(s) written to ${target}`);
