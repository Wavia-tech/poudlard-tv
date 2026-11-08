# Pour l'assistant IA : installer Poudlard TV chez un débutant

Ce fichier s'adresse à Claude (Claude Code, ou Claude dans le navigateur qui lit ce dépôt). Une personne te demande
d'installer Poudlard TV sur sa télé. Pars du principe qu'**elle n'a rien d'installé** (ni Python, ni Java, ni adb,
ni Git) et qu'elle n'a jamais ouvert un terminal. Le guide pour humains est `INSTALLER.md`, la compatibilité des télés
`docs/TELEVISEURS.md`.

## Ta façon de faire

- Parle français, en phrases courtes, sans jargon. Dis ce que tu vas faire avant de le faire.
- Une étape à la fois. Quand elle doit agir sur la télé, décris exactement ce qu'elle doit voir à l'écran et sur quel
  bouton appuyer, puis attends qu'elle te dise que c'est fait.
- Demande avant toute action qui change quelque chose sur la télé (installer, changer l'accueil, désinstaller).
- **Ne désactive et ne désinstalle jamais l'accueil d'origine** ni une autre appli. Pas de `pm disable-user`, pas de
  `pm uninstall` sur une appli système, pas de root, pas de réinitialisation.
- Tu ne compiles rien par défaut : l'APK prêt à l'emploi est sur la page des versions du dépôt. Ne construis l'APK
  (`android/build.sh`, JDK 17 + Android SDK, voir `android/README.md`) que si la personne te le demande ou si le
  téléchargement est impossible.
- Si tu es Claude dans le navigateur (sans terminal), tu ne peux pas lancer les commandes : guide-la pour la méthode
  « Sans Claude Code » d'`INSTALLER.md`, commande par commande, en adaptant à son système.

## 1. Vérifier que la télé est compatible

1. Demande la marque et le modèle exact (étiquette au dos, ou Paramètres → À propos).
2. Si tu as accès au web, cherche « *marque modèle* Android TV » pour confirmer le système. Compare avec
   `docs/TELEVISEURS.md`.
3. Si elle n'est pas compatible (Samsung Tizen, LG webOS, Apple TV, Roku, Fire TV sous Vega OS), dis-le tout de
   suite, gentiment, et propose les deux sorties : un boîtier Google TV en HDMI, ou Free My TV (qui marche aussi sur
   LG et Samsung, voir `docs/PERSONNALISER.md`).
4. Fire TV sous Fire OS : préviens que Poudlard TV s'ouvrira comme une appli, sans prendre la touche Accueil.

## 2. Mode développeur et adresse IP

Le guide pour humains lui a déjà fait faire « 7 fois sur Build » puis « Débogage USB activé ». Vérifie-le avec elle.
Si son modèle a des menus différents, cherche sur le web « *marque modèle* options développeur débogage USB » et
donne-lui le chemin exact. Sur Android TV, c'est bien **Débogage USB** qui ouvre adb, y compris par le réseau
(port 5555) : pas de câble. Fire TV l'appelle « Débogage ADB », Nvidia Shield « Débogage réseau ».

**Ne lui demande pas l'adresse IP : trouve-la toi-même.** L'ordinateur et la télé doivent être sur le même réseau
(même box). Dans l'ordre :

1. `adb mdns services` : liste les télés qui annoncent le débogage sans fil (Android 11 et plus).
2. Sinon, cherche sur le réseau local les appareils qui répondent sur le port 5555 : trouve l'adresse et le
   masque de l'ordinateur (`ipconfig` sous Windows, `ipconfig getifaddr en0` sous Mac), puis teste chaque adresse
   du même sous-réseau avec un délai court (PowerShell : `System.Net.Sockets.TcpClient` avec `ConnectAsync` et
   200 ms d'attente ; Mac et Linux : `nc -z -G 1` ou `nc -z -w 1`). Si plusieurs répondent, `adb connect` sur
   chacune et `adb shell getprop ro.product.model` pour reconnaître la sienne.
3. Si rien ne répond (télé en veille, réseau invité, Wi-Fi différent), alors seulement, demande-lui l'adresse :
   Paramètres → Réseau et Internet → son Wi-Fi.

## 3. Installer adb sur l'ordinateur (sans droits administrateur)

Télécharge les platform-tools officiels de Google dans le dossier de l'utilisateur, et utilise ce chemin complet
ensuite (pas besoin de toucher au PATH) :

- Windows : `https://dl.google.com/android/repository/platform-tools-latest-windows.zip`, décompressé dans
  `%USERPROFILE%\platform-tools` (PowerShell : `Invoke-WebRequest` puis `Expand-Archive`). Alternative :
  `winget install -e --id Google.PlatformTools`.
- Mac : `https://dl.google.com/android/repository/platform-tools-latest-darwin.zip` dans `~/platform-tools`
  (`curl -L -o` puis `unzip`). Pas besoin de Homebrew.
- Linux : `https://dl.google.com/android/repository/platform-tools-latest-linux.zip` dans `~/platform-tools`.

Vérifie avec `adb version`.

## 4. Télécharger l'APK

```
https://github.com/Wavia-tech/poudlard-tv/releases/latest/download/PoudlardTV.apk
```

Range-le dans le dossier de travail. Vérifie qu'il fait plus de 15 Mo (sinon le téléchargement a échoué).

## 5. Se connecter à la télé

```
adb connect <IP>:5555
```

- La télé affiche « Autoriser le débogage USB ? » : dis-lui de cocher **Toujours autoriser depuis cet ordinateur**
  puis **OK**. Si `adb devices` dit `unauthorized`, la fenêtre est encore à l'écran ou a été refusée : refais
  `adb disconnect` puis `adb connect`.
- `connection refused` ou délai dépassé (fréquent sur Chromecast avec Google TV, Google TV Streamer et Android 14) :
  active **Débogage sans fil** dans les options pour les développeurs, ouvre **Associer l'appareil avec un code
  d'association**, et fais-lui lire les deux nombres affichés. Puis :
  ```
  adb pair <IP>:<port d'association> <code à 6 chiffres>
  adb connect <IP>:<port affiché sous Débogage sans fil>
  ```
  (les deux ports sont différents).
- Toujours rien : vérifie le même Wi-Fi, que la télé est allumée (pas en veille), et que le débogage est activé.

## 6. Installer

```
adb install -r PoudlardTV.apk
```

- Sur Android 14, Google Play Protect peut afficher « Appli bloquée » ou « Appli à risque » sur la télé : dis-lui
  d'appuyer sur **Plus de détails** puis **Installer quand même**. Poudlard TV ne demande **aucune permission** (pas
  d'Internet, pas de données) : c'est vérifiable avec `aapt dump permissions`, qui n'affiche rien.
- `INSTALL_FAILED_UPDATE_INCOMPATIBLE` : une autre version est déjà installée avec une autre signature. Demande
  l'accord, puis `adb uninstall fr.wavia.poudlardtv` et réinstalle.
- Télé **TCL** : autorise l'appli à tourner en arrière-plan (sans quoi TCL la coupe) :
  ```
  adb shell "appops set fr.wavia.poudlardtv AUTO_START allow || appops set fr.wavia.poudlardtv APP_AUTO_START allow"
  ```

L'installation **ne prend pas** la touche Accueil : la télé reste comme avant tant que la personne ne l'a pas choisi.

## 7. Premier lancement

Lance l'appli :

```
adb shell am start -n fr.wavia.poudlardtv/.Start
```

La **Lettre d'admission** s'ouvre sur la télé (maison, applis, chouette, moins d'une minute, tout à la
télécommande). À la dernière page, « Les issues de secours » :

- **Faire de Poudlard l'accueil** : la télé affiche sa propre fenêtre de confirmation, il faut choisir Poudlard TV.
  Sur Android 8 et 9, appuyer ensuite sur la touche Accueil et choisir Poudlard TV puis « Toujours ».
- Si la personne préfère attendre, elle peut le faire plus tard : flèche haut → la plume en haut à droite → Salle sur
  Demande → Accueil de la télé.

Par la commande, si l'écran de choix ne vient pas : `adb shell pm enable fr.wavia.poudlardtv/.Home` puis
`adb shell cmd package set-home-activity fr.wavia.poudlardtv/.Home` (avec son accord).

## 8. Finir proprement

1. Montre-lui les issues de secours, et fais-les essayer une fois :
   - **Retour maintenu 2 secondes** → « Nox ? » → écran sobre, et retour au décor par le même geste ;
   - **Salle sur Demande → Accueil de la télé → Revenir à l'accueil de la télé** → la télé retrouve son accueil.
2. `adb disconnect`.
3. Dis-lui qu'elle peut **désactiver le débogage USB** maintenant : Poudlard TV n'en a pas besoin pour fonctionner.
4. Pour les films d'Ollivander : ils s'ouvrent dans Canal+ (la version d'origine). Pour les changer, ou pour
   personnaliser l'interface, renvoie vers `docs/PERSONNALISER.md`.

## Si ça se passe mal

| Ce qu'elle voit | Quoi faire |
|---|---|
| Écran noir ou appli qui se ferme | Retour maintenu 2 s (écran sobre). Mets à jour « Android System WebView » dans le Play Store. Après 3 plantages en 5 minutes, Poudlard rend la main tout seul à l'accueil d'origine. |
| La touche Accueil ramène l'ancien accueil après une mise à jour de la télé | Poudlard propose de reprendre la touche (« La télé a repris la touche Home ») : accepter. |
| Une appli ne s'ouvre pas | Elle n'est pas installée sur la télé, ou n'est pas faite pour la télé : l'installer depuis le Play Store. |
| Elle veut tout enlever | `adb shell cmd package set-home-activity <accueil d'origine>` (la liste : `adb shell cmd package query-activities -a android.intent.action.MAIN -c android.intent.category.HOME`), puis `adb uninstall fr.wavia.poudlardtv`. Ou sur la télé : Paramètres → Applis → Poudlard TV → Désinstaller. |

Les détails techniques (pont Java, réglages, journal `adb logcat -s PoudlardTV chromium`) sont dans
`docs/INSTALLATION.md` et `android/README.md`.
