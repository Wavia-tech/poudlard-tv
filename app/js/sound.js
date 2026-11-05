// Poudlard TV soundtrack: a film-score celesta synthesized with Web Audio, plus the owner's background music file.
//
// Two layers, a single voice:
//   1. the CUES (short phrases, one to six notes with tails of 1.5 to 3.5 s) played on every interaction;
//   2. the BACKGROUND MUSIC (ambience), looping under the cues (the owner's file assets/music/ambiance.ogg, or an
//      original synthesized waltz), which ducks under every cue and goes on hold (Nox, app launch, hidden page).
//
// ---------------------------------------------------------------------------------------------------------------
// 1. Cues
// ---------------------------------------------------------------------------------------------------------------
// Principle: every interaction plays a very short "cue", all in the same key (E minor) and with the same timbre,
// so that the interface has a single voice. The melodies are ORIGINAL: no quotation of Hedwig's Theme nor of any
// melody from the films (rights). In particular, no cue opens with the B → E pickup followed by G
// (the incipit of Hedwig's Theme). They only share the "music box in a great hall" spirit:
// celesta, long reverb, clear notes.
//
// Timbre (per note): a glass harmonica with a harp's harmonics. Harmonic partials only (x1, x2, x3, x4, the
// highs whispering and dying first), a second fundamental a few cents away for the slow sheen of rubbed glass,
// 30–60 ms attack (a glass that is stroked, never struck), exponential tails of 1.5 to 3.5 s. No hammer noise.
// Under lumos, enter and return only: a breath of band-passed air that swells and fades beneath the notes.
//
// Levels: the cues are a presence, not a signal. NOTE_SCALE is computed from the master gain so that a note
// at g = 1 peaks at CUE_PEAK_DB at the output before the hall; the phrases are written in that scale, the richest
// (lumos) summing near CUE_PEAK_DB, the quietest (move, one note) about 7 dB lower. Round 4 (first test on the
// real TV, "the music is too low against the effects"): the whole mix came up toward TV programme level and the
// music most of all, so the cues now sit just above it instead of jumping out (see "Volume").
//
// Space: ConvolverNode with a generated impulse response (decaying white noise 3.6 s, two decorrelated channels,
// low-pass filtered at 5 kHz; 1.8 s and one channel on a low-RAM TV, Platform.device().lowRam), dry/wet mix 0.5/0.5,
// gentle compressor, master volume −6 dB.
//
// Baked cues: a key must cost next to nothing, and a cue's tail must not take a core from the animation it goes with.
// So the cues are rendered once ahead of time, hall and compressor included, by one OfflineAudioContext, end to end,
// then cut into one buffer per cue (bakeCues: the rendering runs off the main thread; building its graph is the
// main-thread part, spread over idle moments, a few ms each). A key then starts one AudioBufferSourceNode into the
// master, on the key's own task, so sound and picture stay together: no oscillator, no gain node, no convolver running.
// About 1 MB per cue on a low-RAM TV, 8 MB in all (mono, the short hall), three times that in stereo, in the one buffer the
// rendering made: a cue plays its stretch of it, and no copy doubles it until the next garbage collection; freed by
// 'poudlard:trim'. A slight detune per play keeps the sheen of the live notes.
// A cue asked for before the bake is done (the first seconds), and the celesta waltz always, play live through the
// graph: oscillators, and the hall, built on the first need and wired in only while something rings through it. A
// convolver left connected keeps its convolution threads busy forever, even on silence: on the TV (round 5) the two
// "Reverb convolution" threads cost about 21 % of a core each with nothing playing.
//
// Robustness: if AudioContext does not exist (Node, old browser), everything is silent without errors.
//
// Unlocking: the module keeps a `gestured` flag ("audio is allowed"). It is set either by the first keydown /
// pointerdown / touchstart, or at start-up when the browser lets a context run without a gesture: the Android
// WebView does (setMediaPlaybackRequiresUserGesture(false)), so on the TV the music starts by itself. At start-up
// (`init()` or `setEnabled(true)`, sound on, music not 'aucune'), the module probes the file at once (metadata only)
// and creates the context in an idle moment; if the context runs (or its resume() resolves), audio is unlocked and
// the music fades in. A desktop browser keeps that context suspended: nothing sounds until the first key, as before,
// and the same context is resumed inside that key's handler. Nothing here ever blocks the UI.
// A cue requested while the context is resuming (resume() in progress) is kept pending (only one, the last)
// and played as soon as the context runs; a cue requested on a suspended context with no resume in progress is ignored.
// So nothing piles up during sleep and nothing fires in a burst on wake.
//
// Idle and memory: when nothing has sounded for IDLE_SUSPEND_MS (no cue in flight, no celesta waltz), the context is
// suspended (no audio thread at all; the next cue or the waltz resumes it). The music FILE does not keep it awake: it
// plays outside Web Audio (see 2a). On the window event
// 'poudlard:trim', if nothing is sounding, the context is CLOSED (hall impulse, air noise and graph freed) and the
// <audio> element is emptied; both are rebuilt on demand. Nothing in this module keeps a decoded music buffer:
// the file is always streamed by an <audio> element, never decodeAudioData.
//
// Confirmations belong to the screens: setEnabled(true) plays nothing by itself (it is the home screen's Sound bar,
// or the Settings' Sounds row, that plays its `toggle`).
//
// ---------------------------------------------------------------------------------------------------------------
// 2. Background music
// ---------------------------------------------------------------------------------------------------------------
// Two sources:
//
//   (a) THE FILE: `assets/music/ambiance.ogg` (Ogg Opus, the owner's recording from 29:45 to its end: 29:37, stereo,
//       80 kbit/s, 19 MB, not levelled; see docs/MUSIC.md),
//       then `.mp3` or `.m4a` (MUSIC_FILES, probed in that order). Versioned in the repo at the owner's explicit
//       request (see DISCLAIMER.md and docs/MUSIC.md). It is probed with an <audio> (preload "metadata": the probe
//       never downloads the file); if missing, no visible error, we fall through to (b). Streamed by that <audio>
//       in a loop and played by it ALONE, outside the Web Audio graph (no MediaElementSource, no compressor, no
//       hall): its level is el.volume = FILE_VOLUME, and its fades and its ducking are el.volume stepped every
//       FILE_STEP_MS while they last (no timer otherwise). Round 5 on the TV: routed through the graph, the music
//       alone kept the audio thread at about 70 % of a core, plus the hall. In the APK the element reads the file
//       through WebAssets.java, whose byte ranges follow what the WebView really does (docs/MUSIC.md): a wrong
//       answer there and <audio> fails silently, the waltz takes over, and it costs a core.
//
//   (b) ORIGINAL COMPOSITION synthesized by the celesta engine: a slow waltz in E minor, 3/4, 66 to the quarter note,
//       24 bars (≈ 65 s) in a seamless loop, composed for this project and published under the repo's license (MIT).
//       Three voices:
//         - celesta: the melody (the cues' timbre, hence the same voice as the interface);
//         - harp: arpeggiated counter-melody in eighth notes (six per bar, bass then broken chord);
//         - strings: a soft pad (two sawtooths detuned ±7 cents per note, 820 Hz low-pass filter,
//           0.9 s attack, 0.9 s release), held on every chord.
//       Light rubato: the tempo breathes by ±3 % over a 12-bar cycle (identical on every loop, so the seam
//       is invisible), plus ±0.4 % per beat and ±8 ms on every celesta note.
//
//       Originality constraints observed (checkable note by note in MELODY; Hedwig's Theme, J. Williams,
//       is also a waltz in E minor, hence the vigilance):
//         - no B → E pickup (ascending fourth as an anacrusis) at the head of a phrase: the melody starts on the
//           downbeat, with a stepwise rise B C D;
//         - never the cell E–G–F#–E (the characteristic shape of the incipit) nor the cell B–A–F#, in absolute
//           pitches AND at any transposition: no contour +3 −1 −2 (nor +5 +3 −1, nor +7 −2 −3) in the sequence of
//           consecutive intervals;
//         - no dotted figure (dotted eighth–sixteenth): quarter-note and half-note rhythm only;
//         - no rising fifth E → B followed by A → F#;
//         - tempo 66 (slow, lullaby) versus ≈ 160 for the films' theme.
//       These constraints are checked by script (see tools/test-sound.mjs if present, otherwise the verification
//       script described in docs/MUSIC.md): analysis of the 48 notes, 72 beats, consecutive intervals.
//
// Volume: celesta at AMBIENT_DB below the master, file at FILE_VOLUME (el.volume). Ducking: on every cue, the ambience drops to
// half in 20 ms, stays there 300 ms, then comes back in 450 ms; so the cues always sit on top. Fade-in 3 s
// (2.5 s for the celesta), fade-out 300 ms (sound muted, mode change, put on hold).
// Measured at the output in headless Chrome (round 4, TV viewport, autoplay allowed as in the WebView; RMS over
// 1 s blocks, "peak" = sample peak): celesta waltz ≈ −32 dBFS RMS; cue sample peaks lumos / enter / return ≈ −20,
// error / wake / nox / confirm −23 to −25, toggle −25, move −27 dBFS, over a music ducked 6 dB while they ring. The
// file's level at the output follows from its own numbers and el.volume (see FILE_DB). Before (round 3 and the first
// round-4 build) the music opened near −62 dBFS RMS and stayed under −40, 25 to 30 dB below TV programme level: the
// owner turned the TV up to hear it, then every cue jumped out.
//
// Modes (Sound.ambient): 'auto' (file if it exists, otherwise celesta) · 'fichier' (the same, chosen by name) ·
// 'celesta' · 'aucune'; these are exactly
// the values accepted by config.music (config.js). An explicit ambient(mode) call durably OVERRIDES
// config.music until the next call; ambient(null) goes back to the config. Without an explicit call, the mode comes
// from config.music (read defensively: 'auto' if the field does not exist).
//
// Hold (independent of the mode): Sound.ambientHold(true, reason) silences the ambience without touching the mode,
// Sound.ambientHold(false, reason) restarts it once no reason remains. Planned reasons: 'nox' (sleep),
// 'launch' (an app is launching), 'hidden' (hidden page, set by the module itself on visibilitychange).
// Starts by itself at start-up where the browser allows it (the TV), otherwise on the first user gesture, through
// init() (already called by the screens via Fx.initAudio) or setEnabled(true); setEnabled(false) also cuts it.
//
// API: Sound.init() · Sound.setEnabled(bool) · Sound.cue(name, { dir }) · Sound.isEnabled() · Sound.names()
//      Sound.ambient(mode | null) · Sound.ambientHold(on, reason) · Sound.ambientState()

