# Avertissement

## Projet de fan, non officiel

Poudlard TV est un projet personnel de fan, publié par Wavia à titre expérimental. Il n'est **ni affilié, ni approuvé, ni sponsorisé** par Warner Bros. Discovery, Wizarding World, J.K. Rowling, ses éditeurs ou ses ayants droit.

« Harry Potter », « Hogwarts », « Poudlard », « Wizarding World », les noms des maisons, des lieux, des objets et des personnages, ainsi que toutes les marques citées dans ce dépôt (Netflix, Prime Video, Disney+, Canal+, Max, Apple TV, Paramount+, YouTube, france.tv, TF1+, M6+, Arte, Crunchyroll, DAZN, Twitch, Spotify, Deezer, Plex, PlayStation, Xbox, Nintendo Switch, Google TV, Android TV, Chromecast et les autres) sont la propriété de leurs titulaires respectifs. Ils sont cités uniquement pour désigner les services et appareils concernés.

## Ce que le dépôt ne contient pas

- **Aucune ressource officielle** des films, des livres ou des jeux : pas de photo, pas d'extrait, pas de blason officiel, pas de lettrage à l'éclair, pas de police dérivée des affiches. Les décors (château, parchemin, brume, chouette), les écussons et les glyphes sont générés ou dessinés pour ce projet.
- **Aucune mélodie des films.** Les sons de l'interface et la musique de fond (une valse de célesta) sont synthétisés à l'exécution (Web Audio) et composés pour ce projet ; aucun fichier audio n'est distribué. Le thème d'Hedwige et les autres musiques de John Williams, Patrick Doyle, Nicholas Hooper et Alexandre Desplat sont des œuvres protégées : elles ne sont ni incluses, ni citées, ni « réarrangées ». Voir `docs/MUSIQUE.md`.
- **Aucun logo d'application.** Les logos des services de streaming sont des marques ; le dépôt ne les distribue pas. `app/assets/logos.js` est volontairement absent et ignoré par Git ; le dépôt fournit `app/assets/logos.example.js` (vide) et l'interface affiche un monogramme à la place. Sur une vraie TV, le launcher utilise l'icône que chaque application fournit elle-même au système.
- **Aucune donnée.** Le launcher ne collecte rien, ne transmet rien, n'a pas de compte, pas d'analytique, pas de rapport de plantage et aucun accès réseau. Les réglages restent dans le stockage local de l'appareil.

## Ce que l'utilisateur fournit lui-même

Pour un usage strictement privé, chacun peut compléter son installation avec :

1. **Ses logos** : un fichier `app/assets/logos.js` généré localement (procédure dans `tools/README.md`), à partir de sources dont il respecte les conditions d'utilisation. Ce fichier ne doit pas être redistribué.
2. **Sa musique de fond** : un fichier audio qu'il possède ou dont il détient une licence, déposé dans `app/assets/music/` sous le nom `ambiance.ogg`, `ambiance.mp3` ou `ambiance.m4a`. Ce dossier est ignoré par Git. La bande originale des films n'y a pas sa place.
3. **Ses liens de contenus** : les adresses des films dans son service de streaming, dans `app/js/config.js`. Seuls les hôtes de la liste blanche de `app/js/platform.js` sont acceptés.

## Usage

Ce projet est fourni « en l'état », sans garantie (voir `LICENSE`). Il n'est pas destiné à un usage commercial. Il ne contourne aucune protection, ne donne accès à aucun contenu et ne remplace aucun abonnement : il ne fait qu'ouvrir, sur demande, les applications déjà installées sur la télévision.

Si vous êtes titulaire d'un droit et estimez qu'un élément de ce dépôt y porte atteinte, ouvrez une issue : l'élément sera retiré.
