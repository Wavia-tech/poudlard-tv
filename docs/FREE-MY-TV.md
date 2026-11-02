# Ce qu'on reprend de Free My TV

Étude du dépôt [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv) (MIT, lu le 2 novembre 2026,
branche `main`, version 1.3) pour tout ce qui touche à la télé dans Poudlard TV : lancement des applis, liste des applis
installées, bannières, entrées HDMI, choix de l'accueil, retour à l'accueil d'origine, garde-fou en cas de plantage,
construction sans Gradle. Ce document dit ce qu'on reprend, ce qu'on laisse, et pourquoi.

Free My TV est en Java pur, sans Gradle ni bibliothèque (`build.sh` : aapt2 → javac → d8 → zipalign → apksigner),
`minSdk 26`, `targetSdk 33`. C'est exactement la contrainte de Poudlard TV, donc on copie la méthode, et pour deux
fichiers (`Apps.java`, `Watchdog.java`) une bonne part du code : Free My TV est sous licence MIT
(« Copyright (c) 2026 Free My TV contributors »), dont la notice est reproduite dans `android/README.md` (section
« Licence de Free My TV ») et citée en tête de chaque fichier concerné.

## 1. Les fichiers qui comptent (et où est quoi)

| Fichier Free My TV | Rôle | Ce qu'on en fait |
|---|---|---|
| `build.sh` | Trouve le SDK, compile sans Gradle, signe | Repris dans l'esprit (`android/build.sh`) |
| `app/AndroidManifest.xml` | HOME + LEANBACK, `<queries>`, process `:home` | Repris en version réduite, sans aucune permission |
| `app/src/io/freemytv/HomeApps.java` | Liste des applis, lancement, bannières, entrées HDMI | Repris : `Apps.java` |
| `app/src/io/freemytv/HomeMode.java` | Bascule Free My TV / Original par adb interne | **Pas repris** (exige INTERNET et désactive des applis système) ; remplacé par `HomeMode.java` réversible et sans adb |
| `app/src/io/freemytv/Watchdog.java` | 3 plantages en 5 min → accueil d'origine | Repris : `Watchdog.java` |
| `app/src/io/freemytv/HomeActivity.java` | Activité d'accueil, touche Home, `onNewIntent` | Repris : `HomeActivity.java` |
| `app/src/io/freemytv/HomeReceiver.java` | `BOOT_COMPLETED` et `MY_PACKAGE_REPLACED` | **Pas repris** (règle : aucun récepteur au démarrage hors catégorie HOME) |
| `app/src/io/freemytv/Prefs.java` | Réglages TV > `config.properties` | Repris comme principe : la config vit dans le launcher (DataStore côté Kotlin plus tard, `localStorage` de la WebView aujourd'hui) |
| `config.example.properties` | `shelf_apps`, `hide_apps`, `hide_services`… | Mappé sur notre `config.js` (section 7) |
| `app/src/io/freemytv/Adb.java` | Client adb maison vers `127.0.0.1:5555` | **Pas repris** : une socket, même locale, exige `android.permission.INTERNET` |

## 2. Lancer une appli sans bug

Free My TV, `HomeApps.launchIntent` : l'intent Leanback d'abord, l'intent « téléphone » en repli.

```java
Intent intent = pm.getLeanbackLaunchIntentForPackage(pkg);
return intent != null ? intent : pm.getLaunchIntentForPackage(pkg);
```

Puis dans `open(...)` : `FLAG_ACTIVITY_NEW_TASK`, essai dans un `try`, et **un échec ne fait jamais planter l'accueil** :

```java
intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
try {
    a.startActivity(intent, options);
    return true;
} catch (ActivityNotFoundException | SecurityException e) {
    AppLog.w("couldn't open " + it.label + ": " + e.getMessage());
    ...
}
```

Deux détails qu'on reprend aussi :
- `FLAG_ACTIVITY_RESET_TASK_IF_NEEDED` sur l'intent « simple » de l'appli : l'appli revient là où l'utilisateur l'avait laissée au lieu de repartir de zéro.
- Quand on ouvre un **contenu** (`ACTION_VIEW` + `setPackage(pkg)`) et que ça échoue, on retombe sur l'intent simple de la même appli. Netflix ignore parfois l'adresse : Free My TV force alors son activité et `FLAG_ACTIVITY_CLEAR_TASK`. On garde le repli générique, sans le cas Netflix (notre Bibliothèque vise Max). Et on s'arrête là : pas de troisième repli « n'importe quelle appli qui répond » (un navigateur, par exemple), pour que la promesse « intents explicites » du README reste vraie.

Chez nous : `Apps.launch(pkg)` et `Apps.openUrl(url, pkg)` dans `android/src/fr/wavia/poudlardtv/Apps.java`, qui renvoient un JSON `{ok, error}` au JavaScript au lieu d'un booléen. La Beuglante (message d'erreur de la maquette) affiche `error`.