import { getConfig } from './config.js';
import { Platform } from './platform.js';

const MASTER_DB = -6;                        // master volume
const MASTER = Math.pow(10, MASTER_DB / 20); // ≈ 0.5 (was −14 dB until round 4: the whole mix sat far below TV level)
const DRY = 0.5, WET = 0.5;                  // dry / wet mix: half hall, the notes bloom instead of striking
const REVERB_SECONDS = 3.6;
const REVERB_SECONDS_LOW = 1.8;              // a low-RAM TV: half the hall, one channel (one convolution thread, a quarter of the work)
const REVERB_LOWPASS_HZ = 5000;
const REVERB_PREDELAY = 0.018;               // small pre-delay: the sound leaves before the hall answers
const MAX_VOICES = 40;                       // beyond this, new notes are ignored (never any saturation)
const DEDUPE_MS = 30;                        // the same cue requested again within this window is ignored (screen duplicates)

// Glass partials: frequency ratio, relative level, duration factor (the highs die first), optional detune (cents).
// Harmonic only, like a harp's string or a wine glass's rim: nothing clangs. The second entry doubles the
// fundamental a few cents away: the two beat slowly (about one beat per second around E5), the sheen of
// rubbed glass, without any chorus effect.
const PARTIALS = [
  { ratio: 1, level: 1.00, decay: 1.00 },
  { ratio: 1, level: 0.35, decay: 0.90, cents: 2.6 },
  { ratio: 2, level: 0.22, decay: 0.70 },
  { ratio: 3, level: 0.07, decay: 0.45 },
  { ratio: 4, level: 0.025, decay: 0.30 },
];
const PARTIAL_SUM = PARTIALS.reduce((s, p) => s + p.level, 0);   // ≈ 1.665: worst-case coherent peak of one note at g = 1

// Target peak of the richest cue at the output, measured on the dry path (the hall adds a diffuse tail, not a peak).
// A note at g = 1 reaches it if its partials add coherently: peak = g × PARTIAL_SUM × NOTE_SCALE × DRY × MASTER
// = 10^(CUE_PEAK_DB / 20). They never quite do (the sheen drifts, the highs die first), so the phrases below are
// written a little above g = 0.5 per note. Was −34 until round 3, −40 in the first round-4 build, now −33 over a
// music brought up by about 30 dB at its opening (≈ 10 dB on the body).
const CUE_PEAK_DB = -33;
const NOTE_SCALE = Math.pow(10, CUE_PEAK_DB / 20) / (PARTIAL_SUM * DRY * MASTER);   // ≈ 0.054
const ATTACK = 0.045;                        // s, default attack of a cue note (30–60 ms: stroked glass)

// Air: a breath of band-passed noise that swells under lumos, enter and return. AIR_LEVEL is the gain applied to
// the filtered noise (its RMS is far below 1): about −44 dBFS at the output, felt more than heard.
const AIR_HZ = 1700, AIR_Q = 0.9, AIR_LEVEL = 0.07;
const AIR_BUFFER_SECONDS = 2;

// Pitches as MIDI numbers (A4 = 69 = 440 Hz). Key: E minor (E, F#, G, A, B, C, D).
const E3 = 52, E4 = 64, G4 = 67, B4 = 71, C5 = 72, D5 = 74, E5 = 76, FS5 = 78, G5 = 79, A5 = 81, B5 = 83, D6 = 86, E6 = 88;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// The 9 cues: list of notes { n: MIDI pitch, t: start (s), d: decay (s), g: level 0–1, a?: attack (s) },
// plus an optional air swell { air: true, t, d, g }. `g` is in the NOTE_SCALE scale (1 = CUE_PEAK_DB, one note, coherent).
// `dir` (−1 | 1) picks the pitch of `move` (a touch higher to the right than to the left).
// Every phrase is original and in E minor; none opens with the B → E pickup of the films' theme, none even
// contains a rising B → E, and none carries the cells E–G–F#–E or B–A–F# at any transposition.
// Total durations (last tail included): move 1.7 s · toggle 1.6 s · confirm 2.4 s · enter/return 3.2 s ·
// wake 2.6 s · error 2.6 s · nox 4 s · lumos 4.4 s.
const CUES = {
  // One soft note: E to the left, G to the right. A breath on the glass, nothing more.
  move: (dir) => [{ n: dir < 0 ? E5 : G5, t: 0, d: 1.6, g: 0.54 }],
  // Going down into a section: D, B, G, the relative major settling downward, with a breath of air beneath.
  enter: () => [
    { n: D6, t: 0,    d: 2.0, g: 0.68 },
    { n: B5, t: 0.2,  d: 2.3, g: 0.64 },
    { n: G5, t: 0.42, d: 2.7, g: 0.60 },
    { air: true, t: 0, d: 1.6, g: 0.8 },
  ],
  // Going back up: E, G, B, the tonic chord unfolding upward (no B → E pickup, no leap back to E).
  return: () => [
    { n: E5, t: 0,    d: 2.0, g: 0.64 },
    { n: G5, t: 0.2,  d: 2.3, g: 0.64 },
    { n: B5, t: 0.42, d: 2.7, g: 0.64 },
    { air: true, t: 0, d: 1.6, g: 0.8 },
  ],
  // The light rises: a slow glass bloom over a low E (E, G, D, G, B, D: an E minor seventh opening upward,
  // never a B → E), the longest tails of all, and a breath of air that swells with it. The richest cue.
  lumos: () => [
    { n: E4, t: 0,    d: 3.5, g: 0.66, a: 0.06 },
    { n: G4, t: 0.17, d: 3.2, g: 0.52, a: 0.06 },
    { n: D5, t: 0.34, d: 3.0, g: 0.48 },
    { n: G5, t: 0.51, d: 2.9, g: 0.48 },
    { n: B5, t: 0.68, d: 2.8, g: 0.48 },
    { n: D6, t: 0.85, d: 2.6, g: 0.44 },
    { air: true, t: 0, d: 2.6, g: 1 },
  ],
  // The house goes to bed: B, G, E sinking, then a low E that lingers, each note softer than the last.
  nox: () => [
    { n: B4, t: 0,    d: 2.4, g: 0.64, a: 0.06 },
    { n: G4, t: 0.3,  d: 2.6, g: 0.52, a: 0.06 },
    { n: E4, t: 0.62, d: 3.0, g: 0.44, a: 0.06 },
    { n: E3, t: 1.0,  d: 3.0, g: 0.30, a: 0.06 },
  ],
  // The house wakes: D, F#, A, a bright major chord rising at dawn (the chord on the seventh degree).
  wake: () => [
    { n: D5, t: 0,    d: 2.0, g: 0.60 },
    { n: FS5, t: 0.18, d: 2.2, g: 0.56 },
    { n: A5, t: 0.36, d: 2.4, g: 0.52 },
  ],
  // The Howler: a sigh, C sinking to B over a low E, gentle; the red envelope does the shouting.
  error: () => [
    { n: C5, t: 0,    d: 1.8, g: 0.56 },
    { n: B4, t: 0.22, d: 2.2, g: 0.50 },
    { n: E4, t: 0.1,  d: 2.4, g: 0.32, a: 0.06 },
  ],
  // A single soft note, high and short: checkmark or hourglass.
  toggle: () => [{ n: B5, t: 0, d: 1.5, g: 0.64 }],
  // "Done": G then D above it, an open fifth placed almost together.
  confirm: () => [{ n: G5, t: 0, d: 1.9, g: 0.60 }, { n: D6, t: 0.12, d: 2.2, g: 0.57 }],
};

