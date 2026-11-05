# Music and sounds

This document describes what the code does (`app/js/sound.js`), which audio file the repository carries and why the film theme is not in the code. It is the most sensitive topic of the repo: the documentation and the code must say the same thing.

## What the repo does

`app/js/sound.js` produces two layers:

1. **The cues**: nine very short phrases (0.4 to 2.5 s), played on each interaction: `move`, `enter`, `return`, `lumos`, `nox`, `wake`, `error`, `toggle`, `confirm`. A celesta synthesised in Web Audio (generated reverb), all in E minor, all composed for this project, nothing downloaded.
2. **The background music** (the home screen ambience), looped, which ducks under each cue (half the volume in 20 ms, held for 300 ms, back in 450 ms). It has **three possible sources**, chosen in Settings → Owl and sounds → **Background music** (`config.music`):

| Setting | Value | What is played |
|---|---|---|
| **Auto** (default) | `auto` | The music file (below), which the repository ships; the celesta waltz only if no file can be played. |
| **Celesta** | `celesta` | The celesta waltz, always, even if a file exists. |
| **None** | `aucune` | Nothing: the cues only. |

The cues are rendered once ahead of time (an `OfflineAudioContext`, hall and compressor included, about 8 MB in all on a low-RAM TV), and a key only starts one buffer: no oscillator is created on the key and no reverb runs. A cue asked for in the first seconds, before that is done, plays live; so does the waltz, always.

The levels are constants at the top of `sound.js` (`AMBIENT_DB` for the waltz, `FILE_DB` for the file, the master volume for the cues and the waltz). The file plays through its own `<audio>` element, outside the Web Audio graph: `FILE_DB` is its whole level (`el.volume` ≈ 0.9), its fades and its ducking are the element's volume, so the audio graph sleeps whenever no cue rings (on the TV, the graph kept running for the music alone cost about one core).

### The music file (versioned at the maintainer's request)

The repository carries `app/assets/music/ambiance.ogg`: the maintainer's own recording from 29:45 to its end, 29:37 long, Ogg Opus, stereo, 80 kbit/s, 19 MB. It is shipped as it is, not levelled: −20 LUFS integrated (mean −23.5 dB), peaks at 0 dBFS, 18 LU of range, 30 s blocks from −17 to −40 dB. It opens near −41 dB for its first half minute and reaches −30 dB in the second. It is **not** covered by the MIT license: its rights belong to its author, it is versioned on the maintainer's explicit decision, and any rights holder may ask for its removal (`DISCLAIMER.md`, section "Third-party material versioned at the maintainer's request").

The player probes the names listed in `MUSIC_FILES` (`sound.js`), `ambiance.ogg` first, and plays the first one the browser or the WebView can decode. Another file name, or a `.wav` or `.flac`, is silently ignored. A file that takes more than 4 s to respond is considered absent.

**To use your own music instead**, for private use:

1. Pick a file whose rights you hold, or whose licence covers personal use: your own composition, a work under a compatible Creative Commons licence (read the attribution clause and the no-derivatives clause), a track bought from a sound library. The films' soundtrack has no place here (see below).
2. Keep it reasonable, since it goes into the APK, stored uncompressed: `tools/test-sound.mjs` allows 24 MB. It should start and end on silence or on the same chord (otherwise there is a click at the loop point). Ogg Opus at 64 to 96 kbit/s is the right format for the Android WebView:
   `ffmpeg -i source.wav -c:a libopus -b:a 80k -vbr on app/assets/music/ambiance.ogg`
3. Put it in place of `app/assets/music/ambiance.ogg` and rebuild the APK (`android/build.sh` copies `app/` as is).
4. Do not commit it: it would replace the versioned file for everyone. Write down its source and licence for yourself, outside the repository.

## How the APK serves the file (byte ranges in the WebView)

