# Installer Poudlard TV sur ta télé

Guide pour débutants, en français. Tu n'as besoin d'aucune connaissance technique ni d'aucun logiciel déjà installé.
Compte **20 minutes**. Tout est réversible : ta télé peut revenir comme avant en moins d'une minute, sans ordinateur.

## Avant de commencer

1. **Une télé ou un boîtier Android TV / Google TV.** Ça ne marche **pas** sur Apple TV, Samsung, LG, Roku ni les
   Fire TV récents. Vérifie la tienne dans [`docs/TELEVISEURS.md`](docs/TELEVISEURS.md) avant tout.
   Pas compatible ? Un boîtier Google TV branché en HDMI fait l'affaire sur n'importe quelle télé.
2. **Un ordinateur** (Windows ou Mac) **sur le même Wi-Fi** que la télé. Il ne sert que pendant l'installation.
3. **Un abonnement payant à une IA qui code, environ 20 € par mois** : Claude Pro (pour Claude Code), ou ChatGPT
   Plus (pour Codex, avec les mêmes messages). Les versions gratuites ne peuvent pas installer d'appli sur une télé.
   Un mois suffit : Poudlard TV continue de marcher après. Sans abonnement, suis la méthode « Sans Claude Code » plus bas.

## Étape 1 : active le mode développeur sur la télé

1. Paramètres → **Système → À propos** (ou **Préférences de l'appareil → À propos**).
2. Appuie **7 fois** sur la ligne **Build** jusqu'au message « Vous êtes maintenant développeur ».
3. Reviens en arrière → **Options pour les développeurs** → active **Débogage USB**.

Ton menu est différent ? Demande à Claude (même la version gratuite) : « Sur ma télé [marque et modèle], comment
activer les options pour les développeurs et le débogage ADB ? ». « Débogage USB » sert aussi par le Wi-Fi : pas de câble.
Ça ne casse rien, et ça se désactive en un clic.

## Étape 2 : installe avec Claude (la méthode simple)

1. Installe l'application **Claude** sur ton ordinateur ([claude.com/download](https://claude.com/download)) et
   connecte-toi. **Sur Windows**, installe aussi **Git** ([git-scm.com](https://git-scm.com/download/win), tout par
   défaut) : Claude Code en a besoin pour lancer ses commandes.
2. Crée un dossier vide, par exemple `Poudlard` sur ton bureau.
3. Ouvre Claude, clique sur l'icône **`</>`** (Claude Code) en haut à gauche, et choisis ce dossier.
4. Envoie ce message, avec le modèle de ta télé :

   > Installe Poudlard TV sur ma télé [marque et modèle] : github.com/Wavia-tech/poudlard-tv
   > Je suis débutant, explique-moi simplement ce que je dois faire sur la télé.

   Pas besoin de l'adresse IP : Claude trouve la télé sur ton réseau.

5. Claude installe ce qu'il faut, télécharge l'appli et la met sur ta télé. Il te demande la permission avant chaque
   action : clique **Autoriser**.
6. **Sur la télé**, une fenêtre « Autoriser le débogage USB ? » apparaît : coche **Toujours autoriser** puis **OK**.
   Si Google Play Protect bloque l'appli : **Plus de détails → Installer quand même** (Poudlard TV ne demande aucune
   permission, ni Internet, ni données).

## Étape 3 : ouvre Poudlard TV

1. Ouvre **Poudlard TV** dans la liste des applis de la télé (ou laisse Claude l'ouvrir).
2. La **Lettre d'admission** te guide : ta maison, tes applis, la chouette. Moins d'une minute.
3. Dernière page : **Faire de Poudlard l'accueil**, puis confirme dans la fenêtre de la télé. La touche Accueil de la
   télécommande mène maintenant au château.

| Touche | Ce qu'elle fait |
|---|---|
| ← → | Choisir une appli (Hedwige se pose dessus) |
| OK | Ouvrir l'appli |
| ↓ | Ollivander : la collection de films |
| ↑ | Le son, la Carte du Maraudeur (toutes les applis), la Salle sur Demande (les réglages) |
| OK maintenu | Déplacer, retirer ou cacher une appli |
| Retour maintenu 2 s | Écran sobre, sans décor (et retour) |

## Revenir comme avant

- **Retour maintenu 2 secondes** : écran sobre.
- **Salle sur Demande → Accueil de la télé → Revenir à l'accueil de la télé** : ta télé retrouve son accueil.
- **Paramètres → Applis → Poudlard TV → Désinstaller** : il ne reste rien.

Après l'installation, tu peux désactiver le débogage USB : Poudlard TV n'en a pas besoin.

## Sans Claude Code

1. Télécharge l'appli : [PoudlardTV.apk](https://github.com/Wavia-tech/poudlard-tv/releases/latest/download/PoudlardTV.apk).
2. Télécharge les outils Android de Google (adb) :
   [Windows](https://dl.google.com/android/repository/platform-tools-latest-windows.zip) ·
   [Mac](https://dl.google.com/android/repository/platform-tools-latest-darwin.zip). Décompresse le dossier
   `platform-tools` et mets-y aussi `PoudlardTV.apk`.
3. Ouvre ce dossier dans un terminal (Windows : tape `cmd` dans la barre d'adresse de l'Explorateur, puis Entrée ;
   Mac : clic droit sur le dossier → Nouveau terminal au dossier), puis tape, avec l'IP de ta télé :
   ```
   adb connect 192.168.1.42:5555
   adb install -r PoudlardTV.apk
   ```
   Sur Mac, écris `./adb` au lieu de `adb`. Accepte la fenêtre sur la télé (Toujours autoriser → OK).
4. Continue à l'étape 3.

Ça ne se connecte pas (Chromecast, Google TV Streamer, Android 14) ? La marche à suivre avec le « Débogage sans fil »
est dans [`docs/POUR-CLAUDE.md`](docs/POUR-CLAUDE.md), section 5.

## Et ensuite : ta propre interface

Star Wars, Seigneur des Anneaux, tes photos de famille : pars de Free My TV et transforme-le en parlant à Claude,
[`docs/PERSONNALISER.md`](docs/PERSONNALISER.md).