// When a cue's last tail ends, in seconds from its start.
function cueEnd(notes) {
  let end = 0;
  for (const note of notes) end = Math.max(end, note.t + (note.air ? note.d : (note.a || ATTACK) + note.d));
  return end;
}
// What the bake renders: every cue, `move` with its two pitches.
const BAKE_CUES = ['move:1', 'move:-1', 'enter', 'return', 'toggle', 'confirm', 'lumos', 'wake', 'error', 'nox'];
const BAKE_IDLE_MS = 1500;                   // an idle moment, or this long at most

// ---------------------------------------------------------------------------------------------------------------
// Background music score (slow waltz, E minor, 3/4)
// ---------------------------------------------------------------------------------------------------------------
// Was −22 until round 3 (≈ −52 LUFS at the output, barely there), −12 in the first round-4 build: now ≈ −32 dBFS RMS
// at the output, just under the file.
const AMBIENT_DB = -6;
const AMBIENT = Math.pow(10, AMBIENT_DB / 20);   // ≈ 0.5: level of the synthesized waltz
// The file plays outside the graph, so el.volume is its whole level: FILE_DB is the one knob, each dB here is a dB at
// the output. The owner's recording is not levelled: mean −23.5 dB, −20 LUFS integrated, peaks at 0 dBFS, 18 LU of
// range (30 s blocks from −17 to −40 dB; it opens near −41 dB for its first half minute and is at −30 by the second).
// The previous file sat at −18 LUFS, at el.volume ≈ 0.53. So near the top of the element's range: ≈ −24.4 dB mean at
// the output, about what the previous one gave. Its peaks stay under full scale, and the cues are not touched.
const FILE_DB = -0.9;
const AMB_FADE_IN = 2.5;                         // s (celesta)
const FILE_FADE_IN = 3;                          // s (file)
const AMB_FADE_OUT = 0.3;                        // s
const IDLE_SUSPEND_MS = 12000;                   // no cue and no celesta for that long: suspend the context
// The file plays outside Web Audio: el.volume carries its level, and fades and ducking step it every FILE_STEP_MS
// while they last.
const FILE_VOLUME = Math.pow(10, FILE_DB / 20);  // ≈ 0.9
const FILE_STEP_MS = 40;
const BOOT_DELAY_MS = 700;                       // start-up context creation, in an idle moment after the first frames
const DUCK_LEVEL = 0.5, DUCK_HOLD = 0.3, DUCK_BACK = 0.45;   // ducking under a cue
const AMB_MAX_VOICES = 64;                       // ambience's own ceiling (independent of the cues)
const AMB_REVERB_SEND = 0.5;                     // share of the ambience sent into the hall (celesta)
// Waltz melody: its fundamental keeps the peak it always had (0.112 before the ambience bus), whatever NOTE_SCALE is.
const AMB_MELODY_G = 0.112 / NOTE_SCALE;         // ≈ 2.1
// File: paths relative to index.html / tv.html, probed in this order (.ogg Opus is the shipped format).
const MUSIC_FILES = [
  { src: 'assets/music/ambiance.ogg', type: 'audio/ogg; codecs="opus"' },
  { src: 'assets/music/ambiance.mp3', type: 'audio/mpeg' },
  { src: 'assets/music/ambiance.m4a', type: 'audio/mp4' },
];
const PROBE_TIMEOUT_MS = 4000;                   // beyond this, the file is deemed absent
const SCHED_MS = 200, LOOKAHEAD = 0.6;           // scheduler: every 200 ms, 600 ms ahead
const BPM = 66, BEAT = 60 / BPM;                 // quarter note ≈ 0.909 s, bar ≈ 2.73 s, 24 bars ≈ 65 s
const BEATS_PER_BAR = 3;
const RUBATO = 0.03;                             // ±3 % over a 12-bar cycle
// The same values as config.music (config.js, sanitize): nothing exists here that cannot be set on screen.
const AMBIENT_MODES = ['auto', 'fichier', 'celesta', 'aucune'];   // 'fichier': the personal file, chosen by name in the settings

// Harmonic grid: 24 bars, three phrases of eight. The last one (E minor) leads back to the first (E minor):
// the loop does not "jump".
const PROGRESSION = [
  'Em', 'Em', 'C', 'D', 'Em', 'C', 'Am', 'B7',
  'Em', 'Bm', 'C', 'G', 'Am', 'Em', 'B7', 'Em',
  'C', 'G', 'D', 'Em', 'C', 'Am', 'B7', 'Em',
];
// Harp: five pitches per chord (bass, fifth, third, fifth, octave), played in eighth notes according to HARP_PATTERN.
const HARP = {
  Em: [52, 59, 67, 71, 76], G: [55, 62, 71, 74, 79], C: [48, 55, 64, 67, 72], D: [50, 57, 66, 69, 74],
  Am: [45, 52, 60, 64, 69], Bm: [47, 54, 62, 66, 71], B7: [47, 54, 63, 69, 71],
};
const HARP_PATTERN = [0, 1, 2, 3, 4, 3];
// Strings: close triad around E4, held for the whole duration of the chord.
const PAD = {
  Em: [64, 67, 71], G: [62, 67, 71], C: [60, 64, 67], D: [62, 66, 69], Am: [60, 64, 69], Bm: [62, 66, 71], B7: [63, 66, 69],
};
// Celesta melody: [MIDI pitch, duration in beats]. 72 beats = 24 bars. Comments: one line per bar.
const MELODY = [
  [71, 1], [72, 1], [74, 1],   //  1 Em  B C D: stepwise rise (no B→E pickup)
  [76, 3],                     //  2 Em  E held
  [79, 1], [81, 1], [84, 1],   //  3 C   G A C
  [81, 2], [78, 1],            //  4 D   A F# (not "B A": G A C B A would be E G F# E transposed)
  [79, 2], [76, 1],            //  5 Em  G E
  [84, 2], [83, 1],            //  6 C   C B
  [81, 2], [84, 1],            //  7 Am  A C
  [83, 3],                     //  8 B7  B held
  [86, 2], [88, 1],            //  9 Em  D E (upper octave; no B→E leap after the held B)
  [83, 2], [86, 1],            // 10 Bm  B D
  [84, 2], [88, 1],            // 11 C   C E
  [86, 2], [83, 1],            // 12 G   D B
  [84, 1], [83, 1], [81, 1],   // 13 Am  C B A: stepwise descent
  [79, 2], [76, 1],            // 14 Em  G E
  [78, 2], [75, 1],            // 15 B7  F# D# (leading tone)
  [76, 3],                     // 16 Em  E held
  [84, 2], [79, 1],            // 17 C   C G
  [83, 2], [79, 1],            // 18 G   B G
  [81, 2], [78, 1],            // 19 D   A F#
  [79, 2], [76, 1],            // 20 Em  G E
  [84, 2], [86, 1],            // 21 C   C D
  [88, 2], [84, 1],            // 22 Am  E C
  [81, 1], [78, 1], [75, 1],   // 23 B7  A F# D#: descending arpeggio
  [76, 3],                     // 24 Em  E held, then the loop restarts on B C D
];

