# Quelles télés ?

À lire **avant** d'installer quoi que ce soit. Poudlard TV est une application Android : elle ne marche que sur une
télé ou un boîtier qui fait tourner **Android TV** ou **Google TV** (Android 8 ou plus récent).

## Comment savoir ce que fait tourner ta télé

- Sur la télécommande, appuie sur Paramètres (la roue dentée), puis va dans **Système → À propos** (ou
  **Préférences de l'appareil → À propos**). Si tu lis « Android TV OS » ou « Google TV », c'est bon.
- Au démarrage, si l'écran d'accueil dit « Google TV » ou montre le Play Store, c'est bon aussi.
- Sinon, tape sur Internet « *marque et modèle de ta télé* système d'exploitation » (le modèle est écrit sur
  l'étiquette au dos de la télé, par exemple `55C745`).

## Le tableau

| Ta télé ou ton boîtier | Poudlard TV | Ce qu'il faut savoir |
|---|---|---|
| Google TV : TCL, Sony, Hisense, Philips, Xiaomi récents, Chromecast avec Google TV, Google TV Streamer | **Oui** | Le cas le plus simple. Sur le Chromecast et le Google TV Streamer, la connexion se fait par « Débogage sans fil » (voir plus bas). |
| Android TV (télés Sony, Philips, TCL, Xiaomi d'avant 2021, Nvidia Shield, Xiaomi Mi Box et Mi TV Stick, projecteurs Android) | **Oui** | Testé sur une télé Android TV 11 (1080p, 1,3 Go de mémoire). Les menus s'appellent parfois « Préférences de l'appareil ». |
| Box d'opérateur sous Android TV (Freebox Pop et Mini 4K, Bbox, box SFR) | **Pas testé** | Elles tournent sous Android TV, mais l'opérateur peut bloquer le mode développeur ou le changement d'écran d'accueil. Si le mode développeur n'apparaît pas, ça ne marchera pas. |
| Amazon Fire TV (Stick, Cube) sous Fire OS | **En partie** | Poudlard TV s'installe et s'ouvre comme une appli, mais Amazon garde la touche Accueil pour lui : tu dois l'ouvrir depuis la liste des applis. |
| Fire TV récents sous Vega OS (par exemple le Fire TV Stick 4K Select) | **Non** | Ce n'est plus Android : aucune appli Android ne s'y installe. |
| Samsung (Tizen) | **Non** | Samsung n'accepte pas les applis Android. Free My TV, lui, s'installe sur Samsung comme une appli : voir `docs/PERSONNALISER.md`. |
| LG (webOS) | **Non** | Même chose que Samsung : Free My TV marche, Poudlard TV non. |
| Apple TV | **Non** | Apple n'autorise pas d'autre écran d'accueil que le sien, et pas d'applis installées hors App Store. |
| Roku, Freebox Révolution/Delta, box Orange, consoles | **Non** | Pas Android. |
| Huawei (HarmonyOS) | **Déconseillé** | Free My TV a vu une télé Huawei ne plus redémarrer après le changement d'accueil. Ne fais pas de Poudlard l'accueil sur ces télés. |

**Ta télé n'est pas compatible ?** Branche un boîtier **Google TV** sur une prise HDMI (Chromecast avec Google TV
ou Google TV Streamer, ou une clé Android TV comme la Xiaomi TV Stick) : c'est lui qui affichera Poudlard TV, sur n'importe quelle télé.

## Activer le mode développeur, marque par marque

C'est la seule manipulation sur la télé. Elle ne casse rien, ne supprime rien, et se désactive en un clic.

1. Ouvre le menu « À propos » et appuie **7 fois de suite** sur la ligne « Build » jusqu'au message « Vous êtes
   maintenant développeur ».
2. Reviens en arrière : un nouveau menu « Options pour les développeurs » est apparu. Active **Débogage USB**
   (et **Débogage sans fil** ou **Débogage réseau** s'il existe).
3. Note l'**adresse IP** de la télé : Paramètres → Réseau et Internet → ton Wi-Fi (elle ressemble à `192.168.1.42`).

| Marque | Où est « Build » | Où sont les options pour les développeurs |
|---|---|---|
| Google TV (Chromecast, Streamer, TCL, Sony, Hisense récents) | Paramètres → Système → À propos → **Build du système d'exploitation Android TV** | Paramètres → Système → Options pour les développeurs |
| Android TV (Philips, Sony, TCL, Xiaomi plus anciens) | Paramètres → Préférences de l'appareil → À propos → **Build** | Paramètres → Préférences de l'appareil → Options pour les développeurs |
| Nvidia Shield | Paramètres → Préférences de l'appareil → À propos → **Build** | Préférences de l'appareil → Options pour les développeurs → **Débogage réseau** |
| Fire TV | Paramètres → Mon Fire TV → À propos → appuie 7 fois sur **le nom de l'appareil** | Mon Fire TV → Options pour les développeurs → **Débogage ADB** |

Les noms changent un peu selon les modèles et les mises à jour. Si tu ne trouves pas, tape sur Internet :
« *marque modèle* activer options développeur débogage USB ». Si tu installes avec Claude, il fait cette recherche
pour toi.

## Ce qui marche, ce qui ne marche pas

| Fonction | Ce qu'on sait |
|---|---|
| Lancer les applis (Netflix, Canal+, Prime Video, Disney+, YouTube…) | Marche, si l'appli est installée sur la télé. Sinon un message dit clairement « pas installée ». |
| Les films d'Ollivander (un lien par film) | Ouvre la page du film dans l'appli qui le diffuse (Canal+ dans la version d'origine). Le film doit être dans ton abonnement. |
| Les entrées HDMI (console, box) | Dépend de la télé : certaines ne laissent pas une appli changer de source. Dans ce cas, utilise la touche Source de la télécommande. |
| La touche Accueil de la télécommande | Marche sur Android TV et Google TV quand tu choisis « Faire de Poudlard l'accueil ». Pas sur Fire TV. Sur Hisense et sur le Google TV Streamer, le bouton de marque (logo de la marque) rouvre l'accueil d'origine. |
| Les résultats de l'Assistant Google, certaines commandes vocales | Rouvrent l'accueil d'origine. |
| Musique d'ambiance | Démarre seule sur la télé. Réglable dans la Salle sur Demande. |
| Télés à très peu de mémoire (moins de 1 Go) | Pas testé. Si l'appli redémarre seule, passe en mode sobre (Retour maintenu 2 s). |
| Samsung 2017-2018 sous Android | Le menu Réglages de la télé se fige quand on l'ouvre depuis une appli : utilise la touche Réglages de la télécommande. |
| TCL | Après l'installation, il faut autoriser l'appli à tourner en arrière-plan (une commande, voir `docs/POUR-CLAUDE.md`). |

## Revenir comme avant

Toujours possible, sans ordinateur, en moins d'une minute :

- **Retour maintenu 2 secondes** : écran sobre, mêmes applis, sans décor.
- **Salle sur Demande → Accueil de la télé → Revenir à l'accueil de la télé** : la télé retrouve son écran d'accueil.
- **Paramètres → Applis → Poudlard TV → Désinstaller** : il ne reste rien.
