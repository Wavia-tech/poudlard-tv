# Contrat des modules — Poudlard TV

Maquette web d'un launcher Android TV « Poudlard », spécification interactive embarquée telle quelle par le portage Android
(`android/`, Java pur, sans Gradle). Le présent contrat dit comment c'est codé et fixe la direction artistique (section
« Direction artistique », seule source ; `app/README.md` y renvoie). Référence de méthode pour le portage (installation `adb`,
bascule Accueil → Poudlard / Origine, filet de sécurité) : [Free My TV](https://github.com/simbasjungles/free-my-tv).
Règles de publication : `AVERTISSEMENT.md` à la racine.

Tout le code : modules ES (`type="module"`), commentaires en français, aucune dépendance, aucun accès réseau à l'exécution
(les polices Google sont la seule ressource distante de la maquette ; l'APK, sans réseau, retombe sur les polices système tant
qu'elles ne sont pas dans `assets/fonts/`), pas de minification.

## Arborescence

```
app/
  index.html                 banc d'essai : cadre TV (#stage) + télécommande à l'écran (boutons data-action)
  css/base.css               jetons, banc d'essai, scène, transitions d'écrans (.enter-* / .leave-*), .fx-*
  css/shared.css             matières partagées : .gold-logo (or en relief), .ivory-logo (ivoire gravé), .engraved, .parchment, .keyhint
  css/owl.css                Hedwige
  css/screens/<nom>.css      un fichier par écran, préfixe de classe = nom de l'écran (.home-, .olv-, .map-, .set-, .sort-, .cls-) ; lié dans index.html
  js/main.js                 démarrage : config → thème → écrans → routeur → veille → musique de fond au premier geste
  js/config.js               CATALOG, LIBRARY, HOUSES, DOCK_MAX, DEFAULT_CONFIG ; loadConfig/getConfig/updateConfig/resetConfig/onConfigChange ;
                             appById(id), dockApps(), allApps() (avec onDock/hidden), addCustomApp/removeCustomApp, isReduced()
  js/platform.js             Platform.launch(app) / openContent(app, item) / installed() — seule porte vers l'extérieur ; retourne 'bridge' | 'simulated' | 'opened'.
                             Pont Android appelé aujourd'hui : window.Android.launch(pkg), switchInput(input), openUrl(url, pkg) → { ok, error } ; installedPackages() → tableau JSON.
                             Exposé par Bridge.java mais pas encore appelé : appIcon(pkg) → data URI | null, setHome('poudlard'|'original') → { ok, error },
                             homeMode() → 'poudlard' | 'original', version() → chaîne (android/README.md, docs/FREE-MY-TV.md)
  js/input.js                actions : left right up down ok back menu longok longback home ; Input.press(a) ; Input.hold()/release() (file d'attente)
  js/router.js               Router.go(name, params, transition) / replace / back / current / refocus ; transitions : fade | up | down | iris
  js/fx.js                   Fx.burst(x, y, n, power) / Fx.lumos(host, x, y, ms) / Fx.cue(name) / Fx.ambient(mode) / Fx.chime / Fx.whoosh() / Fx.initAudio()
  js/sound.js                célesta Web Audio : cues originales + musique de fond (valse originale synthétisée, ou fichier personnel hors dépôt) ; voir « Son »
  js/owl.js                  Hedwige (utilisée seulement par l'accueil)
  js/monogram.js             monogram(name) → { src, ratio, luma } : logo de repli quand LOGOS[id] manque
  js/crests.js               écussons des maisons (traits à la plume, sans blason officiel)
  js/rappeltout.js           menu contextuel partagé (voir API)
  js/beuglante.js            message d'erreur partagé (voir API)
  js/screens/index.js        export const SCREENS = { home, library, map, settings, sorting, classic } ; `library` est servi par ollivanders.js
  js/screens/<nom>.js        un écran = export default { mount(root, ctx), unmount(), onKey(action, ctx) → bool }
  assets/logos.example.js    export const LOGOS = {} — le dépôt public ne distribue AUCUN logo officiel
  assets/logos.js            HORS DÉPÔT (.gitignore) : copie de logos.example.js, ou fichier privé { id: { src: dataURI SVG, ratio, luma } } (tools/logos-build.mjs)
  assets/music/              HORS DÉPÔT : musique de fond personnelle, ambiance.ogg, .mp3 ou .m4a (sondés dans cet ordre), jamais distribuée (docs/MUSIQUE.md)
  assets/fonts/              HORS DÉPÔT par défaut : polices OFL + licence, à ajouter pour l'APK (@font-face dans base.css)
  assets/*.jpg|png|webp      images générées : castle.jpg (1920x1088), parchment.jpg, mist.png (alpha), owl-*.png (détourées), ollivanders.webp (vitrine).
                             Si une image manque : fallback sobre, jamais d'image cassée.
```

Écrans et transitions (grammaire D-pad) :
- `home` (Le Parapet) : bas → `library` (Ollivanders, transition `up`), haut → barre du haut (Son · Carte · Réglages ; bas en revient), menu → `settings` (`iris`), OK → Lumos + Platform.launch, OK long → Rappeltout, Retour long → mode classique (plaque « Nox ? »). Lumos, l'allumage et Nox (veille) vivent DANS home.js (états), pas dans des écrans séparés.
- `library` (Ollivanders, `js/screens/ollivanders.js`, classes `.olv-`) : la collection des films en vitrine de baguettes ; haut ou Retour → `home` (`down`). OK → Platform.openContent(app, item). Remplace l'ancienne Bibliothèque (écartée, hors dépôt).
- `map` (Carte du Maraudeur) : Retour, ou bas depuis la dernière ligne, ou haut depuis la première → `home` (`up`). Chandelle → `settings`.
- `settings` (Salle sur Demande) : Retour → écran précédent (`ctx.router.back()`), ou `home` si pile vide. Rubrique « Mode classique » → `updateConfig({mode:'classique'})` puis `router.replace('classic')`. Rubrique « Chouette et sons » : Chouette (vive / calme / absente), Sons (oui / non), Musique de fond (Auto / Célesta / Aucune → `config.music`, appliqué en direct par `Fx.ambient`). Rubrique « Veille » : `idleSeconds` (1,5 / 3 / 5 / 10 min / jamais), **0 (jamais) par défaut** depuis la version 3 de la config. Rubrique « À propos » : réseau, version, « Rendre l'accueil Google » (simple mention en maquette, voir « À faire côté écrans »), « Réinitialiser » (trois appuis), « Relancer la Lettre d'admission ».
- `sorting` (Lettre d'admission, premier lancement) : 3 pages ; à la fin `updateConfig({firstRunDone:true, house, dock, owl, sounds})` puis `router.replace('home', {boot:true})`.
- `classic` (mode classique) : grille sobre ; haut sur la première ligne → `settings` ; Retour long → `updateConfig({mode:'poudlard'})` puis `replace('home', {boot:true})`.

## Un écran

```js
export default {
  async mount(root, ctx) { /* root : <section class="screen screen-<nom>"> vide ; ctx = { config(), fx, params, router } */ },
  unmount() { /* retirer timers, animations, observers */ },
  onKey(action, ctx) { /* retourne true si l'action est consommée */ },
};
```

Règles :
- Un seul élément en focus à la fois ; il porte la classe `is-focus`. Jamais de souris.
- Unités : tout en `cqw` dans la scène (1 cqw = 1 % de la largeur de l'écran TV ; 1080p : 1 cqw = 19.2 px). Lisible à 3 m : libellés ≥ 1.5 cqw, titres ≥ 2.1 cqw, horloge 5.8 cqw.
- Mouvement : `transform` et `opacity` seulement ; durées 150–700 ms multipliées par `var(--k)` (ralenti du banc d'essai) ; INTERDITS : `filter`
  animé, `blur`, `backdrop-filter`, `box-shadow` animé, boucles visibles permanentes (hors scintillement des fenêtres et brume). Respecter
  `isReduced()` (prefers-reduced-motion ou réglage) : alors fondus 200 ms et rien de plus.
- Logos : toujours `const L = LOGOS[app.id] || monogram(app.name)` ; le dépôt public n'a pas de logos, l'écran doit être beau avec des monogrammes. Ivoire gravé au repos, or en relief en focus. Gabarit :
  `<div class="app-logo ivory-logo" style="--m:url('…')"><i class="l-ext"></i><i class="l-rimD"></i><i class="l-rimL"></i><i class="l-base"></i><i class="l-shine"></i></div>`
  (+ classe `luma` si LOGOS[id].luma) ; sur l'élément parent `.is-focus`, shared.css bascule en or. Dimensionner la boîte avec LOGOS[id].ratio
  (hauteur fixe, largeur = hauteur × ratio, plafonnée).
- Jamais de HTML construit à partir de données non contrôlées : les noms viennent de CATALOG/LIBRARY (constantes) ; les réglages passent par `sanitize()` ;
  pas de `localStorage` direct dans un écran (toujours `updateConfig(patch)`), pas d'`innerHTML` avec des valeurs de config (textContent).
- Chaque écran doit fonctionner si une image manque (fond --night + étoiles) et si le catalogue est vide (message « Le parapet est vide », jamais d'écran noir).

## Direction artistique

- **Polices** (variables CSS de base.css) : `--display` Cinzel (gravé : heure, noms d'applis, plaques, titres, capitales, letter-spacing .18–.28em) ;
  `--body` EB Garamond (date, états, réglages, `font-variant-numeric: tabular-nums`) ; `--fell` IM Fell English (ce qui est écrit par un sorcier :
  Carte, étiquettes d'Ollivanders, Lettre d'admission ; italique pour les formules ; jamais sous 1.5 cqw ; jamais pour une liste de réglages).
  L'heure en lettrine : Cinzel Decorative 700 ; la date avec une initiale ornée (Cinzel Decorative, or) suivie du reste en IM Fell.
- **Palette** (base.css) : --night #070B14, --stone #1C2230, --moon #C9D9EA, --mist #8FB3D9, --ivory #F1EBDD, --gold-light #F1D58A, --gold #C9A24A,
  --gold-dark #6E4C14, --candle #FFB457, --parchment #E8D9B5, --ink #1B1510, --wax (couleur de maison, posée par main.js), --house-glow.
- **Matières** (shared.css) : `.ivory-logo` ivoire gravé au repos, `.gold-logo` or en relief en focus, `.engraved` texte gravé dans la pierre,
  `.parchment` fond parchemin (parchment.jpg, repli uni --parchment), `.keyhint` rappel de touche. Pas de bande sombre sous le dock : un fondu
  vertical doux (nuit → transparent) qui s'intègre à l'image.
- **Décor** : château la nuit (castle.jpg), brume (mist.png) en parallaxe lente, scintillement des fenêtres ; tout généré pour le projet,
  sans image des films. Les écussons (crests.js) sont des traits à la plume, jamais un blason officiel.
- **Hedwige** (owl.js, owl.css) : poses photo détourées (perchée, regard, envol, plané, atterrissage, endormie) fondues selon l'avancement du vol ;
  elle se pose sur l'appli choisie, dort pendant Nox. Réglage « vive / calme / absente ».
- **Signatures** : Lumos (allumage avant lancement), Nox (veille, plaque « Nox ? » vers le mode classique), Rappeltout (menu contextuel en sphère
  de verre), Beuglante (erreur : enveloppe rouge qui tremble), la Lettre d'admission (premier lancement), Ollivanders (films en vitrine de baguettes),
  la Carte du Maraudeur (toutes les applis et les Passages HDMI), la Salle sur Demande (réglages).
- **Son** : une seule voix, le célesta (voir « Son » ci-dessous).

## API partagées à implémenter

`js/rappeltout.js` — menu contextuel « Rappeltout » : sphère de verre, fond assombri, lignes EB Garamond, D-pad haut/bas, OK choisit, Retour annule.
```js
export function rappeltout(host, { title, options: [{ id, label, disabled? }], anchor?: {x, y} }) → Promise<string|null>
// Prend la main sur les touches (Input.setHandler) pendant son affichage et rend la main au routeur (Router.refocus()) en se fermant.
```
`js/beuglante.js` — message d'erreur « Beuglante » : enveloppe rouge qui glisse du bas, tremble 4 fois (rotate ±1.5°), message IM Fell,
une option au plus (« Retirer du parapet »), se consume d'elle-même en 4 s.
```js
export function beuglante(host, { message, action?: { label, onChoose } }) → { close() }
```

## Vérification attendue avant toute contribution
- `node --check` sur chaque fichier JS écrit (les modules ES passent avec `node --check` si l'extension est .mjs : copier dans un .mjs temporaire).
- `node tools/test-sound.mjs` après toute modification de `MELODY` dans sound.js.
- Relire le fichier CSS : aucune propriété interdite, tout en cqw, préfixe de classe respecté.
- Tester avec `assets/logos.js` vide (copie de `logos.example.js`) : tout doit s'afficher en monogrammes.
- Voir `CONTRIBUTING.md` à la racine.

## Publication (dépôt public)
- Jamais dans le dépôt : `assets/logos.js`, `assets/music/`, `assets/fonts/` (sauf avec licence), `*.apk`, `android/*.keystore`, les fichiers de travail (voir `.gitignore`).
- Aucune ressource officielle, aucune mélodie des films, aucune collecte, aucun accès réseau : `AVERTISSEMENT.md`.
- Aucun prénom, aucun chemin personnel dans un fichier versionné (code et commentaires compris).
- Portage TV : méthode Free My TV (`adb install`, Accueil → Poudlard / Origine dans l'application, filet de sécurité) ; pas à pas dans `docs/INSTALLATION.md`.

## Choix produit (V4)

- **Applis ajoutées à la main** : `config.custom = [{ id: 'c_<n>', name, pkg? }]`, validé par `sanitize()` (nom ≤ 20 caractères sobres, package Android bien formé, 12 max).
  `addCustomApp(name, pkg?)` / `removeCustomApp(id)` dans config.js ; `appById`, `dockApps`, `allApps` les incluent (catégorie `'perso'`, `custom: true`).
  Logo : `LOGOS[id]` n'existe pas pour elles → `monogram(name)` de `js/monogram.js` renvoie `{ src, ratio, luma }` au même format (initiale dans un cercle).
  Règle pour tous les écrans : `const L = LOGOS[app.id] || monogram(app.name)`.
- **Dock** : 8 applis au plus, toutes visibles, centrées et réparties selon leur nombre (jamais de défilement) ; au-delà de 8 (impossible par config, mais à prévoir), deux rangées.
  Pas de bande sombre sous les icônes : un fondu vertical doux (nuit → transparent) qui s'intègre à l'image.
- **Barre en haut à droite de l'accueil** : Son (coupe ou remet les cues instantanément, `updateConfig({sounds})`), Carte (toutes les applis), Réglages. Haut depuis le dock y va ; Bas revient au dock.
- **Veille** : `idleSeconds: 0` par défaut (jamais) ; migration automatique des configs antérieures (90 s → 0).
- **Son** : module `js/sound.js` : synthèse Web Audio façon célesta + réverbération générée, cues ORIGINALES (jamais un thème des films) : `move`, `enter` (descendre dans un écran), `return` (remonter vers l'accueil), `lumos`, `nox`, `wake`, `error`, `toggle`, `confirm`.
  API : `Fx.cue(name)` ; `Fx.chime/arpeggio/whoosh` restent valables (alias). Tout respecte `config.sounds`.
- **Musique de fond** (`config.music`, rangée « Musique de fond » de la rubrique « Chouette et sons », `Fx.ambient(mode)`) : trois modes, `auto` (défaut :
  fichier personnel s'il existe, sinon la valse), `celesta` (une valse lente en mi mineur, 3/4, 66 à la noire, 24 mesures en boucle, célesta + harpe + nappe de
  cordes, écrite note à note dans sound.js, originalité vérifiée par `node tools/test-sound.mjs` contre le thème d'Hedwige), `aucune`. Fichier personnel :
  `assets/music/ambiance.ogg`, `.mp3` puis `.m4a`, sondés par `<audio>`, rien d'autre ; jamais distribué. Niveaux : valse −22 dB, fichier −9 dB sous le maître ;
  ducking sous chaque cue, rien avant un geste, en attente quand la page est cachée, qu'une appli se lance ou pendant Nox, coupée par `config.sounds`.
  Le dépôt ne distribue aucun fichier audio. Détail : `docs/MUSIQUE.md`.
- **Typographie de l'heure** : lettrine. L'heure en Cinzel Decorative 700, la date avec une initiale ornée (Cinzel Decorative, or) suivie du reste en IM Fell.

## À faire côté écrans (portage)

- `platform.js` : ajouter `Platform.setHome(mode)` → `window.Android.setHome('poudlard' | 'original')` et `Platform.homeMode()` ; en maquette, retourner `'simulated'`.
- `settings.js`, rubrique « À propos » : remplacer « Rendre l'accueil Google » par deux boutons, **Accueil → Poudlard** (`setHome('poudlard')`, ouvre le sélecteur
  système) et **Accueil → Origine** (`setHome('original')`, désactive l'alias `.Home` et relance l'accueil d'origine), avec l'état courant lu par `homeMode()`.
  Mêmes libellés que `docs/INSTALLATION.md` et `android/README.md`.
- Mode classique : `appIcon(pkg)` comme source d'image, monogramme en repli.
- Polices : `assets/fonts/` + `@font-face` dans `base.css`, licence OFL jointe.
- `tv.html` : la scène seule, sans banc d'essai, chargée par l'APK si elle existe (`build.sh`).