// Compiled score: for each beat of the loop, the list of events { off (fraction of the beat), kind, … }.
function buildScore() {
  const total = PROGRESSION.length * BEATS_PER_BAR;
  const beats = Array.from({ length: total }, () => []);
  let b = 0;
  for (const [n, len] of MELODY) {
    const k = Math.floor(b) % total;
    beats[k].push({ off: b - Math.floor(b), kind: 'mel', n, len });
    b += len;
  }
  PROGRESSION.forEach((ch, bar) => {
    const v = HARP[ch];
    HARP_PATTERN.forEach((idx, k) => beats[bar * BEATS_PER_BAR + Math.floor(k / 2)].push({ off: (k % 2) * 0.5, kind: 'harp', n: v[idx], strong: k === 0 }));
  });
  // Pad: one event per run of identical chords (continuous hold, no retriggering).
  let bar = 0;
  while (bar < PROGRESSION.length) {
    let end = bar + 1;
    while (end < PROGRESSION.length && PROGRESSION[end] === PROGRESSION[bar]) end++;
    beats[bar * BEATS_PER_BAR].push({ off: 0, kind: 'pad', notes: PAD[PROGRESSION[bar]], bars: end - bar });
    bar = end;
  }
  return beats;
}
const SCORE = buildScore();

// Harp partials (harmonic, the highs very short): a plucked string, not a struck bar.
const HARP_PARTIALS = [
  { ratio: 1, level: 1.00, decay: 1.00 },
  { ratio: 2, level: 0.45, decay: 0.60 },
  { ratio: 3, level: 0.20, decay: 0.40 },
  { ratio: 4, level: 0.08, decay: 0.30 },
];

let audio = null;        // AudioContext (null until the context has been created, or if Web Audio is missing)
let graph = null;        // { input, master, convolver, wet, dry, comp } once the graph is built
let noiseBuf = null;     // air noise (2 s, looped), shared by all air swells
let enabled = false;
const voices = new Set();   // cue notes in flight: { nodes: [...], stop() }
let armed = false;          // user-gesture listeners installed?
let gestured = false;       // has a user gesture happened? (nothing sounds before)
let resuming = null;        // resume() promise in progress, otherwise null
let pending = null;         // { name, dir }: the last cue requested during the resume (only one, no queue)
const lastAt = new Map();   // cue name → timestamp (ms) of its last playback, for deduplication
let bootTried = false;      // start-up unlock attempt already made?
let idleTimer = 0;          // pending "suspend when nothing sounds" check
let trimTimer = 0;          // pending retry of a 'poudlard:trim' that came while a cue was ringing
let hallUntil = 0;          // audio time until which a cue still rings through the hall (its tails + the hall's own)
let hallOffTimer = 0;       // pending check that cuts the hall's links once nothing rings through it
let lowRamCache = null;     // Platform.device().lowRam, read once
// The baked cues (head of this file): a key of BAKE_CUES → its AudioBuffer. `run` is the bake's token (a dropped
// context expires it); `busy` from its start, until a dropped context lets it start again.
const baked = new Map();
const bake = { run: 0, busy: false };

// Background music state.
const amb = {
  mode: null,          // mode requested by Sound.ambient(), otherwise null → config.music || 'auto'
  active: null,        // 'celesta' | 'fichier' | null (what is actually playing; 'fichier' is not a mode, it is a source)
  holds: new Set(),    // hold reasons ('nox', 'launch', 'hidden'…): as long as one remains, silence
  level: AMBIENT,      // target level of the active source (AMBIENT for the celesta, FILE_VOLUME for the file)
  bus: null,           // { mix, out, duck, rev } once built (celesta only: the file never enters the graph)
  voices: new Set(),   // ambience notes in flight (same shape as `voices`)
  timer: 0,            // scheduler setInterval (celesta)
  beat: 0,             // next beat to schedule (0..71)
  beatStart: 0,        // audio clock of that beat
  req: 0,              // token of the latest request (cancels an outdated probe)
  swap: 0,             // token of the deferred restart (source change)
  file: undefined,     // undefined: not yet probed · null: absent · HTMLAudioElement: present
  src: null,           // { src, type } of the file found (kept across a trim, so the re-probe goes straight to it)
  pos: 0,              // playback position (s) saved by a trim, restored by the next element
  probing: null,       // callbacks waiting during the probe
  filePending: false,  // play() refused (no gesture): retry on the next cue
  revOn: true,         // ambience → hall send connected?
  env: { from: 0, to: 0, t0: 0, t1: 0, duck: -1, timer: 0 },   // the file's el.volume: fade (ms clock), duck start, step timer
  visArmed: false,     // visibilitychange listener installed?
};

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function audioClass() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.AudioContext || g.webkitAudioContext || null;
}

// Defensive read of config.music: the field may not exist (config.js may or may not validate it).
function configuredMode() {
  try {
    const m = getConfig().music;
    return AMBIENT_MODES.includes(m) ? m : 'auto';
  } catch (e) { return 'auto'; }
}

function lowRam() {
  if (lowRamCache === null) { try { lowRamCache = Boolean(Platform.device().lowRam); } catch (e) { lowRamCache = false; } }
  return lowRamCache;
}
// The hall's length (s): REVERB_SECONDS, or REVERB_SECONDS_LOW on a low-RAM TV.
function hallSeconds() { return lowRam() ? REVERB_SECONDS_LOW : REVERB_SECONDS; }

// Impulse response: decaying white noise (−60 dB after hallSeconds()), two decorrelated channels (one on a low-RAM
// TV), one-pole low-pass filter applied twice (≈ 5 kHz), small pre-delay, normalized level.
function makeImpulse(ctx) {
  const secs = hallSeconds(), chans = lowRam() ? 1 : 2;
  const sr = ctx.sampleRate, len = Math.floor(sr * (secs + REVERB_PREDELAY));
  const buf = ctx.createBuffer(chans, len, sr);
  const pre = Math.floor(sr * REVERB_PREDELAY);
  const alpha = 1 - Math.exp(-2 * Math.PI * REVERB_LOWPASS_HZ / sr);
  for (let ch = 0; ch < chans; ch++) {
    const d = buf.getChannelData(ch);
    let y1 = 0, y2 = 0, energy = 0;
    const k = Math.exp(-6.91 / (secs * sr));                       // per-sample decay: −60 dB after `secs`
    let env = 1;                                                   // (one multiply per sample, no exp: cheap on a TV)
    for (let i = pre; i < len; i++) {
      const x = (Math.random() * 2 - 1) * env;
      env *= k;
      y1 += alpha * (x - y1);                                      // first pole
      y2 += alpha * (y1 - y2);                                     // second pole (steeper slope)
      d[i] = y2;
      energy += y2 * y2;
    }
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 1;          // unit energy: the wet mix stays predictable
    for (let i = pre; i < len; i++) d[i] *= norm;
  }
  return buf;
}

// Air buffer: white noise, looped under the band-pass of the air swell (never heard raw).
function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * AIR_BUFFER_SECONDS);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Built once per context: notes → [dry 0.5] + [convolver → wet 0.5] → gentle compressor → master (−6 dB) → output.
// The convolver gets its impulse (and the air its noise) only in ensureHall(), on the first live note. Its two links
// (input → convolver, convolver → wet) exist only while something rings through it (hallNeed / hallCheck).
function buildGraph(ctx) {
  const input = ctx.createGain(); input.gain.value = 1;
  const dry = ctx.createGain(); dry.gain.value = DRY;
  const wet = ctx.createGain(); wet.gain.value = WET;
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5;
  comp.attack.value = 0.008; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = enabled ? MASTER : 0;
  input.connect(dry).connect(comp);
  wet.connect(comp);
  comp.connect(master).connect(ctx.destination);
  return { input, master, convolver, wet, dry, comp, hall: false, linked: false };
}

// The hall impulse (≈ 1.4 MB stereo 3.6 s, ≈ 0.35 MB mono 1.8 s on a low-RAM TV; a few ms of work) and the air noise:
// built on the first live cue or the first celesta bar, never in advance (the file and the baked cues never need them).
function ensureHall() {
  if (!audio || !graph || graph.hall) return;
  graph.hall = true;
  try { graph.convolver.buffer = makeImpulse(audio); } catch (e) { /* dry only */ }
  try { noiseBuf = makeNoise(audio); } catch (e) { noiseBuf = null; }
}

