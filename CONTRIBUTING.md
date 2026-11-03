# Contributing

Thank you for your interest. The project is small and deliberately dependency-free; a few rules are enough.

## Before proposing a change

- Open an issue for any visible change (screen, gesture, setting) so it can be discussed first. Bug fixes and documentation fixes can go straight to a pull request.
- Read `app/CONTRACT.md`: it describes the architecture, the remote-control grammar, the units (`cqw`), the fonts, the palette and what is forbidden (animated filters, mouse, HTML built from untrusted data).
- Read `DISCLAIMER.md`: no official assets, no melody from the films, no app logos, no data collection, no network access. A pull request that crosses any of these lines will be refused, whatever its quality.

## Code rules

- Native ES modules, no bundler, no minification, no third-party library.
- Code comments in English; on-screen labels in French. Sober tone, formal "vous" in the French documentation.
- One screen = one file `app/js/screens/<name>.js` exporting `{ mount, unmount, onKey }`, and one file `app/css/screens/<name>.css` whose classes carry the screen's prefix.
- Everything read from storage goes through `sanitize()` (`app/js/config.js`). Never direct `localStorage` in a screen, never `innerHTML` with a configuration value.
- The only door to the outside is `app/js/platform.js`. Nothing else launches an app, opens a link or touches the system.
- Every screen must work if an image is missing and if the catalogue is empty.
- Logos: always `LOGOS[app.id] || monogram(app.name)`. Never assume `LOGOS` is populated.
- On the Android side (`android/`), plain Java 8, no Gradle, no library: `build.sh` refuses an APK that declares a permission.

## Checking

There is no automated test suite yet. Before opening a pull request, from the repository root:

```bash
# Syntax of each modified JS file (ES modules pass with the .mjs extension)
cp app/js/screens/home.js /tmp/home.mjs && node --check /tmp/home.mjs

# The background waltz, if app/js/sound.js changed: no quotation of the films' theme
node tools/test-sound.mjs

# The mock-up, on the keyboard
node tools/serve.mjs . 8765      # then http://localhost:8765/app/index.html
```

Check at least: first launch (Admission Letter), full D-pad navigation, held Back (plain mode and back), settings, and the "no logos" case (`logos.js` absent or empty).

## Pull request

- One pull request per topic, short description: what changes, why, how you checked it.
- No heavy binary file: raw images, intermediate renders and other working files stay out of the repository.
- Files ignored by `.gitignore` (`app/assets/logos.js`, `app/assets/music/`, `*.apk`, `android/*.keystore`) must never appear in a commit, even "just for testing".
- No personal path (user name, local folder) in a versioned file: a script must take its paths as parameters.

## License

By contributing, you agree that your contribution is published under the repository's MIT license (`LICENSE`).