## 3. La liste des applis installées (sans QUERY_ALL_PACKAGES)

Free My TV interroge les deux catégories et dédoublonne par package, Leanback en premier (`HomeApps.launchable`) :

```java
Intent tv = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER);
...
if (seen.add(pkg)) out.add(new String[] {pkg, String.valueOf(ri.loadLabel(pm))});
```

Les applis système venant de la requête « téléphone » sont écartées (sauf exceptions nommées), ce qui évite de lister les
menus d'usine. Pour que `queryIntentActivities` voie quelque chose sous Android 11+, le manifeste déclare un bloc
`<queries>` avec ces intents (et une cinquantaine de packages nommés). On reprend les **intents** du bloc `<queries>`
(`MAIN` + `LEANBACK_LAUNCHER`, `MAIN` + `LAUNCHER`, `MAIN` + `HOME`), pas la liste de packages : les packages de notre
`CATALOG` (config.js) sont tous des applis Leanback, donc visibles par la requête. `QUERY_ALL_PACKAGES` reste interdit.

Chez nous : `Apps.installedPackages()` renvoie un tableau JSON de packages ; `platform.js` en fait un `Set`.

## 4. Bannières et icônes

Free My TV n'utilise ni `loadBanner` ni `loadIcon` : il va chercher la **ressource** de bannière à la plus haute densité,
puis se replie sur `getApplicationBanner`, puis sur l'icône (adaptative dessinée dans un rectangle arrondi) :

```java
int res = ai.getBannerResource();
Drawable d = pm.getResourcesForApplication(ai).getDrawableForDensity(res, DisplayMetrics.DENSITY_XXXHIGH, null);
```

Le résultat est réduit à 384 × 216 et mis en cache (mémoire + disque, nom de fichier contenant `lastUpdateTime` pour
se rafraîchir à la mise à jour de l'appli). Chez nous : `Apps.appIcon(pkg)` renvoie la bannière (ou l'icône) en
`data:image/png;base64,…`, 384 × 216 au plus, cache mémoire par package. C'est ce que le mode classique affichera à la
place des logos SVG (usage privé) quand le dépôt sera public.

## 5. Entrées HDMI

Free My TV lit `TvInputManager.getTvInputList()`, garde `TYPE_HDMI`, rattache les appareils CEC (ceux qui ont un
`getParentId()`) à leur port, et n'affiche une entrée que si elle est connectée :

```java
boolean connected = state == TvInputManager.INPUT_STATE_CONNECTED
        || (allwinner && state == TvInputManager.INPUT_STATE_CONNECTED_STANDBY);
```

Pour y aller, l'intent standard, sauf lecteurs maison (Allwinner, Xiaomi, Fire TV) :

```java
return new Intent(Intent.ACTION_VIEW, TvContract.buildChannelUriForPassthroughInput(it.inputId));
```