// Wires the hall in (input → convolver → wet) until audio time `until` at least, then hallCheck() cuts it again.
function hallNeed(until) {
  if (!audio || !graph) return;
  ensureHall();
  if (!graph.linked) {
    try { graph.input.connect(graph.convolver); graph.convolver.connect(graph.wet); graph.linked = true; } catch (e) { /* dry only */ }
  }
  if (until > hallUntil) hallUntil = until;
  armHallOff();
}
function armHallOff() {
  if (hallOffTimer) clearTimeout(hallOffTimer);
  const left = audio ? hallUntil - audio.currentTime : 0;
  hallOffTimer = setTimeout(hallCheck, Math.max(50, Math.ceil(left * 1000) + 20));
}
// Cuts both links once no cue tail and no celesta rings through the hall. A suspended context rings nothing (its
// clock is frozen and the context only suspends when no voice is left): cut at once, no timer left behind.
function hallCheck() {
  hallOffTimer = 0;
  if (!audio || !graph || !graph.linked) return;
  if (amb.active === 'celesta') return;                             // the waltz holds it; ambientStop() checks again
  if (audio.state === 'running' && audio.currentTime < hallUntil) { armHallOff(); return; }
  try { graph.input.disconnect(graph.convolver); } catch (e) { /* nothing */ }
  try { graph.convolver.disconnect(graph.wet); } catch (e) { /* nothing */ }
  graph.linked = false;
  hallUntil = 0;
}

// Creates the context and the graph if missing (or if a trim closed it). Returns true if a usable graph exists.
function ensureContext() {
  if (audio && audio.state === 'closed') dropContext();
  if (audio && graph) return true;
  const AC = audioClass();
  if (!AC) return false;
  try { audio = new AC(); } catch (e) { audio = null; return false; }
  try { graph = buildGraph(audio); } catch (e) { graph = null; try { audio.close(); } catch (e2) { /* nothing */ } audio = null; return false; }
  if (audio.addEventListener) audio.addEventListener('statechange', () => { if (audio && audio.state === 'running') armIdle(); });
  bakeCues();
  return true;
}

// Forgets the context and everything bound to it (the bus, the voices, the celesta). The file plays outside the
// graph: it carries on untouched.
function dropContext() {
  for (const v of Array.from(voices)) { try { v.stop(); } catch (e) { /* nothing */ } }
  for (const v of Array.from(amb.voices)) { try { v.stop(); } catch (e) { /* nothing */ } }
  voices.clear(); amb.voices.clear();
  if (amb.timer) { clearInterval(amb.timer); amb.timer = 0; }
  if (hallOffTimer) { clearTimeout(hallOffTimer); hallOffTimer = 0; }
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = 0; }
  const ctx = audio;
  audio = null; graph = null; noiseBuf = null; amb.bus = null; amb.revOn = true; resuming = null; pending = null; hallUntil = 0;
  baked.clear(); bake.run++; bake.busy = false;
  if (amb.active === 'celesta') amb.active = null;
  if (ctx && ctx.state !== 'closed') { try { const p = ctx.close(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nothing */ } }
}

// Empties the <audio> element (its media buffers go) without forgetting which file exists.
function releaseFile() {
  const el = amb.file;
  if (el) {
    try { amb.pos = el.currentTime || 0; } catch (e) { amb.pos = 0; }   // the next element starts where this one was
    try { el.pause(); } catch (e) { /* nothing */ }
    try { el.removeAttribute('src'); el.load(); } catch (e) { /* nothing */ }
  }
  if (el) amb.file = undefined;                                     // re-probed (straight to amb.src) on the next start
  amb.filePending = false;
}

// Nothing sounding through Web Audio (no cue in flight, no celesta, nothing pending) for IDLE_SUSPEND_MS: suspend the
// context, so the audio thread stops entirely, music file playing or not. The next cue resumes it (pending
// mechanism), and so does the celesta (ambientApply()).
function armIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = 0;
    if (!audio || audio.state !== 'running') return;
    if (voices.size || amb.active === 'celesta' || pending || resuming) { armIdle(); return; }
    try { const p = audio.suspend(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* nothing */ }
  }, IDLE_SUSPEND_MS);
}

// 'poudlard:trim' (the app asks every module to give memory back): if no cue rings and the celesta is off, close the
// context; empty the file's element too unless it is playing. If a cue is still ringing, try again a little later.
function trim() {
  if (trimTimer) { clearTimeout(trimTimer); trimTimer = 0; }
  if (amb.active === 'celesta' || amb.probing) return;
  if (voices.size || pending || resuming) { trimTimer = setTimeout(trim, 4000); return; }
  if (audio) dropContext();
  if (amb.file && amb.active !== 'fichier') releaseFile();
}

// Ambience bus (built on demand, for the celesta only; the file plays outside the graph):
//   sources → mix → out (AMBIENT_DB, fades) → duck (ducking) → compressor (dry)
//                                            duck → rev (send) → convolver (wet, wired in by hallNeed while it plays)
// The master (−6 dB, mute) stays downstream: setEnabled(false) also cuts the ambience.
function ensureAmbientBus() {
  if (amb.bus || !audio || !graph) return amb.bus;
  const ctx = audio;
  const mix = ctx.createGain(); mix.gain.value = 1;
  const out = ctx.createGain(); out.gain.value = 0;
  const duck = ctx.createGain(); duck.gain.value = 1;
  const rev = ctx.createGain(); rev.gain.value = AMB_REVERB_SEND;
  mix.connect(out).connect(duck).connect(graph.comp);
  duck.connect(rev).connect(graph.convolver);
  amb.revOn = true;
  amb.bus = { mix, out, duck, rev };
  return amb.bus;
}

// Hall send of the ambience: on while the celesta plays, off once it stops (disconnected, so the convolver can go idle).
function setAmbientHall(on) {
  if (!amb.bus || amb.revOn === on) return;
  try { if (on) amb.bus.duck.connect(amb.bus.rev); else amb.bus.duck.disconnect(amb.bus.rev); amb.revOn = on; } catch (e) { /* nothing */ }
}

// Stops every cue voice (queued or in flight): purge before a resume, or when muting.
function stopAll(when) {
  for (const v of Array.from(voices)) v.stop(when);
}

// Resumes the context if it is suspended. Only one promise at a time (`resuming`); when it resolves, the pending
// cue is played if the context is really running, and the ambience is (re)started.
function resume() {
  if (!audio || audio.state !== 'suspended') return;
  if (resuming) return;
  let p = null;
  try { p = audio.resume(); } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') return;
  resuming = p.then(() => { resuming = null; flushPending(); ambientApply(); }, () => { resuming = null; pending = null; });
}

// Plays the cue kept during the resume, with the clock re-read at that moment.
function flushPending() {
  const p = pending; pending = null;
  if (!p || !enabled || !audio || !graph || audio.state !== 'running') return;
  schedule(p.name, p.dir);
}

// On the first gesture (key or pointer), set the flag, create the context if sound is enabled (inside the
// event handler: the browser accepts it) and resume it. The listeners are installed only once.
function armGesture() {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const once = () => {
    const was = gestured;
    gestured = true;
    if (audio && !was) stopAll();                 // purge: nothing must fire in a burst on resume
    if (enabled && !audio) Sound.init(); else resume();
    if (amb.filePending) playFile();              // the file was waiting for a gesture
  };
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) document.addEventListener(ev, once, { once: true, capture: true, passive: true });
  armVisibility();
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('poudlard:trim', trim);
}

