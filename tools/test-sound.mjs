// Vérifie l'originalité de la valse de fond (MELODY dans app/js/sound.js) par rapport aux contraintes écrites
// dans docs/MUSIQUE.md : aucune citation du thème d'Hedwige (J. Williams), lui aussi une valse en mi mineur.
//
// Usage : node tools/test-sound.mjs        → code de sortie 0 si tout passe, 1 sinon, avec le détail.
//
// Le script lit sound.js comme du TEXTE (il n'importe pas le module, qui dépend du navigateur) et en extrait
// la constante MELODY : une liste de [note MIDI, durée en temps]. Il vérifie ensuite :
//   1. la structure : 24 mesures à 3 temps = 72 temps, durées entières (noires et blanches, jamais de pointé) ;
//   2. l'ouverture : la mélodie commence sur le temps fort par une montée conjointe si do ré mi
//      (pas de levée si → mi, la quarte ascendante en anacrouse qui ouvre le thème des films) ;
//   3. les cellules interdites, en hauteurs absolues ET à toute transposition, dans la suite des intervalles
//      consécutifs : mi–sol–fa#–mi (+3 −1 −2), si–la–fa# précédé d'une quinte (+7 −2 −3), et la variante +5 +3 −1.
// Tout est relisible : la mélodie est écrite note à note dans sound.js.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const soundPath = resolve(here, '..', 'app', 'js', 'sound.js');
const text = readFileSync(soundPath, 'utf8');

// ---- extraction de MELODY ------------------------------------------------------------------------------------
const start = text.indexOf('const MELODY = [');
if (start < 0) { console.error('MELODY introuvable dans ' + soundPath); process.exit(1); }
const end = text.indexOf('];', start);
const block = text.slice(start, end);
// Chaque note : [midi, durée]. Les commentaires de fin de ligne (// 1 Em …) sont ignorés par la regex.
const notes = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// ---- 1. structure --------------------------------------------------------------------------------------------
const totalBeats = notes.reduce((s, [, d]) => s + d, 0);
check(notes.length > 0, 'aucune note extraite');
check(totalBeats === 72, `72 temps attendus (24 mesures à 3/4), trouvé ${totalBeats}`);
check(notes.every(([, d]) => Number.isInteger(d) && d >= 1), 'durées non entières : figure pointée ou croche interdite');
check(notes.every(([n]) => n >= 48 && n <= 96), 'note hors de la tessiture attendue (do2 à do6)');

// ---- 2. ouverture --------------------------------------------------------------------------------------------
const pitches = notes.map(([n]) => n);
const intervals = pitches.slice(1).map((n, i) => n - pitches[i]);
const NAMES = ['do', 'do#', 'ré', 'ré#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#', 'si'];
const name = (n) => NAMES[n % 12];
check(name(pitches[0]) === 'si' && intervals[0] === 1 && intervals[1] === 2 && intervals[2] === 2,
  `ouverture attendue si do ré mi (conjointe), trouvé ${pitches.slice(0, 4).map(name).join(' ')}`);
check(intervals[0] !== 5, 'levée si → mi (quarte ascendante) en tête : incipit du thème des films');

// ---- 3. cellules interdites (contours d'intervalles consécutifs) --------------------------------------------
const FORBIDDEN = [
  { contour: [3, -1, -2], label: 'mi–sol–fa#–mi (dessin de l’incipit)' },
  { contour: [7, -2, -3], label: 'quinte mi → si puis la → fa#' },
  { contour: [5, 3, -1], label: 'quarte puis tierce puis seconde descendante (variante de l’incipit)' },
];
for (const { contour, label } of FORBIDDEN) {
  for (let i = 0; i + contour.length <= intervals.length; i++) {
    const slice = intervals.slice(i, i + contour.length);
    if (slice.every((v, k) => v === contour[k])) {
      const where = pitches.slice(i, i + contour.length + 1).map(name).join(' ');
      check(false, `cellule interdite ${label} à la note ${i + 1} : ${where}`);
    }
  }
}
// En hauteurs absolues aussi (mi sol fa# mi = 76 79 78 76 à toute octave, si la fa# = 71 69 66).
const ABS = [[4, 7, 6, 4], [11, 9, 6]];
for (const cell of ABS) {
  for (let i = 0; i + cell.length <= pitches.length; i++) {
    if (cell.every((pc, k) => pitches[i + k] % 12 === pc)) {
      check(false, `suite absolue interdite ${cell.map((pc) => NAMES[pc]).join(' ')} à la note ${i + 1}`);
    }
  }
}

// ---- bilan ---------------------------------------------------------------------------------------------------
console.log(`${notes.length} notes, ${totalBeats} temps, ${intervals.length} intervalles analysés (${soundPath})`);
if (failures.length) {
  for (const f of failures) console.error('ÉCHEC : ' + f);
  process.exit(1);
}
console.log('OK : aucune citation du thème des films, structure 24 × 3/4 respectée.');
