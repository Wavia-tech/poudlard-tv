# Poudlard TV, côté Android

Le launcher Android TV qui affiche la maquette web (`../app/`) dans une WebView, plein écran, et lui prête
quatre pouvoirs sur la télé : lancer une appli, changer d'entrée HDMI, ouvrir un lien de film dans son appli,
lister les applis installées. Rien d'autre.

Java pur, sans Gradle ni bibliothèque, construit par `build.sh` : la méthode de [Free My TV](https://github.com/simbasjungles/free-my-tv)
(MIT), dont on a repris ce qui touche à la télé (voir `../docs/FREE-MY-TV.md` et la section « Licence de Free My TV »
ci-dessous), en laissant de côté tout ce qui exige une permission ou touche aux applis de la télé.

> **État des tests.** Ce code a été écrit d'après la documentation Android et le dépôt Free My TV ; il compile
> (`javac` contre `android.jar`), mais **n'a pas encore tourné sur un appareil**. Vérifié sur : *(aucun pour l'instant)*.
> À vérifier en premier sur une clé Google TV, avant la télé du salon : l'installation, la bascule d'accueil dans les
> deux sens, les quatre passages HDMI du CATALOG, l'écran de secours. Mettre cet encart à jour après chaque essai.

## Ce que l'APK ne fait jamais

- **Aucune permission.** Pas d'`INTERNET`, pas d'`ACCESS_NETWORK_STATE`, pas de `RECEIVE_BOOT_COMPLETED`, pas de
  `QUERY_ALL_PACKAGES`. `build.sh` s'arrête si une permission apparaît. À vérifier soi-même :
  `aapt dump permissions PoudlardTV.apk` doit ne rien lister.
- **Ne désactive jamais l'accueil Google** ni aucune autre appli. Pas d'adb interne, pas de `pm disable`.
- **Ne collecte rien.** Pas de compte, pas d'historique, pas de journal envoyé. Le seul journal est `logcat`.
- **Lance les applis par intent explicite** (package nommé, présent dans la liste des applis installées). Un lien
  de film est ouvert dans l'appli qui le possède, à défaut sur l'accueil de cette appli, jamais dans une autre ; les
  hôtes sont limités à `URL_HOSTS` (`Apps.java`, identique à `platform.js`). Les entrées HDMI passent par l'intent
  standard du système (`content://android.media.tv/…`), auquel seule l'appli TV de la télé répond.
- **Ne survit pas à sa désinstallation** : `adb uninstall fr.wavia.poudlardtv` remet la télé exactement comme avant.

## Arborescence

```
android/
  AndroidManifest.xml            HOME (alias .Home, désactivable) + LEANBACK_LAUNCHER (alias .Start), <queries> ciblé, zéro permission
  build.sh                       maquette → assets/web/, aapt2, javac, d8, zipalign, apksigner, contrôle des permissions
  .gitignore                     out/, *.apk, *.keystore
  res/values/strings.xml         les seuls textes natifs (écran de secours)
  res/values/styles.xml          plein écran, fond nuit
  res/values/colors.xml          la palette de base.css pour les vues natives
  res/drawable/banner.xml        bannière Leanback 320x180 (XML, à remplacer par un PNG original si on veut)
  res/drawable/icon.xml          icône carrée, même motif
  src/fr/wavia/poudlardtv/
    HomeActivity.java            la WebView, les touches, le cycle de vie, les écrans de secours
    Bridge.java                  window.Android : launch, switchInput, openUrl, installedPackages, appIcon, setHome, homeMode, version
    Apps.java                    lancement, liste des installées, bannières, entrées HDMI (repris de HomeApps de Free My TV)
    HomeMode.java                Poudlard / accueil d'origine, réversible, sans adb
    Watchdog.java                3 plantages en 5 minutes → l'accueil d'origine reprend (repris de Free My TV)
    WebAssets.java               sert assets/web/ sous https://poudlard.invalid/ (WebViewAssetLoader réécrit, sans AndroidX)
    Log.java                     logcat, tag PoudlardTV
```

## Construire

Prérequis : un JDK 17 ou plus, les outils en ligne de commande du SDK Android, adb.

```bash
sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"
export ANDROID_HOME=~/Android/Sdk        # ou ANDROID_SDK_ROOT ; sous Windows (Git Bash) : /c/Users/<nom>/AppData/Local/Android/Sdk
cd tv-home/android
./build.sh
```

Résultat : `PoudlardTV.apk` dans ce dossier, signé avec `poudlard.keystore` (créé au premier build, ignoré par git).
**Conserver ce fichier** : une mise à jour doit être signée avec la même clé, sinon il faut désinstaller avant de réinstaller.