// Start-up unlock (once): where the browser lets a context run without a gesture (the Android WebView), the music
// starts by itself. The file probe starts at once (metadata only, asynchronous); the context is created a moment
// later, out of the first frames. If it runs, or its resume() resolves, audio is unlocked and the music fades in.
// Otherwise (desktop browser) the suspended context waits for the first key, whose handler resumes it.
function tryAutoplay() {
  if (bootTried || gestured || !enabled || typeof document === 'undefined') return;
  if ((amb.mode || configuredMode()) === 'aucune') return;
  bootTried = true;
  if ((amb.mode || configuredMode()) !== 'celesta') probeFile(() => {});
  const go = () => {
    if (gestured || !enabled || !ensureContext()) return;
    const unlock = () => { if (!gestured && audio && audio.state === 'running') { gestured = true; ambientApply(); } };
    if (audio.state === 'running') { unlock(); return; }
    let p = null;
    try { p = audio.resume(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') p.then(unlock, () => {});
  };
  setTimeout(go, BOOT_DELAY_MS);
}

// Hidden page (tab, or WebView paused by the launcher): 'hidden' hold; lifted when it comes back.
// Same mechanism as Nox and app launch (ambientHold), so the chosen mode is never touched.
function armVisibility() {
  if (amb.visArmed || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  amb.visArmed = true;
  if (document.hidden) amb.holds.add('hidden');
  document.addEventListener('visibilitychange', () => ambientHold(Boolean(document.hidden), 'hidden'));
}

// Hold by reason: reasons stack; the ambience stays silent while one remains and resumes (according to
// its mode) when the last is lifted. Never modifies amb.mode.
function ambientHold(on, reason) {
  const r = typeof reason === 'string' && reason ? reason : 'hold';
  const had = amb.holds.has(r);
  if (on) { amb.holds.add(r); if (!had) ambientStop(); return; }
  if (!had) return;
  amb.holds.delete(r);
  if (!amb.holds.size) ambientApply();
}

// Registers a voice (cue or ambience): allows a grouped stop, cleans up at the end of the longest note.
function registerVoice(bag, nodes, longest) {
  const voice = {
    nodes,
    stop(when) {
      for (const n of nodes) { if (typeof n.stop === 'function') { try { n.stop(when); } catch (e) { /* already stopped */ } } }
    },
  };
  bag.add(voice);
  const done = () => { bag.delete(voice); for (const n of nodes) { try { n.disconnect(); } catch (e) { /* nothing */ } } };
  if (longest) longest.onended = done; else done();
}

// One glass note at time `at` (audio clock). `out`: output node; `bag` / `max`: registry and ceiling.
// Envelope per partial: silence → linear rise over the attack (30–60 ms) → exponential tail (1.5–3.5 s for the
// fundamental, shorter for the highs). The partials share one random detune (±3 cents: one glass, not a choir).
function playNote(note, at, out = graph.input, bag = voices, max = MAX_VOICES, ctx = audio) {
  if (bag && bag.size >= max) return;
  const f0 = hz(note.n);
  const detune = (Math.random() * 2 - 1) * 3;
  const attack = note.a || ATTACK;
  const nodes = [];
  let longest = null, longestEnd = 0;
  for (const p of PARTIALS) {
    const f = f0 * p.ratio;
    if (f > ctx.sampleRate * 0.45) continue;                       // partial beyond Nyquist: skip it
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = detune + (p.cents || 0);
    const peak = note.g * p.level * NOTE_SCALE;
    const dur = note.d * p.decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
    osc.connect(g).connect(out);
    osc.start(at); osc.stop(at + attack + dur + 0.05);
    nodes.push(osc, g);
    if (at + dur > longestEnd) { longestEnd = at + dur; longest = osc; }
  }
  if (bag) registerVoice(bag, nodes, longest);                     // no bag: a bake, whose nodes go with its context
}

// A breath of air at time `at`: looped noise through a band-pass, swelling over the first third of `d` and
// fading over the rest. `g` scales AIR_LEVEL. Cues only (lumos, enter, return), under the notes.
function playAir(air, at, out = graph.input, bag = voices, ctx = audio, noise = noiseBuf) {
  if (!noise || (bag && bag.size >= MAX_VOICES)) return;
  const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = AIR_HZ; bp.Q.value = AIR_Q;
  const g = ctx.createGain();
  const rise = air.d * 0.35, end = at + air.d;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(AIR_LEVEL * air.g, at + rise);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  src.connect(bp).connect(g).connect(out);
  src.start(at); src.stop(end + 0.05);
  if (bag) registerVoice(bag, [src, bp, g], src);
}

// ---- Baked cues (head of this file) -----------------------------------------------------------------------------------
// Every cue rendered once, as the live graph would play it, master aside: one offline context, the cues end to end, the
// hall's tail between them. Each step below is its own idle moment; a failure leaves the cues live. Only while the
// sound is on, and once per context.
function bakeCues() {
  if (bake.busy || !enabled || !audio || typeof OfflineAudioContext !== 'function') return;
  bake.busy = true;
  const run = bake.run, sr = audio.sampleRate, chans = lowRam() ? 1 : 2;
  let total = 0;
  const slots = BAKE_CUES.map((key) => {
    const [name, dir] = key.split(':');
    const notes = CUES[name](Number(dir) || 1), secs = cueEnd(notes) + hallSeconds() + 0.1;
    const slot = { key, notes, at: total, secs };
    total += secs;
    return slot;
  });
  let off = null, g = null, hall = null, air = null;
  const steps = [
    () => { off = new OfflineAudioContext(chans, Math.ceil(total * sr), sr); hall = makeImpulse(off); },
    () => { air = makeNoise(off); g = buildGraph(off); g.master.gain.value = 1; },
    () => { g.convolver.buffer = hall; g.input.connect(g.convolver); g.convolver.connect(g.wet); },
    ...slots.map((s) => () => {
      for (const note of s.notes) { if (note.air) playAir(note, s.at + note.t, g.input, null, off, air); else playNote(note, s.at + note.t, g.input, null, Infinity, off); }
    }),
    () => off.startRendering().then((out) => {
      off = null; g = null; hall = null; air = null;               // the graph and the hall's impulse go now
      if (run !== bake.run || !audio) return;
      for (const s of slots) baked.set(s.key, { buf: out, at: s.at, secs: s.secs });
    }, () => {}),
  ];
  const later = (fn) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: BAKE_IDLE_MS }); else setTimeout(fn, 50); };
  const next = () => {
    if (run !== bake.run || !steps.length) return;
    try { steps.shift()(); } catch (e) { steps.length = 0; return; }
    if (steps.length) later(next);
  };
  later(next);
}
// A key's cue: one buffer source into the master, nothing else.
function playBaked(cue) {
  const src = audio.createBufferSource();
  src.buffer = cue.buf;
  src.detune.value = (Math.random() * 2 - 1) * 3;
  src.connect(graph.master);
  src.start(0, cue.at, cue.secs);
  registerVoice(voices, [src], src);
}

// A plucked harp string (ambience only): harmonic partials, 3 ms attack, the lows last longer.
function playPluck(n, at, g0) {
  if (amb.voices.size >= AMB_MAX_VOICES) return;
  const ctx = audio, out = amb.bus.mix;
  const f0 = hz(n);
  const base = Math.min(1.3, Math.max(0.5, 0.7 + (72 - n) * 0.012));   // duration by pitch
  const nodes = [];
  let longest = null, longestEnd = 0;
  for (const p of HARP_PARTIALS) {
    const f = f0 * p.ratio;
    if (f > ctx.sampleRate * 0.45) continue;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = (Math.random() * 2 - 1) * 3;
    const dur = base * p.decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(g0 * p.level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.003 + dur);
    osc.connect(g).connect(out);
    osc.start(at); osc.stop(at + 0.003 + dur + 0.05);
    nodes.push(osc, g);
    if (at + dur > longestEnd) { longestEnd = at + dur; longest = osc; }
  }
  registerVoice(amb.voices, nodes, longest);
}

// String pad (ambience only): per note, two sawtooths detuned ±7 cents, a shared low-pass,
// 0.9 s attack, `secs` hold, 0.9 s release (the next pad overlaps: no gap).
function playPad(notes, at, secs) {
  if (amb.voices.size >= AMB_MAX_VOICES) return;
  const ctx = audio;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820; lp.Q.value = 0.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(1, at + 0.9);
  env.gain.setValueAtTime(1, at + Math.max(1, secs - 0.2));
  env.gain.linearRampToValueAtTime(0.0001, at + secs + 0.9);
  lp.connect(env).connect(amb.bus.mix);
  const nodes = [lp, env];
  let last = null;
  notes.forEach((n, i) => {
    for (const d of [-7, 7]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = hz(n); osc.detune.value = d + (Math.random() - 0.5) * 3;
      g.gain.value = 0.03 * (i === 0 ? 1 : 0.8);
      osc.connect(g).connect(lp);
      osc.start(at); osc.stop(at + secs + 1);
      nodes.push(osc, g);
      last = osc;
    }
  });
  registerVoice(amb.voices, nodes, last);
}

