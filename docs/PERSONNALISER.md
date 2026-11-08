# Créer ta propre interface de télé

Poudlard TV est un exemple. Le même principe marche pour n'importe quelle passion : Star Wars, le Seigneur des
Anneaux, ton club de foot, tes photos de famille. La méthode la plus simple : partir de
[**Free My TV**](https://github.com/simbasjungles/free-my-tv), un écran d'accueil libre et gratuit, fait pour être
modifié par une IA, puis tout changer en parlant à Claude.

Compte **30 minutes** pour l'installer, puis le temps que tu veux pour la personnaliser. Tout est réversible.

## Pourquoi Free My TV comme base

- Il marche sur **plus de télés** que Poudlard TV : Google TV, Android TV, et aussi **LG** et **Samsung** (comme une
  appli).
- Il se règle **directement à la télécommande** : tes applis favorites, ta ville, le thème clair ou sombre, tes photos.
- Son code est fait pour qu'un assistant IA le modifie : il contient un mode d'emploi pour Claude (`CLAUDE.md`).
- Un seul bouton remet la télé comme avant : *Écran d'accueil* → *Original*.

Ce qu'il change sur Google TV, pour être clair : il devient l'écran d'accueil et l'économiseur d'écran, et il éteint
(sans les désinstaller) l'accueil de Google et les applis de publicité de la marque. *Original* rallume tout.

## Ce qu'il te faut

- Une télé **Google TV, Android TV, LG (webOS 3 ou plus) ou Samsung (Tizen)**. Pas d'Apple TV. Le détail :
  [`docs/TELEVISEURS.md`](TELEVISEURS.md).
- Un ordinateur sur le même Wi-Fi, avec l'application **Claude** et un abonnement payant, environ 20 € par mois (Claude Pro pour Claude Code, ou
  ChatGPT Plus pour Codex). Sur Windows,
  installe aussi [Git](https://git-scm.com/download/win).
- Le **mode développeur** activé sur la télé :
  - Google TV / Android TV : comme pour Poudlard TV ([`docs/TELEVISEURS.md`](TELEVISEURS.md)), débogage USB activé.
  - LG : installe l'appli **Developer Mode** depuis le magasin LG, connecte-toi avec un compte développeur LG gratuit,
    active *Dev Mode Status* puis *Key Server*.
  - Samsung : dans **Apps**, tape `1 2 3 4 5` à la télécommande, active *Developer mode*, et entre l'adresse IP de
    ton ordinateur.

## 1. Installer Free My TV avec Claude

1. Crée un dossier vide (par exemple `Ma-tele` sur ton bureau).
2. Ouvre Claude → icône **`</>`** (Claude Code) → choisis ce dossier.
3. Envoie ce message, en remplaçant ce qui est entre crochets :

   > Installe Free My TV sur ma télé [marque et modèle] : github.com/simbasjungles/free-my-tv
   > J'habite à [Nantes]. Mets-le en français. Je suis débutant, explique-moi simplement ce que je dois faire sur
   > la télé.

   Pas besoin de lui donner l'adresse IP : il trouve la télé sur ton réseau.

4. Claude télécharge le code, installe les outils (Java, les outils Android), construit l'appli et la met sur ta
   télé. Clique **Autoriser** quand il te le demande.
5. **Sur la télé (Google TV / Android TV)** : ouvre l'appli *Free My TV* → *Écran d'accueil* → *Free My TV*. La
   télé demande « Autoriser le débogage USB ? » pour Free My TV : coche **Toujours autoriser** puis **OK**.
   Sur LG, tu ouvres Free My TV en maintenant une touche chiffre de la télécommande ; sur Samsung, il apparaît dans la
   barre des applis.

## 2. Tout régler depuis la télé

Ouvre l'appli *Free My TV* → **Réglages de l'accueil**. À la télécommande, sans ordinateur :

| Réglage | Ce que tu choisis |
|---|---|
| *Apps favorites* | Les applis de l'étagère et leur ordre (ou OK maintenu sur une appli de l'accueil, puis ◀ ▶) |
| *Langue*, *Ville* | Le français, ta ville pour la météo et l'heure du coucher du soleil |
| *Thème* | Clair, sombre, ou automatique (sombre après le coucher du soleil) |
| *Mes photos* | Tes photos en fond d'écran et en économiseur (envoyées depuis l'ordinateur, voir plus bas) |
| *Boutons du haut*, *Boutons de la télécommande* | Les raccourcis (Live TV, magasin d'applis, boutons Netflix ou YouTube de la télécommande) |
| *Clé TMDB* | Optionnel : les suggestions de films et séries du moment (clé gratuite sur themoviedb.org) |

## 3. Tout modifier en parlant à Claude

Garde la même conversation Claude Code ouverte (dans le dossier où il a installé Free My TV) et demande en français ce
que tu veux voir. Il modifie le code, reconstruit l'appli et la réinstalle sur la télé. Quelques idées :

- *« Envoie sur la télé les photos du dossier Vacances 2025 de mon bureau. »*
- *« Mets un fond Star Wars : un ciel étoilé qui défile lentement, et des couleurs jaune et noir. »*
- *« Remplace l'horloge par un compte à rebours jusqu'à Noël. »*
- *« Ajoute Canal+ et France.tv sur l'étagère. »*
- *« Change la police pour quelque chose qui fait Seigneur des Anneaux. »*
- *« Fais clignoter doucement le logo de l'appli choisie. »*

Une règle pour que ça se passe bien : **une demande à la fois**, et tu regardes le résultat sur la télé avant la
suivante. Si ça ne te plaît pas : *« Reviens à la version d'avant. »*

Pour les images (un décor, un personnage), demande à Claude de te dire exactement la taille à préparer (en général
1920 × 1080 pour un fond), puis génère-les ou prends des images dont tu as les droits. Pas d'images des films : elles
appartiennent aux studios.

## 4. Ton univers complet

Toujours dans Free My TV, décris l'univers que tu veux, et laisse Claude proposer puis construire étape par étape :

> Transforme Free My TV en interface [Star Wars] : propose-moi un décor de fond, des couleurs, une police et une
> petite animation quand je change d'appli. Une chose à la fois, et montre-moi chaque étape sur la télé.

Garde Free My TV comme base : c'est un projet suivi, testé sur beaucoup de télés, et qui sait revenir à l'accueil
d'origine. Poudlard TV n'est qu'un exemple de ce qu'on peut obtenir.

## Revenir comme avant

- Free My TV : appli *Free My TV* → *Écran d'accueil* → **Original**. Tout revient comme à l'achat. Pour le
  supprimer : d'abord *Original*, puis Paramètres → Applis → Free My TV → Désinstaller.
- Après 3 plantages en 5 minutes, Free My TV rend la main tout seul à l'accueil d'origine.
- Sur LG et Samsung, l'accueil de la marque ne change jamais : Free My TV est une appli à côté.
