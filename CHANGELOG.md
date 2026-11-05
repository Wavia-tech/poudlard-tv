# Changelog

## 0.3 · November 2026 · the first device test

Reworked after the owner watched it on his TV. Checked on the PC; see `android/README.md` for what is measured on the TV.

- **One move for everything that stacks.** The dive is gone: Parapet, wands and suitcases are one vertical camera move, on a curve of its own, to neighbours mounted ahead, so that a key is answered in its own frame. The clock, the dock and the owl fade by themselves and never travel or scale with the picture.
- **The focus in the shops.** Sprites baked at their risen size, 1:1 on the screen; his pixels through the handles; no brightness filter, no sheen; a shadow on surfaces only. The scrims are lighter. Two titles never overlap.
- **One focus everywhere.** The item lifts with a soft shadow; the Map's black frame, the stars, the outlines, the gold logos and the reflections in the lake are gone.
- **The sky, his.** His clouds at full resolution, drifting behind the castle: at rest the sky reads as his picture, and his soft sky takes fine wisps from his crispest clouds, so that it stays alive at any moment of the drift. Around the moon, one round disc and one soft glow read from his sky by the distance to the moon alone, with nothing of a cloud frozen in it: the clouds go right up to the limb and light up as they near the moon. No arc, no frozen wisp, no ring, no pale band beside the spire, which stays a needle up to its tip, veiled a little by what passes. Nothing is frozen around the castle any more, so no pale outline comes and goes around a chimney, and the faint mountain on the left stays a contour with clouds passing through it. The disc and its glow are one picture, in one plane with the castle, and the sky now slides with them on a focus move: no crescent at either end of the dock, and the moon never slides over its clouds. One opaque picture that moves, truly drawn as opaque now, and one blended picture of all that is still; 12 steps of the drift a second instead of 16. The tint of the hour is painted once into the still pictures instead of being blended over the whole screen at every step of the clouds.
- **The Parapet's hierarchy.** A quiet clock, a small crest, a night-graded owl on a fixed perch line. One help line, for 3 s on arrival.
- **Keys that were lost.** The first key after coming back from a film is no longer swallowed: the launch settles when the app takes the screen. The Home key no longer breaks classic mode, and goes straight to the Parapet from the Room of Requirement. OK wakes Nox, and launches nothing. In classic mode, long Back from the Room goes back to the grid. An app installed or removed while another app had the screen shows on the Parapet when you come back.

On 3 November 2026 the APK ran on a real television for the first time (Android TV 11, 1080p panel laid out at
960 × 540 CSS px with a device pixel ratio of 2, 1.3 GB of RAM, Free My TV as the home). This round fixes what that
test found. The TV was measured again on 4 and 5 November (`android/README.md`, "Test status", with what still fails there); what came after
the last measured build is checked on a computer only.

- **Apps open.** The page called the `window.Android` bridge methods detached from their object, which the WebView's
  Java bridge refuses: no app, film, HDMI input, Home key or TV setting could open. They are now called on the bridge.
- **Links, including Canal+.** canalplus.com joins the whitelist on both sides (`platform.js` and `Apps.java`, still
  identical), so the Canal+ film pages open.
- **Clear errors.** A failure says what happened in plain French, and "not installed" when the app is missing,
  instead of "La télé n'a pas répondu".
- **Installed apps only.** On the TV, the Admission Letter and Ollivanders offer only what is installed (Molotov
  included, Max and Canal+ not when they are absent); no more "S'ouvre dans Max" for an app the TV does not have.
- **Home is not taken at install.** The HOME entry stays disabled until the person chooses « Faire de Poudlard
  l'accueil ». Poudlard remembers the home that was the default before (third-party launchers such as Free My TV
  included) and gives the Home key back to it from « Accueil d'origine » and from the rescue screen. The documented
  rollback by hand is `cmd package set-home-activity`, since Android 11 refuses `pm disable-user`.
- **Memory and idle CPU.** Nothing moves when nothing happens: no endless animation loop, no canvas redrawn at idle,
  stars and mist stopped when unseen; the goal is a calm WebView on a 1.3 GB TV
  that no longer gets killed for memory.
- **No grain, sharper images.** The full-screen film grain is gone; images are sized for the screen (the owl sheet
  under the GPU texture limit, the rider at its display size) and the castle is sharper at 1080p.
- **Embedded fonts.** Cinzel, Cinzel Decorative, EB Garamond and IM Fell English ship in `app/assets/fonts/` with
  their OFL licence: the TV shows them without a network.