// Duration of a beat: base tempo × slow breathing (±3 % over 12 bars) × a tiny bit of randomness.
function beatDuration(beat) {
  const bar = Math.floor(beat / BEATS_PER_BAR);
  return BEAT * (1 + RUBATO * Math.sin(2 * Math.PI * bar / 12)) * (1 + (Math.random() * 2 - 1) * 0.004);
}

// One score event at time `at`; `dur`: duration of the current beat (s).
function scheduleAmbientEvent(ev, at, dur) {
  if (ev.kind === 'mel') {
    const t = at + (Math.random() - 0.5) * 0.016;                   // ±8 ms: a hand, not a machine
    playNote({ n: ev.n, d: ev.len * dur * 0.9 + 0.6, g: AMB_MELODY_G }, t, amb.bus.mix, amb.voices, AMB_MAX_VOICES);
  } else if (ev.kind === 'harp') {
    const g = 0.15 * (0.85 + Math.random() * 0.3) * (ev.strong ? 1.25 : 1);
    playPluck(ev.n, at, g);
  } else if (ev.kind === 'pad') {
    playPad(ev.notes, at, ev.bars * BEATS_PER_BAR * dur);
  }
}

// Scheduler: plans the beats that fall within the next 600 ms. If the context is suspended, the setInterval
// keeps running but the audio clock no longer moves: each pass finds nothing to schedule, nothing
// piles up, and on resume the music carries on where it was.
function ambientTick() {
  if (!audio || !amb.bus || amb.active !== 'celesta') return;
  const horizon = audio.currentTime + LOOKAHEAD;
  let guard = 0;
  while (amb.beatStart < horizon && guard++ < 12) {
    const dur = beatDuration(amb.beat);
    for (const ev of SCORE[amb.beat]) scheduleAmbientEvent(ev, amb.beatStart + ev.off * dur, dur);
    amb.beatStart += dur;
    amb.beat = (amb.beat + 1) % SCORE.length;
  }
}

// Ambience level fade (linear: the values are small).
function rampAmbient(target, secs) {
  const g = amb.bus.out.gain, t = audio.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(target, t + secs);
}

// Ducking: under a cue, the ambience drops to half in 20 ms, holds 300 ms, comes back in 450 ms.
function duckAmbient() {
  if (amb.active === 'fichier') { fileDuck(); return; }
  if (!amb.bus || !amb.active) return;
  const g = amb.bus.duck.gain, t = audio.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(DUCK_LEVEL, t + 0.02);
  g.setValueAtTime(DUCK_LEVEL, t + 0.02 + DUCK_HOLD);
  g.linearRampToValueAtTime(1, t + 0.02 + DUCK_HOLD + DUCK_BACK);
}

// ---- The file ---------------------------------------------------------------------------------------------------------
// Probes assets/music/ambiance.ogg, .mp3 then .m4a (MUSIC_FILES) with an <audio>, preload "metadata": the probe reads
// the header only, never the whole file, and succeeds on 'loadedmetadata'. Result cached; never a visible exception.
// After a trim, the element is rebuilt and the probe goes straight to the file found the first time (amb.src).
function probeFile(cb) {
  if (amb.file !== undefined) { cb(amb.file); return; }
  if (amb.probing) { amb.probing.push(cb); return; }
  amb.probing = [cb];
  const settle = (el, entry) => {
    amb.file = el;
    amb.src = el ? entry : null;
    if (el) {
      // Safety net: if a loop ever fails to seek back (a server without Range), restart from the top by hand.
      el.addEventListener('ended', () => { if (amb.file === el && amb.active === 'fichier') { try { el.currentTime = 0; } catch (e) { /* nothing */ } playFile(); } });
    }
    const cbs = amb.probing; amb.probing = null;
    for (const f of cbs) f(el);
  };
  const Aud = typeof globalThis !== 'undefined' ? globalThis.Audio : undefined;
  if (typeof document === 'undefined' || typeof Aud !== 'function') { settle(null); return; }
  const list = amb.src ? [amb.src, ...MUSIC_FILES.filter((f) => f !== amb.src)] : MUSIC_FILES;
  let i = 0;
  const tryNext = () => {
    if (i >= list.length) { settle(null); return; }
    const entry = list[i++];
    let el = null;
    try { el = new Aud(); } catch (e) { settle(null); return; }
    // Format this browser cannot play: move on to the next without even requesting it.
    if (typeof el.canPlayType === 'function' && el.canPlayType(entry.type) === '') { tryNext(); return; }
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      clearTimeout(timer);
      el.removeEventListener('loadedmetadata', onOk); el.removeEventListener('error', onKo);
      if (ok) settle(el, entry); else { try { el.removeAttribute('src'); el.load(); } catch (e) { /* nothing */ } tryNext(); }
    };
    const onOk = () => finish(true), onKo = () => finish(false);
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    el.addEventListener('loadedmetadata', onOk);
    el.addEventListener('error', onKo);
    el.preload = 'metadata'; el.loop = true;
    try { el.src = entry.src; } catch (e) { finish(false); }
  };
  tryNext();
}

// The file's level: el.volume = FILE_VOLUME × fade × duck. The fade is linear on the ms clock (from → to, t0 → t1),
// the duck the same shape as the graph's (half in 20 ms, 300 ms hold, back in 450 ms). A 40 ms step timer runs only
// while one of them moves, then clears itself.
function fileFadeAt(t) {
  const e = amb.env;
  if (t >= e.t1) return e.to;
  if (t <= e.t0) return e.from;
  return e.from + (e.to - e.from) * (t - e.t0) / (e.t1 - e.t0);
}
function fileDuckAt(t) {
  const e = amb.env;
  if (e.duck < 0) return 1;
  const dt = (t - e.duck) / 1000, a = 0.02, h = a + DUCK_HOLD, b = h + DUCK_BACK;
  if (dt < a) return 1 - (1 - DUCK_LEVEL) * dt / a;
  if (dt < h) return DUCK_LEVEL;
  if (dt < b) return DUCK_LEVEL + (1 - DUCK_LEVEL) * (dt - h) / DUCK_BACK;
  e.duck = -1;
  return 1;
}
function fileStep() {
  const e = amb.env, t = now(), el = amb.file;
  const v = Math.max(0, Math.min(1, FILE_VOLUME * fileFadeAt(t) * fileDuckAt(t)));
  if (el) { try { el.volume = v; } catch (err) { /* nothing */ } }
  if (t >= e.t1 && e.duck < 0 && e.timer) { clearInterval(e.timer); e.timer = 0; }
}
function fileKick() {
  if (!amb.env.timer) amb.env.timer = setInterval(fileStep, FILE_STEP_MS);
  fileStep();
}
function fileFade(target, secs) {
  const e = amb.env, t = now();
  e.from = fileFadeAt(t); e.to = target; e.t0 = t; e.t1 = t + secs * 1000;
  fileKick();
}
function fileDuck() {                            // the first step comes with the next tick: nothing on the key's task
  amb.env.duck = now();
  if (!amb.env.timer) amb.env.timer = setInterval(fileStep, FILE_STEP_MS);
}
function fileSilence() {
  const e = amb.env;
  if (e.timer) { clearInterval(e.timer); e.timer = 0; }
  e.from = e.to = 0; e.t0 = e.t1 = 0; e.duck = -1;
  if (amb.file) { try { amb.file.volume = 0; } catch (err) { /* nothing */ } }
}

function playFile() {
  const el = amb.file;
  if (!el || amb.active !== 'fichier') return;
  amb.filePending = false;
  try { el.preload = 'auto'; } catch (e) { /* nothing */ }        // playing: let it buffer ahead (still streamed)
  if (amb.pos) { try { el.currentTime = amb.pos; } catch (e) { /* not seekable: from the top */ } amb.pos = 0; }
  let p = null;
  try { p = el.play(); } catch (e) { amb.filePending = true; return; }
  if (p && typeof p.catch === 'function') p.catch(() => { amb.filePending = true; });
}