Le script copie `../app/` tel quel dans `assets/web/` (sans les `.md`). Si `app/tv.html` existe (version plein écran
sans le banc d'essai), c'est elle qui est chargée ; sinon `index.html`. Les assets sont ajoutés à l'APK avec `jar`
plutôt qu'avec `aapt2 -A`, ce qui évite le bug des antislashs d'aapt2 sous Windows. Si `app/assets/logos.js` (logos
privés) ou `app/assets/music/` (musique personnelle) sont présents, ils partent dans l'APK et le script le signale :
un APK destiné à d'autres personnes se construit depuis un clone propre.

## Installer sur la télé (première fois)

1. Sur la télé : Paramètres → Système → À propos → appuyer 7 fois sur « Build Android » → les options pour les
   développeurs apparaissent. Y activer **Débogage USB** (et « Débogage sans fil » sur Android 14). Noter l'adresse IP
   (Paramètres → Réseau).
2. Sur l'ordinateur :
   ```bash
   adb connect 192.168.1.50:5555        # l'IP de la télé
   adb install -r PoudlardTV.apk
   ```
   La télé demande « Autoriser le débogage USB ? » : cocher « Toujours autoriser », OK.
   Sur Android 14, Play Protect peut bloquer : « Plus de détails » → « Installer quand même ».
   Sur TCL, autoriser l'exécution en arrière-plan :
   `adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"`.
3. Sur la télé : ouvrir **Poudlard TV** dans la liste des applis (c'est l'alias `.Start`). La Lettre d'admission se joue.
4. Dans les réglages de Poudlard TV → À propos → **« Faire de Poudlard l'accueil »** : le launcher réactive sa porte
   HOME (elle l'est déjà à la première installation). Appuyer ensuite sur la touche **Home** : la télé a deux accueils
   et affiche sa boîte de choix, « Google TV » ou « Poudlard TV » ; choisir Poudlard TV et **« Toujours »**. À partir
   de là, la touche Home mène au Parapet.
   Si aucune boîte n'apparaît (certains modèles mémorisent l'accueil Google sans demander), la seule autre voie est en
   ligne de commande : `adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home`. C'est la seule commande
   de ce document qui touche à un réglage de la télé, et elle est réversible (voir ci-dessous).

   Note : les Paramètres d'Android TV / Google TV n'ont pas d'écran « Application d'accueil » (c'est un écran de
   téléphone). Le launcher tente quand même de l'ouvrir ; s'il existe sur le modèle, il s'affiche, sinon la consigne
   est celle ci-dessus (appuyer sur Home).

Conseil repris du README du projet : essayer d'abord sur une clé Google TV avant la télé du salon.

## Revenir en arrière

Trois chemins, du plus doux au plus radical. Aucun ne touche aux autres applis. Les libellés sont ceux de l'écran
Réglages → À propos de la maquette.

1. **Depuis Poudlard TV** : Réglages → À propos → **« Rendre l'accueil Google »**. Le launcher désactive sa propre
   porte HOME (l'alias `.Home`) et relance l'accueil d'origine ; la touche Home y retourne. Poudlard TV reste dans la
   liste des applis pour revenir plus tard (Réglages → À propos → « Faire de Poudlard l'accueil », puis Home).
   *Attendu d'après la documentation (le rôle HOME est réattribué quand le composant disparaît), non encore vérifié sur
   appareil : voir l'encart « État des tests ».*
2. **Depuis l'ordinateur**, sans télécommande : rendre l'accueil au composant Google TV de la télé. Le trouver d'abord
   (le package varie selon la marque), puis le désigner :
   ```bash
   adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME
   adb shell cmd package set-home-activity <package>/<activité>      # celui de la ligne ci-dessus qui n'est pas fr.wavia.poudlardtv
   ```
   Pour fermer la porte HOME de Poudlard TV sans l'ouvrir : `adb shell pm disable-user --user 0 fr.wavia.poudlardtv/.Home`
   (et `pm enable` pour le contraire). Ces commandes ne touchent qu'à Poudlard TV.
3. **Désinstaller** : `adb uninstall fr.wavia.poudlardtv`. La télé revient à son état d'origine ; il n'y a rien d'autre à nettoyer.

Et le garde-fou : si l'accueil plante **trois fois en cinq minutes**, il rend la main tout seul à l'accueil
d'origine et affiche un écran sobre avec deux boutons : « Ouvrir l'accueil d'origine » et « Réessayer Poudlard TV »
(qui efface le compteur et rouvre l'interface, sans rouvrir la porte HOME : il faut refaire « Faire de Poudlard
l'accueil » pour la retrouver). Sans ce bouton, rouvrir Poudlard TV depuis la liste des applis réaffiche l'écran de
secours tant que les cinq minutes ne sont pas écoulées.

## Le pont `window.Android`

Appelé par `../app/js/platform.js`. Chaque méthode renvoie une chaîne JSON et ne lève jamais d'exception.

| Méthode | Retour | Note |
|---|---|---|
| `launch(pkg)` | `{"ok":true}` ou `{"ok":false,"error":"…"}` | Leanback puis repli téléphone ; `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED` |
| `switchInput("HDMI 1")` | idem | `TvContract.buildChannelUriForPassthroughInput` ; erreur lisible si la télé ne répond pas ; **à tester** : les 4 passages HDMI sur la télé du salon (le numéro de port est lu dans l'identifiant de l'entrée, sinon n-ième port dans l'ordre de la télé) |
| `openUrl(url, pkg)` | idem | https et hôte en liste blanche seulement ; dans l'appli `pkg` ; sinon sur l'accueil de `pkg` ; jamais ailleurs |
| `installedPackages()` | `["com.netflix.ninja", …]` | `LEANBACK_LAUNCHER` puis `LAUNCHER` (sans applis système), dédoublonné |
| `appIcon(pkg)` | `"data:image/png;base64,…"` ou `null` | bannière Leanback (384x216) sinon icône centrée sur fond nuit ; cache mémoire |
| `setHome("poudlard")` | `{"ok":true,"hint":"press-home"}` ou `{"ok":true,"hint":"settings"}` | rouvre la porte HOME et efface le garde-fou ; `hint` dit quelle consigne afficher : « appuyez sur Home et choisissez Poudlard TV, puis Toujours » (`press-home`, le cas normal sur Android TV) ou « choisissez dans l'écran qui s'ouvre » (`settings`) |
| `setHome("original")` | `{"ok":true}` | voir « Revenir en arrière » |
| `homeMode()` | `"poudlard"` ou `"original"` | pour afficher l'état dans les réglages |
| `version()` | `"0.1"` | |

Touches : flèches et OK arrivent nativement dans la page (ArrowLeft…, Enter). Retour et Menu sont capturés par
l'activité et rejoués comme `KeyboardEvent` (`Escape`, `ContextMenu`), appui et relâchement, pour que l'appui long
de `input.js` fonctionne. La touche Home rejoue `Home`.

Stockage : la configuration de `config.js` vit dans le `localStorage` de la WebView, lié à l'origine
`https://poudlard.invalid/` (stockage privé de l'application, jamais synchronisé ; `allowBackup="false"`).
Changer cet hôte dans `WebAssets.java` ferait perdre la configuration enregistrée.

Veille : l'activité ne pose pas `FLAG_KEEP_SCREEN_ON`. La télé garde son économiseur et sa mise en veille.

## Déboguer

```bash
adb logcat -s PoudlardTV chromium          # le launcher et les erreurs JS de la WebView
```

Pour inspecter la page comme dans Chrome : `chrome://inspect` sur l'ordinateur (débogage USB actif sur la télé),
après avoir ajouté `WebView.setWebContentsDebuggingEnabled(true)` dans `HomeActivity.buildWebView` le temps du test
(ne pas le laisser dans une version publiée).

## Ce qui reste à faire avant un dépôt public

- Embarquer les polices (Cinzel, EB Garamond, IM Fell English, licence OFL) dans `app/assets/fonts/` et les déclarer
  en `@font-face` dans `base.css` : sans réseau, la télé affiche sinon ses polices système.
- Remplacer les logos SVG officiels de la maquette (usage privé) par `appIcon(pkg)` dans le mode classique, ou par
  des monogrammes.
- Une `tv.html` sans banc d'essai (la scène seule, 100 % de la fenêtre).
- Une bannière PNG originale (320x180) à la place de `banner.xml`.
- Un premier essai sur appareil, et l'encart « État des tests » mis à jour.

## Licence de Free My TV

`Apps.java`, `Watchdog.java` et la structure de `HomeActivity.java` (ainsi que `HomeMode.originalHome`) reprennent du
code de Free My TV, publié sous licence MIT. Cette licence impose de conserver la notice ci-dessous dans toute copie
substantielle ; elle s'ajoute à la licence MIT de Wavia (`../LICENSE`) qui couvre le reste du dépôt.

```
MIT License

Copyright (c) 2026 Free My TV contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
