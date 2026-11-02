# Outils

Ce dossier contient ce qui sert à lancer la maquette et à reconstruire chez soi ce que le dépôt ne distribue pas. Aucun de ces outils n'est nécessaire pour utiliser l'interface une fois servie.

| Fichier | Rôle |
|---|---|
| `serve.mjs` | Serveur statique sans dépendance pour la maquette web : `node tools/serve.mjs . 8765`, puis http://localhost:8765/app/index.html. N'écoute que sur `127.0.0.1`, ne sert que les fichiers situés sous la racine donnée, aucun cache. |
| `logos-build.mjs` | Assemble un `app/assets/logos.js` privé à partir d'un dossier de SVG (ci-dessous). |
| `test-sound.mjs` | Vérifie que la valse de fond (`MELODY` dans `app/js/sound.js`) ne cite pas le thème des films : `node tools/test-sound.mjs` (voir `docs/MUSIQUE.md`). |
| `detourer_chouette.py` | Détourage d'une chouette générée sur fond noir (Pillow) : `python -I tools/detourer_chouette.py entree.png sortie.png 640`. |

Les scripts de génération des décors eux-mêmes ne sont pas versionnés (ils dépendent d'un poste et d'un modèle locaux) ; la méthode est décrite à la fin de ce document.

## Logos des applications (`app/assets/logos.js`)

Le dépôt public **ne contient pas** `app/assets/logos.js` : les logos des services sont des marques et ne sont pas redistribués (voir `AVERTISSEMENT.md`). À la place :

- `app/assets/logos.example.js` exporte un objet `LOGOS` vide ;
- chaque écran applique `const L = LOGOS[app.id] || monogram(app.name)` : sans logo, l'application reçoit un monogramme (son initiale dans un cercle, `app/js/monogram.js`), au même format.

### Démarrer sans logos

```bash
cp app/assets/logos.example.js app/assets/logos.js
```

C'est suffisant : la maquette se lance, toutes les applications ont un monogramme.

### Reconstruire ses propres logos (usage privé)

Pour un usage strictement personnel, vous pouvez assembler un `logos.js` à partir de SVG monochromes. La maquette d'origine utilisait les pictogrammes de [Simple Icons](https://simpleicons.org) (licence CC0 pour les fichiers ; les marques elles-mêmes restent celles de leurs titulaires, et Simple Icons rappelle que leur usage est soumis aux conditions de chaque marque). Vérifiez ces conditions avant tout usage autre que privé.

Format attendu, un enregistrement par `id` du `CATALOG` de `app/js/config.js` :

```js
export const LOGOS = {
  netflix: { src: 'data:image/svg+xml;base64,…', ratio: 1, luma: false },
  // …
};
```

- `src` : SVG **blanc** (`fill="#ffffff"`) sur fond transparent, encodé en base64 dans une data URI. Il sert de masque CSS : c'est `shared.css` qui le rend ivoire gravé au repos et or en relief en focus.
- `ratio` : largeur divisée par hauteur de la boîte de vue (`viewBox`). Les écrans fixent la hauteur et déduisent la largeur ; 1 pour un pictogramme carré.
- `luma` : `true` si le SVG est un aplat plein (un logo posé sur un fond coloré, par exemple) et doit être masqué par luminance plutôt que par alpha. Dans la maquette d'origine : `canal`, `max`, `tf1`, `m6`.

Procédure, avec Node seul (aucune dépendance), depuis n'importe quel répertoire, sous bash, PowerShell ou cmd :

```bash
# 1. Déposer un SVG blanc par id dans un dossier de travail, nommé <id>.svg (netflix.svg, prime.svg, …).
#    Les ids disponibles sont ceux de CATALOG : netflix prime disney canal max appletv paramount youtube
#    francetv tf1 m6 arte crunchyroll dazn twitch spotify deezer plex ps5 ps4 xbox switch
# 2. Les assembler (deuxième argument facultatif : les ids à masquer par luminance) :
node tools/logos-build.mjs ./mes-logos canal,max,tf1,m6
```

