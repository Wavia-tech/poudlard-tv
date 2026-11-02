# La démarche : faire de sa télévision un objet à soi

Ce guide raconte comment transformer un écran d'accueil de télévision ordinaire en quelque chose qu'on a envie de regarder tous les soirs, avec Poudlard TV comme exemple. Il est écrit pour quelqu'un qui n'a jamais ouvert un terminal : chaque étape dit ce qu'il faut réunir, ce qu'il faut préparer, puis ce qu'il faut demander à un assistant de code (Claude Code ou équivalent) dans un prompt à coller.

Une seule règle traverse tout le guide : **on ne casse rien**. À chaque étape, la télévision peut revenir à son état d'origine en moins d'une minute.

Le chemin :

1. Avant de commencer
2. Une base propre : retirer la publicité, garder l'accueil d'origine sous la main
3. Réunir ses ressources
4. L'accueil : le Parapet
5. La collection : Ollivanders
6. Les réglages et le premier lancement
7. Les sons
8. Finir proprement

---

## 1. Avant de commencer

- **Une Android TV ou Google TV** (TCL, Sony, Hisense, Philips, Xiaomi, Chromecast with Google TV, Google TV Streamer…). Samsung (Tizen) et LG (webOS) n'acceptent pas de launcher tiers : sur ces télévisions, une clé Google TV branchée en HDMI donne le même résultat.
- **Un ordinateur sur le même Wi-Fi**, avec `adb` (Android platform-tools) et, si vous voulez vous faire aider, Claude Code.
- **Le mode développeur sur la télévision** : Paramètres → Système → À propos → appuyer sept fois sur « Build ». Puis Options pour les développeurs → Débogage USB (et Débogage réseau si la télévision le propose). À la première connexion, la télévision demande « Autoriser le débogage ? » : oui.
- **Du temps pour les images, pas pour le code.** Les prompts prennent quelques minutes ; choisir un château, une chouette, une vitrine demande une soirée.

## 2. Une base propre