// ---- Start / stop ---------------------------------------------------------------------------------------------------
function ambientStop(fade = AMB_FADE_OUT) {
  amb.swap++;                                                       // cancels a deferred restart
  amb.req++;                                                        // and a file probe in progress
  if (!amb.active) return;
  const kind = amb.active; amb.active = null;
  if (amb.timer) { clearInterval(amb.timer); amb.timer = 0; }
  if (kind === 'celesta' && audio && amb.bus) {
    rampAmbient(0, fade);
    const when = audio.currentTime + fade + 0.05;
    for (const v of Array.from(amb.voices)) v.stop(when);
    // The waltz's last notes still ring through the hall: let them go, then cut it (and the send).
    hallUntil = Math.max(hallUntil, audio.currentTime + fade + hallSeconds() + 0.1);
    setTimeout(() => { if (amb.active !== 'celesta') setAmbientHall(false); }, (fade + hallSeconds() + 0.1) * 1000);
    armHallOff();
  }
  if (kind === 'fichier' && amb.file) {
    const el = amb.file;
    fileFade(0, fade);
    setTimeout(() => { if (amb.active !== 'fichier') { fileSilence(); try { el.pause(); } catch (e) { /* nothing */ } } }, fade * 1000 + 60);
  }
  armIdle();
}

function ambientStart(kind) {
  if (!enabled || !gestured || amb.holds.size) return;
  if (kind === 'celesta' && (!audio || !graph)) return;
  if (kind === 'fichier' && !amb.file) return;
  if (amb.active === kind) return;
  if (amb.active) {
    // Source change: fade out, then the other one comes in. The `swap` token expires this deferred restart if
    // a stop, a hold or a direct start happens in between (two ◀▶ presses less than 340 ms apart).
    ambientStop();
    const token = ++amb.swap;
    setTimeout(() => { if (amb.swap === token && !amb.active) ambientStart(kind); }, AMB_FADE_OUT * 1000 + 40);
    return;
  }
  amb.swap++;                                                       // direct start: expires any pending deferred restart
  amb.active = kind;
  amb.level = kind === 'fichier' ? FILE_VOLUME : AMBIENT;
  if (kind === 'celesta') {
    ensureAmbientBus();
    amb.bus.duck.gain.value = 1;
    hallNeed(audio.currentTime);                                    // wired in for as long as the waltz plays
    setAmbientHall(true);
    rampAmbient(amb.level, AMB_FADE_IN);
    amb.beat = 0;
    amb.beatStart = audio.currentTime + 0.15;
    amb.timer = setInterval(ambientTick, SCHED_MS);
    ambientTick();
  } else {
    // Outside the graph: the fade-in is el.volume stepped from 0 (the context can stay suspended meanwhile).
    fileSilence();
    fileFade(1, FILE_FADE_IN);
    playFile();
  }
}

// Applies the mode in force (explicit or config), unless on hold. Idempotent: does not restart a source
// that is already active. The celesta recreates the context after a trim and wakes it from an idle suspend; the
// file needs neither (it plays outside Web Audio), so it never wakes a suspended context.
function ambientApply() {
  if (!enabled || !gestured || amb.holds.size) return;
  const mode = amb.mode || configuredMode();
  const token = ++amb.req;
  if (mode === 'aucune') { ambientStop(); return; }
  const celesta = () => {
    if (!ensureContext()) return;
    if (audio.state === 'suspended') resume();                      // its success calls ambientApply() again: harmless
    ambientStart('celesta');
  };
  if (mode === 'celesta') { celesta(); return; }
  // 'auto' and 'fichier': the file if it exists, otherwise the waltz (the settings' note says so).
  probeFile((el) => {
    if (amb.req !== token || !enabled || amb.holds.size) return;    // another request came in meanwhile
    if (el) ambientStart('fichier'); else celesta();
  });
}

// A cue on a running context: its baked buffer, or every note live until the bake is done (clock re-read here, never
// before).
function schedule(name, dir) {
  const make = CUES[name];
  if (!make) return false;
  const buf = baked.get(name === 'move' ? `move:${dir}` : name);
  if (buf) playBaked(buf);
  else {
    const at = audio.currentTime + 0.012;                          // small lead: every note leaves on time
    const notes = make(dir);
    hallNeed(at + cueEnd(notes) + hallSeconds() + 0.1);             // the hall, for this cue's tails and its own
    for (const note of notes) { if (note.air) playAir(note, at + note.t); else playNote(note, at + note.t); }
  }
  duckAmbient();
  lastAt.set(name, now());
  armIdle();
  return true;
}

export const Sound = {
  // Creates the context and the graph (idempotent) once audio is unlocked (a user gesture happened, or the start-up
  // attempt found that the browser allows playback without one: the TV). Before that, installs the gesture listeners,
  // makes the start-up attempt (once) and returns false. Also starts the background music.
  init() {
    armGesture();
    if (!gestured) { tryAutoplay(); return false; }
    if (!ensureContext()) return false;
    resume();
    ambientApply();
    return true;
  },

  isEnabled() { return enabled; },

  // Instant mute: the master drops to zero in 30 ms and the notes in flight are stopped; the ambience does its
  // 300 ms fade (under a master already at zero: inaudible, but the scheduler stops cleanly).
  // Unmute: the master comes back up, playing nothing (the confirmation belongs to the calling screen); the ambience
  // resumes according to its mode. Before any unlock, also makes the start-up attempt (once).
  setEnabled(on) {
    const was = enabled;
    enabled = !!on;
    armGesture();
    if (!enabled) pending = null;
    if (enabled && !gestured) tryAutoplay();
    if (was === enabled) return;                                    // nothing changed (main.js calls this on every config change)
    if (audio && graph) {
      const t = audio.currentTime;
      const g = graph.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(enabled ? MASTER : 0, t + 0.03);
      if (!enabled) stopAll(t + 0.035);
    }
    if (!enabled) ambientStop(); else { ambientApply(); bakeCues(); }   // the file has no master: its own fade
  },

  // Plays a cue by name. opts.dir: 1 (right / up) or −1 (left / down) for `move`.
  // Returns true if the cue is played (or kept for the end of a resume in progress), false otherwise:
  // sound muted, unknown name, audio not unlocked yet, Web Audio missing, context suspended, or duplicate too close.
  cue(name, opts = { dir: 1 }) {
    if (!enabled) return false;
    if (!CUES[name]) return false;
    if (!gestured) { armGesture(); return false; }
    if ((!audio || !graph || audio.state === 'closed') && !Sound.init()) return false;
    if (!graph) return false;
    if (amb.filePending) playFile();                                // a cue always comes from a gesture
    const dir = opts && opts.dir < 0 ? -1 : 1;
    const t = now(), prev = lastAt.get(name);
    if (prev !== undefined && t - prev < DEDUPE_MS) return false;  // same cue twice within a few ms: only one
    if (audio.state === 'running') return schedule(name, dir);
    // Suspended context (idle, sleep, hidden tab): resume and keep this cue, the last one requested wins.
    resume();
    if (!resuming) return false;
    pending = { name, dir };
    lastAt.set(name, t);
    return true;
  },

  // Available names (for screens that want to check).
  names() { return Object.keys(CUES); },

  // Background music: 'auto' | 'fichier' | 'celesta' | 'aucune', or null to go back to config.music. Returns false if
  // the mode is unknown. An explicit mode OVERRIDES config.music until the next call (it is remembered even without a
  // context and applies once audio is unlocked): to cut temporarily without losing the mode, use ambientHold().
  ambient(mode) {
    if (mode !== null && !AMBIENT_MODES.includes(mode)) return false;
    amb.mode = mode;
    armGesture();
    if ((mode || configuredMode()) === 'aucune') ambientStop(); else ambientApply();
    return true;
  },

  // Hold without touching the mode: ambientHold(true, 'nox') when entering sleep, ambientHold(false, 'nox') on
  // wake; same with 'launch' around an app launch. Several reasons can stack; the music resumes
  // when the last one is lifted. Returns the number of reasons still active.
  ambientHold(on, reason) {
    ambientHold(!!on, reason);
    return amb.holds.size;
  },

  // For tests and debugging: { mode (requested or config), active ('celesta' | 'fichier' | null),
  // file (true / false / null = not yet probed), holds (hold reasons), unlocked, context state ('none' if none),
  // baked (the cues ready to play as a single buffer) }.
  ambientState() {
    return {
      mode: amb.mode || configuredMode(), active: amb.active,
      file: amb.file === undefined ? (amb.src ? true : null) : Boolean(amb.file),
      holds: Array.from(amb.holds), unlocked: gestured, context: audio ? audio.state : 'none',
      baked: Array.from(baked.keys()),
    };
  },
};
