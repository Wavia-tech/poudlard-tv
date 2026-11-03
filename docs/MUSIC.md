# Music and sounds

This document describes exactly what the code does (`app/js/sound.js`) and why the film theme is not in it. It is the most sensitive topic of the repo: the documentation and the code must say the same thing.

## What the repo does

`app/js/sound.js` produces two layers, with the same voice (a celesta synthesised in Web Audio, generated reverb) and without downloading anything:

1. **The cues**: nine very short phrases (0.4 to 2.5 s), played on each interaction: `move`, `enter`, `return`, `lumos`, `nox`, `wake`, `error`, `toggle`, `confirm`. All in E minor, all composed for this project.
2. **The background music** (the home screen ambience), looped, very quiet (the waltz at −22 dB below the master volume; a personal file, already mastered, at −9 dB), which ducks under each cue (ducking: half the volume in 20 ms, held for 300 ms, back in 450 ms). It has **three possible sources**, chosen in Settings → Owl and sounds → **Background music** (`config.music`):

| Setting | Value | What is played |
|---|---|---|
| **Auto** (default) | `auto` | Your personal file if it exists (below), otherwise the celesta waltz. |
| **Celesta** | `celesta` | The celesta waltz, always, even if a file exists. |
| **None** | `aucune` | Nothing: the cues only. |

### The celesta waltz (original composition)

A slow waltz in E minor, 3/4, 66 to the quarter note, 24 bars (about 65 s) in a seamless loop, in three voices: celesta (melody), harp (arpeggiated counter-melody in eighth notes), string pad (held on each chord). A slight rubato, identical on each loop.

It is written note by note in `sound.js` (constants `MELODY` and `PROGRESSION`), published under the repo's MIT licence, and can be reviewed by anyone. Since Hedwig's Theme is also a waltz in E minor, originality was checked interval by interval:

- the melody starts on the downbeat with a stepwise rise B, C, D, E; no B → E pickup (the ascending fourth in anacrusis that opens the film theme);
- never the cell E–G–F♯–E, nor the cell B–A–F♯, in absolute pitches and at any transposition (no interval contour +3 −1 −2, nor +5 +3 −1, nor +7 −2 −3);
- no dotted figure (dotted eighth–sixteenth): quarter and half notes only;
- no rising fifth E → B followed by A → F♯;
- tempo 66 (lullaby) against about 160 for the film theme.

These constraints are checked by a script, to be re-run after any change to the melody: `node tools/test-sound.mjs` (it reads `MELODY` from `sound.js`, counts 48 notes and 72 beats, and looks for the forbidden cells in the sequence of intervals). The nine cues respect the same prohibitions (for example `enter` goes down B, G, E, B; `wake` goes up G → E).

### The personal file (outside the repo)

The `app/assets/music/` folder is **ignored by Git**: whatever you put there stays on your machine. The player probes, in this order (constant `MUSIC_FILES` in `sound.js`), and stops at the first one the browser can play:

1. `app/assets/music/ambiance.ogg` (Vorbis; recommended: free, compact, played by Chrome and the Android WebView)
2. `app/assets/music/ambiance.mp3`
3. `app/assets/music/ambiance.m4a` (AAC)

Nothing else is played: another file name, or a `.wav` or `.flac`, is silently ignored (and those formats are too heavy for a loop anyway). Convert if needed: `ffmpeg -i source.wav -c:a libvorbis -q:a 4 app/assets/music/ambiance.ogg` (or `-c:a libmp3lame -b:a 128k … ambiance.mp3`). A file that takes more than 4 s to respond is considered absent.

To add it:

1. Pick a file whose rights you hold, or whose licence covers personal use: your own composition, a work under a compatible Creative Commons licence (read the attribution clause and the no-derivatives clause), a track bought from a sound library. The films' soundtrack has no place here (see below).
2. Name it `ambiance.ogg`, `ambiance.mp3` or `ambiance.m4a` and put it in `app/assets/music/`.
3. Keep it light: a 1 to 3 minute loop, 96 to 128 kbit/s, that starts and ends on silence or on the same chord (otherwise there is a click at the loop point).
4. Write down its source and licence for yourself, **somewhere other than the repo** (for example `app/assets/music/LICENCE.txt`, ignored by Git like the whole folder). Never commit this folder.

On the television (APK), the file must be present in `app/assets/music/` when `build.sh` runs: it then goes into the APK, which stays private.

## What the player does (behaviour you can verify in `sound.js`)

- It only plays **a local file** from the `app/assets/music/` folder, never a URL, and probes it with an `<audio>` element; if it is missing, no visible error, it falls back to the celesta (Auto mode) or to silence.
- **Nothing before a user gesture**: no audio context is created before the first key press or click (browsers and the WebView enforce this anyway).
- It obeys the **Sound** setting (`config.sounds`, home bar and Settings): when off, everything goes silent, music included. The master volume (−14 dB) stays downstream of the ambience.
- It goes silent when the page is hidden (`visibilitychange`: background tab, paused WebView), when an app is launched and during Nox, then resumes on return. Fade-in 2.5 s, fade-out 300 ms.
- With no file and in None mode, **nothing happens and nothing is shown**: this is the normal state of a freshly cloned repo.

## Why the film theme is excluded

Hedwig's Theme and the other film scores (John Williams, Patrick Doyle, Nicholas Hooper, Alexandre Desplat) are works protected by copyright, and their recordings by neighbouring rights. Using them in a launcher, even a free one, even private and then shared, means reproducing them and communicating them to the public without authorisation.

Two ideas come up often; neither holds:

- **"I'll change a few notes so that it's original."** A modified melody remains a derivative work as long as the original can be recognised in it. Changing the key, the tempo, the instrument or a few notes does not create a new work; it creates an adaptation, which requires the same authorisation. The test is not how many notes were changed, it is recognisability.
- **"I'll only keep the first few notes."** The opening of Hedwig's Theme is precisely its most recognisable part. A short quotation is not an exception in music: there is no duration threshold below which borrowing would be free.

This is why `sound.js` explicitly forbids itself the cells of the opening and only works on original phrases. If you want a "magical" ambience, the right path is an original composition (the repo's, or your own) or licensed music, never a variation on the theme. For strictly private use on your own television, the personal file exists for that; it simply must never be redistributed.
