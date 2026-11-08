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
  css/base.css               tokens (the motion language: --ease-arrive, --t-settle, --ease-camera, --t-pan, --t-chrome-*), test bench, stage, camera, screen transitions (.enter-* / .leave-*, .pan-fade), .fx-*
  css/shared.css             shared materials: .app-logo (ivory, its dark rim), .engraved, .parchment, .keyhint
  css/owl.css                Hedwig
  css/screens/<name>.css     one file per screen, class prefix = screen name (.home-, .olv-, .map-, .set-, .sort-, .cls-); linked from index.html
  js/main.js                 start-up: config → theme → screens → router → sleep → background music on the first gesture
  js/config.js               CATALOG, LIBRARY, HOUSES, DOCK_MAX, DEFAULT_CONFIG; loadConfig/getConfig/updateConfig/resetConfig/onConfigChange;
                             appById(id), dockApps(), allApps() (with onDock/hidden), addCustomApp/removeCustomApp, isReduced()
  js/platform.js             The only door to the outside. Every action returns { status: 'bridge'|'failed'|'simulated'|'opened', error, hint, missing? }:
                             launch(app), openContent(app, item), setHome(mode), openSystem(key, arg), liveTv(), store(). The TV's lists are read by
                             readLists() alone (main.js, in an idle moment after the boot and a moment after the page comes back from another app; never in a mount or a key: a list read from the TV is a synchronous trip to another process, up to 494 ms on the TV)
                             and kept in localStorage (`poudlard-tv.tv-lists`) from one run to the next; the reads return the last lists, never the bridge: apps() → [{pkg,label,system}] | null, installed() → Set | null,
                             inputs() → [{id,port,label,connected}] | null, hasLiveTv(). Also appIcon(pkg) (memoised), homeMode() → 'poudlard'|'original'|'simulated', version().
                             Bridge methods are always called ON the bridge object (b[method](...args)): the WebView's Java
                             bridge refuses a detached call. A failure's `error` is plain French and says "not installed" when it is.
                             Android bridge (Bridge.java, 17 methods): launch, switchInput, openUrl, installedPackages, installedApps, appIcon, setHome (hint: held |
                             role | settings | press-home | fire), originalHome, homeMode ('poudlard' | 'original' | 'reverted'), openSystem, inputs, hasLiveTv, liveTv, store,
                             fatal, device, version (docs/FREE-MY-TV.md). Platform.device() and Platform.fatal() wrap the last two.
                             Config keys beyond the defaults: passages, sky, motionSystem, text, homeNagAt (all sanitized in config.js).
  js/input.js                actions: left right up down ok back menu longok longback home, plus okdown (press feedback, never queued); Input.press(a); Input.hold()/release() (queue)
  js/router.js               Router.go(name, params, transition) / replace / back / current / refocus; transitions: fade | down | iris | snuff | pan-down | pan-up
                             (a screen may expose onLeave(transition, staysBehind) for its own flourish, and neighbours(), revisit(params), warm(), onParked() and `progressive` for the pans; every
                             screen's ctx.transition is the move it arrived by; see "The pan and the neighbours" below; reduced motion turns
                             everything into a 200 ms fade)
  js/fx.js                   ONE scene clock: Fx.tick(fn) / Fx.untick(fn) / Fx.setRate(ms); Fx.burst(x, y, n, power) / Fx.lumos(host, x, y, ms) /
                             Fx.cue(name) / Fx.ambient(mode) / Fx.chime / Fx.whoosh() / Fx.initAudio(). No screen runs its own requestAnimationFrame loop.
                             A callback unregisters itself (Fx.untick) once its motion has settled: with nothing registered, no frame runs.
  css/focus.css              the focus grammar: rest → focus → press (.is-press on the `okdown` action, --t-press-in, --t-press-out); tokens in base.css
  js/sound.js                Web Audio celesta: original cues, baked ahead of time + background music (assets/music/ambiance.ogg, or the original synthesized waltz as fallback); see "Sound"
  js/owl.js                  Hedwig: one sprite sheet (assets/owl-sheet.webp, tools/cutout_owl.py --sheet), one layer per pose, a flight that can be interrupted (moves added up, nothing read from the page), feathers on landing, startle, lookAt
  js/monogram.js             monogram(name) → { src, ratio, luma }: fallback logo when LOGOS[id] is missing
  js/crests.js               house crests: the pictures assets/crest-<house>.webp when present (third-party, versioned at the maintainer's request), original pen strokes otherwise
  js/rappeltout.js           shared context menu (see API)
  js/beuglante.js            shared error message (see API)
  js/screens/index.js        export const SCREENS = { home, library, map, settings, sorting, classic }; `library` is served by ollivanders.js
  js/screens/<name>.js       one screen = export default { mount(root, ctx), unmount(), onKey(action, ctx) → bool }
  assets/logos.js            VERSIONED at the maintainer's request (third-party trademarks, DISCLAIMER.md): { id: { src: SVG dataURI, ratio, luma, scale? } } (tools/logos-build.mjs;
                             `scale`, the optical scale for equal ink, is a table kept by hand after the generated one, applied by logoBox())
  assets/logos.example.js    export const LOGOS = {}: the shape of the file, for anyone who wants to start from nothing (never copy it over logos.js)
  assets/crest-*.webp        VERSIONED at the maintainer's request (third-party, DISCLAIMER.md): the four house crest pictures
  assets/music/ambiance.ogg  VERSIONED at the maintainer's request (DISCLAIMER.md): the background music, Ogg Opus, 19 MB (docs/MUSIC.md)
  assets/shop/               one sprite per film, cut out of the shop's pictures pixel for pixel (its own light and its shadow baked), and sprites.js, their place: tools/shop_sprites.py
  assets/fonts/              the embedded OFL fonts and their licence (css/fonts.css)
  assets/*.jpg|png|webp      generated images: castle.jpg, parchment.jpg, map-parchment.webp (the same paper cut out along its edge and curls, alpha,
                             cropped to the paper, its ring stain cloned over with clean paper: the Map's sheet), owl-sheet.webp (the owl's poses, ivory rim baked in), feather.webp,
                             ollivanders.webp, beasts.webp (the owner's pictures with a soft scrim baked in, tools/shop_sprites.py), rider.webp. Each is sized for its display size, and no image is wider than 4096 px
                             (the texture limit of some TV GPUs). If an image is missing: a sober fallback, never a broken image.
```

Screens and transitions (D-pad grammar):
- `home` (the Parapet): down → `library` (Ollivanders, `pan-down`: it stands ready one screen below), up → top bar (Sound · Map · Settings; down comes back), OK → Lumos + Platform.launch, long OK or menu → the focused app's Remembrall (Rappeltout; menu goes to `settings` (`snuff`) when the parapet is empty), long Back → classic mode ("Nox?" plate). Lumos, boot-up and Nox (sleep) live INSIDE home.js (as states), not in separate screens.
- `library` (Ollivanders, `js/screens/ollivanders.js`, `.olv-` classes): the film collection displayed as shop windows, one per collection of `LIBRARY` that has a `scene`. Up from the first window or Back → `home` (`pan-up`); Down and Up between windows → `pan-down`, `pan-up`, and the choice goes to the film straight below or above (`params.near`, an x in image pixels). OK → Platform.openContent(app, item). The caption is the film, then "Sur <app>" (or plainly that none of its apps is installed); the help line shows for 3 s on arrival and does not come back with the keys. At rest the screen is one opaque picture, the chosen sprite (`scene.sprites`, generated by `tools/shop_sprites.py`) and text: no veil, no outline, no grade, no vignette. Left and Right change two classes and read no layout: the old sprite settles while the new one rises (transform and opacity, `--t-settle`, `--ease-arrive`, no delay on any transition: a delayed one wakes the main thread at every frame of its delay), the titles and sub-lines are all typeset at mount; two titles never overlap (the old one out in 90 ms, the new one in over 180 ms from 70 ms), and a sub-line that does not change is not touched. A sprite is baked at its risen size and drawn at rest at `1 / scale`, so that the settled focus is 1:1 on the screen's pixels (`RISE`, sprites.js). The windows one move away are mounted ahead, and the hidden sprites are rasterised once before a window shows (`warm()`), because a layer at opacity 0 is not. Replaces the former Library (dropped, out of the repo).
- `map` (Marauder's Map): Back, or down from the last row, or up from the first → `home` (`pan-down`: the Parapet stands behind it, so that the camera leaves in the key's frame). Candle → `settings`. It arrives by `down`, not by a pan: nothing of it stands ready, and its sheet unfolds on a timer a moment into the slide, once its grid is built (`ARRIVE_AFTER_MS`).
- `settings` (Room of Requirement): Back → previous screen (`ctx.router.back()`), or `home` if the stack is empty. First section "Accueil de la télé": first a button « Revenir à l’accueil de la télé » (`openTvHome`, exported with `TV_HOME` for classic mode: `Platform.setHome('original')` in one press, no confirmation; it closes the HOME entry point if Poudlard held the Home key and opens the TV's own home, the recorded original or else the system TV launcher; its note says which of the two it will do), then one row "Touche Home" (Poudlard TV / Accueil d'origine → `Platform.setHome`, giving it back asks a confirmation with focus on "Non"; the hint from the TV is written in the message band; the row repaints on the `poudlard:home` document event; read-only in the mock-up). Second section "Réglages de la télé": eleven buttons → `Platform.openSystem(key)` (`TV_SCREENS`, exported for classic mode and the Map). "Mode classique" section → `updateConfig({mode:'classique'})` then `router.replace('classic')`. "Chouette et sons" section: Owl (vive / calme / absente), Sounds (yes / no), Background music (Auto / Célesta / Aucune → `config.music`, applied live by `Fx.ambient`). "Veille" section: `idleSeconds` (1.5 / 3 / 5 / 10 min / never), **0 (never) by default** since config version 3. "À propos" section: network, version, Home key, "Les issues de secours" (→ `sorting` page IV alone), "Réinitialiser" (three presses), "Relancer la Lettre d'admission".
- `sorting` (Admission Letter, first launch): 4 pages (house, spells, owl, emergency exits + "Faire de Poudlard l'accueil" on the TV); at the end `updateConfig({firstRunDone:true, house, dock, owl, sounds})` then `router.replace('home', {boot:true})`. Params `{ page, only }` open one page alone: Back returns, nothing is saved.
- `classic` (classic mode): a plain grid; up on the first row → `settings`; tail row Réglages · Télé (the TV's screens) · Touche Home (« Revenir à l’accueil de la télé », then Poudlard TV / Accueil d'origine) · Lumos; long Back → `updateConfig({mode:'poudlard'})` then `replace('home', {boot:true})`.
- Passages (HDMI): ids `in<port>`; on the TV the Map lists `Platform.inputs()` (CEC name, pale when nothing is plugged in, OK refused) plus "Télé" when `hasLiveTv()`; the mock-up shows the four catalog consoles. `config.passages[id].name` (Remembrall → "Renommer", `namePassage()`), 12 at most. Old ids ps5/ps4/xbox/switch migrate to in1–in4 (config version 4).
- Errors: a `status: 'failed'` result settles the launch at once (no card, no `Input.hold`) and the Howler reads `error`; `missing: true` adds the "Retirer du parapet" action. Apps with a package on the TV get "Infos de l'appli" in their Remembrall (`openSystem('appinfo', pkg)`); the Map's "Boutique" piece (TV only) opens the store.

## The pan and the neighbours

Everything that stacks (the Parapet, then each shop window under it) is one vertical camera move: `pan-down`, `pan-up`. The dive through the castle window is gone: it ended in a double exposure and answered the key late.

```js
Router.replace('library', { collection }, 'pan-down');   // or Router.go(...), as for any move; 'pan-up' goes the other way
```

What a screen gives and gets:
- `neighbours()`: `{ 'pan-down': { name, params }, 'pan-up': { name, params } }`, who stands next to it. Once it has settled and the keys have stopped (`NEAR_AFTER_MS`), the router mounts them one at a time, one screen away (`.is-near`), where nothing draws them, a piece per frame. Once whole, a neighbour stands in place for a few frames, all but invisible (`.is-prep`, because a layer on screen is what gets rasterised; any key sends it back at once), and goes back. The layer a pan leaves stays mounted when the new screen names it. A pan to a neighbour only sets one transform in the key's task. Under reduced motion nothing is mounted ahead.
- `mount(root, ctx)`: `ctx.prepared` is true, `ctx.transition` is the move. Mount at the picture's full light; a neighbour is mounted long before it shows, so a mount must not start what the viewer should see (arm it in `onEnter`). **A mount is cut in pieces with `await ctx.slice()`**, after which it checks that it is still wanted: each piece runs right after a frame, under 50 ms with its style and layout, and a neighbour's pieces wait while a key is being answered (`QUIET_MS`) and while a move plays. The first piece may run in a key's task: it makes the empty screen and reads no layout.
- `progressive: true`: the screen can be shown before its mount is over (the Parapet, the shop: an opaque picture first, the rest on top). A pan never waits for such a screen: the camera moves in the key's frame, and the mount goes on under it. What it adds to its `.pan-fade` waits for the end of the mount (`.is-hold`). A key that reaches a screen still being built makes what it needs (the shop's `sprite(n)`, `title(n)`) or is kept for the end (the Parapet's `keyLater`).
- `ready` or `sceneReady`, set by `mount`: a promise that says the first frame is decoded. A move to a screen that is not `progressive` waits for it, 1.2 s at most, the last key being kept and played when the move has started.
- `warm()`: called as the screen stands in place for its raster: what only shows on a move (the hidden sprites, the owl's poses, the logos' shadows) is drawn for a few frames at an opacity that cannot be seen, because a layer at opacity 0 is not rasterised. Its tiles then stay on the GPU.
- `revisit(params)`: this neighbour stood ready and the camera is coming, with these params (the shop: the film straight below or above, `params.near`, an x in image pixels).
- `onEnter(transition)`: the move starts now (the Parapet puts right here what changed while it was away: its config, an app launched from the Map, the owl it stopped). `onLeave(transition)`: this screen is leaving; it may stay mounted, off screen, so it must stop what should not run there (the Parapet pauses its clouds, the shop its help timers).
- `unmount()` comes once the camera has passed, for a layer no longer next to the screen in place. There is one instance of a screen per place on the strip: `library` is a factory (`export default () => ({ ... })`), one instance per window; `home` is one object, never mounted twice.
- Any other move (`fade`, `down`, `snuff`...) first lets the neighbours go, and the camera is at zero.
- **Behind**: the Parapet stays mounted, off screen and paused (`.is-near`, one screen above), while the Map or the Room of Requirement is open (`KEEP_BEHIND`), in place of the neighbours they let go. Closing them only moves layers in the key's task: `pan-down` from the Map, the Room's fade over the Parapet already in place. `onLeave(transition, true)` pauses it, `onParked()` brings it back to the dock once out of sight, and a change of the config it depends on is followed a moment later (`configSig`, `resync`, home.js). Any other screen lets it go. `Router.trim()` (memory pressure, `poudlard:trim`) lets go of the neighbours and of what stands behind; a later move simply shows its screen as far as it has got.
- **Finished transitions**: a CSS transition that has ended stays attached to its element until the next garbage collection, and until then the next transition of the same property on that element is refused by the compositor (`compositeFailed` 64, "incompatible animations"; measured with Tracing, a forced collection clears it) and runs on the main thread, with a main frame, a style pass and a commit at every frame of the move. The router cancels each one as it ends (`settleTransitions`, on the stage), which changes nothing on screen. A Web Animation is cancelled on `onfinish` for the same reason, and never animates a property that a transition of the same element may be animating (the dock's landing dips `.home-logo`, not `.home-lift`).

How the pan moves: every screen layer hangs on one element, the camera (`.camera`), each opaque and exactly one screen from the next, and only the camera moves, on `--ease-camera` for `--t-pan` (650 ms: about 24 device px in the first 50 ms, a peak of 3.55 px per ms, both pictures on screen for about 266 ms). Two opaque pictures, no opacity on the layers, no tear between them possible. `--ease-arrive` is not used here: over a whole screen it snaps and crawls. When every pan is over the camera and the layers go back to zero together, which changes nothing on screen. `.pan-fade` is what does not travel with its picture (the caption and help line, the Parapet's clock, crest, bar, dock and owl): it goes in `--t-chrome-out` as the move starts and comes back when the picture has nearly settled (`--t-chrome-in`, its curve holding it at 0 for the first 55 %). It never scales. The class must be on an element whose own `opacity` nothing else sets to a higher specificity; a pan never touches `transform` inside the layer.

Keys during a move: the last key pressed while a screen is being waited for is kept and played as soon as the move has started. A navigation asked for during a move waits and goes right after it, the last one winning. A pan over a pan does not wait: it retargets from where the camera is, unless it would mount again a screen on its way out or already in place (then it waits, and is dropped if it still asks for the screen in place).

Motion tokens (base.css): `--ease-arrive` `cubic-bezier(.32, .72, 0, 1)`, the one curve for what arrives; `--t-settle` 320 ms, a focus going from one element to the next; `--ease-camera` `cubic-bezier(.4, .05, .35, 1)` and `--t-pan` 650 ms, the camera. `MOVE_MS` in router.js keeps the leaving layer as long as these durations: keep them in step.

## Focus on the other screens

One focus everywhere: **the focused item lifts by transform with a soft shadow, and the others do not change.** No frame, no outline, no star, no underline, no gold. The Map, the Room of Requirement, classic mode and the Remembrall share one way of moving:
- **One mark per list.** A single element goes from line to line or from tile to tile, by its transform, on `--ease-arrive` for `--t-settle`: `.map-focus`, `.set-mark` and `.set-focus` (a slip of lighter paper with its soft shadow, under the lifted item), `.cls-frame` (a breath of ivory and the shadow: a shadow alone does not read on the night), `.rpt-mark`. A key sets a transform and a class; it retargets from where the mark is, so a quick second key never jumps.
- **Nothing is painted for a move.** What rises under the mark (a Map piece, a classic plate) is a layer painted once. A focus never changes a font weight, a border width or an opacity without a layer: those repaint or lay out.
- **Nothing is measured in a key.** The Map computes every place from `GEO` (the numbers of map.css: change both). The others read their lines' places once, when a list has just been laid out (`measure()`), and keep them; a row's height may also be a token (`--rub-h`).
- **What costs, away from the key.** Opening the Map or the Room of Requirement: the key's task only makes the empty screen, the move starts on the next frame, and the rest comes a piece per frame under it (`ctx.slice()`), the Map's two frame pictures (each an SVG document built in a style pass) one per frame on a probe nothing draws, then its rows one per frame. Only the Map rows in or next to the window exist; far ones are put away with `content-visibility: hidden`, which keeps their layout. The sections of the Room of Requirement are built in idle moments, never within `WARM_QUIET_MS` of a key (the parapet list `ROWS_PER_STEP` rows at a time, each piece laid out in the frame after), then measured and given their logos while hidden, and stay laid out and painted: they are hidden by `opacity` alone on a layer of their own (`will-change: transform, opacity`), never `visibility`, which is inherited and would restyle every line of a section each time it shows, nor `content-visibility`, which throws the paint away and had each section painted again at every visit. The right page changes when the keys stop (`TURN_MS`), never in the key's task, and a section's move restyles no more than its two sheets, the page titles and the mark (the preview is hidden by a class that only changes for the TV screens and About). A mask's SVG document is parsed on the main thread (12 to 19 ms each at 4x CPU, the first time a logo is met), so logos get their pictures one per frame (the Map, a section in view) or one per idle moment (the Room's sections in the background, the parse forced there by a style-only read), on an element that shows nothing until then. Nothing of the Map is held before it opens (parchment, logos): it has the time of its slide.
- **Faces stay warm.** The first time a glyph of a face is met at a size, its outline and metrics load on the main thread, and the browser drops them once nothing uses the face. `keepFaces()` (settings.js) keeps every face the screens use, with all its letters, on hidden lines wearing the screen's own classes (`KEPT_FACES`), one per idle moment after start-up. A new text class with a new face or size belongs in that list. These lines sit in `#stage`: query a screen's elements from its `root`, not from `document`.
- **The TV's lists.** Reading the installed apps, the HDMI inputs and the tuner is a synchronous trip to another process (494 ms for the first installed-apps call on the TV). No key and no mount may cause one: only `Platform.readLists()` does, from main.js (`readListsSoon`), in an idle moment a moment after the Lumos boot (2.5 s after the start on the other first screens) and a moment after the page comes back from another app. `apps()`, `installed()`, `has()`, `inputs()`, `hasLiveTv()` return the last lists read, kept in localStorage from one run to the next; before the very first read on a new TV they are unknown (null, nothing refused). When a read finds a change, the Parapet (mounted, parked or standing ready) and the screen in place are told (`listsRead()`, each in a task of its own): the Parapet rebuilds its dock if a flag changed, the Letter rebuilds page II's offer as long as it has not been shown. `homeMode()` and `appIcon()` stay bridge calls, made on demand.
- **Web Animations.** Restarting one needs no forced layout (never `remove class; offsetWidth; add class`). No `delay` on animations that start together: a delay wakes the main thread every frame until the last one has started; write each one's turn in its keyframes (the Map's footprints).

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
asks "Nox ?" on the Parapet (the settings and Ollivanders send there, never a silent switch; in classic mode the settings go back to the grid); Home resets the Parapet
(`onHome()` on the screen, else `Router.replace` of the mode's home, and nothing if it is already there; debounced 700 ms); long Back 6 s is native (HomeActivity
rescue screen). A screen may expose `settle()`: main.js calls it on any uncaught error and when the page goes hidden
(the launched app took the screen), then frees the keys; keys pressed meanwhile are dropped on return (`Input.flush`).

Rules:
- Exactly one element in focus at a time; it carries the `is-focus` class. Never a mouse.
- Units: everything in `cqw` inside the stage (1 cqw = 1% of the TV screen width; at 1080p, 1 cqw = 19.2 px). Type scale from base.css tokens
  (`--t-hint` 1.7, `--t-body` 2.1, `--t-label` 2.3, `--t-title` 2.8, `--t-clock` 3.6 cqw): a raw size below `--t-hint` is forbidden. Safe area `--safe-x` / `--safe-y`.
- Motion, the guiding principle: **nothing moves when nothing happens**, but for the clouds drifting behind the castle on the Parapet (below). Motion answers a key press, then settles. Animate `transform` and
  `opacity` only (compositor-only); durations 150–700 ms multiplied by `var(--k)` (the test bench's slow motion). FORBIDDEN: `filter`, `blur`,
  `backdrop-filter`, `mix-blend-mode`, animated `box-shadow`, a second requestAnimationFrame loop (use `Fx.tick`), any other infinite animation on the
  Parapet at idle, a canvas redrawn when nothing changes, a layer wider than the screen (the Parapet's three planes, 16 CSS px of margin, and its cloud loop are the only exceptions: "Art direction"), a full-screen overlay (grain, noise, vignette) over the
  scene, anything animating while it is not visible. Nox (sleep) is the only state allowed to keep moving, and it stops when the page is hidden.
  On the first device test an idle Parapet cost 110-130 % CPU with 35 % janky frames: measure idle CPU after any motion change.
  Honor `isReduced()` (the setting, or prefers-reduced-motion while "Suivre le système" is on): then 200 ms fades and nothing more. `config.motion` is 'auto' for everybody; 'reduit' and 'economie' are only ever the person's own choice (`motionChosen`), nothing sets them by itself. A TV that 0.2 left in economy moves to 'auto' once (`undoAutoEconomy`, config.js; main.js).
- Layout: everything must fit at 960 × 540 CSS px (ratio 2) and at 1920 × 1080: no text cut, no button outside its frame or over the key
  hints, the selected item always visible from three metres.
- House palette: four CSS tokens set by `html[data-house]` in base.css (`--wax`, `--house-glow`, `--house-ink`, `--house-night`); never set inline.
- Logos: always `const L = LOGOS[app.id] || monogram(app.name)`; `logos.js` is versioned, but a hand-added app has no entry, so the screen must look good with monograms too. Ivory, engraved by a dark rim, never gold; focus is carried by the lift. Template:
  `<div class="app-logo" style="--m:url('…')"><i class="l-rimD"></i><i class="l-base"></i></div>`
  (+ the `luma` class if LOGOS[id].luma). Size the box with LOGOS[id].ratio
  (fixed height, width = height × ratio, capped).
- Never build HTML from uncontrolled data: names come from CATALOG/LIBRARY (constants); settings go through `sanitize()`;
  no direct `localStorage` in a screen (always `updateConfig(patch)`), no `innerHTML` with config values (textContent).
- Every screen must work if an image is missing (--night background + stars) and if the catalog is empty ("Le parapet est vide" message, never a black screen).

## Art direction

- **Fonts** (CSS variables in base.css): `--display` Cinzel (engraved: time, app names, plates, titles, capitals, letter-spacing .18–.28em);
  `--body` EB Garamond (date, states, settings, `font-variant-numeric: tabular-nums`); `--fell` IM Fell English (anything written by a wizard:
  the Map, Ollivanders labels, the Admission Letter; italic for spells; never below 1.5 cqw; never for a list of settings).
  The time: Cinzel 3.6 cqw, ivory at 90 %, lining figures, a soft dark halo and nothing else; the date: one run of EB Garamond, lining figures. The picture and the chosen app come first.
- **Palette** (base.css): --night #070B14, --stone #1C2230, --moon #C9D9EA, --mist #8FB3D9, --ivory #F1EBDD, --gold-light #F1D58A, --gold #C9A24A,
  --gold-dark #6E4C14, --candle #FFB457, --parchment #E8D9B5, --ink #1B1510, --wax (house color, set by main.js), --house-glow.
- **Materials** (shared.css): `.app-logo` ivory with its dark rim, `.engraved` text engraved in stone,
  `.parchment` parchment background (parchment.jpg, plain --parchment fallback), `.keyhint` the help line: one component, one baseline for every screen, 2.85 cqw from the bottom. No dark band under the dock: a soft
  vertical fade (night → transparent) that blends into the image.
- **Backdrop**: the castle at night, cut from castle.jpg by `tools/parapet_scene.py` (`assets/scene/`; scene.json and windows.json are its reference notes: no page fetches them, `DEPTH` and `LIT_BANDS` in home.js and home.css are hand copies of their numbers, and build.sh leaves them out of the APK): at rest it is that
  picture. Three planes slide a few px as the focus moves, the sky and the castle together, so that the moon never slides over its clouds, the foreground more, 992 CSS px wide for a 16 px margin, permanently composited; castle.jpg alone is the
  fallback (still, no clouds). On the TV's GPU every blended screen-sized layer holds back every move of the Parapet (measured: two cloud layers and a veil gave a 21.7 ms median frame on the dock), so
  the sky is one opaque picture that moves and one blended picture that does not. The sky plane: the clouds, seamless, 1:1 on the screen's pixels, his own pixels wherever the sky shows at rest, but against the moon, where his crescents would leave as a ghost of its outline, around the castle's edges, and with fine wisps from his crispest clouds over his soft sky, since all of it passes by the moon. The castle plane: an opaque strip for all that is below the skyline, and above it one picture of all that does not
  drift: the moon's disc, which lets a little of what passes show through, and the sky's light and blue, a function of the distance to the moon's centre and of nothing else, measured on his sky, most of it lying on the clouds as they pass (one plane with the castle: nothing can open between them, and no shape of a cloud stays behind), the exact silhouette and nothing frozen around it, the mountains (the faint one on the left at a quarter, clouds passing through it). The foreground: the pines. The lake mist and the night fade are baked into the strip and the
  pines: no screen-sized layer for them. A WebP is not known to be opaque when its layer is made: the clouds and the strip stand on a solid background (`.home-cloud`, `.home-castle-base`), or the compositor blends them and draws all that is behind. **The clouds drift** one loop in about 170 s (a timer in home.js, 12 steps of one device px a second, held for 1.5 s after each key; never a CSS animation, which left paused made a quarter of the other screens' frames late on the TV). They are the only thing that moves at rest; they stop in Nox, during a launch, off screen, when the page is hidden, and
  do not exist under reduced motion. The sky's tint by the hour (`data-sky`: dusk, deep, dawn; `config.sky` 'nuit' keeps the night) is one gradient painted inside each still picture (`.home-tint`), once, never a layer of its own and never animated. Lit windows (a
  pre-rendered layer revealed in a left-to-right wave on Lumos and wake); the "Ambiance vivante" option (`config.ambiance`, 'calme' by
  default, config version 5, `isAmbianceOn()`) adds a slow lake mist drift and reflections; all generated for the
  project, with no image from the films. No grain or noise overlay: sharpness comes from the images themselves. The crests: the four
  pictures versioned at the maintainer's request (DISCLAIMER.md), or `crests.js`'s original pen strokes.
- **The dock** (home.js, home.css): a key sets two classes and starts Hedwig's flight, nothing else: no layout is read (the places are measured at the
  mount and on a resize), nothing is painted (each logo is one layer made at the mount, on a lift drawn at its focused size, the same ivory at .62 at rest and at
  1 in focus, scale 1.14; its soft shadow is a second). No reflection, no gold. Transform and opacity on `--ease-arrive` for `--t-settle`.
- **Hedwig** (owl.js, owl.css): cut-out photo poses (perched, looking, take-off, gliding, landing, asleep), one layer each, a hard cut between them, never a cross-fade: one glide pose moved by the transform, 320 to 380 ms on the curve of the focus, her feet on one perch line over the row, graded for the night (`cutout_owl.py --grade`);
  a key pressed mid-flight adds a move to the ones under way, so she never stops and never jumps; she lands on the chosen app and sleeps during Nox. Setting "vive / calme / absente" (lively / calm / absent).
- **Signature moments**: Lumos (light-up before launch), Nox (sleep, "Nox?" plate toward classic mode), Remembrall (Rappeltout, context menu as a glass
  sphere), Howler (Beuglante, error: a red envelope that shakes), the Admission Letter (first launch), Ollivanders (films in a wand shop window),
  the Marauder's Map (every app and the HDMI Passages), the Room of Requirement (settings).
- **Sound**: a single voice, the celesta (see "Sound" below).

## Shared APIs to implement

`js/rappeltout.js` — "Rappeltout" (Remembrall) context menu: glass sphere, lightly dimmed background, EB Garamond lines, D-pad up/down, OK picks, Back cancels.
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
- Look at every screen touched at 960 × 540, ratio 2, and at 1920 × 1080; with nothing pressed, the page must be still (no frame running), but for the steps of the clouds on the Parapet.
- See `CONTRIBUTING.md` at the root.

## Publishing (public repo)
- Never in the repo: `*.apk`, `android/*.keystore`, `android/out/`, the build clone `repo/`, `__pycache__/`, working files (see `.gitignore`), nor a personal
  replacement of a versioned file (your own `logos.js` or `ambiance.ogg`).
- Versioned at the maintainer's request and listed in `DISCLAIMER.md`: `assets/logos.js`, `assets/crest-*.webp`, `assets/rider.webp`, `assets/music/ambiance.ogg`. No other third-party asset.
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
  The cues are rendered once ahead of time by an OfflineAudioContext (hall and compressor included, off the main thread, its graph built over idle moments), end to end in one buffer, and a key starts one buffer source on its stretch of it: about 1 ms at CPU x4, no oscillator, no convolver running. A cue asked for before that is done plays live.
  API: `Fx.cue(name)`; `Fx.chime/arpeggio/whoosh` remain valid (aliases). Everything honors `config.sounds`.
- **Background music** (`config.music`, the "Musique de fond" row of the "Chouette et sons" section, `Fx.ambient(mode)`): three modes, `auto` (default:
  the music file, otherwise the waltz), `celesta` (a slow waltz in E minor, 3/4, 66 to the quarter note, 24 bars looped, celesta + harp + string
  pad, written note by note in sound.js, originality checked by `node tools/test-sound.mjs` against Hedwig's Theme), `aucune` (none). Music file:
  `assets/music/ambiance.ogg` (versioned at the maintainer's request, Ogg Opus, 19 MB, 29:37, not levelled; the names probed are `MUSIC_FILES` in sound.js),
  probed through `<audio>` and played by that element alone, OUTSIDE the Web Audio graph (its level, fades and ducking are `el.volume`, stepped
  only while they move), so the AudioContext suspends 12 s after the last cue even while the music plays; the reverb (a ConvolverNode, 1.8 s
  mono on a low-RAM TV) is baked into the cues, and wired in only while a live cue or the celesta rings through it (round 5 on the TV: the graph left running cost about one
  core at idle). Levels: constants in sound.js, `FILE_DB` being the file's whole level (el.volume ≈ 0.9); ducking under each cue; on the TV it starts by
  itself with the Parapet (a desktop browser may wait for a gesture); paused when the page is hidden, when an app launches or during Nox, muted
  by `config.sounds`. Details: `docs/MUSIC.md`.
- **Clock typography**: quiet. The time in Cinzel, ivory; the date in EB Garamond, one run of text. In Nox the clock sits in the dark of the lake, away from the castle.

## To do on the screens side (port)

- Classic mode: `appIcon(pkg)` as the image source, monogram as the fallback.

**Choosing the app of a film (`library`):** OK on a film shows its apps in a row under the title (`.olv-pick`: Prime Video, HBO Max, Canal+), Left and Right go along them, OK opens the film's own link in that app, Back or Up closes. An app that is not on this TV stays dim and says so. The choice is kept per film (`config.library.apps`). Long OK only lends the film now.
