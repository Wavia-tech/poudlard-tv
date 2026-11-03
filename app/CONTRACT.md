# Module contract — Poudlard TV

Web mock-up of a "Hogwarts" Android TV launcher, an interactive specification embedded as is by the Android port
(`android/`, plain Java, no Gradle). This contract says how the code is written and fixes the art direction (section
"Art direction", the single source; `app/README.md` points to it). Reference method for the port (`adb` installation,
Home → Poudlard / Original toggle, safety net): [Free My TV](https://github.com/simbasjungles/free-my-tv).
Publishing rules: `DISCLAIMER.md` at the root.

All the code: ES modules (`type="module"`), no dependencies, no network access at runtime (Google Fonts are the
mock-up's only remote resource; the APK, with no network, falls back to system fonts until they are placed in
`assets/fonts/`), no minification.

## File tree

```
app/
  index.html                 test bench: TV frame (#stage) + on-screen remote (data-action buttons)
  css/base.css               tokens, test bench, stage, screen transitions (.enter-* / .leave-*), .fx-*
  css/shared.css             shared materials: .gold-logo (embossed gold), .ivory-logo (engraved ivory), .engraved, .parchment, .keyhint
  css/owl.css                Hedwig
  css/screens/<name>.css     one file per screen, class prefix = screen name (.home-, .olv-, .map-, .set-, .sort-, .cls-); linked from index.html
  js/main.js                 start-up: config → theme → screens → router → sleep → background music on the first gesture
  js/config.js               CATALOG, LIBRARY, HOUSES, DOCK_MAX, DEFAULT_CONFIG; loadConfig/getConfig/updateConfig/resetConfig/onConfigChange;
                             appById(id), dockApps(), allApps() (with onDock/hidden), addCustomApp/removeCustomApp, isReduced()
  js/platform.js             Platform.launch(app) / openContent(app, item) / installed() — the only door to the outside; returns 'bridge' | 'simulated' | 'opened'.
                             Android bridge called today: window.Android.launch(pkg), switchInput(input), openUrl(url, pkg) → { ok, error }; installedPackages() → JSON array.
                             Exposed by Bridge.java but not yet called: appIcon(pkg) → data URI | null, setHome('poudlard'|'original') → { ok, error },
                             homeMode() → 'poudlard' | 'original', version() → string (android/README.md, docs/FREE-MY-TV.md)
  js/input.js                actions: left right up down ok back menu longok longback home; Input.press(a); Input.hold()/release() (queue)
  js/router.js               Router.go(name, params, transition) / replace / back / current / refocus; transitions: fade | up | down | iris
  js/fx.js                   Fx.burst(x, y, n, power) / Fx.lumos(host, x, y, ms) / Fx.cue(name) / Fx.ambient(mode) / Fx.chime / Fx.whoosh() / Fx.initAudio()
  js/sound.js                Web Audio celesta: original cues + background music (original synthesized waltz, or a personal file kept out of the repo); see "Sound"
  js/owl.js                  Hedwig (used only by the home screen)
  js/monogram.js             monogram(name) → { src, ratio, luma }: fallback logo when LOGOS[id] is missing
  js/crests.js               house crests (pen strokes, no official coat of arms)
  js/rappeltout.js           shared context menu (see API)
  js/beuglante.js            shared error message (see API)
  js/screens/index.js        export const SCREENS = { home, library, map, settings, sorting, classic }; `library` is served by ollivanders.js
  js/screens/<name>.js       one screen = export default { mount(root, ctx), unmount(), onKey(action, ctx) → bool }
  assets/logos.example.js    export const LOGOS = {} — the public repo distributes NO official logo
  assets/logos.js            OUT OF THE REPO (.gitignore): a copy of logos.example.js, or a private file { id: { src: SVG dataURI, ratio, luma } } (tools/logos-build.mjs)
  assets/music/              OUT OF THE REPO: personal background music, ambiance.ogg, .mp3 or .m4a (probed in that order), never distributed (docs/MUSIC.md)
  assets/fonts/              OUT OF THE REPO by default: OFL fonts + licence, to add for the APK (@font-face in base.css)
  assets/*.jpg|png|webp      generated images: castle.jpg (1920x1088), parchment.jpg, mist.png (alpha), owl-*.png (cut out), ollivanders.webp (shop window).
                             If an image is missing: a sober fallback, never a broken image.
```

Screens and transitions (D-pad grammar):
- `home` (the Parapet): down → `library` (Ollivanders, `up` transition), up → top bar (Sound · Map · Settings; down comes back), menu → `settings` (`iris`), OK → Lumos + Platform.launch, long OK → Remembrall (Rappeltout), long Back → classic mode ("Nox?" plate). Lumos, boot-up and Nox (sleep) live INSIDE home.js (as states), not in separate screens.
- `library` (Ollivanders, `js/screens/ollivanders.js`, `.olv-` classes): the film collection displayed as a wand shop window; up or Back → `home` (`down`). OK → Platform.openContent(app, item). Replaces the former Library (dropped, out of the repo).
- `map` (Marauder's Map): Back, or down from the last row, or up from the first → `home` (`up`). Candle → `settings`.
- `settings` (Room of Requirement): Back → previous screen (`ctx.router.back()`), or `home` if the stack is empty. "Mode classique" section → `updateConfig({mode:'classique'})` then `router.replace('classic')`. "Chouette et sons" section: Owl (vive / calme / absente), Sounds (yes / no), Background music (Auto / Célesta / Aucune → `config.music`, applied live by `Fx.ambient`). "Veille" section: `idleSeconds` (1.5 / 3 / 5 / 10 min / never), **0 (never) by default** since config version 3. "À propos" section: network, version, "Rendre l'accueil Google" (a plain mention in the mock-up, see "To do on the screens side"), "Réinitialiser" (three presses), "Relancer la Lettre d'admission".
- `sorting` (Admission Letter, first launch): 3 pages; at the end `updateConfig({firstRunDone:true, house, dock, owl, sounds})` then `router.replace('home', {boot:true})`.
- `classic` (classic mode): a plain grid; up on the first row → `settings`; long Back → `updateConfig({mode:'poudlard'})` then `replace('home', {boot:true})`.

## A screen

```js
export default {
  async mount(root, ctx) { /* root: an empty <section class="screen screen-<name>">; ctx = { config(), fx, params, router } */ },
  unmount() { /* remove timers, animations, observers */ },
  onKey(action, ctx) { /* returns true if the action was consumed */ },
};
```

Rules:
- Exactly one element in focus at a time; it carries the `is-focus` class. Never a mouse.
- Units: everything in `cqw` inside the stage (1 cqw = 1% of the TV screen width; at 1080p, 1 cqw = 19.2 px). Readable from 3 m: labels ≥ 1.5 cqw, titles ≥ 2.1 cqw, clock 5.8 cqw.
- Motion: `transform` and `opacity` only; durations 150–700 ms multiplied by `var(--k)` (the test bench's slow motion); FORBIDDEN: animated `filter`,
  `blur`, `backdrop-filter`, animated `box-shadow`, permanent visible loops (apart from the window flicker and the mist). Honor
  `isReduced()` (prefers-reduced-motion or the setting): then 200 ms fades and nothing more.
- Logos: always `const L = LOGOS[app.id] || monogram(app.name)`; the public repo has no logos, so the screen must look good with monograms. Engraved ivory at rest, embossed gold in focus. Template:
  `<div class="app-logo ivory-logo" style="--m:url('…')"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div>`
  (+ the `luma` class if LOGOS[id].luma); on the `.is-focus` parent, shared.css switches to gold. Size the box with LOGOS[id].ratio
  (fixed height, width = height × ratio, capped).
- Never build HTML from uncontrolled data: names come from CATALOG/LIBRARY (constants); settings go through `sanitize()`;
  no direct `localStorage` in a screen (always `updateConfig(patch)`), no `innerHTML` with config values (textContent).
- Every screen must work if an image is missing (--night background + stars) and if the catalog is empty ("Le parapet est vide" message, never a black screen).

## Art direction

- **Fonts** (CSS variables in base.css): `--display` Cinzel (engraved: time, app names, plates, titles, capitals, letter-spacing .18–.28em);
  `--body` EB Garamond (date, states, settings, `font-variant-numeric: tabular-nums`); `--fell` IM Fell English (anything written by a wizard:
  the Map, Ollivanders labels, the Admission Letter; italic for spells; never below 1.5 cqw; never for a list of settings).
  The time as a drop cap: Cinzel Decorative 700; the date with an ornate initial (Cinzel Decorative, gold) followed by the rest in IM Fell.
- **Palette** (base.css): --night #070B14, --stone #1C2230, --moon #C9D9EA, --mist #8FB3D9, --ivory #F1EBDD, --gold-light #F1D58A, --gold #C9A24A,
  --gold-dark #6E4C14, --candle #FFB457, --parchment #E8D9B5, --ink #1B1510, --wax (house color, set by main.js), --house-glow.
- **Materials** (shared.css): `.ivory-logo` engraved ivory at rest, `.gold-logo` embossed gold in focus, `.engraved` text engraved in stone,
  `.parchment` parchment background (parchment.jpg, plain --parchment fallback), `.keyhint` key reminder. No dark band under the dock: a soft
  vertical fade (night → transparent) that blends into the image.
- **Backdrop**: the castle at night (castle.jpg), mist (mist.png) in slow parallax, flickering windows; all generated for the project,
  with no image from the films. The crests (crests.js) are pen strokes, never an official coat of arms.
- **Hedwig** (owl.js, owl.css): cut-out photo poses (perched, looking, take-off, gliding, landing, asleep) cross-faded according to flight progress;
  she lands on the chosen app and sleeps during Nox. Setting "vive / calme / absente" (lively / calm / absent).
- **Signature moments**: Lumos (light-up before launch), Nox (sleep, "Nox?" plate toward classic mode), Remembrall (Rappeltout, context menu as a glass
  sphere), Howler (Beuglante, error: a red envelope that shakes), the Admission Letter (first launch), Ollivanders (films in a wand shop window),
  the Marauder's Map (every app and the HDMI Passages), the Room of Requirement (settings).
- **Sound**: a single voice, the celesta (see "Sound" below).

## Shared APIs to implement

`js/rappeltout.js` — "Rappeltout" (Remembrall) context menu: glass sphere, darkened background, EB Garamond lines, D-pad up/down, OK picks, Back cancels.
```js
export function rappeltout(host, { title, options: [{ id, label, disabled? }], anchor?: {x, y} }) → Promise<string|null>
// Takes over the keys (Input.setHandler) while displayed and hands them back to the router (Router.refocus()) on close.
```
`js/beuglante.js` — "Beuglante" (Howler) error message: a red envelope that slides up from the bottom, shakes 4 times (rotate ±1.5°), message in IM Fell,
one option at most ("Retirer du parapet"), burns itself out after 4 s.
```js
export function beuglante(host, { message, action?: { label, onChoose } }) → { close() }
```

## Checks expected before any contribution
- `node --check` on every JS file written (ES modules pass `node --check` when the extension is .mjs: copy to a temporary .mjs).
- `node tools/test-sound.mjs` after any change to `MELODY` in sound.js.
- Re-read the CSS file: no forbidden property, everything in cqw, class prefix respected.
- Test with an empty `assets/logos.js` (a copy of `logos.example.js`): everything must display as monograms.
- See `CONTRIBUTING.md` at the root.

## Publishing (public repo)
- Never in the repo: `assets/logos.js`, `assets/music/`, `assets/fonts/` (unless with a licence), `*.apk`, `android/*.keystore`, working files (see `.gitignore`).
- No official asset, no melody from the films, no data collection, no network access: `DISCLAIMER.md`.
- No first name, no personal path in a versioned file (code and comments included).
- TV port: the Free My TV method (`adb install`, Home → Poudlard / Original inside the app, safety net); step by step in `docs/INSTALLATION.md`.

## Product choices (V4)

- **Hand-added apps**: `config.custom = [{ id: 'c_<n>', name, pkg? }]`, validated by `sanitize()` (name ≤ 20 plain characters, well-formed Android package, 12 at most).
  `addCustomApp(name, pkg?)` / `removeCustomApp(id)` in config.js; `appById`, `dockApps`, `allApps` include them (category `'perso'`, `custom: true`).
  Logo: `LOGOS[id]` does not exist for them → `monogram(name)` from `js/monogram.js` returns `{ src, ratio, luma }` in the same format (the initial in a circle).
  Rule for every screen: `const L = LOGOS[app.id] || monogram(app.name)`.
- **Dock**: 8 apps at most, all visible, centered and spread according to their number (never any scrolling); beyond 8 (impossible through the config, but to be planned for), two rows.
  No dark band under the icons: a soft vertical fade (night → transparent) that blends into the image.
- **Top-right bar on the home screen**: Sound (mutes or unmutes the cues instantly, `updateConfig({sounds})`), Map (every app), Settings. Up from the dock goes there; Down comes back to the dock.
- **Sleep**: `idleSeconds: 0` by default (never); automatic migration of earlier configs (90 s → 0).
- **Sound**: `js/sound.js` module: celesta-style Web Audio synthesis + generated reverb, ORIGINAL cues (never a theme from the films): `move`, `enter` (going down into a screen), `return` (going back up to home), `lumos`, `nox`, `wake`, `error`, `toggle`, `confirm`.
  API: `Fx.cue(name)`; `Fx.chime/arpeggio/whoosh` remain valid (aliases). Everything honors `config.sounds`.
- **Background music** (`config.music`, the "Musique de fond" row of the "Chouette et sons" section, `Fx.ambient(mode)`): three modes, `auto` (default:
  the personal file if present, otherwise the waltz), `celesta` (a slow waltz in E minor, 3/4, 66 to the quarter note, 24 bars looped, celesta + harp + string
  pad, written note by note in sound.js, originality checked by `node tools/test-sound.mjs` against Hedwig's Theme), `aucune` (none). Personal file:
  `assets/music/ambiance.ogg`, `.mp3` then `.m4a`, probed through `<audio>`, nothing else; never distributed. Levels: waltz −22 dB, file −9 dB below master;
  ducking under each cue, nothing before a gesture, paused when the page is hidden, when an app launches or during Nox, muted by `config.sounds`.
  The repo distributes no audio file. Details: `docs/MUSIC.md`.
- **Clock typography**: a drop cap. The time in Cinzel Decorative 700, the date with an ornate initial (Cinzel Decorative, gold) followed by the rest in IM Fell.

## To do on the screens side (port)

- `platform.js`: add `Platform.setHome(mode)` → `window.Android.setHome('poudlard' | 'original')` and `Platform.homeMode()`; in the mock-up, return `'simulated'`.
- `settings.js`, "À propos" section: replace "Rendre l'accueil Google" with two buttons, **Accueil → Poudlard** (`setHome('poudlard')`, opens the system
  picker) and **Accueil → Origine** (`setHome('original')`, disables the `.Home` alias and relaunches the original home), with the current state read from `homeMode()`.
  Same labels as `docs/INSTALLATION.md` and `android/README.md`.
- Classic mode: `appIcon(pkg)` as the image source, monogram as the fallback.
- Fonts: `assets/fonts/` + `@font-face` in `base.css`, OFL licence included.
- `tv.html`: the stage alone, without the test bench, loaded by the APK if it exists (`build.sh`).