Chez nous : `Apps.switchInput("HDMI 1")` cherche l'entrée HDMI dont le numéro, lu dans l'identifiant de l'entrée
(`…/HW2`, `…/HDMI1`), correspond ; sinon le n-ième port HDMI dans l'ordre renvoyé par `getTvInputList()`.
`TvInputInfo.getHdmiDeviceInfo()` donnerait le port exact mais c'est une API système, inaccessible avec `android.jar`.
Puis on envoie cet intent standard, lancé dans un `try` comme Free My TV (sans passer par `resolveActivity()`, que
la visibilité des packages sous Android 11+ peut faire mentir). Pas de lecteur maison : si la TV n'y répond pas, on
renvoie une erreur lisible (« Cette télé n'ouvre pas ses entrées HDMI depuis un launcher »), jamais un crash. Pas de
CEC dans cette version. Limite connue : sur certaines plateformes (Amlogic), `/HW5`, `/HW6`, `/HW7` désignent
HDMI 1/2/3 ; le chiffre ne correspond alors à aucun port demandé et c'est l'ordre de la liste qui sert, ce qui est
le bon résultat. **À tester sur la télé cible** : les quatre passages HDMI du CATALOG ; en cas d'écart, préférer
l'ordre de `getTvInputList()` à la lecture du chiffre.

## 6. Accueil : Free My TV / Original, et pourquoi on ne fait pas pareil

C'est le cœur de Free My TV et c'est ce qu'on **ne copie pas**. `HomeMode.applyFree` :

1. refuse certaines plateformes (Fire TV, Kalley `R3_GTV`, Huawei, téléphones) ;
2. mémorise l'accueil actuel (`cmd role get-role-holders android.app.role.HOME`) ;
3. passe son activité en accueil : `cmd package set-home-activity io.freemytv/.HomeActivity` ;
4. **désactive** (`pm disable-user --user 0`) l'appli de configuration Google TV, l'accueil du constructeur, le launcher
   Google TV, l'économiseur, une liste de bloatware ; avec une liste `PROTECTED` (image, son, entrées, store, services
   Google) et un contrôle `dumpsys wifi` pour ne jamais éteindre l'appli qui possède les réseaux Wi-Fi enregistrés.

Tout passe par un client **adb maison** (`Adb.java`) qui se connecte à `127.0.0.1:5555` et déclenche le prompt
« Autoriser le débogage USB ? ». Retour : `applyOriginal` réactive tout dans l'ordre inverse (accueil constructeur
d'abord, appli de configuration en dernier) ; `revertHomeNow` fait la même chose après 3 plantages.

Pourquoi pas chez nous :
- une socket vers `127.0.0.1` exige `android.permission.INTERNET`, que notre manifeste ne déclare pas (règle n° 1) ;
- désactiver l'accueil Google est précisément ce que le cahier des charges interdit (« ne désactive jamais l'accueil Google ») ;
- la liste PROTECTED de Free My TV a demandé des mois de retours terrain par marque ; on n'a pas ces retours.

