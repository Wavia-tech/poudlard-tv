# Changelog

## 0.3 · November 2026 · the first device test

On 3 November 2026 the APK ran on a real television for the first time (Android TV 11, 1080p panel laid out at
960 × 540 CSS px with a device pixel ratio of 2, 1.3 GB of RAM, Free My TV as the home). This round fixes what that
test found. A second test on the TV is still to be done (paused while the TV is in everyday use); until it is reported in `android/README.md`, these fixes
are checked in a desktop browser emulating the TV, not yet on the device.

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
  no layer wider than the screen, stars and mist stopped when unseen; the goal is a calm WebView on a 1.3 GB TV
  that no longer gets killed for memory.
- **No grain, sharper images.** The full-screen film grain is gone; images are sized for the screen (the owl sheet
  under the GPU texture limit, the rider at its display size) and the castle is sharper at 1080p.
- **Embedded fonts.** Cinzel, Cinzel Decorative, EB Garamond and IM Fell English ship in `app/assets/fonts/` with
  their OFL licence: the TV shows them without a network.
- **Music.** `app/assets/music/ambiance.ogg` (Ogg Opus, under 3 MB) replaces the 28 MB mp3; it starts by itself and
  sits louder against the sound cues.
- **960 × 540 layouts.** The Admission Letter (page II app names no longer cut, page IV buttons inside the parchment
  and clear of the help strip) lays out cleanly at the TV's size; in Ollivanders and the Beasts window the selected
  wand or suitcase is clearly marked.- **Repository.** The README no longer overwrites the versioned logos with `logos.example.js`; the docs say what the
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