- **Music.** `app/assets/music/ambiance.ogg` (Ogg Opus, 19 MB) is the maintainer's recording from 29:45 to its end; it
  starts by itself. The APK's byte ranges now follow what the WebView really does (`docs/MUSIC.md`): the file never played
  on the TV before, the synthesised waltz stood in for it.
- **Cues off the key.** The sound cues are rendered once ahead of time; a key only starts one buffer.
- **One path for every TV.** The low-RAM cross-fade is gone from the router. Nothing sets the Économie motion by itself
  any more, and a TV that 0.2 left there moves to Auto once; an explicit choice is kept.
- **The shop windows, rebuilt.** Ollivanders and the Beasts window are now his picture and nothing over it: no veil, no
  gold outline, no grade, no vignette, one opaque image as light as his outside a soft patch behind the caption. The
  chosen box or suitcase is a sprite cut out of the picture pixel for pixel (`tools/shop_sprites.py`, real antialiased
  silhouettes, the inside of the handle included), its own light up by a hair and its soft shadow baked: it rises on
  its place while the old one settles back, and a new key retargets from where they are. Moving reads no layout and
  typesets nothing. Down and Up between the windows are the camera's vertical move, the neighbours' pictures decoded
  ahead, the choice going to the film straight below. The old `crane` and `uncrane` moves are gone.
- **Panels.** The router has a prepared vertical camera move (`pan-down`, `pan-up`), and a key pressed during a move is
  no longer lost.
- **The clouds move behind the castle.** The Parapet's sky is rebuilt from his picture (`tools/parapet_scene.py`): one seamless picture of his clouds, the castle's exact silhouette over it, an opaque strip below the skyline. A full loop takes ten minutes; the moon and the mountains stay put. The clouds stop in Nox, during a launch, when the page is hidden, and under reduced motion.
- **The dock.** A key no longer reads the layout or paints anything: places measured at the mount, one logo layer made once, the lift on the shared curve. Hedwig's flight can be interrupted without stopping or jumping, with one layer per pose. The low-RAM path of the Parapet (`.lite`, the still castle) is gone, and with it the logo's passing shine, the "charging" and molten gold on Lumos, and the gold ring on the bar's focus. Coming back from Ollivanders, the camera pulls back over the castle alone and the rest comes in as it settles.
- **The other screens move the same way.** The Map, the Room of Requirement, classic mode and the Remembrall each have one mark
  that glides from line to line on the shared curve: nothing is repainted and no layout is read for a move. The long task
  that opened the Map is gone (about 500 ms on a 4× throttled desktop, now about 100): three rows are built, not the
  whole catalog; a piece is a handful of elements; the faces the screens write with stay in use, all their letters
  loaded; the logos' pictures come after the key's task. The sections of the Room of Requirement stay laid out and the
  right page follows when the keys stop. The Remembrall's backdrop is lighter, without an overshoot; on the Map, the
  footprints walk between the pieces, not over them.
- **960 × 540 layouts.** The Admission Letter (page II app names no longer cut, page IV buttons inside the parchment
  and clear of the help strip) lays out cleanly at the TV's size; in Ollivanders and the Beasts window the selected
  wand or suitcase is clearly marked.
- **Repository.** The README no longer overwrites the versioned logos with `logos.example.js`; the docs say what the
  repository really carries (logos, crest pictures, music, at the maintainer's request; `DISCLAIMER.md`);
  `tools/tv.ps1` is versioned; `tools/__pycache__` is gone and ignored.

## 0.2 · November 2026

- Free My TV parity: the Home key asked through the system (RoleManager) and given back from one settings row;
  the TV's own settings opened from the launcher (eleven entries, the remote's Settings key); real HDMI ports with
  CEC names; honest errors (the TV's sentence in the Howler); app info and store from the launcher; the Admission
  Letter's page of emergency exits.
- Visual and motion: one scene clock, zero blend mode and filter; Hedwig as a sprite sheet with banking and
  feathers; camera moves between screens; Ollivanders without blur; boot as a Lumos; launch with a cancel window;
  Nox as a starfield; type scale at 3 m; house palette in CSS.
- UX and robustness: key contract (Home resets, Menu opens options, long Back asks); an error boundary that frees the
  keys; native rescue screen on a 6 s Back; original copy everywhere; honest accessibility (system reduced motion,
  larger text).
- Android: sticky watchdog revert, lost-role detection after TV updates, device guards (Fire TV, low RAM, phone,
  Samsung 2017-2018), `tools/tv.sh` / `tv.ps1`.

## 0.1 · November 2026

First public version: the web mock-up and the Android skeleton.
