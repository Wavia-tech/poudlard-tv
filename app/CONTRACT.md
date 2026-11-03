# Module contract — Poudlard TV

Web mock-up of a "Hogwarts" Android TV launcher, an interactive specification embedded as is by the Android port
(`android/`, plain Java, no Gradle). This contract says how the code is written and fixes the art direction (section
"Art direction", the single source; `app/README.md` points to it). Reference method for the port (`adb` installation,
Home → Poudlard / Original toggle, safety net): [Free My TV](https://github.com/simbasjungles/free-my-tv).
Publishing rules: `DISCLAIMER.md` at the root.

All the code: ES modules (`type="module"`), no dependencies, no network access at runtime (the fonts are embedded in
`assets/fonts/` and declared in `css/fonts.css`, for `index.html` and `tv.html` alike), no minification.

Target device: a 1080p Android TV whose WebView lays out at **960 × 540 CSS px with `devicePixelRatio` 2**, on 1.3 GB of
RAM and four weak cores (the first device test, 3 November 2026). Every screen must lay out cleanly there, and still at
1920 × 1080, ratio 1, in a desktop browser. Target: 60 fps on that TV.

## File tree

```
app/
  index.html                 test bench: TV frame (#stage) + on-screen remote (data-action buttons)
  tv.html                    the stage alone, full window: the page the APK loads
  css/fonts.css              @font-face for the embedded OFL fonts (assets/fonts/)
  css/base.css               tokens, test bench, stage, screen transitions (.enter-* / .leave-*), .fx-*
  css/shared.css             shared materials: .gold-logo (embossed gold), .ivory-logo (engraved ivory), .engraved, .parchment, .keyhint
  css/owl.css                Hedwig
  css/screens/<name>.css     one file per screen, class prefix = screen name (.home-, .olv-, .map-, .set-, .sort-, .cls-); linked from index.html
  js/main.js                 start-up: config → theme → screens → router → sleep → background music on the first gesture
  js/config.js               CATALOG, LIBRARY, HOUSES, DOCK_MAX, DEFAULT_CONFIG; loadConfig/getConfig/updateConfig/resetConfig/onConfigChange;
                             appById(id), dockApps(), allApps() (with onDock/hidden), addCustomApp/removeCustomApp, isReduced()
  js/platform.js             The only door to the outside. Every action returns { status: 'bridge'|'failed'|'simulated'|'opened', error, hint, missing? }:
                             launch(app), openContent(app, item), setHome(mode), openSystem(key, arg), liveTv(), store(). Reads, cached until
                             Platform.refresh() (called by the router before each mount): apps() → [{pkg,label,system}] | null, installed() → Set | null,
                             inputs() → [{id,port,label,connected}] | null, hasLiveTv(), appIcon(pkg), homeMode() → 'poudlard'|'original'|'simulated', version().
                             Bridge methods are always called ON the bridge object (b[method](...args)): the WebView's Java
                             bridge refuses a detached call. A failure's `error` is plain French and says "not installed" when it is.
                             Android bridge (Bridge.java, 16 methods): launch, switchInput, openUrl, installedPackages, installedApps, appIcon, setHome (hint: held |
                             role | settings | press-home | fire), homeMode ('poudlard' | 'original' | 'reverted'), openSystem, inputs, hasLiveTv, liveTv, store,
                             fatal, device, version (docs/FREE-MY-TV.md). Platform.device() and Platform.fatal() wrap the last two.
                             Config keys beyond the defaults: passages, sky, motionSystem, text, homeNagAt (all sanitized in config.js).
  js/input.js                actions: left right up down ok back menu longok longback home, plus okdown (press feedback, never queued); Input.press(a); Input.hold()/release() (queue)
  js/router.js               Router.go(name, params, transition) / replace / back / current / refocus; transitions: fade | up | down | iris | crane | uncrane | snuff
                             (a screen may expose onLeave(transition) for its own flourish; reduced motion turns everything into a 200 ms fade)
  js/fx.js                   ONE scene clock: Fx.tick(fn) / Fx.untick(fn) / Fx.setRate(ms); Fx.burst(x, y, n, power) / Fx.lumos(host, x, y, ms) /
                             Fx.cue(name) / Fx.ambient(mode) / Fx.chime / Fx.whoosh() / Fx.initAudio(). No screen runs its own requestAnimationFrame loop.
                             A callback unregisters itself (Fx.untick) once its motion has settled: with nothing registered, no frame runs.
  css/focus.css              the focus grammar: rest → focus (--t-focus) → press (.is-press on the `okdown` action) → land (.is-land, Parapet); tokens in base.css
  js/sound.js                Web Audio celesta: original cues + background music (assets/music/ambiance.ogg, or the original synthesized waltz as fallback); see "Sound"
  js/owl.js                  Hedwig: one sprite sheet (assets/owl-sheet.webp, tools/cutout_owl.py --sheet) on two layers, banking per flight segment, feathers on landing, startle, lookAt
  js/monogram.js             monogram(name) → { src, ratio, luma }: fallback logo when LOGOS[id] is missing
  js/crests.js               house crests: the pictures assets/crest-<house>.webp when present (third-party, versioned at the maintainer's request), original pen strokes otherwise
  js/rappeltout.js           shared context menu (see API)
  js/beuglante.js            shared error message (see API)
  js/screens/index.js        export const SCREENS = { home, library, map, settings, sorting, classic }; `library` is served by ollivanders.js
  js/screens/<name>.js       one screen = export default { mount(root, ctx), unmount(), onKey(action, ctx) → bool }
  assets/logos.js            VERSIONED at the maintainer's request (third-party trademarks, DISCLAIMER.md): { id: { src: SVG dataURI, ratio, luma } } (tools/logos-build.mjs)
  assets/logos.example.js    export const LOGOS = {}: the shape of the file, for anyone who wants to start from nothing (never copy it over logos.js)
  assets/crest-*.webp        VERSIONED at the maintainer's request (third-party, DISCLAIMER.md): the four house crest pictures
  assets/music/ambiance.ogg  VERSIONED at the maintainer's request (DISCLAIMER.md): the background music, Ogg Opus, under 3 MB (docs/MUSIC.md)
  assets/fonts/              the embedded OFL fonts and their licence (css/fonts.css)
  assets/*.jpg|png|webp      generated images: castle.jpg, parchment.jpg, mist.png (alpha), owl-sheet.webp (the owl's poses, ivory rim baked in), feather.webp,
                             ollivanders.webp, beasts.webp, rider.webp. Each is sized for its display size, and no image is wider than 4096 px
                             (the texture limit of some TV GPUs). If an image is missing: a sober fallback, never a broken image.
```

Screens and transitions (D-pad grammar):
- `home` (the Parapet): down → `library` (Ollivanders, `up` transition), up → top bar (Sound · Map · Settings; down comes back), OK → Lumos + Platform.launch, long OK or menu → the focused app's Remembrall (Rappeltout; menu goes to `settings` (`snuff`) when the parapet is empty), long Back → classic mode ("Nox?" plate). Lumos, boot-up and Nox (sleep) live INSIDE home.js (as states), not in separate screens.
- `library` (Ollivanders, `js/screens/ollivanders.js`, `.olv-` classes): the film collection displayed as a wand shop window; up or Back → `home` (`down`). OK → Platform.openContent(app, item). Replaces the former Library (dropped, out of the repo).
- `map` (Marauder's Map): Back, or down from the last row, or up from the first → `home` (`up`). Candle → `settings`.
- `settings` (Room of Requirement): Back → previous screen (`ctx.router.back()`), or `home` if the stack is empty. First section "Accueil de la télé": one row "Touche Home" (Poudlard TV / Accueil d'origine → `Platform.setHome`, giving it back asks a confirmation with focus on "Non"; the hint from the TV is written in the message band; the row repaints on the `poudlard:home` document event; read-only in the mock-up). Second section "Réglages de la télé": eleven buttons → `Platform.openSystem(key)` (`TV_SCREENS`, exported for classic mode and the Map). "Mode classique" section → `updateConfig({mode:'classique'})` then `router.replace('classic')`. "Chouette et sons" section: Owl (vive / calme / absente), Sounds (yes / no), Background music (Auto / Célesta / Aucune → `config.music`, applied live by `Fx.ambient`). "Veille" section: `idleSeconds` (1.5 / 3 / 5 / 10 min / never), **0 (never) by default** since config version 3. "À propos" section: network, version, Home key, "Les issues de secours" (→ `sorting` page IV alone), "Réinitialiser" (three presses), "Relancer la Lettre d'admission".
- `sorting` (Admission Letter, first launch): 4 pages (house, spells, owl, emergency exits + "Faire de Poudlard l'accueil" on the TV); at the end `updateConfig({firstRunDone:true, house, dock, owl, sounds})` then `router.replace('home', {boot:true})`. Params `{ page, only }` open one page alone: Back returns, nothing is saved.
- `classic` (classic mode): a plain grid; up on the first row → `settings`; tail row Réglages · Télé (the TV's screens) · Touche Home · Lumos; long Back → `updateConfig({mode:'poudlard'})` then `replace('home', {boot:true})`.
- Passages (HDMI): ids `in<port>`; on the TV the Map lists `Platform.inputs()` (CEC name, pale when nothing is plugged in, OK refused) plus "Télé" when `hasLiveTv()`; the mock-up shows the four catalog consoles. `config.passages[id].name` (Remembrall → "Renommer", `namePassage()`), 12 at most. Old ids ps5/ps4/xbox/switch migrate to in1–in4 (config version 4).
- Errors: a `status: 'failed'` result settles the launch at once (no card, no `Input.hold`) and the Howler reads `error`; `missing: true` adds the "Retirer du parapet" action. Apps with a package on the TV get "Infos de l'appli" in their Remembrall (`openSystem('appinfo', pkg)`); the Map's "Boutique" piece (TV only) opens the store.

## A screen

```js
export default {
  async mount(root, ctx) { /* root: an empty <section class="screen screen-<name>">; ctx = { config(), fx, params, router } */ },
  unmount() { /* remove timers, animations, observers */ },
  onKey(action, ctx) { /* returns true if the action was consumed */ },
};
```

Key contract (every screen): arrows move the single focus; OK opens (`okdown` shows the press); long OK or Menu opens the
focused item's Remembrall when it has one, else the settings; Back goes up one level and is never a trap; long Back (2 s)
asks "Nox ?" on the Parapet (the settings and Ollivanders send there, never a silent switch); Home resets the Parapet
(`onHome()` on the screen, else `Router.replace` of the mode's home; debounced 700 ms); long Back 6 s is native (HomeActivity
rescue screen). A screen may expose `settle()`: main.js calls it on any uncaught error and when the page goes hidden
(the launched app took the screen), then frees the keys; keys pressed meanwhile are dropped on return (`Input.flush`).

Rules:
- Exactly one element in focus at a time; it carries the `is-focus` class. Never a mouse.
- Units: everything in `cqw` inside the stage (1 cqw = 1% of the TV screen width; at 1080p, 1 cqw = 19.2 px). Type scale from base.css tokens
  (`--t-hint` 1.5, `--t-body` 1.85, `--t-label` 2.05, `--t-title` 2.4, `--t-clock` 6 cqw): a raw size below `--t-hint` is forbidden. Safe area `--safe-x` / `--safe-y`.
- Motion, the guiding principle: **nothing moves when nothing happens.** Motion answers a key press, then settles. Animate `transform` and
  `opacity` only (compositor-only); durations 150–700 ms multiplied by `var(--k)` (the test bench's slow motion). FORBIDDEN: `filter`, `blur`,
  `backdrop-filter`, `mix-blend-mode`, animated `box-shadow`, a second requestAnimationFrame loop (use `Fx.tick`), any infinite animation on the
  Parapet at idle, a canvas redrawn when nothing changes, a layer wider than the screen, a full-screen overlay (grain, noise, vignette) over the
  scene, anything animating while it is not visible. Nox (sleep) is the only state allowed to keep moving, and it stops when the page is hidden.
  On the first device test an idle Parapet cost 110-130 % CPU with 35 % janky frames: measure idle CPU after any motion change.
  Honor `isReduced()` (prefers-reduced-motion or the setting): then 200 ms fades and nothing more.
- Layout: everything must fit at 960 × 540 CSS px (ratio 2) and at 1920 × 1080: no text cut, no button outside its frame or over the key
  hints, the selected item always visible from three metres.
- House palette: four CSS tokens set by `html[data-house]` in base.css (`--wax`, `--house-glow`, `--house-ink`, `--house-night`); never set inline.
- Logos: always `const L = LOGOS[app.id] || monogram(app.name)`; `logos.js` is versioned, but a hand-added app has no entry, so the screen must look good with monograms too. Engraved ivory at rest, embossed gold in focus. Template:
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
- **Backdrop**: the castle at night (castle.jpg), mist (mist.png), lit windows; still when nobody touches the remote; all generated for the
  project, with no image from the films. No grain or noise overlay: sharpness comes from the images themselves. The crests: the four
  pictures versioned at the maintainer's request (DISCLAIMER.md), or `crests.js`'s original pen strokes.
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
- Test an app without a logo (add one by hand from the Map): it must display as a monogram. Never copy `logos.example.js` over the versioned `logos.js`.
- Look at every screen touched at 960 × 540, ratio 2, and at 1920 × 1080; with nothing pressed, the page must be still (no frame running).
- See `CONTRIBUTING.md` at the root.

## Publishing (public repo)
- Never in the repo: `*.apk`, `android/*.keystore`, `android/out/`, the build clone `repo/`, `__pycache__/`, working files (see `.gitignore`), nor a personal
  replacement of a versioned file (your own `logos.js` or `ambiance.ogg`).
- Versioned at the maintainer's request and listed in `DISCLAIMER.md`: `assets/logos.js`, `assets/crest-*.webp`, `assets/music/ambiance.ogg`. No other third-party asset.
- Fonts only with their licence (`assets/fonts/`, OFL).
- No other official asset, no melody from the films in the code, no data collection, no network access: `DISCLAIMER.md`.
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
  the music file, otherwise the waltz), `celesta` (a slow waltz in E minor, 3/4, 66 to the quarter note, 24 bars looped, celesta + harp + string
  pad, written note by note in sound.js, originality checked by `node tools/test-sound.mjs` against Hedwig's Theme), `aucune` (none). Music file:
  `assets/music/ambiance.ogg` (versioned at the maintainer's request, Ogg Opus, under 3 MB; the names probed are `MUSIC_FILES` in sound.js),
  probed through `<audio>`. Levels: constants in sound.js, the file loud enough against the cues; ducking under each cue; on the TV it starts by
  itself with the Parapet (a desktop browser may wait for a gesture); paused when the page is hidden, when an app launches or during Nox, muted
  by `config.sounds`. Details: `docs/MUSIC.md`.
- **Clock typography**: a drop cap. The time in Cinzel Decorative 700, the date with an ornate initial (Cinzel Decorative, gold) followed by the rest in IM Fell.

## To do on the screens side (port)

- Classic mode: `appIcon(pkg)` as the image source, monogram as the fallback.