Le script écrit toujours dans `app/assets/logos.js` (chemin résolu depuis le script, pas depuis le répertoire courant). Le fichier produit est ignoré par `.gitignore` ; ne le commitez pas.

## Sur Android TV : `appIcon(pkg)` à la place des logos

Le launcher Android n'a pas besoin de ce fichier. Chaque application installée fournit déjà au système une bannière Leanback (320 × 180 dp) et une icône. Le pont `window.Android` (`android/src/fr/wavia/poudlardtv/Bridge.java`) expose une méthode `appIcon(pkg)` qui renvoie cette image en data URI (PNG), ou `null` si l'application ne fournit rien. **Dans cette version, les écrans ne l'appellent pas encore** (`app/js/platform.js` n'expose que `launch`, `openContent`, `installed`) : ils affichent `LOGOS[id]` ou le monogramme. Le branchement prévu : l'écran utilise `appIcon(pkg)` comme il utilise `LOGOS[id].src`, et le monogramme reste le repli.

Côté Java (`Apps.java`), l'image est cherchée dans cet ordre : 1) la ressource de bannière de l'application à la densité xxxhdpi (384 × 216, plus nette), 2) `getApplicationBanner`, 3) `getApplicationIcon`, centrée sur fond nuit. Elle est convertie en PNG et mise en cache en mémoire au premier affichage. Rien n'est téléchargé, rien ne sort de l'appareil, et aucun logo n'est embarqué dans l'APK.

## Comment les décors ont été produits

Toutes les images de `app/assets/` (château, parapet, parchemin, brume, chouette dans ses poses, vitrine d'Ollivanders) ont été générées en local, sans aucune image des films, puis retouchées à la main. Les scripts de génération ne sont pas versionnés (chemins propres au poste) ; voici la méthode, reproductible avec n'importe quel outil de génération local.

- **Modèle** : Z-Image Turbo (licence Apache 2.0) en GGUF quantifié Q4_K, exécuté par `sd-cli` (stable-diffusion.cpp), VAE sur CPU, 8 pas, `cfg-scale 1.0`, encodeur de texte Qwen3-4B-Instruct quantifié. Chaque image est produite avec une graine fixe, notée ci-dessous, pour pouvoir la refaire à l'identique.
- **Château** (`castle.jpg`, 1920 × 1088, graine 777) : « cinematic film still of a vast gothic wizard school castle at night, closer view, towers rising above the camera, perched on dramatic cliffs above a black mirror lake, dozens of slender towers and spires with conical slate roofs, great hall with tall arched stained glass windows glowing warm amber, lit astronomy tower, moonlight through dramatic clouds, thin mist over the water, small lanterns of rowing boats, misty highlands, 35mm anamorphic, volumetric light, deep blue and warm gold palette, no text, no people ». Le mot « Hogwarts » ne sert que de direction visuelle au modèle ; aucune image des films n'entre dans le processus.
- **Parapet** (1536 × 448, graine 21) : parapet de pierre grise vu de légèrement au-dessus, trois chandeliers de laiton aux bougies allumées, isolé sur fond noir pur.
- **Parchemin** (`parchment.jpg`, 1536 × 864, graine 33) : parchemin ancien vide, plis et bords brûlés, tache de cire, vue de dessus.
- **Brume** (`mist.png`, 1536 × 320, graine 44) : volutes de brume blanche horizontales, isolées sur fond noir pur, puis converties en alpha.
- **Chouette** (1024 × 1024, graine 11 pour toutes les poses, afin de garder le même animal) : chouette harfang, plumage blanc à rares mouchetures sombres, yeux jaunes, photo animalière, isolée sur fond noir pur, corps entier ; une variante par pose (perchée, regard par-dessus l'épaule, endormie, envol, plané, atterrissage). Détourage ensuite avec `detourer_chouette.py`.
- **Vitrine d'Ollivanders** (`ollivanders.webp`) : intérieur de boutique ancienne, étagères de boîtes longues, lumière de bougie, sans texte.

Tout prompt est en anglais, finit par « no text » et exclut personnes et figures volantes. Les sorties brutes et les rendus intermédiaires restent hors du dépôt (`.gitignore`).
