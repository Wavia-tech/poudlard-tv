// Checks the originality of the background waltz (MELODY in app/js/sound.js) against the constraints written
// in docs/MUSIC.md: no quotation of Hedwig's Theme (J. Williams), itself a waltz in E minor.
//
// Usage: node tools/test-sound.mjs        → exit code 0 if everything passes, 1 otherwise, with details.
//
// The script reads sound.js as TEXT (it does not import the module, which depends on the browser) and extracts
// the MELODY constant from it: a list of [MIDI note, duration in beats]. It then checks:
//   1. the structure: 24 bars of 3 beats = 72 beats, integer durations (quarter and half notes, never dotted);
//   2. the opening: the melody starts on the downbeat with a stepwise rise B C D E
//      (no B → E pickup, the ascending fourth in anacrusis that opens the films' theme);
//   3. the forbidden cells, in absolute pitches AND at every transposition, in the sequence of consecutive
//      intervals: E–G–F#–E (+3 −1 −2), B–A–F# preceded by a fifth (+7 −2 −3), and the +5 +3 −1 variant.
// Everything is re-readable: the melody is written note by note in sound.js.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const soundPath = resolve(here, '..', 'app', 'js', 'sound.js');
const text = readFileSync(soundPath, 'utf8');

// ---- MELODY extraction ---------------------------------------------------------------------------------------
const start = text.indexOf('const MELODY = [');
if (start < 0) { console.error('MELODY not found in ' + soundPath); process.exit(1); }
const end = text.indexOf('];', start);
const block = text.slice(start, end);
// Each note: [midi, duration]. End-of-line comments (// 1 Em …) are ignored by the regex.
const notes = [...block.matchAll(/\[\s*(\d+)\s*,\s*(\d+(?:\.\d+)?)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// ---- 1. structure --------------------------------------------------------------------------------------------
const totalBeats = notes.reduce((s, [, d]) => s + d, 0);
check(notes.length > 0, 'no note extracted');
check(totalBeats === 72, `72 beats expected (24 bars of 3/4), found ${totalBeats}`);
check(notes.every(([, d]) => Number.isInteger(d) && d >= 1), 'non-integer durations: dotted note or eighth note forbidden');
check(notes.every(([n]) => n >= 48 && n <= 96), 'note outside the expected range (C2 to C6)');

// ---- 2. opening ----------------------------------------------------------------------------------------------
const pitches = notes.map(([n]) => n);
const intervals = pitches.slice(1).map((n, i) => n - pitches[i]);
const NAMES = ['do', 'do#', 'ré', 'ré#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#', 'si'];
const name = (n) => NAMES[n % 12];
check(name(pitches[0]) === 'si' && intervals[0] === 1 && intervals[1] === 2 && intervals[2] === 2,
  `expected opening si do ré mi (B C D E, stepwise), found ${pitches.slice(0, 4).map(name).join(' ')}`);
check(intervals[0] !== 5, 'B → E pickup (ascending fourth) at the start: incipit of the films\' theme');

// ---- 3. forbidden cells (contours of consecutive intervals) --------------------------------------------------
const FORBIDDEN = [
  { contour: [3, -1, -2], label: 'E–G–F#–E (shape of the incipit)' },
  { contour: [7, -2, -3], label: 'fifth E → B then A → F#' },
  { contour: [5, 3, -1], label: 'fourth, then third, then descending second (variant of the incipit)' },
];
for (const { contour, label } of FORBIDDEN) {
  for (let i = 0; i + contour.length <= intervals.length; i++) {
    const slice = intervals.slice(i, i + contour.length);
    if (slice.every((v, k) => v === contour[k])) {
      const where = pitches.slice(i, i + contour.length + 1).map(name).join(' ');
      check(false, `forbidden cell ${label} at note ${i + 1}: ${where}`);
    }
  }
}
// In absolute pitches too (E G F# E = 76 79 78 76 at any octave, B A F# = 71 69 66).
const ABS = [[4, 7, 6, 4], [11, 9, 6]];
for (const cell of ABS) {
  for (let i = 0; i + cell.length <= pitches.length; i++) {
    if (cell.every((pc, k) => pitches[i + k] % 12 === pc)) {
      check(false, `forbidden absolute sequence ${cell.map((pc) => NAMES[pc]).join(' ')} at note ${i + 1}`);
    }
  }
}

// ---- summary -------------------------------------------------------------------------------------------------
console.log(`${notes.length} notes, ${totalBeats} beats, ${intervals.length} intervals analyzed (${soundPath})`);
if (failures.length) {
  for (const f of failures) console.error('FAIL: ' + f);
  process.exit(1);
}
console.log('OK: no quotation of the films\' theme, 24 × 3/4 structure respected.');
