# Poudlard TV — la maquette web

Écran d'accueil de télévision « Poudlard », inspiré du reel « I vibecoded my TV to feel like Hogwarts » de @ikevinadams (Instagram).
Ce dossier est la **maquette web** : elle se pilote au clavier comme avec une télécommande et sert de spécification
interactive pour le portage Android TV, qui l'embarque telle quelle. Pour la présentation générale, l'installation et les
droits, voir le `README.md` de la racine, `docs/` et `AVERTISSEMENT.md`.

## Lancer la maquette

Aucune dépendance. Les logos d'applications ne sont pas distribués (marques) : copiez le fichier d'exemple, puis servez
le dépôt avec n'importe quel serveur statique (celui fourni suffit), depuis la racine du dépôt :

```bash
cp app/assets/logos.example.js app/assets/logos.js     # monogrammes à la place des logos
node tools/serve.mjs . 8765
```

Puis http://localhost:8765/app/index.html. Cliquez sur l'écran, puis :

| Touche | Action |
|---|---|
| ← → | choisir une appli (Hedwige s'envole, le décor glisse) ; 8 applis au plus, réparties sur la largeur |
| ↓ | Ollivanders (la collection des films, lien direct vers l'appli qui les possède) |
| ↑ | la barre en haut à droite : Son (coupe ou remet), La Carte du Maraudeur (toutes les applis, ajouter la sienne), Réglages |
| Entrée | OK : Lumos, puis l'appli s'ouvre |
| Entrée maintenue | Rappeltout (menu contextuel) |
| Échap | Retour |
| Échap maintenu 2 s | Nox ? → mode classique (launcher sobre) ; même geste pour revenir |
| M | La Salle sur Demande (réglages) |

Au premier lancement, la Lettre d'admission (maison, applis, Hedwige) prend moins d'une minute.
La veille (Nox) est **désactivée par défaut** (`idleSeconds: 0`) ; Réglages → Veille la règle de 1,5 à 10 min, ou jamais.

## Les écrans

`home` Le Parapet · `library` Ollivanders (fichier `ollivanders.js`) · `map` La Carte du Maraudeur · `settings` La Salle
sur Demande · `sorting` La Lettre d'admission · `classic` Le mode classique · plus Lumos, l'allumage et Nox, qui sont des
états de l'accueil.

Direction artistique (typographie, palette, matières, chouette, signatures) : `CONTRAT.md`, section « Direction artistique ».

## Architecture

```
app/
  index.html            banc d'essai (cadre TV + télécommande à l'écran)
  css/                  base (jetons), shared (matières), owl, rappeltout, beuglante, screens/<écran>.css
  js/main.js            démarrage
  js/config.js          catalogue d'applis, collections, réglages, applis ajoutées à la main, validation stricte du stockage
  js/platform.js        la SEULE porte vers l'extérieur (lancer une appli, basculer une entrée, ouvrir un contenu, lister les applis installées)
  js/input.js           D-pad : actions, appuis longs, file d'attente pendant Lumos
  js/router.js          un écran à la fois, transitions fade / up / down / iris
  js/fx.js              poussière, Lumos, cues sonores et musique de fond (via sound.js)
  js/sound.js           célesta synthétisé en Web Audio : cues originales + valse de fond originale ; lecteur du fichier personnel
  js/owl.js             Hedwige : poses photo fondues selon l'avancement du vol
  js/monogram.js        logo de repli : l'initiale dans un cercle, même format que LOGOS
  js/crests.js          écussons des maisons, traits à la plume, sans blason officiel
  js/rappeltout.js      menu contextuel partagé
  js/beuglante.js       message d'erreur partagé
  js/screens/<écran>.js un fichier par écran : { mount, unmount, onKey }
  assets/               images générées en local (château, brume, parchemin, chouette, vitrine Ollivanders)
  assets/logos.example.js   LOGOS vide ; le vrai logos.js est hors dépôt (voir tools/README.md)
  assets/music/         musique de fond personnelle (ambiance.ogg, .mp3 ou .m4a), hors dépôt (voir docs/MUSIQUE.md)
tools/                  serveur statique, assemblage des logos, test d'originalité de la valse, détourage, méthode de génération des décors
android/                portage Android TV (Java pur, sans Gradle) : WebView + pont window.Android
```

Côté Android, la maquette est copiée telle quelle dans l'APK par `android/build.sh` et servie à la WebView sous
`https://poudlard.tv/` ; seul `platform.js` change de comportement (pont `window.Android`).

## Modèle de configuration

Un seul objet, lisible, versionné, validé à la lecture (`sanitize()` ignore tout ce qui n'est pas connu) :

```json
{ "version": 3, "mode": "poudlard", "house": "gryffondor",
  "dock": ["netflix", "prime", "disney", "canal", "max", "appletv", "youtube", "ps5"],
  "hidden": [], "owl": "vive", "sounds": false, "motion": "auto",
  "music": "auto",
  "idleSeconds": 0,
  "lastApp": null, "firstRunDone": true,
  "library": { "hidden": [], "apps": {} },
  "custom": [{ "id": "c_1", "name": "Molotov", "pkg": "tv.molotov.app" }] }
```

- `music` : musique de fond, `auto` (fichier personnel s'il existe, sinon la valse de célesta) | `celesta` | `aucune` ; voir `docs/MUSIQUE.md`.
- `idleSeconds` : veille, 0 = jamais ; l'interface propose 90, 180, 300, 600 ou 0, `sanitize()` accepte 0 à 3600.

Maquette : `localStorage` du navigateur. Android : `localStorage` de la WebView (origine `https://poudlard.tv`), dans les
données privées de l'application, jamais synchronisé, effacé à la désinstallation. Une configuration d'une version
antérieure est migrée à la lecture (la veille, 90 s avant la version 3, passe à 0).

## Sécurité (dans l'ordre d'importance)

1. **Aucune permission réseau.** Le manifeste Android ne déclare ni `INTERNET` ni `ACCESS_NETWORK_STATE` : le système interdit lui-même toute connexion, vérifiable en une ligne (`aapt dump permissions`). En maquette, la seule requête distante est celle des polices Google ; dans l'APK, elle échoue proprement et la WebView retombe sur les polices système tant que `app/assets/fonts/` n'existe pas.
2. **Aucune bibliothèque tierce**, aucune analytics, aucun crash reporter, aucun service d'accessibilité, aucun récepteur au démarrage hors catégorie HOME. `QUERY_ALL_PACKAGES` remplacé par un bloc `<queries>` ciblant `LEANBACK_LAUNCHER`.
3. **Lancement par intent explicite uniquement** (`getLeanbackLaunchIntentForPackage`), sur un package présent dans la config ; liens profonds uniquement depuis la config, hôtes en liste blanche (`platform.js`, identique dans `Apps.java`), jamais d'URL saisie à l'écran. Un intent qui échoue donne une Beuglante, jamais un crash.
4. **Aucune collecte** : pas d'historique, pas de compte. Le launcher ne connaît que l'heure et la liste des applis installées.
5. **Réversibilité totale** : le launcher Google reste installé ; Accueil → Origine dans Réglages → À propos (bouton à brancher, voir ci-dessous) ; Retour maintenu 2 s rappelle le mode classique depuis n'importe quel écran ; désinstaller l'APK remet tout en place ; trois fermetures anormales en cinq minutes rendent la main d'elles-mêmes (méthode Free My TV).

## Images, sons et droits

- Château, parchemin, brume, chouette, vitrine : générés en local (méthode dans `tools/README.md`), sans photo des films, sans logo Warner, sans lettrage éclair.
- Logos des applis : **non distribués**. `LOGOS[id]` absent → `monogram(name)`. Pour un usage privé, `tools/README.md` explique comment assembler son propre `logos.js` ; sur Android, le pont expose l'icône fournie par chaque appli (`appIcon(pkg)`), pas encore appelée par les écrans.
- Sons : synthétisés (`sound.js`), phrases originales, aucune mélodie des films. Musique de fond : une valse de célesta originale, elle aussi synthétisée, ou un fichier personnel hors dépôt (`docs/MUSIQUE.md`).
- Polices : Cinzel, Cinzel Decorative, EB Garamond, IM Fell English (licence OFL), chargées depuis Google Fonts en maquette ; à embarquer dans `app/assets/fonts/` avec leur licence pour l'APK.

## Portage Android TV

Référence de méthode : [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT) — sans Gradle ni bibliothèque, installation par `adb`, intents Leanback avec repli, liste des applis installées sans `QUERY_ALL_PACKAGES`, entrées HDMI, filet de sécurité qui rend la main à l'accueil d'origine après trois plantages. Ce qu'on reprend et ce qu'on laisse (son adb interne et la désactivation de l'accueil Google, incompatibles avec nos règles) : `docs/FREE-MY-TV.md`.

Ce qui existe dans `android/` (Java pur, `build.sh`) : `minSdk 26`, catégorie `HOME` (alias `.Home`, désactivable) + `LEANBACK_LAUNCHER` (alias `.Start`), WebView qui charge `app/` depuis les assets, modules `Apps` (découverte, bannières, intents, liste blanche, HDMI), `HomeMode` (sélecteur système / rendre l'accueil), `Watchdog` (filet de sécurité), `HomeActivity`, et le pont `Bridge` :

| Méthode `window.Android` | Appelée par `platform.js` ? | Retour |
|---|---|---|
| `launch(pkg)` | oui | `{ ok, error }` |
| `switchInput(input)` | oui | `{ ok, error }` |
| `openUrl(url, pkg)` | oui | `{ ok, error }` |
| `installedPackages()` | oui | tableau JSON de packages |
| `appIcon(pkg)` | pas encore | data URI PNG, ou `null` |
| `setHome('poudlard' \| 'original')` | pas encore | `{ ok, error }` |
| `homeMode()` | pas encore | `"poudlard"` ou `"original"` |
| `version()` | pas encore | chaîne |

Ce qui reste à faire côté maquette : `Platform.setHome(mode)` et `Platform.homeMode()` dans `platform.js`, les deux boutons
**Accueil → Poudlard** / **Accueil → Origine** dans Réglages → À propos (à la place de « Rendre l'accueil Google »), `appIcon`
en mode classique, les polices dans `app/assets/fonts/` (`@font-face` dans `base.css`), une `tv.html` sans banc d'essai.
Pas à pas d'installation dans `docs/INSTALLATION.md`, détail du portage dans `android/README.md`.
