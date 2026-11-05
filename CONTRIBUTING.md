# Contributing

Thank you for your interest. The project is small and deliberately dependency-free; a few rules are enough.

## Before proposing a change

- Open an issue for any visible change (screen, gesture, setting) so it can be discussed first. Bug fixes and documentation fixes can go straight to a pull request.
- Read `app/CONTRACT.md`: it describes the architecture, the remote-control grammar, the units (`cqw`), the fonts, the palette, the motion budget and what is forbidden (animated filters, mouse, HTML built from untrusted data).
- Read `DISCLAIMER.md`: no new official asset, no melody from the films in the code, no data collection, no network access. The third-party files already versioned (app logos, house crest pictures, background music) are the maintainer's own decision and are listed there; do not add others. A pull request that crosses any of these lines will be refused, whatever its quality.

## Code rules

- Native ES modules, no bundler, no minification, no third-party library.
- Code comments in English; on-screen labels in French. Sober tone, formal "vous" in the French documentation.
- One screen = one file `app/js/screens/<name>.js` exporting `{ mount, unmount, onKey }`, and one file `app/css/screens/<name>.css` whose classes carry the screen's prefix.
- Everything read from storage goes through `sanitize()` (`app/js/config.js`). Never direct `localStorage` in a screen, never `innerHTML` with a configuration value.
- The only door to the outside is `app/js/platform.js`. Nothing else launches an app, opens a link or touches the system.
- Nothing moves when nothing happens: animate `transform` and `opacity` only, no infinite animation on the idle Parapet but the clouds behind the castle, no canvas redrawn when nothing changes, no layer wider than the screen but the Parapet's three planes (16 CSS px of margin) and its cloud loop (`app/CONTRACT.md`).
- Every screen must work if an image is missing and if the catalogue is empty.
- Logos: always `LOGOS[app.id] || monogram(app.name)`. Never assume `LOGOS` has an entry for every app (hand-added apps have none).
- On the Android side (`android/`), plain Java 8, no Gradle, no library: `build.sh` refuses an APK that declares a permission.

## Checking

There is no automated test suite yet. Before opening a pull request, from the repository root:

```bash
# Syntax of each modified JS file (ES modules pass with the .mjs extension)
cp app/js/screens/home.js /tmp/home.mjs && node --check /tmp/home.mjs

# The background waltz, if app/js/sound.js changed: no quotation of the films' theme
node tools/test-sound.mjs

# The mock-up, on the keyboard
node tools/serve.mjs . 8765      # then http://localhost:8765/app/index.html (test bench) or /app/tv.html (full screen)
```

Check at least: first launch (Admission Letter), full D-pad navigation, held Back (plain mode and back), settings, and an app without a logo (add one by hand from the Map: it must show a monogram). Check every screen you touched at the TV's layout size, **960 × 540 CSS px with a device pixel ratio of 2** (browser device emulation), and again at 1920 × 1080: nothing cut, nothing overlapping, nothing outside the safe area.

## Pull request

- One pull request per topic, short description: what changes, why, how you checked it.
- No heavy binary file: raw images, intermediate renders and other working files stay out of the repository. Images are sized for the screen they appear on (no texture wider than the TV needs), audio stays under the 24 MB that `tools/test-sound.mjs` allows.
- Files ignored by `.gitignore` (`*.apk`, `android/*.keystore`, `android/out/`, `repo/`, `__pycache__/`) must never appear in a commit, even "just for testing". Neither must a personal replacement of a versioned file (your own `app/assets/logos.js` or `app/assets/music/ambiance.ogg`).
- No personal path (user name, local folder) in a versioned file: a script must take its paths as parameters.

## License

By contributing, you agree that your contribution is published under the repository's MIT license (`LICENSE`).
