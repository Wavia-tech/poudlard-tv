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
//      intervals: E–G–F#–E (+3 −1 −2), B–A–F# preceded by a fifth (+7 −2 −3), and the +5 +3 −1 variant;
//   4. the background music file: app/assets/music/ambiance.ogg present and under 24 MB, no other ambiance.* left,
//      probed first, probed with preload 'metadata', and never decoded whole (no decodeAudioData in sound.js);
//   5. the levels (round 4, "the music is too low against the effects"): the file's el.volume (FILE_DB) is between
//      −6 and 0 dB, the cues' CUE_PEAK_DB is no higher than −30, and, when ffmpeg is on the PATH, the file's first 12 s
//      and its whole level are printed. The opening is not a failure: the owner's recording is shipped as it is, not
//      levelled, and it opens well under its average (docs/MUSIC.md).
// Everything is re-readable: the melody is written note by note in sound.js.
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// ---- 4. the background music file (the owner's recording in Ogg Opus at 80 kbit/s, 19 MB) ---------------------
// The file is shipped in the APK: it must stay small, it must be the first format probed, the probe must read the
// header only, and the music must be streamed by an <audio> (a decoded 30-minute buffer would weigh ≈ 1.3 GB).
const musicDir = resolve(here, '..', 'app', 'assets', 'music');
const ogg = resolve(musicDir, 'ambiance.ogg');
let oggSize = -1;
try { oggSize = statSync(ogg).size; } catch (e) { /* missing */ }
check(oggSize > 0, `app/assets/music/ambiance.ogg is missing`);
check(oggSize < 24_000_000, `ambiance.ogg weighs ${oggSize} bytes, the budget is 24 MB`);
const filesBlock = text.slice(text.indexOf('const MUSIC_FILES = ['), text.indexOf('];', text.indexOf('const MUSIC_FILES = [')));
check(/^\s*\{\s*src:\s*'assets\/music\/ambiance\.ogg'/m.test(filesBlock.split('\n')[1] || ''), 'MUSIC_FILES must probe assets/music/ambiance.ogg first');
check(text.includes("el.preload = 'metadata'"), "the probe must use preload = 'metadata' (never download the whole file to probe it)");
check(!/decodeAudioData\s*\(/.test(text), 'decodeAudioData is forbidden in sound.js: the music is streamed by an <audio> element');
for (const big of ['ambiance.mp3', 'ambiance.m4a', 'ambiance.wav', 'ambiance.flac']) {
  let sz = -1; try { sz = statSync(resolve(musicDir, big)).size; } catch (e) { /* absent: good */ }
  check(sz < 0, `app/assets/music/${big} is still there (${sz} bytes): only ambiance.ogg is shipped`);
}

// ---- 5. levels ------------------------------------------------------------------------------------------------
const dbConst = (name) => { const m = text.match(new RegExp('^const ' + name + ' = (-?[0-9]+(?:[.][0-9]+)?);', 'm')); return m ? Number(m[1]) : NaN; };
const masterDb = dbConst('MASTER_DB'), fileDb = dbConst('FILE_DB'), cueDb = dbConst('CUE_PEAK_DB');
check(Number.isFinite(masterDb) && Number.isFinite(fileDb) && Number.isFinite(cueDb), 'MASTER_DB, FILE_DB and CUE_PEAK_DB must be plain numeric constants in sound.js');
check(fileDb >= -6, `FILE_DB = ${fileDb} dB: el.volume is the file's whole level, below −6 dB it sits far under TV level again`);
check(fileDb <= 0, `FILE_DB = ${fileDb} dB: el.volume cannot go above 1`);
check(cueDb <= -30, `CUE_PEAK_DB = ${cueDb}: above −30 dBFS the cues jump out over the music`);
let opening = 'skipped (no ffmpeg on the PATH)';
const rmsOf = (args) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args, '-i', ogg, '-af', 'astats=measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  const m = (r.stderr || '').match(/RMS level dB:\s*(-?[\d.]+)/g);
  return m ? Number(m[m.length - 1].split(':')[1]) : null;
};
if (oggSize > 0) {
  const head = rmsOf(['-t', '12']), whole = rmsOf([]);
  if (head !== null && whole !== null) {
    opening = `first 12 s ${head.toFixed(1)} dBFS RMS, whole file ${whole.toFixed(1)} dBFS RMS`;
  }
}

// ---- summary -------------------------------------------------------------------------------------------------
console.log(`${notes.length} notes, ${totalBeats} beats, ${intervals.length} intervals analyzed (${soundPath})`);
if (failures.length) {
  for (const f of failures) console.error('FAIL: ' + f);
  process.exit(1);
}
console.log('OK: no quotation of the films\' theme, 24 × 3/4 structure respected.');
console.log(`OK: ambiance.ogg ${(oggSize / 1e6).toFixed(2)} MB, probed first with preload 'metadata', streamed.`);
console.log(`OK: levels MASTER_DB ${masterDb}, FILE_DB ${fileDb}, CUE_PEAK_DB ${cueDb}; opening: ${opening}.`);
