# Contribuer

Merci de votre intérêt. Le projet est petit et volontairement sans dépendance ; quelques règles suffisent.

## Avant de proposer un changement

- Ouvrez une issue pour tout changement visible (écran, geste, réglage) afin d'en discuter d'abord. Les corrections de bug et de documentation peuvent aller directement en pull request.
- Lisez `app/CONTRAT.md` : il décrit l'architecture, la grammaire de la télécommande, les unités (`cqw`), les polices, la palette et ce qui est interdit (filtres animés, souris, HTML construit à partir de données non contrôlées).
- Lisez `AVERTISSEMENT.md` : aucune ressource officielle, aucune mélodie des films, aucun logo d'application, aucune collecte, aucun accès réseau. Une pull request qui franchit l'une de ces lignes sera refusée, quelle que soit sa qualité.

## Règles de code

- Modules ES natifs, pas de bundler, pas de minification, pas de bibliothèque tierce.
- Commentaires et libellés en français. Ton sobre, vouvoiement dans la documentation.
- Un écran = un fichier `app/js/screens/<nom>.js` qui exporte `{ mount, unmount, onKey }`, et un fichier `app/css/screens/<nom>.css` dont les classes portent le préfixe de l'écran.
- Tout ce qui est lu du stockage passe par `sanitize()` (`app/js/config.js`). Jamais de `localStorage` direct dans un écran, jamais d'`innerHTML` avec une valeur de configuration.
- La seule porte vers l'extérieur est `app/js/platform.js`. Rien d'autre ne lance une application, n'ouvre un lien ni ne touche au système.
- Chaque écran doit fonctionner si une image manque et si le catalogue est vide.
- Logos : toujours `LOGOS[app.id] || monogram(app.name)`. Ne jamais supposer que `LOGOS` est rempli.
- Côté Android (`android/`), Java 8 pur, sans Gradle ni bibliothèque : `build.sh` refuse un APK qui déclare une permission.

## Vérifier

Il n'y a pas de suite de tests automatisés pour l'instant. Avant d'ouvrir une pull request, depuis la racine du dépôt :

```bash
# Syntaxe de chaque fichier JS modifié (les modules ES passent avec l'extension .mjs)
cp app/js/screens/home.js /tmp/home.mjs && node --check /tmp/home.mjs

# La valse de fond, si app/js/sound.js a changé : aucune citation du thème des films
node tools/test-sound.mjs

# La maquette, au clavier
node tools/serve.mjs . 8765      # puis http://localhost:8765/app/index.html
```

Vérifiez au moins : premier lancement (Lettre d'admission), navigation complète au D-pad, Retour maintenu (mode classique et retour), réglages, et le cas « sans logos » (`logos.js` absent ou vide).

## Pull request

- Une pull request par sujet, titre en français, description courte : ce qui change, pourquoi, comment vous l'avez vérifié.
- Pas de fichier binaire lourd : les images brutes, rendus intermédiaires et autres fichiers de travail restent hors du dépôt.
- Les fichiers ignorés par `.gitignore` (`app/assets/logos.js`, `app/assets/music/`, `*.apk`, `android/*.keystore`) ne doivent jamais apparaître dans un commit, même « pour tester ».
- Aucun chemin personnel (nom d'utilisateur, dossier local) dans un fichier versionné : un script doit prendre ses chemins en paramètre.

## Licence

En contribuant, vous acceptez que votre contribution soit publiée sous la licence MIT du dépôt (`LICENSE`).