Deux projets ouverts font déjà le gros du travail : [Free My TV](https://github.com/simbasjungles/free-my-tv) et [CleanYourTV](https://github.com/Gathin23/cleanyourtv). Ils retirent les rangées sponsorisées et la publicité de l'accueil, et installent un accueil sobre. Poudlard TV reprend la méthode de Free My TV (installation par `adb`, lancement des applications, filet de sécurité) sans désactiver l'accueil Google : il reste installé, et un réglage le remet en place. Le détail de ce qu'on reprend : `docs/FREE-MY-TV.md`.

**Ce qu'on fait**

1. Cloner Poudlard TV, construire l'APK (`android/build.sh`) et l'installer : `docs/INSTALLATION.md`, section 2.
2. Choisir Poudlard TV comme accueil dans le sélecteur du système quand la télévision le propose. Pas avant d'avoir vérifié que « Retour maintenu deux secondes » ramène bien le mode classique, et que Réglages → À propos → Accueil → Origine rend l'accueil Google.

**Ce qu'on ne fait pas** : désactiver ou désinstaller l'accueil d'origine, installer un service d'accessibilité, donner une permission réseau au launcher. Si un tutoriel vous le propose, passez votre chemin.

## 3. Réunir ses ressources

Faites un dossier (par exemple `tv-assets/`) et nommez chaque fichier en minuscules avec des tirets. Tout ce qui suit reste chez vous : le dépôt n'en distribue rien.

| Ressource | Sert à | Format | Où la trouver, comment la préparer |
|---|---|---|---|
| Le décor de l'accueil | Le Parapet | 16:9, 1920 px de large au moins, JPEG ou WebP | Une image générée (le dépôt documente la méthode dans `tools/README.md`) ou une illustration dont vous avez les droits. Choisissez un tiers inférieur calme : les applications s'y posent. Pas de photo des films. |
| Les poses de la chouette | Hedwige | PNG détourés, fond transparent, 600 px de haut | Cinq poses suffisent : posée, ailes hautes, ailes basses, plané, atterrissage. Générées sur fond noir uni puis détourées (`tools/detourer_chouette.py`). Toutes vues de trois-quarts, tournées du même côté. |
| La vitrine | Ollivanders | 16:9, 1672×941 ou proportion identique | Une image de vitrine avec un coffret par film. Les zones de sélection sont des polygones mesurés sur l'image (`app/js/screens/ollivanders.js`, constante `BOXES`). |
| Les liens des films | Ollivanders | Une adresse web par titre | Sur le site de votre service de streaming, la page du film (ou sa recherche). Pour Netflix : `netflix.com/title/<numéro>`. Vérifiez d'abord sur JustWatch où chaque titre est disponible dans votre pays. Seuls les hôtes de la liste blanche de `app/js/platform.js` sont acceptés. |
| Les logos des applications | Le Parapet, la Carte | SVG monochromes | Sur la vraie télévision, inutile : le launcher prend l'icône que chaque application fournit au système. Pour la maquette, `tools/README.md` explique comment assembler son propre fichier, à ne pas redistribuer. |
| La musique de fond | Toute l'interface | OGG, MP3 ou M4A | Un fichier que vous possédez, dans `app/assets/music/`. Sinon, la valse de célesta synthétisée fait le travail. `docs/MUSIQUE.md`. |

## 4. L'accueil : le Parapet

L'accueil tient en une phrase : un décor, l'heure, jusqu'à huit applications réparties sur la largeur, et une chouette qui se pose sur celle qu'on choisit. Rien d'autre. Le reste de l'interface se mérite d'une pression (bas pour la collection, haut pour le son, la Carte et les réglages).

Ce qui fait la différence à l'usage, et qu'on règle en premier :

- **Le fondu plutôt que la bande.** Les applications ne sont pas posées sur un bandeau : la nuit remonte doucement depuis le bas de l'image et elles s'y posent.
- **La répartition.** Huit applications au plus, toujours toutes visibles, espacées à intervalles égaux. Jamais de défilement.
- **Le focus unique.** Une seule chose vit à la fois : l'application en focus passe de l'ivoire gravé à l'or en relief, une bougie s'allume sous elle, la chouette s'y pose. Pas de cadre, pas de panneau de verre.
- **Le silence visuel.** Pas de nom sous les icônes, pas de boucle permanente : seules les fenêtres du château scintillent.

**Prompt à coller** (remplissez les crochets) :

> Mon décor est `tv-assets/chateau.jpg`, mes poses de chouette dans `tv-assets/chouette/`. Installe-les dans `app/assets/` sous les noms attendus (`castle.jpg`, `owl-perch.png`, `owl-up.png`, `owl-down.png`, `owl-glide.png`, `owl-land.png`). Mon parapet : [Netflix, Prime Video, Disney+, Canal+, Max, Apple TV, YouTube, PlayStation 5]. Ma maison : [Gryffondor]. Relance la maquette et montre-moi l'accueil avec chaque application en focus. Ne change pas les durées des animations sans me le demander.

Regardez ensuite sur l'écran et corrigez en français courant : « la chouette est trop grosse », « descends les icônes », « le fondu cache le château ». Une demande à la fois.

## 5. La collection : Ollivanders

Les films ne sont pas une liste : c'est une vitrine. Un coffret par film, du plus modeste au plus élaboré, et OK ouvre le film dans l'application qui le possède.

1. Préparez l'image de la vitrine (voir Ressources) et placez-la dans `app/assets/ollivanders.webp`.
2. Notez les liens de chaque film.
3. Collez le prompt :

> Voici ma vitrine `app/assets/ollivanders.webp` et les liens de mes films (titre | application | lien) :
> - [À l'école des sorciers | Max | https://…]
> - […]
> Mesure la zone de chaque coffret sur l'image et mets à jour `BOXES` dans `app/js/screens/ollivanders.js` ; mets les liens dans `LIBRARY` (`app/js/config.js`). La sélection ne dessine aucun contour : un projecteur chaud sur le coffret choisi, le reste de la vitrine qui baisse d'un ton, la caméra qui se penche légèrement. Montre-moi chaque coffret sélectionné.

## 6. Les réglages et le premier lancement

Tout se règle à la télécommande, dans la Salle sur Demande (touche Menu, ou la plume en haut à droite) : les applications du parapet et leur ordre, la maison (elle teinte la bougie, le liseré, l'écusson sous l'heure), la chouette (vive, calme, absente), les sons et la musique, le mouvement (auto, réduit, économie), la veille, le mode classique, et « Accueil → Origine ».

La Lettre d'admission fait tout ça en trois pages au premier lancement. Pour la rejouer : Réglages → À propos → Relancer la Lettre d'admission.

Le mode classique est là pour les autres : la famille, l'invité, le soir où la télévision rame. Retour maintenu deux secondes depuis n'importe quel écran, et le même geste pour revenir.

## 7. Les sons

Pas de fichiers audio dans l'interface : une voix de célesta synthétisée, neuf phrases courtes (déplacement, descente, retour, Lumos, Nox, réveil, erreur, coche, confirmation) et une valse de fond, toutes originales. La touche Son en haut à droite coupe tout d'un coup. Pour une musique à vous : `docs/MUSIQUE.md`.

Ce qu'on ne fait pas : reprendre la musique des films, même modifiée. Un arrangement reste une œuvre dérivée.

## 8. Finir proprement

- **Coupez le débogage USB** quand vous avez terminé. Tant qu'il est actif, n'importe quel ordinateur du Wi-Fi peut demander à se connecter. Réactivez-le quand vous voulez changer quelque chose.
- **Tout se défait.** L'accueil d'origine n'a jamais été touché ; Réglages → À propos → Accueil → Origine le remet en place ; désinstaller l'application remet tout comme avant.
- **Une étape à la fois.** Un prompt, un regard sur l'écran, une correction en français. Les petites demandes précises marchent mieux qu'un prompt géant.
- **Gardez votre dossier de ressources.** Changer de décor, de chouette ou de vitrine plus tard, c'est un prompt court.
- **Les mains loin de la télécommande pendant une installation.** Chaque installation redémarre l'accueil.

---

Idée de départ : le reel « I vibecoded my TV to feel like Hogwarts » (@ikevinadams). Méthode d'installation et de retour arrière : Free My TV (MIT). Projet de fan, non officiel : `AVERTISSEMENT.md`.
