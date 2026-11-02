# Installation

Deux façons d'utiliser Poudlard TV :

- **Sur ordinateur (maquette web)** : pour découvrir l'interface, la régler, la modifier. Cinq minutes.
- **Sur la télévision (Android TV / Google TV)** : le launcher remplace l'écran d'accueil. Réversible à tout moment.

Le portage TV reprend la méthode de [Free My TV](https://github.com/simbasjungles/free-my-tv) (construction sans Gradle, installation par ADB, lancement des applications par intent Leanback, liste des applications installées, entrées HDMI, filet de sécurité), qui a fait ses preuves sur Chromecast with Google TV et sur les téléviseurs Android TV. Ce qu'on reprend et ce qu'on laisse, point par point : `docs/FREE-MY-TV.md`. La différence principale : Poudlard TV ne désactive jamais l'accueil Google et n'utilise pas d'adb interne (qui exigerait la permission réseau).

---

## 1. Maquette web

### Prérequis

- [Node.js](https://nodejs.org) 18 ou plus récent (uniquement pour le petit serveur statique ; l'interface elle-même n'a aucune dépendance).
- Un navigateur récent (Chrome, Edge, Firefox, Safari).

### Étapes

```bash
git clone https://github.com/Wavia-tech/poudlard-tv.git
cd poudlard-tv

# Le dépôt ne fournit pas de logos d'applications (marques). Ce fichier vide suffit :
cp app/assets/logos.example.js app/assets/logos.js

node tools/serve.mjs . 8765
```

Ouvrez ensuite http://localhost:8765/app/index.html, cliquez sur l'écran, et pilotez au clavier :

| Touche | Télécommande | Effet |
|---|---|---|
| ← → | D-pad | Choisir une application sur le parapet |
| ↓ | Bas | Ollivanders (la collection des films) |
| ↑ | Haut | Barre du haut : Son · Carte du Maraudeur · Réglages |
| Entrée | OK | Lumos, puis l'application s'ouvre |
| Entrée maintenue | OK long | Rappeltout (menu contextuel) |
| Échap | Retour | Revenir |
| Échap maintenu 2 s | Retour long | « Nox ? » : passer en mode classique, et inversement |
| M | Menu | La Salle sur Demande (réglages) |

Le premier lancement affiche la Lettre d'admission (maison, applications, Hedwige). Les réglages sont conservés dans le `localStorage` du navigateur ; pour repartir de zéro, Réglages → À propos → « Réinitialiser » (confirmation en trois appuis), ou videz le stockage du site.

Pourquoi un serveur et pas un double-clic sur `index.html` ? Parce que l'interface est en modules ES, que les navigateurs refusent de charger depuis `file://`. Le serveur fourni n'écoute que sur `127.0.0.1` et ne sert que les fichiers du dépôt.

### Sans logos, c'est voulu

Avec `logos.js` vide, chaque application est représentée par un monogramme (son initiale dans un cercle). Pour un usage privé, `tools/README.md` explique comment assembler vos propres logos.

### Musique de fond

Par défaut, l'accueil joue une valse de célesta originale, très bas (Réglages → Chouette et sons → Musique de fond : Auto / Célesta / Aucune). Pour y mettre votre propre fichier, hors dépôt : `docs/MUSIQUE.md`.

---

## 2. Télévision Android TV / Google TV

### État du portage

L'application Android (`android/`, Java pur, sans Gradle) embarque la maquette web dans une WebView et lui expose un pont `window.Android`. Deux choses à distinguer :

**Ce que la maquette appelle aujourd'hui** (`app/js/platform.js`), quatre méthodes :

| Méthode | Rôle |
|---|---|
| `launch(pkg)` | Lance l'application par son package, via `getLeanbackLaunchIntentForPackage` (sinon `getLaunchIntentForPackage`). |
| `switchInput(input)` | Bascule sur une entrée HDMI (consoles, box), via `TvInputManager`. |
| `openUrl(url, pkg)` | Ouvre un lien de contenu dans l'application qui le possède. L'URL doit déjà avoir passé la liste blanche de `platform.js`. |
| `installedPackages()` | Renvoie la liste des packages installés (tableau JSON) pour griser ce qui n'est pas là. |

Les trois premières renvoient `{ ok, error }` : un échec donne une Beuglante à l'écran, jamais un plantage.

**Ce que le pont Java expose en plus** (`android/src/fr/wavia/poudlardtv/Bridge.java`), pas encore appelé par les écrans : `appIcon(pkg)` (bannière ou icône de l'application en data URI, ou `null` ; voir `tools/README.md`), `setHome('poudlard' | 'original')` (`{ ok, error }`, la bascule d'accueil ci-dessous), `homeMode()` (`"poudlard"` ou `"original"`) et `version()`. Le détail de chaque retour est dans `android/README.md`.

> **État actuel de l'écran Réglages.** Dans cette version, la rubrique À propos de la maquette n'a pas encore les deux boutons **Accueil → Poudlard** et **Accueil → Origine** : elle affiche un bouton « Rendre l'accueil Google » qui, en maquette, ne fait qu'une mention. Le branchement sur `setHome()` est prévu (voir `app/CONTRAT.md`, « À faire côté écrans »). En attendant, la bascule se fait depuis les réglages de la télévision ou par `adb` (ci-dessous) ; les deux chemins sont équivalents.

### Ce que l'APK ne demande pas

- Aucune permission réseau (`INTERNET` et `ACCESS_NETWORK_STATE` absents du manifeste : le système interdit lui-même toute connexion). `build.sh` refuse de produire un APK qui déclarerait une permission.
- Pas de `QUERY_ALL_PACKAGES` : un bloc `<queries>` ciblé sur la catégorie `LEANBACK_LAUNCHER`.
- Aucune bibliothèque tierce, aucune analytique, aucun service d'accessibilité, aucun récepteur au démarrage hors catégorie HOME.

### Construire l'APK

Prérequis : un JDK 17 ou plus, les outils en ligne de commande du SDK Android (`sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"`), la variable `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`) qui pointe sur le SDK. Détails, variantes Windows (Git Bash) et dépannage dans `android/README.md`.

```bash
cd android
./build.sh            # → android/PoudlardTV.apk, signé avec android/poudlard.keystore
```

Le fichier `poudlard.keystore` est créé au premier build et ignoré par Git. **Conservez-le** : une mise à jour doit être signée avec la même clé, sinon il faut désinstaller avant de réinstaller. Le script copie `app/` tel quel dans l'APK (sans `*.md` ni fichiers de travail) et avertit si `app/assets/fonts/` n'existe pas (voir Dépannage, polices).

### Préparer la télévision

1. Paramètres → Système → À propos → appuyez **sept fois** sur « Build Android TV OS » pour activer les options pour les développeurs.
2. Paramètres → Système → Options pour les développeurs → activez **Débogage USB** (et « Débogage sans fil » sur Android 14).
3. Notez l'adresse IP de la TV (Paramètres → Réseau et Internet).
4. Sur l'ordinateur, installez `adb` (Android platform-tools) : `winget install Google.PlatformTools` sous Windows, `brew install --cask android-platform-tools` sous macOS, le paquet `android-tools` sous Linux.

### Installer

```bash
adb connect 192.168.1.50:5555          # l'adresse IP de la TV
adb install -r android/PoudlardTV.apk
```

Acceptez la demande « Autoriser le débogage USB ? » sur la TV, en cochant « Toujours autoriser ». Installez par `adb` plutôt qu'en ouvrant l'APK sur la TV ; sur Android 14, Play Protect peut tout de même afficher un avertissement : « Plus de détails » → « Installer quand même ». Sur certains modèles TCL, autorisez l'exécution en arrière-plan : `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.

Sur **Chromecast with Google TV**, le port 5555 se referme à chaque redémarrage. Si `adb connect` échoue, appairez puis rouvrez-le, dans cet ordre (les deux ports affichés sous « Débogage sans fil » sont différents : un port d'appairage, un port de débogage) :

```bash
adb pair 192.168.1.50:37123 123456      # port et code affichés par « Appairer avec un code »
adb connect 192.168.1.50:41567          # port affiché sous « Débogage sans fil »
adb tcpip 5555
adb connect 192.168.1.50:5555
```

### Définir comme accueil (Accueil → Poudlard)

Le choix de l'accueil appartient au système, pas au launcher ; Poudlard TV ne fait qu'ouvrir le sélecteur. Lancez Poudlard TV depuis la liste des applications (la Lettre d'admission se joue), puis :

- quand le bouton existe dans la maquette : Réglages → À propos → **Accueil → Poudlard** ouvre le sélecteur « Application d'accueil » de la TV (`Settings.ACTION_HOME_SETTINGS`), et vous y choisissez Poudlard TV ;
- sinon : Paramètres → Applications → Accueil (ou le sélecteur « Ouvrir avec » → Poudlard TV → « Toujours ») ; en ligne de commande, `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home` (seule commande qui touche aux réglages de la télé, réversible ci-dessous).

La touche Home de la télécommande mène désormais au Parapet. Contrairement à Free My TV, rien n'est désactivé : l'accueil Google reste installé, actif et choisissable au même endroit.

Vérifiez d'abord sur une clé Google TV ou un appareil secondaire avant la télévision principale.

### Revenir à l'accueil d'origine (Accueil → Origine)

Quatre chemins, du plus doux au plus radical. Aucun ne demande de réinstaller la TV.

1. **Le mode classique**, sans quitter Poudlard TV : Retour maintenu 2 s depuis n'importe quel écran → « Nox ? » → Oui. Un accueil sobre, mêmes applications, sans décor. Le même geste rallume Poudlard.
2. **Accueil → Origine** : le launcher désactive sa propre entrée d'accueil (l'alias `.Home`, une opération autorisée sans permission sur ses propres composants) et relance l'accueil d'origine. Le système n'a plus qu'un candidat, l'accueil Google, et la touche Home y retourne. Poudlard TV reste dans la liste des applications (alias `.Start`) pour revenir en arrière. Depuis la maquette (quand le bouton existe) : Réglages → À propos → Accueil → Origine ; depuis la télé : Paramètres → Applications → Accueil → Google TV ; en ligne de commande : `adb shell pm disable-user --user 0 fr.wavia.poudlardtv/.Home` (et `enable` pour le contraire).
3. **Désinstaller** : Paramètres → Applications → Poudlard TV → Désinstaller, ou `adb uninstall fr.wavia.poudlardtv`. La configuration, stockée dans les données privées de l'application, part avec elle.
4. **Filet de sécurité** : si le launcher se ferme anormalement trois fois en cinq minutes (un moteur WebView qui meurt compte aussi), il rend lui-même la main à l'accueil d'origine et affiche un écran sobre qui le dit (principe repris de Free My TV, sans adb). Il ne réessaie pas tant qu'on n'a pas refait Accueil → Poudlard. Au pire, un redémarrage de la TV (débrancher 10 s) suffit pour retrouver un système qui démarre.

Rien n'est modifié dans le système : pas de root, pas de partition touchée, aucune application désactivée. Le launcher Google reste installé et à jour.

### Réglages sur la télévision

Tous les réglages se font dans l'interface (bouton Menu → La Salle sur Demande), au D-pad : applications du parapet et leur ordre, applications cachées, maison, Hedwige, sons et musique de fond, mouvement, veille, mode classique, et la rubrique « À propos » (réseau, version, réversibilité, réinitialisation). Il n'y a aucun fichier de configuration à éditer et rien à recompiler pour changer un réglage.

La configuration est un seul objet JSON, versionné et validé à la lecture (voir `app/README.md`). Sur TV il vit dans le `localStorage` de la WebView (origine `https://poudlard.tv`, servie depuis les assets de l'APK), dans les données privées de l'application : jamais synchronisé, jamais sauvegardé dans le cloud, effacé à la désinstallation.

### Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| `adb connect` refuse ou expire | Débogage non activé, ou port 5555 fermé (Chromecast) | Réactiver le débogage ; `adb pair` → `adb connect <ip:port-debogage>` → `adb tcpip 5555` → `adb connect <ip>:5555` |
| « INSTALL_FAILED_… » à l'installation | APK d'une autre signature déjà installé | `adb uninstall fr.wavia.poudlardtv` puis réinstaller (et garder `poudlard.keystore` pour la suite) |
| Une application ne se lance pas (Beuglante « n'est plus installée ») | Package absent, ou application sans activité Leanback | Vérifier le package dans Réglages ; lancer l'application une fois depuis l'accueil Google |
| Une entrée HDMI ne bascule pas | Le modèle n'expose pas `TvInputManager` à une application tierce | Rester sur la télécommande pour la source ; retirer le Passage du parapet |
| Écran noir au démarrage | Image de décor manquante ou WebView ancienne | Le mode classique est garanti sans image : Retour maintenu 2 s ; mettre à jour « Android System WebView » |
| Polices par défaut (pas de Cinzel) | État normal de cette version : la maquette charge les polices depuis Google Fonts, ce que l'APK (sans réseau) ne peut pas faire | Placer les fichiers OFL (Cinzel, Cinzel Decorative, EB Garamond, IM Fell English) et leur licence dans `app/assets/fonts/`, les déclarer en `@font-face` dans `app/css/base.css`, reconstruire |
| Rien à l'écran après trois plantages | Le filet de sécurité a rendu la main | Corriger la cause (`adb logcat -s PoudlardTV chromium`), puis refaire Accueil → Poudlard |
