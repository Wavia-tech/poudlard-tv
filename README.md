# Poudlard TV

Un écran d'accueil de télévision inspiré de l'univers de Harry Potter : un château la nuit, une chouette qui s'envole quand on change d'application, un parapet où sont posées les applications, et une télécommande qui suffit à tout faire.

Projet de fan, **non officiel**, publié par [Wavia](https://wav-ia.fr) sous licence MIT. Il n'est affilié ni à Warner Bros. Discovery, ni à Wizarding World, ni à J.K. Rowling. Voir `AVERTISSEMENT.md`.

> **In English.** A fan-made, unofficial TV home screen inspired by Harry Potter, for Android TV / Google TV. Web mock-up with no dependency (ES modules), fully driven by the remote's D-pad; the Android port (plain Java, no Gradle) embeds it in a WebView behind an explicit `window.Android` bridge. No network permission, no data collected, no official assets, no film music, no app logos distributed. Fully reversible: the original launcher is never disabled, one setting gives the home back to it, and a two-second Back press brings a plain mode back from anywhere. Install, app launching and the crash watchdog follow the [Free My TV](https://github.com/simbasjungles/free-my-tv) method (`adb install`, Leanback intents, 3 crashes in 5 minutes → original home), without its internal adb. See `docs/INSTALLATION.md`. MIT, © 2026 Wavia. Not affiliated with Warner Bros. Discovery, Wizarding World or J.K. Rowling.

## Ce que c'est

- **Le Parapet** (accueil) : l'heure en lettrine, jusqu'à huit applications réparties sur la largeur, Hedwige qui se pose sur celle qu'on choisit. OK allume (Lumos) puis ouvre l'application.
- **Ollivanders** : la collection des films, présentée comme une vitrine de baguettes ; OK ouvre le film dans l'application qui le possède.
- **La Carte du Maraudeur** : toutes les applications, les Passages (entrées HDMI : consoles, box), l'ajout d'une application à la main.
- **La Salle sur Demande** : les réglages, tous au D-pad.
- **La Lettre d'admission** : le premier lancement (maison, applications, Hedwige), moins d'une minute.
- **Le mode classique** : un accueil sobre, mêmes applications, sans décor. Retour maintenu deux secondes y mène depuis n'importe quel écran, et en revient.

Le tout en modules ES natifs, sans dépendance, sans bundler, sans accès réseau à l'exécution.

## Démo

Maquette web pilotée au clavier (flèches, Entrée, Échap, M) :

```bash
git clone https://github.com/Wavia-tech/poudlard-tv.git
cd poudlard-tv
cp app/assets/logos.example.js app/assets/logos.js   # pas de logos officiels dans le dépôt : monogrammes
node tools/serve.mjs . 8765
```

Puis http://localhost:8765/app/index.html. Le banc d'essai affiche une télécommande à l'écran et un ralenti ×3 pour régler les gestes.

## Installation

- **Web** : les quatre commandes ci-dessus ; détails dans `docs/INSTALLATION.md`.
- **Télévision** : construction de l'APK avec `android/build.sh` (Java, sans Gradle), installation par `adb`, choix de l'accueil dans le sélecteur du système, retour à l'accueil d'origine en un réglage. Procédure complète, Chromecast compris, dans `docs/INSTALLATION.md` ; ce qui est repris de Free My TV dans `docs/FREE-MY-TV.md`.

## Réversibilité

C'est la règle la plus importante du projet : on doit pouvoir rendre la télévision telle qu'on l'a trouvée, en moins d'une minute, sans ordinateur.

1. Retour maintenu 2 s → mode classique (depuis n'importe quel écran).
2. Réglages → À propos → **Accueil → Origine** : le launcher désactive sa propre entrée d'accueil et relance celui d'origine, qui n'a jamais été désactivé. **Accueil → Poudlard** fait le chemin inverse (il ouvre le sélecteur d'accueil du système ; c'est vous qui choisissez).
3. Désinstaller l'application remet tout en place.
4. Trois fermetures anormales en cinq minutes : le launcher rend la main de lui-même (méthode Free My TV).

## Sécurité et données

- Aucune permission réseau dans le manifeste Android. En maquette, la seule requête distante est le chargement des polices Google ; dans l'APK, sans permission réseau, la WebView retombe sur les polices système tant que les polices OFL ne sont pas placées dans `app/assets/fonts/` avec leur licence (voir `docs/INSTALLATION.md`, dépannage).
- Aucune bibliothèque tierce, aucune analytique, aucun compte, aucun historique.
- Lancement par intent explicite uniquement, sur un package présent dans la configuration ; liens de contenus limités à une liste blanche d'hôtes ; jamais d'URL saisie à l'écran.
- Tout ce qui est lu du stockage est validé (`sanitize()`) : un stockage corrompu ne peut rien injecter.

## Organisation du dépôt

```
app/            la maquette web (index.html, js/, css/, assets/) ; app/README.md et app/CONTRAT.md pour le détail technique
docs/           GUIDE.md (la démarche, étape par étape, avec les prompts), INSTALLATION.md (web + TV, pas à pas), FREE-MY-TV.md (ce qu'on reprend du projet de référence), MUSIQUE.md (sons, musique de fond, droits)
tools/          serveur statique, assemblage de ses propres logos, méthode de génération des décors
android/        portage Android TV (Java pur, build.sh, WebView + pont window.Android)
AVERTISSEMENT.md, LICENSE (MIT), CONTRIBUTING.md
```

## Ce que l'utilisateur fournit lui-même

Le dépôt ne distribue ni logos d'applications (marques), ni musique enregistrée (droits), ni ressources officielles. Chacun peut, pour un usage privé, ajouter ses logos (`tools/README.md`) et sa musique (`docs/MUSIQUE.md`) ; ces fichiers sont ignorés par Git.

## Licence

Le code et la documentation sont sous licence MIT (`LICENSE`). Cette licence ne couvre pas ce que chaque utilisateur fournit lui-même et qui n'est pas distribué ici (logos d'applications, musique de fond), ni les marques citées, qui restent la propriété de leurs titulaires. Voir `AVERTISSEMENT.md`.

## Crédits

- Idée de départ : le reel « I vibecoded my TV to feel like Hogwarts » de @ikevinadams (Instagram).
- Méthode d'installation, de bascule et de retour arrière sur Android TV : [Free My TV](https://github.com/simbasjungles/free-my-tv) (MIT).
- Polices : Cinzel, Cinzel Decorative, EB Garamond, IM Fell English (SIL Open Font License).
- Décors, chouette, écussons, glyphes : générés et dessinés pour ce projet (`tools/README.md`).
- Sons et musique de fond : célesta synthétisé en Web Audio, phrases et valse originales (`app/js/sound.js`, `docs/MUSIQUE.md`).
- Conception et réalisation : Wavia, Nantes, 2026.

Harry Potter, Hogwarts et les noms associés sont des marques de Warner Bros. Entertainment Inc. ; les autres marques citées appartiennent à leurs titulaires. Projet de fan, non commercial, non officiel.
