# Musique et sons

Ce document décrit exactement ce que fait le code (`app/js/sound.js`) et pourquoi le thème des films n'y est pas. C'est le sujet le plus sensible du dépôt : la documentation et le code doivent dire la même chose.

## Ce que fait le dépôt

`app/js/sound.js` produit deux couches, avec la même voix (un célesta synthétisé en Web Audio, réverbération générée) et sans rien télécharger :

1. **Les cues** : neuf phrases très courtes (0,4 à 2,5 s), jouées à chaque interaction : `move`, `enter`, `return`, `lumos`, `nox`, `wake`, `error`, `toggle`, `confirm`. Toutes en mi mineur, toutes composées pour ce projet.
2. **La musique de fond** (l'ambiance de l'accueil), en boucle, très bas (la valse à −22 dB sous le volume maître, un fichier personnel, déjà masterisé, à −9 dB), qui s'efface sous chaque cue (ducking : moitié du volume en 20 ms, 300 ms de maintien, retour en 450 ms). Elle a **trois sources possibles**, choisies dans Réglages → Chouette et sons → **Musique de fond** (`config.music`) :

| Réglage | Valeur | Ce qui est joué |
|---|---|---|
| **Auto** (défaut) | `auto` | Votre fichier personnel s'il existe (ci-dessous), sinon la valse de célesta. |
| **Célesta** | `celesta` | La valse de célesta, toujours, même si un fichier existe. |
| **Aucune** | `aucune` | Rien : les cues seulement. |

### La valse de célesta (composition originale)

Une valse lente en mi mineur, 3/4, 66 à la noire, 24 mesures (environ 65 s) en boucle sans couture, à trois voix : célesta (mélodie), harpe (contre-chant arpégé en croches), nappe de cordes (tenue sur chaque accord). Léger rubato identique à chaque boucle.

Elle est écrite note à note dans `sound.js` (constantes `MELODY` et `PROGRESSION`), publiée sous la licence MIT du dépôt, et peut être relue par n'importe qui. Le thème d'Hedwige étant lui aussi une valse en mi mineur, l'originalité a été vérifiée intervalle par intervalle :