Ce qu'on garde de l'idée, en version réversible :
- Le **choix de l'accueil appartient au système et à la personne** : `setHome('poudlard')` se contente de réactiver
  notre porte HOME (l'alias `.Home`) et d'effacer le compteur du garde-fou. Au prochain appui sur la touche Home, la
  télé a deux accueils candidats et affiche sa boîte de choix (« Google TV » ou « Poudlard TV », « Toujours » pour
  mémoriser). Rien n'est désactivé. Attention : l'écran « Application d'accueil » des Paramètres
  (`Settings.ACTION_HOME_SETTINGS`) est un écran de téléphone ; les Paramètres d'Android TV / Google TV ne l'ont pas,
  en général. Le launcher tente de l'ouvrir et renvoie à la maquette la consigne adaptée (`hint: 'settings'` s'il
  s'est ouvert, `hint: 'press-home'` sinon), sans jamais compter son absence comme un échec. C'est d'ailleurs parce
  que ce sélecteur n'existe pas sur TV que Free My TV passe par `cmd package set-home-activity` ; chez nous, cette
  commande reste un recours **depuis l'ordinateur** (`android/README.md`), jamais depuis l'application.
- Le **retour à l'origine sans passer par les réglages** : `setHome('original')` désactive l'alias `.Home` avec
  `PackageManager.setComponentEnabledSetting` (autorisé sans permission sur ses propres composants) : le système n'a
  plus qu'un accueil candidat, l'accueil Google, et la touche Home y retourne. Le launcher Poudlard reste installé et
  visible dans la liste des applis (alias `.Start`, `LEANBACK_LAUNCHER`) pour revenir en arrière. Désinstaller l'APK
  remet tout en place. Depuis Android 10 l'accueil est un rôle (`RoleManager` HOME) : le système doit le réattribuer
  quand le composant disparaît. Attendu, pas encore vérifié sur appareil (encart « État des tests » du README).
- `stockHome()` de Free My TV (lister les activités HOME système, en exclure soi-même et `FallbackHome`, ne pas deviner
  s'il y a deux candidats) est repris tel quel dans `HomeMode.originalHome()` pour relancer l'accueil d'origine
  immédiatement après la bascule.

## 7. Le garde-fou (Watchdog)

Petit fichier, repris quasi à l'identique (d'où la notice MIT de Free My TV en tête de `Watchdog.java`) :

- `install(Context)` pose un `UncaughtExceptionHandler` une seule fois, garde l'ancien et le rappelle après ;
- chaque plantage écrit un horodatage sur une ligne de `files/home-crashes.txt` (lecture plafonnée à 4096 octets,
  lignes mal formées ignorées) ;
- `LIMIT = 3`, `WINDOW = 5 * 60_000L` : au troisième plantage dans la fenêtre, `HomeMode.requestRevertHome` ;
- `crashedTooOften()` empêche l'accueil de réessayer tant que l'original est restauré ; `HomeActivity.onCreate` le teste
  **avant** de construire l'interface et affiche un simple `TextView` sinon ;
- `clear()` quand on remet Free My TV.

Chez nous, le retour en arrière est `HomeMode.giveBackHome()` (désactivation de l'alias `.Home` + lancement de l'accueil
d'origine) au lieu de commandes adb. Et comme notre interface est une WebView, le garde-fou surveille aussi le **rendu**
(`onRenderProcessGone`) : un moteur WebView qui meurt compte comme un plantage ; la WebView morte est alors détachée
et détruite avant d'afficher l'écran de secours (contrat Android quand on renvoie `true`). L'écran de secours a deux
boutons : « Ouvrir l'accueil d'origine » et « Réessayer Poudlard TV » (`Watchdog.clear` + `recreate()`, la porte HOME
restant fermée jusqu'à « Faire de Poudlard l'accueil »).

## 8. HomeActivity : ce qu'on reprend

- `launchMode="singleTask"`, `taskAffinity=""`, `stateNotNeeded`, `clearTaskOnLaunch`, `excludeFromRecents`,
  `screenOrientation="landscape"`, `configChanges` large : l'accueil ne se recrée pas à chaque retour.
- La touche Home arrive dans `onNewIntent`, pas dans un gestionnaire de touches ; Free My TV distingue un double appui
  (< 700 ms) pour ouvrir les récents. Chez nous, un appui Home remet l'accueil à son état d'entrée (action `home` de
  `input.js`).
- `onResume` sur TCL Android 11+ : `setTranslucent(false)` sinon l'appli précédente reste visible par-dessus. Repris.
- Au démarrage : Watchdog, puis test « trop de plantages », puis l'interface. Repris dans cet ordre.
- `android:banner` obligatoire pour apparaître dans la liste Leanback ; `uses-feature leanback required=false`.

## 9. build.sh : la recette

Reprise ligne à ligne dans l'esprit :

```sh
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"            # puis chemins usuels
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
aapt2 compile --dir app/res -o out/res.zip
aapt2 link -o out/base.apk -I android.jar --manifest AndroidManifest.xml --java out/gen out/res.zip \
      --min-sdk-version 26 --target-sdk-version 33 -A assets -0 ttf
javac -source 8 -target 8 -bootclasspath "android.jar:core-lambda-stubs.jar" -encoding UTF-8 -d out/classes …
d8 --release --min-api 26 --lib android.jar --output out out/classes/**/*.class
zip -qj base.apk classes.dex          # ou `jar -u -M -f` si zip manque
zipalign -f -p 4 out/base.apk out/aligned.apk
apksigner sign --ks poudlard.keystore --ks-pass pass:… --out PoudlardTV.apk out/aligned.apk
keytool -genkeypair -keystore poudlard.keystore -alias poudlard -keyalg RSA -keysize 2048 -validity 20000 …
```

Ce qu'on ajoute : la copie de la maquette web (`app/` → `assets/web/`) avant `aapt2 link`. Ce qu'on change : les
assets ne passent pas par `aapt2 link -A` mais par `jar -u -M -0` après coup (stockés sans compression, chemins
toujours en `/`), ce qui évite le bug des antislashs d'aapt2 sous Windows que Free My TV corrige avec un
`FixAssets.java` généré à la volée. Ce qu'on enlève : la génération de `Config.java` et du
`network_security_config.xml` (rien à configurer à la compilation, aucun réseau).

## 10. Mapping de notre configuration vers la sienne

| Poudlard TV (`config.js`) | Free My TV | Commentaire |
|---|---|---|
| `dock` (8 max, ordonné) | `shelf_apps` / `Prefs.shelf()` (liste de packages séparés par des virgules ; `null` = liste intégrée) | Même idée : ordre d'affichage = ordre de la liste. Lui n'a pas de plafond hors TV à faible RAM (8). Nos ids (`netflix`) se traduisent en packages par `CATALOG`. |
| `hidden` | `hide_apps` (LG/Samsung) et `HIDDEN` dans `HomeApps` (Google TV) | Chez lui, caché = retiré de l'étagère, de « Toutes les applis » et des suggestions. Chez nous, caché = retiré de la Carte seulement, jamais perdu. |
| `mode` (`poudlard` / `classique`) | `Home Screen` → `Free My TV` / `Original` | **Pas la même chose** : son « Original » rend l'accueil Google ; notre `classique` est un autre écran du même launcher. L'équivalent de son « Original » est `setHome('original')` (section 6). |
| `custom` (`{id:'c_n', name, pkg}`) | `shelf_apps` avec un id complet (Samsung) | Pas d'équivalent direct : chez lui toute appli installée est déjà listée. Chez nous, `custom` sert à poser une appli qui n'est pas dans `CATALOG`. Avec `Apps.installedPackages()`, la Carte pourra à terme proposer les applis installées sans saisie. |
| `sounds` | `Prefs.sounds` (true par défaut) | Même rôle (cues de navigation). Chez nous, faux par défaut. |
| `idleSeconds` (Nox) | `screensaver` (remplace l'économiseur de la TV) + `SleepTimer` | Lui fournit un vrai `DreamService` ; Nox n'est qu'un état de l'accueil, la TV garde son économiseur. |
| `house`, `owl`, `motion` | aucun | Propres à Poudlard TV. |
| `library` | `watchmode_key` (ouvrir un titre sur sa page) | Chez lui, lien profond via Watchmode ; chez nous, URL en liste blanche dans `config.js`, ouverte par `openUrl`. |
| `lastApp` | aucun (il a « Recent Apps », optionnel) | |
| `firstRunDone` | `KeyPage` (page unique de saisie des clés) | Pas de clés chez nous : la Lettre d'admission suffit. |
| — | `disable_assistant`, `hide_services`, `tmdb_key`, `latitude`… | Réseau ou désactivation d'applis : hors périmètre. |

## 11. Ce qu'on ne fera jamais depuis l'application (et que Free My TV fait, à raison dans son contexte)

- Pas d'adb interne : l'application n'exécute jamais `pm disable-user` ni `cmd package set-home-activity`.
  (Ces commandes restent des outils pour la personne, tapés depuis l'ordinateur, documentés dans `android/README.md` ;
  l'APK, lui, n'en a pas les moyens, et c'est voulu.)
- Pas de `RECEIVE_BOOT_COMPLETED`, pas de service d'accessibilité (`RemoteKeyService`), pas de `NotificationListener`
  (`NowPlaying`), pas de `SYSTEM_ALERT_WINDOW` (`SleepOverlay`), pas de `REQUEST_INSTALL_PACKAGES` (mises à jour).
- Pas d'`INTERNET` : ni météo, ni TMDB, ni crypto, ni vérification de mise à jour.
- Pas de ContentProvider exporté (`Secrets`, `PhotoInbox`).

Le résultat est un launcher moins capable que Free My TV, mais dont la vérification tient en une ligne
(`aapt dump permissions PoudlardTV.apk` : aucune permission) et dont le retour en arrière ne dépend d'aucun outil.