The `<audio>` element reads the file in pieces, through `WebAssets.java`, which answers its `Range` requests (`206 Partial Content`). One behaviour of the WebView decides everything here, measured on the TV: **the WebView skips `start` bytes of the stream it is handed, by itself, whenever the request has a `Range`.** So the stream must start at byte 0 of the asset and stop at the last byte asked for, while the headers describe the range (`Content-Range`, and `Content-Length` = its length). A stream already positioned at `start` is skipped twice: `bytes=1000-2023` came back with 24 bytes, `<audio>` failed without a word, and the synthesised waltz played instead, at the cost of a core. If the music is ever silent or replaced by the waltz on a TV, look there first. The asset must be stored uncompressed (`build.sh`, `jar -0`) for `openFd()` to give its length.

## What the player does (behaviour you can verify in `sound.js`)

- It only plays **a local file** from the `app/assets/music/` folder, never a URL, and probes it with an `<audio>` element; if it is missing or cannot be decoded, no visible error: it falls back to the celesta (Auto mode) or to silence.
- **It starts by itself on the TV.** In the APK the music begins when the Parapet appears, without waiting for a key press (the first device test found that it never started on its own). A desktop browser applies its own autoplay policy: there, the music may still wait for the first key press or click.
- It obeys the **Sound** setting (`config.sounds`, home bar and Settings): when off, everything goes silent, music included.
- It goes silent when the page is hidden (`visibilitychange`: background tab, paused WebView), when an app is launched and during Nox, then resumes on return, with a short fade-in and fade-out.
- In None mode, **nothing plays and nothing is shown**.

### The celesta waltz (original composition, the fallback)

A slow waltz in E minor, 3/4, 66 to the quarter note, 24 bars (about 65 s) in a seamless loop, in three voices: celesta (melody), harp (arpeggiated counter-melody in eighth notes), string pad (held on each chord). A slight rubato, identical on each loop. It plays in Celesta mode, or in Auto mode when no file can be played.

It is written note by note in `sound.js` (constants `MELODY` and `PROGRESSION`), published under the repo's MIT licence, and can be reviewed by anyone. Since Hedwig's Theme is also a waltz in E minor, originality was checked interval by interval:

- the melody starts on the downbeat with a stepwise rise B, C, D, E; no B → E pickup (the ascending fourth in anacrusis that opens the film theme);
- never the cell E–G–F♯–E, nor the cell B–A–F♯, in absolute pitches and at any transposition (no interval contour +3 −1 −2, nor +5 +3 −1, nor +7 −2 −3);
- no dotted figure (dotted eighth–sixteenth): quarter and half notes only;
- no rising fifth E → B followed by A → F♯;
- tempo 66 (lullaby) against about 160 for the film theme.

These constraints are checked by a script, to be re-run after any change to the melody: `node tools/test-sound.mjs` (it reads `MELODY` from `sound.js`, counts 48 notes and 72 beats, and looks for the forbidden cells in the sequence of intervals). The nine cues respect the same prohibitions (for example `enter` goes down B, G, E, B; `wake` goes up G → E).

## Why the film theme is excluded from the code

Hedwig's Theme and the other film scores (John Williams, Patrick Doyle, Nicholas Hooper, Alexandre Desplat) are works protected by copyright, and their recordings by neighbouring rights. Using them in a launcher, even a free one, even private and then shared, means reproducing them and communicating them to the public without authorisation.

Two ideas come up often; neither holds:

- **"I'll change a few notes so that it's original."** A modified melody remains a derivative work as long as the original can be recognised in it. Changing the key, the tempo, the instrument or a few notes does not create a new work; it creates an adaptation, which requires the same authorisation. The test is not how many notes were changed, it is recognisability.
- **"I'll only keep the first few notes."** The opening of Hedwig's Theme is precisely its most recognisable part. A short quotation is not an exception in music: there is no duration threshold below which borrowing would be free.

This is why `sound.js` explicitly forbids itself the cells of the opening and only works on original phrases. If you want a "magical" ambience of your own, the right path is an original composition or licensed music, never a variation on the theme.