- la mélodie commence sur le temps fort par une montée conjointe si, do, ré, mi ; pas de levée si → mi (la quarte ascendante en anacrouse qui ouvre le thème des films) ;
- jamais la cellule mi–sol–fa♯–mi, ni la cellule si–la–fa♯, en hauteurs absolues et à toute transposition (aucun contour d'intervalles +3 −1 −2, ni +5 +3 −1, ni +7 −2 −3) ;
- aucune figure pointée (croche pointée–double) : noires et blanches seulement ;
- pas de quinte montante mi → si suivie de la → fa♯ ;
- tempo 66 (berceuse) contre environ 160 pour le thème des films.

Ces contraintes sont vérifiées par un script, à relancer après toute modification de la mélodie : `node tools/test-sound.mjs` (il lit `MELODY` dans `sound.js`, compte 48 notes et 72 temps, et cherche les cellules interdites dans la suite des intervalles). Les neuf cues respectent les mêmes interdits (par exemple `enter` descend si, sol, mi, si ; `wake` monte sol → mi).

### Le fichier personnel (hors dépôt)

Le dossier `app/assets/music/` est **ignoré par Git** : ce que vous y déposez reste sur votre machine. Le lecteur sonde, dans cet ordre (constante `MUSIC_FILES` de `sound.js`), et s'arrête au premier que le navigateur sait lire :

1. `app/assets/music/ambiance.ogg` (Vorbis ; recommandé : libre, compact, lu par Chrome et la WebView Android)
2. `app/assets/music/ambiance.mp3`
3. `app/assets/music/ambiance.m4a` (AAC)

Rien d'autre n'est lu : un autre nom de fichier, ou un `.wav`, `.flac`, est ignoré en silence (et ces formats sont de toute façon trop lourds pour une boucle). Convertissez si besoin : `ffmpeg -i source.wav -c:a libvorbis -q:a 4 app/assets/music/ambiance.ogg` (ou `-c:a libmp3lame -b:a 128k … ambiance.mp3`). Un fichier qui met plus de 4 s à répondre est réputé absent.

Pour l'ajouter :

1. Choisissez un fichier dont vous détenez les droits ou une licence qui couvre un usage personnel : votre propre composition, une œuvre sous Creative Commons compatible (lisez la clause d'attribution et l'interdiction d'œuvre dérivée), une musique achetée sur une banque de sons. La bande originale des films n'y a pas sa place (ci-dessous).
2. Nommez-le `ambiance.ogg`, `ambiance.mp3` ou `ambiance.m4a` et déposez-le dans `app/assets/music/`.
3. Gardez-le léger : une boucle de 1 à 3 minutes, 96 à 128 kbit/s, qui commence et finit sur un silence ou sur le même accord (sinon un clic au rebouclage).
4. Notez sa source et sa licence pour vous, **ailleurs que dans le dépôt** (par exemple `app/assets/music/LICENCE.txt`, ignoré par Git comme tout le dossier). Ne commitez jamais ce dossier.

Sur la télévision (APK), le fichier doit être présent dans `app/assets/music/` au moment du `build.sh` : il part alors dans l'APK, qui reste privé.

## Ce que fait le lecteur (comportement vérifiable dans `sound.js`)

- Il ne lit **qu'un fichier local** du dossier `app/assets/music/`, jamais une URL, et le sonde avec un élément `<audio>` ; s'il manque, aucune erreur visible, on passe au célesta (mode Auto) ou au silence.
- **Rien avant un geste** de l'utilisateur : aucun contexte audio n'est créé avant le premier appui ou clic (les navigateurs et la WebView l'imposent de toute façon).
- Il obéit au réglage **Son** (`config.sounds`, barre de l'accueil et Réglages) : coupé, tout se tait, musique comprise. Le volume maître (−14 dB) reste en aval de l'ambiance.
- Il se tait quand la page est cachée (`visibilitychange` : onglet en arrière-plan, WebView mise en pause), quand une application est lancée et pendant Nox, puis reprend au retour. Fondu d'entrée 2,5 s, fondu de sortie 300 ms.
- Sans fichier et en mode Aucune, **rien ne se passe et rien ne s'affiche** : c'est l'état normal d'un dépôt fraîchement cloné.

## Pourquoi le thème des films est exclu

Le thème d'Hedwige et les autres musiques des films (John Williams, Patrick Doyle, Nicholas Hooper, Alexandre Desplat) sont des œuvres protégées par le droit d'auteur, et leurs enregistrements par des droits voisins. Les utiliser dans un launcher, même gratuit, même privé puis partagé, c'est les reproduire et les communiquer au public sans autorisation.

Deux idées reviennent souvent ; aucune ne tient :

- **« Je modifie quelques notes pour que ce soit original. »** Une mélodie modifiée reste une œuvre dérivée tant qu'on y reconnaît l'originale. Changer la tonalité, le tempo, l'instrument ou quelques notes ne crée pas une œuvre nouvelle ; cela crée une adaptation, qui exige la même autorisation. Le critère n'est pas le nombre de notes changées, c'est la reconnaissance.
- **« Je ne garde que les premières notes. »** L'incipit du thème d'Hedwige est précisément sa partie la plus reconnaissable. Une citation courte n'est pas une exception en musique : il n'y a pas de seuil de durée en dessous duquel l'emprunt serait libre.

C'est pour cela que `sound.js` s'interdit explicitement les cellules de l'incipit et ne travaille que sur des phrases originales. Si vous voulez une ambiance « magique », la bonne voie est une composition originale (celle du dépôt, ou la vôtre) ou une musique sous licence, jamais une variation du thème. Pour un usage strictement privé sur votre propre télévision, le fichier personnel est fait pour cela ; il ne doit simplement jamais être redistribué.
