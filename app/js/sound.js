// Bande-son de Poudlard TV : un célesta de film, synthétisé en Web Audio, sans aucun fichier audio distribué.
//
// Deux couches, une seule voix :
//   1. les CUES (très courts, 0.4 à 2.5 s) joués à chaque interaction ;
//   2. la MUSIQUE DE FOND (ambiance), en boucle, loin sous le maître (valse originale synthétisée, ou fichier
//      personnel hors dépôt), qui se tait sous chaque cue (ducking) et se met en attente (Nox, lancement, page cachée).
//
// ---------------------------------------------------------------------------------------------------------------
// 1. Cues
// ---------------------------------------------------------------------------------------------------------------
// Principe : chaque interaction joue un « cue » très court, tous dans la même tonalité (mi mineur) et avec le même
// timbre, pour que l'interface ait une seule voix. Les mélodies sont ORIGINALES : aucune citation du thème d'Hedwige
// ni d'une mélodie des films (droits). En particulier, aucune cue ne commence par la levée si → mi suivie de sol
// (incipit du thème d'Hedwige). Elles ne font que partager l'esprit « boîte à musique dans une grande salle » :
// célesta, réverbération longue, notes claires.
//
// Timbre (par note) : 3 à 4 partiels inharmoniques de cloche (x1, x2.76, x5.4, x8.9), attaque 4 ms,
// décroissance exponentielle 0.8–1.8 s, détune aléatoire ±4 cents, et un bruit de marteau très court
// filtré passe-haut à l'attaque. Les partiels aigus s'éteignent plus vite que la fondamentale.
//
// Espace : ConvolverNode avec une réponse impulsionnelle générée (bruit blanc décroissant 2.2 s, deux canaux
// décorrélés, filtré passe-bas 5 kHz), mix sec/humide 0.65/0.35, compresseur doux, volume maître −14 dB.
//
// Robustesse : si AudioContext n'existe pas (Node, vieux navigateur), tout est silencieux sans erreur.
//
// Rien avant un geste : le module tient lui-même un drapeau `gestured`, posé par le premier keydown / pointerdown /
// touchstart. Avant ce geste, aucun contexte n'est créé et rien n'est joué (même si le navigateur autorisait
// l'autoplay) : `init()` se contente de poser les écouteurs, `cue()` répond false. Au premier geste, si le son est
// activé, le contexte est créé dans le gestionnaire d'événement lui-même (il démarre donc « running »).
// Un cue demandé pendant que le contexte se relance (resume() en cours) est gardé en attente (un seul, le dernier)
// et joué dès que le contexte tourne ; un cue demandé sur un contexte suspendu sans relance en cours est ignoré.
// Ainsi, rien ne s'empile pendant une veille et rien ne part en rafale au réveil.
//
// Les confirmations appartiennent aux écrans : setEnabled(true) ne joue rien de lui-même (c'est la barre Son de
// l'accueil, ou la rangée Sons des Réglages, qui joue son `toggle`).
//
// ---------------------------------------------------------------------------------------------------------------
// 2. Musique de fond
// ---------------------------------------------------------------------------------------------------------------
// La musique des films est protégée (compositeur, éditeur, enregistrement) ; une version « légèrement modifiée »
// reste une œuvre dérivée tant qu'on y reconnaît l'originale. D'où deux sources, toutes deux légales :
//
//   (a) FICHIER PERSONNEL : `assets/music/ambiance.ogg`, `.mp3` ou `.m4a` (MUSIC_FILES, sondés dans cet ordre)
//       s'il existe. L'utilisateur y dépose une musique dont il détient les droits, pour son usage privé. Le fichier
//       n'est JAMAIS distribué : le dossier `assets/music/` est dans le .gitignore du dépôt. On le sonde avec un
//       <audio> ; s'il manque, aucune erreur visible, on passe à (b). Joué en boucle, avec fondu, à FILE_DB sous le
//       maître (un fichier masterisé est bien plus fort que la synthèse : il a son propre niveau).
//
//   (b) COMPOSITION ORIGINALE synthétisée par le moteur célesta : une valse lente en mi mineur, 3/4, 66 à la noire,
//       24 mesures (≈ 65 s) en boucle sans couture, composée pour ce projet et publiée sous la licence du dépôt (MIT).
//       Trois voix :
//         - célesta : la mélodie (timbre des cues, donc même voix que l'interface) ;
//         - harpe : contre-chant arpégé en croches (six par mesure, basse puis accord brisé) ;
//         - cordes : nappe douce (deux dents de scie détunées ±7 cents par note, filtre passe-bas 820 Hz,
//           attaque 0.9 s, relâchement 0.9 s), tenue sur chaque accord.
//       Rubato léger : le tempo respire de ±3 % sur un cycle de 12 mesures (identique à chaque boucle, donc la couture
//       est invisible), plus ±0.4 % par temps et ±8 ms sur chaque note de célesta.
//
//       Contraintes d'originalité respectées (relisibles note à note dans MELODY ; le thème d'Hedwige, J. Williams,
//       est lui aussi une valse en mi mineur, d'où la vigilance) :
//         - pas de levée si → mi (quarte ascendante en anacrouse) en tête de phrase : la mélodie commence sur le temps
//           fort, par une montée conjointe si do ré mi ;
//         - jamais la cellule mi–sol–fa#–mi (dessin caractéristique de l'incipit) ni la cellule si–la–fa#, en hauteurs
//           absolues ET à toute transposition : aucun contour +3 −1 −2 (ni +5 +3 −1, ni +7 −2 −3) dans la suite des
//           intervalles consécutifs ;
//         - aucune figure pointée (croche pointée–double) : rythme de noires et de blanches seulement ;
//         - pas de quinte montante mi → si suivie de la → fa# ;
//         - tempo 66 (lent, berceuse) contre ≈ 160 pour le thème des films.
//       Ces contraintes sont vérifiées par script (voir tools/test-sound.mjs s'il est présent, sinon le script de
//       vérification décrit dans docs/MUSIQUE.md) : analyse des 48 notes, 72 temps, intervalles consécutifs.
//
// Volume : célesta à −22 dB sous le maître (AMBIENT_DB), fichier à −9 dB (FILE_DB). Ducking : à chaque cue,
// l'ambiance tombe à la moitié en 20 ms, reste 300 ms, puis revient en 450 ms ; les cues passent donc toujours
// au-dessus. Fondu d'entrée 2.5 s, fondu de sortie 300 ms (coupure du son, changement de mode, mise en attente).
//
// Modes (Sound.ambient) : 'auto' (fichier s'il existe, sinon célesta) · 'celesta' · 'aucune' ; ce sont exactement
// les valeurs acceptées par config.music (config.js). Un appel explicite ambient(mode) REMPLACE durablement
// config.music jusqu'au prochain appel ; ambient(null) revient à la config. Sans appel explicite, le mode vient de
// config.music (lu de façon défensive : 'auto' si le champ n'existe pas).
//
// Mise en attente (indépendante du mode) : Sound.ambientHold(true, raison) coupe l'ambiance sans toucher au mode,
// Sound.ambientHold(false, raison) la relance quand plus aucune raison ne tient. Raisons prévues : 'nox' (veille),
// 'launch' (une appli se lance), 'hidden' (page cachée, posée par le module lui-même sur visibilitychange).
// Démarrage au premier geste utilisateur seulement, par init() (déjà appelé par les écrans via Fx.initAudio) ;
// setEnabled(false) coupe aussi l'ambiance.
//
// API : Sound.init() · Sound.setEnabled(bool) · Sound.cue(name, { dir }) · Sound.isEnabled() · Sound.names()
//       Sound.ambient(mode | null) · Sound.ambientHold(on, reason) · Sound.ambientState()

import { getConfig } from './config.js';

const MASTER_DB = -14;                       // volume maître
const MASTER = Math.pow(10, MASTER_DB / 20); // ≈ 0.2
const DRY = 0.65, WET = 0.35;                // mix sec / humide
const REVERB_SECONDS = 2.2;
const REVERB_LOWPASS_HZ = 5000;
const REVERB_PREDELAY = 0.018;               // petit pré-délai : le son part avant que la salle ne réponde
const MAX_VOICES = 40;                       // au-delà, on ignore les nouvelles notes (jamais de saturation)
const DEDUPE_MS = 30;                        // un même cue redemandé dans ce délai est ignoré (doublons d'écrans)

// Partiels du célesta : rapport de fréquence, niveau relatif, facteur de durée (les aigus meurent plus vite).
const PARTIALS = [
  { ratio: 1,    level: 1.00, decay: 1.00 },
  { ratio: 2.76, level: 0.34, decay: 0.55 },
  { ratio: 5.40, level: 0.12, decay: 0.32 },
  { ratio: 8.90, level: 0.045, decay: 0.22 },
];

// Hauteurs en numéros MIDI (La 4 = 69 = 440 Hz). Tonalité : mi mineur (mi, fa#, sol, la, si, do, ré).
const E3 = 52, B3 = 59, E4 = 64, B4 = 71, D5 = 74, E5 = 76, F5 = 77, G5 = 79, B5 = 83, E6 = 88, G6 = 91, B6 = 95;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Les 9 cues : liste de notes { n: hauteur MIDI, t: départ (s), d: décroissance (s), g: niveau 0–1 }.
// `dir` (−1 | 1) renverse l'ordre des notes de `move` (montant à droite, descendant à gauche).
// Durées totales : move 0.5 s · enter/return 1.3 s · lumos 2.5 s · nox 2.2 s · wake 1.1 s · error 0.45 s ·
// toggle 0.5 s · confirm 0.8 s.
const CUES = {
  // Deux notes légères, mi → sol (tierce mineure) : on se déplace d'un pas.
  move: (dir) => {
    const up = [E5, G5], seq = dir < 0 ? up.slice().reverse() : up;
    return seq.map((n, i) => ({ n, t: i * 0.07, d: 0.55 + i * 0.1, g: 0.22 + i * 0.04 }));
  },
  // Phrase de quatre notes qui descend : si, sol, mi, si (on descend dans la Bibliothèque ou la Carte).
  enter: () => [B5, G5, E5, B4].map((n, i) => ({ n, t: i * 0.11, d: 0.9 + i * 0.12, g: 0.3 - i * 0.03 })),
  // Accord de mi mineur arpégé en montant depuis la tonique : mi, sol, si, mi (on remonte vers le Parapet).
  // Pas de levée si → mi en tête : rien de commun avec l'incipit du thème d'Hedwige.
  return: () => [E5, G5, B5, E6].map((n, i) => ({ n, t: i * 0.11, d: 0.9 + i * 0.12, g: 0.26 + i * 0.02 })),
  // Accord arpégé lumineux (mi, sol, si, mi, sol) puis une tenue mi–si qui s'éteint lentement : la lumière monte.
  lumos: () => [
    ...[E5, G5, B5, E6, G6].map((n, i) => ({ n, t: i * 0.09, d: 1.1 + i * 0.1, g: 0.26 + i * 0.03 })),
    { n: E6, t: 0.46, d: 1.9, g: 0.34 },
    { n: B6, t: 0.50, d: 1.7, g: 0.16 },
    { n: E4, t: 0.46, d: 1.9, g: 0.24 },
  ],
  // Trois notes graves qui s'éteignent, de plus en plus faibles : mi, si, mi (la maison se couche).
  nox: () => [
    { n: E4, t: 0,    d: 1.4, g: 0.30 },
    { n: B3, t: 0.26, d: 1.6, g: 0.22 },
    { n: E3, t: 0.56, d: 1.8, g: 0.16 },
  ],
  // Deux notes claires, sol → mi (sixte montante) : la maison s'éveille. Pas la levée si → mi des films.
  wake: () => [{ n: G5, t: 0, d: 0.9, g: 0.26 }, { n: E6, t: 0.13, d: 1.1, g: 0.3 }],
  // Intervalle grinçant très court : seconde mineure (mi/fa) frappée deux fois, pour la Beuglante.
  error: () => [
    { n: E5, t: 0,    d: 0.28, g: 0.26 }, { n: F5, t: 0,    d: 0.28, g: 0.22 },
    { n: D5, t: 0.09, d: 0.32, g: 0.22 }, { n: E5, t: 0.09, d: 0.32, g: 0.2 },
  ],
  // Une note sèche : coche ou sablier.
  toggle: () => [{ n: B5, t: 0, d: 0.45, g: 0.26 }],
  // Tierce courte, sol puis si presque ensemble : « c'est fait ».
  confirm: () => [{ n: G5, t: 0, d: 0.7, g: 0.24 }, { n: B5, t: 0.06, d: 0.8, g: 0.26 }],
};

// ---------------------------------------------------------------------------------------------------------------
// Partition de la musique de fond (valse lente, mi mineur, 3/4)
// ---------------------------------------------------------------------------------------------------------------
const AMBIENT_DB = -22;
const AMBIENT = Math.pow(10, AMBIENT_DB / 20);   // ≈ 0.079 sous le maître : niveau de la valse synthétisée
// Fichier personnel : un mp3/ogg masterisé crête vers 0 dBFS, là où la célesta culmine vers 0.4. Il a donc son propre
// niveau, −9 dB sous le maître (−23 dBFS en sortie pour une crête pleine). Le repli direct (sans Web Audio) l'aligne.
const FILE_DB = -9;
const FILE_LEVEL = Math.pow(10, FILE_DB / 20);   // ≈ 0.355
const AMB_FADE_IN = 2.5;                         // s
const AMB_FADE_OUT = 0.3;                        // s
const DUCK_LEVEL = 0.5, DUCK_HOLD = 0.3, DUCK_BACK = 0.45;   // ducking sous un cue
const AMB_MAX_VOICES = 64;                       // plafond propre à l'ambiance (indépendant des cues)
const AMB_REVERB_SEND = 0.5;                     // part de l'ambiance envoyée dans la salle (célesta)
const FILE_REVERB_SEND = 0.15;                   // un fichier est déjà mixé : juste une touche de salle
// Fichier personnel : chemins relatifs à index.html, sondés dans cet ordre (le .ogg est le format recommandé).
const MUSIC_FILES = [
  { src: 'assets/music/ambiance.ogg', type: 'audio/ogg' },
  { src: 'assets/music/ambiance.mp3', type: 'audio/mpeg' },
  { src: 'assets/music/ambiance.m4a', type: 'audio/mp4' },
];
const PROBE_TIMEOUT_MS = 4000;                   // au-delà, le fichier est réputé absent
const SCHED_MS = 200, LOOKAHEAD = 0.6;           // ordonnanceur : toutes les 200 ms, 600 ms d'avance
const BPM = 66, BEAT = 60 / BPM;                 // noire ≈ 0.909 s, mesure ≈ 2.73 s, 24 mesures ≈ 65 s
const BEATS_PER_BAR = 3;
const RUBATO = 0.03;                             // ±3 % sur un cycle de 12 mesures
// Les mêmes valeurs que config.music (config.js, sanitize) : rien n'existe ici qui ne soit réglable à l'écran.
const AMBIENT_MODES = ['auto', 'celesta', 'aucune'];

// Grille harmonique : 24 mesures, trois phrases de huit. La dernière (mi mineur) ramène à la première (mi mineur) :
// la boucle ne « saute » pas.
const PROGRESSION = [
  'Em', 'Em', 'C', 'D', 'Em', 'C', 'Am', 'B7',
  'Em', 'Bm', 'C', 'G', 'Am', 'Em', 'B7', 'Em',
  'C', 'G', 'D', 'Em', 'C', 'Am', 'B7', 'Em',
];
// Harpe : cinq hauteurs par accord (basse, quinte, tierce, quinte, octave), jouées selon HARP_PATTERN en croches.
const HARP = {
  Em: [52, 59, 67, 71, 76], G: [55, 62, 71, 74, 79], C: [48, 55, 64, 67, 72], D: [50, 57, 66, 69, 74],
  Am: [45, 52, 60, 64, 69], Bm: [47, 54, 62, 66, 71], B7: [47, 54, 63, 69, 71],
};
const HARP_PATTERN = [0, 1, 2, 3, 4, 3];
// Cordes : triade serrée autour de mi 4, tenue sur toute la durée de l'accord.
const PAD = {
  Em: [64, 67, 71], G: [62, 67, 71], C: [60, 64, 67], D: [62, 66, 69], Am: [60, 64, 69], Bm: [62, 66, 71], B7: [63, 66, 69],
};
// Mélodie du célesta : [hauteur MIDI, durée en temps]. 72 temps = 24 mesures. Commentaires : une ligne par mesure.
const MELODY = [
  [71, 1], [72, 1], [74, 1],   //  1 Em  si do ré : montée conjointe (pas de levée si→mi)
  [76, 3],                     //  2 Em  mi tenu
  [79, 1], [81, 1], [84, 1],   //  3 C   sol la do
  [81, 2], [78, 1],            //  4 D   la fa# (pas « si la » : sol la do si la serait mi sol fa# mi transposé)
  [79, 2], [76, 1],            //  5 Em  sol mi
  [84, 2], [83, 1],            //  6 C   do si
  [81, 2], [84, 1],            //  7 Am  la do
  [83, 3],                     //  8 B7  si tenu
  [86, 2], [88, 1],            //  9 Em  ré mi (octave haute ; pas de saut si→mi après la tenue de si)
  [83, 2], [86, 1],            // 10 Bm  si ré
  [84, 2], [88, 1],            // 11 C   do mi
  [86, 2], [83, 1],            // 12 G   ré si
  [84, 1], [83, 1], [81, 1],   // 13 Am  do si la : descente conjointe
  [79, 2], [76, 1],            // 14 Em  sol mi
  [78, 2], [75, 1],            // 15 B7  fa# ré# (sensible)
  [76, 3],                     // 16 Em  mi tenu
  [84, 2], [79, 1],            // 17 C   do sol
  [83, 2], [79, 1],            // 18 G   si sol
  [81, 2], [78, 1],            // 19 D   la fa#
  [79, 2], [76, 1],            // 20 Em  sol mi
  [84, 2], [86, 1],            // 21 C   do ré
  [88, 2], [84, 1],            // 22 Am  mi do
  [81, 1], [78, 1], [75, 1],   // 23 B7  la fa# ré# : arpège descendant
  [76, 3],                     // 24 Em  mi tenu, puis la boucle repart sur si do ré
];

// Partition compilée : pour chaque temps de la boucle, la liste des événements { off (fraction du temps), kind, … }.
function buildScore() {
  const total = PROGRESSION.length * BEATS_PER_BAR;
  const beats = Array.from({ length: total }, () => []);
  let b = 0;
  for (const [n, len] of MELODY) {
    const k = Math.floor(b) % total;
    beats[k].push({ off: b - Math.floor(b), kind: 'mel', n, len });
    b += len;
  }
  PROGRESSION.forEach((ch, bar) => {
    const v = HARP[ch];
    HARP_PATTERN.forEach((idx, k) => beats[bar * BEATS_PER_BAR + Math.floor(k / 2)].push({ off: (k % 2) * 0.5, kind: 'harp', n: v[idx], strong: k === 0 }));
  });
  // Nappe : un événement par suite d'accords identiques (tenue continue, pas de redéclenchement).
  let bar = 0;
  while (bar < PROGRESSION.length) {
    let end = bar + 1;
    while (end < PROGRESSION.length && PROGRESSION[end] === PROGRESSION[bar]) end++;
    beats[bar * BEATS_PER_BAR].push({ off: 0, kind: 'pad', notes: PAD[PROGRESSION[bar]], bars: end - bar });
    bar = end;
  }
  return beats;
}
const SCORE = buildScore();

// Partiels de la harpe (harmoniques, les aigus très courts) : une corde pincée, pas une lame frappée.
const HARP_PARTIALS = [
  { ratio: 1, level: 1.00, decay: 1.00 },
  { ratio: 2, level: 0.45, decay: 0.60 },
  { ratio: 3, level: 0.20, decay: 0.40 },
  { ratio: 4, level: 0.08, decay: 0.30 },
];

let audio = null;        // AudioContext (null tant que le contexte n'a pas été créé, ou si Web Audio manque)
let graph = null;        // { input, master, convolver, wet, dry, comp } une fois le graphe construit
let noiseBuf = null;     // bruit de marteau (30 ms), partagé par toutes les notes
let enabled = false;
const voices = new Set();   // notes de cue en cours : { nodes: [...], stop() }
let armed = false;          // écouteurs de geste utilisateur posés ?
let gestured = false;       // un geste utilisateur a-t-il eu lieu ? (rien ne sonne avant)
let resuming = null;        // promesse de resume() en cours, sinon null
let pending = null;         // { name, dir } : le dernier cue demandé pendant la relance (un seul, pas de file)
const lastAt = new Map();   // nom de cue → horodatage (ms) de sa dernière lecture, pour dédupliquer

// État de la musique de fond.
const amb = {
  mode: null,          // mode demandé par Sound.ambient(), sinon null → config.music || 'auto'
  active: null,        // 'celesta' | 'fichier' | null (ce qui joue réellement ; 'fichier' n'est pas un mode, c'est une source)
  holds: new Set(),    // raisons de mise en attente ('nox', 'launch', 'hidden'…) : tant qu'il en reste une, silence
  level: AMBIENT,      // niveau cible de la source active (AMBIENT pour la célesta, FILE_LEVEL pour le fichier)
  bus: null,           // { mix, out, duck, rev } une fois construit
  voices: new Set(),   // notes d'ambiance en cours (même forme que `voices`)
  timer: 0,            // setInterval de l'ordonnanceur (célesta)
  beat: 0,             // prochain temps à planifier (0..71)
  beatStart: 0,        // horloge audio de ce temps
  req: 0,              // jeton de la dernière demande (annule une sonde dépassée)
  swap: 0,             // jeton du redémarrage différé (changement de source)
  file: undefined,     // undefined : pas encore sondé · null : absent · HTMLAudioElement : présent
  probing: null,       // rappels en attente pendant la sonde
  fileNode: null,      // MediaElementAudioSourceNode (une seule fois par élément)
  filePending: false,  // play() refusé (pas de geste) : réessayer au prochain cue
  visArmed: false,     // écouteur visibilitychange posé ?
};

const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

function audioClass() {
  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  return g.AudioContext || g.webkitAudioContext || null;
}

// Lecture défensive de config.music : le champ peut ne pas exister (config.js le valide ou non).
function configuredMode() {
  try {
    const m = getConfig().music;
    return AMBIENT_MODES.includes(m) ? m : 'auto';
  } catch (e) { return 'auto'; }
}

// Réponse impulsionnelle : bruit blanc décroissant (−60 dB à 2.2 s), deux canaux décorrélés,
// filtre passe-bas à un pôle appliqué deux fois (≈ 5 kHz), petit pré-délai, niveau normalisé.
function makeImpulse(ctx) {
  const sr = ctx.sampleRate, len = Math.floor(sr * (REVERB_SECONDS + REVERB_PREDELAY));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(sr * REVERB_PREDELAY);
  const alpha = 1 - Math.exp(-2 * Math.PI * REVERB_LOWPASS_HZ / sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y1 = 0, y2 = 0, energy = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp(-6.91 * t / REVERB_SECONDS);           // −60 dB au bout de REVERB_SECONDS
      const x = (Math.random() * 2 - 1) * env;
      y1 += alpha * (x - y1);                                      // premier pôle
      y2 += alpha * (y1 - y2);                                     // second pôle (pente plus franche)
      d[i] = y2;
      energy += y2 * y2;
    }
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 1;          // énergie unitaire : le mix humide reste prévisible
    for (let i = pre; i < len; i++) d[i] *= norm;
  }
  return buf;
}

function makeNoise(ctx) {
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Construit une fois : notes → [sec 0.65] + [convolver → humide 0.35] → compresseur doux → maître (−14 dB) → sortie.
function buildGraph(ctx) {
  const input = ctx.createGain(); input.gain.value = 1;
  const dry = ctx.createGain(); dry.gain.value = DRY;
  const wet = ctx.createGain(); wet.gain.value = WET;
  const convolver = ctx.createConvolver();
  convolver.normalize = false;
  convolver.buffer = makeImpulse(ctx);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 2.5;
  comp.attack.value = 0.008; comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = enabled ? MASTER : 0;
  input.connect(dry).connect(comp);
  input.connect(convolver).connect(wet).connect(comp);
  comp.connect(master).connect(ctx.destination);
  noiseBuf = makeNoise(ctx);
  return { input, master, convolver, wet, dry, comp };
}

// Bus de l'ambiance (construit à la demande) :
//   sources → mix → out (niveau −22 dB, fondus) → duck (ducking) → compresseur (sec)
//                                                  duck → rev (envoi) → convolver (humide)
// Le maître (−14 dB, coupure du son) reste en aval : setEnabled(false) coupe aussi l'ambiance.
function ensureAmbientBus() {
  if (amb.bus || !audio || !graph) return amb.bus;
  const ctx = audio;
  const mix = ctx.createGain(); mix.gain.value = 1;
  const out = ctx.createGain(); out.gain.value = 0;
  const duck = ctx.createGain(); duck.gain.value = 1;
  const rev = ctx.createGain(); rev.gain.value = AMB_REVERB_SEND;
  mix.connect(out).connect(duck).connect(graph.comp);
  duck.connect(rev).connect(graph.convolver);
  amb.bus = { mix, out, duck, rev };
  return amb.bus;
}

// Arrête toutes les voix de cue (en file ou en cours) : purge avant une relance, ou coupure du son.
function stopAll(when) {
  for (const v of Array.from(voices)) v.stop(when);
}

// Relance le contexte s'il est suspendu. Une seule promesse à la fois (`resuming`) ; à sa résolution, le cue
// gardé en attente est joué si le contexte tourne vraiment, et l'ambiance est (re)mise en route.
function resume() {
  if (!audio || audio.state !== 'suspended') return;
  if (resuming) return;
  let p = null;
  try { p = audio.resume(); } catch (e) { p = null; }
  if (!p || typeof p.then !== 'function') return;
  resuming = p.then(() => { resuming = null; flushPending(); ambientApply(); }, () => { resuming = null; pending = null; });
}

// Joue le cue gardé pendant la relance, avec une horloge relue à cet instant.
function flushPending() {
  const p = pending; pending = null;
  if (!p || !enabled || !audio || !graph || audio.state !== 'running') return;
  schedule(p.name, p.dir);
}

// Au premier geste (touche ou pointeur), on pose le drapeau, on crée le contexte si le son est activé (dans le
// gestionnaire d'événement : le navigateur l'accepte) et on le relance. Les écouteurs sont posés une seule fois.
function armGesture() {
  if (armed || typeof document === 'undefined') return;
  armed = true;
  const once = () => {
    gestured = true;
    if (audio) stopAll();                         // purge : rien ne doit partir en rafale à la relance
    if (enabled && !audio) Sound.init(); else resume();
    if (amb.filePending) playFile();              // le fichier attendait un geste
  };
  for (const ev of ['keydown', 'pointerdown', 'touchstart']) document.addEventListener(ev, once, { once: true, capture: true, passive: true });
  armVisibility();
}

// Page cachée (onglet, ou WebView mise en pause par le launcher) : mise en attente 'hidden' ; de retour, levée.
// Même mécanisme que Nox et le lancement d'une appli (ambientHold), donc le mode choisi n'est jamais touché.
function armVisibility() {
  if (amb.visArmed || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  amb.visArmed = true;
  document.addEventListener('visibilitychange', () => ambientHold(Boolean(document.hidden), 'hidden'));
}

// Mise en attente par raison : on empile les raisons ; l'ambiance se tait tant qu'il en reste une et reprend (selon
// son mode) quand la dernière est levée. Ne modifie jamais amb.mode.
function ambientHold(on, reason) {
  const r = typeof reason === 'string' && reason ? reason : 'hold';
  const had = amb.holds.has(r);
  if (on) { amb.holds.add(r); if (!had) ambientStop(); return; }
  if (!had) return;
  amb.holds.delete(r);
  if (!amb.holds.size) ambientApply();
}

// Enregistre une voix (cue ou ambiance) : arrêt groupé possible, nettoyage à la fin de la note la plus longue.
function registerVoice(bag, nodes, longest) {
  const voice = {
    nodes,
    stop(when) {
      for (const n of nodes) { if (typeof n.stop === 'function') { try { n.stop(when); } catch (e) { /* déjà arrêté */ } } }
    },
  };
  bag.add(voice);
  const done = () => { bag.delete(voice); for (const n of nodes) { try { n.disconnect(); } catch (e) { /* rien */ } } };
  if (longest) longest.onended = done; else done();
}

// Une note de célesta à l'instant `at` (horloge audio). `out` : nœud de sortie ; `bag` / `max` : registre et plafond.
function playNote(note, at, out = graph.input, bag = voices, max = MAX_VOICES) {
  if (bag.size >= max) return;
  const ctx = audio;
  const f0 = hz(note.n);
  const detune = (Math.random() * 2 - 1) * 4;                      // ±4 cents, commun aux partiels (une seule lame)
  const nodes = [];
  let longest = null, longestEnd = 0;
  for (const p of PARTIALS) {
    const f = f0 * p.ratio;
    if (f > ctx.sampleRate * 0.45) continue;                       // partiel au-delà de Nyquist : on le laisse
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = detune;
    const peak = note.g * p.level;
    const dur = note.d * p.decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.004);              // attaque 4 ms
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.004 + dur); // décroissance exponentielle
    osc.connect(g).connect(out);
    osc.start(at); osc.stop(at + 0.004 + dur + 0.05);
    nodes.push(osc, g);
    if (at + dur > longestEnd) { longestEnd = at + dur; longest = osc; }
  }
  // Marteau : 30 ms de bruit passe-haut, enveloppe de 12 ms, très discret.
  if (noiseBuf) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200; hp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(note.g * 0.18, at + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.012);
    src.connect(hp).connect(g).connect(out);
    src.start(at); src.stop(at + 0.03);
    nodes.push(src, hp, g);
  }
  registerVoice(bag, nodes, longest);
}

// Une corde de harpe pincée (ambiance seulement) : partiels harmoniques, attaque 3 ms, les graves durent plus.
function playPluck(n, at, g0) {
  if (amb.voices.size >= AMB_MAX_VOICES) return;
  const ctx = audio, out = amb.bus.mix;
  const f0 = hz(n);
  const base = Math.min(1.3, Math.max(0.5, 0.7 + (72 - n) * 0.012));   // durée selon la hauteur
  const nodes = [];
  let longest = null, longestEnd = 0;
  for (const p of HARP_PARTIALS) {
    const f = f0 * p.ratio;
    if (f > ctx.sampleRate * 0.45) continue;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = f; osc.detune.value = (Math.random() * 2 - 1) * 3;
    const dur = base * p.decay;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(g0 * p.level, at + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.003 + dur);
    osc.connect(g).connect(out);
    osc.start(at); osc.stop(at + 0.003 + dur + 0.05);
    nodes.push(osc, g);
    if (at + dur > longestEnd) { longestEnd = at + dur; longest = osc; }
  }
  registerVoice(amb.voices, nodes, longest);
}

// Nappe de cordes (ambiance seulement) : par note, deux dents de scie détunées ±7 cents, un passe-bas commun,
// attaque 0.9 s, tenue `secs`, relâchement 0.9 s (la nappe suivante se superpose : pas de trou).
function playPad(notes, at, secs) {
  if (amb.voices.size >= AMB_MAX_VOICES) return;
  const ctx = audio;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 820; lp.Q.value = 0.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(1, at + 0.9);
  env.gain.setValueAtTime(1, at + Math.max(1, secs - 0.2));
  env.gain.linearRampToValueAtTime(0.0001, at + secs + 0.9);
  lp.connect(env).connect(amb.bus.mix);
  const nodes = [lp, env];
  let last = null;
  notes.forEach((n, i) => {
    for (const d of [-7, 7]) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = hz(n); osc.detune.value = d + (Math.random() - 0.5) * 3;
      g.gain.value = 0.03 * (i === 0 ? 1 : 0.8);
      osc.connect(g).connect(lp);
      osc.start(at); osc.stop(at + secs + 1);
      nodes.push(osc, g);
      last = osc;
    }
  });
  registerVoice(amb.voices, nodes, last);
}

// Durée d'un temps : tempo de base × respiration lente (±3 % sur 12 mesures) × hasard infime.
function beatDuration(beat) {
  const bar = Math.floor(beat / BEATS_PER_BAR);
  return BEAT * (1 + RUBATO * Math.sin(2 * Math.PI * bar / 12)) * (1 + (Math.random() * 2 - 1) * 0.004);
}

// Un événement de la partition, à l'instant `at` ; `dur` : durée du temps courant (s).
function scheduleAmbientEvent(ev, at, dur) {
  if (ev.kind === 'mel') {
    const t = at + (Math.random() - 0.5) * 0.016;                   // ±8 ms : une main, pas une machine
    playNote({ n: ev.n, d: ev.len * dur * 0.9 + 0.6, g: 0.28 }, t, amb.bus.mix, amb.voices, AMB_MAX_VOICES);
  } else if (ev.kind === 'harp') {
    const g = 0.15 * (0.85 + Math.random() * 0.3) * (ev.strong ? 1.25 : 1);
    playPluck(ev.n, at, g);
  } else if (ev.kind === 'pad') {
    playPad(ev.notes, at, ev.bars * BEATS_PER_BAR * dur);
  }
}

// Ordonnanceur : planifie les temps qui tombent dans les 600 ms à venir. Si le contexte est suspendu, le setInterval
// continue de tourner mais l'horloge audio ne bouge plus : chaque passage ne trouve rien à planifier, rien ne
// s'empile, et à la reprise la musique continue où elle en était.
function ambientTick() {
  if (!audio || !amb.bus || amb.active !== 'celesta') return;
  const horizon = audio.currentTime + LOOKAHEAD;
  let guard = 0;
  while (amb.beatStart < horizon && guard++ < 12) {
    const dur = beatDuration(amb.beat);
    for (const ev of SCORE[amb.beat]) scheduleAmbientEvent(ev, amb.beatStart + ev.off * dur, dur);
    amb.beatStart += dur;
    amb.beat = (amb.beat + 1) % SCORE.length;
  }
}

// Fondu du niveau de l'ambiance (linéaire : les valeurs sont petites).
function rampAmbient(target, secs) {
  const g = amb.bus.out.gain, t = audio.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(target, t + secs);
}

// Ducking : sous un cue, l'ambiance tombe à la moitié en 20 ms, tient 300 ms, revient en 450 ms.
function duckAmbient() {
  if (!amb.bus || !amb.active) return;
  const g = amb.bus.duck.gain, t = audio.currentTime;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(DUCK_LEVEL, t + 0.02);
  g.setValueAtTime(DUCK_LEVEL, t + 0.02 + DUCK_HOLD);
  g.linearRampToValueAtTime(1, t + 0.02 + DUCK_HOLD + DUCK_BACK);
}

// ---- Fichier personnel ------------------------------------------------------------------------------------------
// Sonde assets/music/ambiance.ogg, .mp3 puis .m4a (MUSIC_FILES) avec un <audio>. Résultat mis en cache ; jamais
// d'exception visible.
function probeFile(cb) {
  if (amb.file !== undefined) { cb(amb.file); return; }
  if (amb.probing) { amb.probing.push(cb); return; }
  amb.probing = [cb];
  const settle = (el) => { amb.file = el; const cbs = amb.probing; amb.probing = null; for (const f of cbs) f(el); };
  const Aud = typeof globalThis !== 'undefined' ? globalThis.Audio : undefined;
  if (typeof document === 'undefined' || typeof Aud !== 'function') { settle(null); return; }
  let i = 0;
  const tryNext = () => {
    if (i >= MUSIC_FILES.length) { settle(null); return; }
    const { src, type } = MUSIC_FILES[i++];
    let el = null;
    try { el = new Aud(); } catch (e) { settle(null); return; }
    // Format non lisible par ce navigateur : on passe au suivant sans même le demander.
    if (typeof el.canPlayType === 'function' && el.canPlayType(type) === '') { tryNext(); return; }
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true;
      clearTimeout(timer);
      el.removeEventListener('canplay', onOk); el.removeEventListener('error', onKo);
      if (ok) settle(el); else { try { el.removeAttribute('src'); el.load(); } catch (e) { /* rien */ } tryNext(); }
    };
    const onOk = () => finish(true), onKo = () => finish(false);
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    el.addEventListener('canplay', onOk);
    el.addEventListener('error', onKo);
    el.preload = 'auto'; el.loop = true;
    try { el.src = src; el.load(); } catch (e) { finish(false); }
  };
  tryNext();
}

// Branche l'élément sur le bus (une seule fois) ; si la WebView refuse, l'élément joue seul à bas volume.
function connectFile() {
  const el = amb.file;
  if (!el || amb.fileNode !== null) return;
  try {
    amb.fileNode = audio.createMediaElementSource(el);
    amb.fileNode.connect(amb.bus.mix);
    el.volume = 1;
  } catch (e) {
    amb.fileNode = false;                                           // repli : sortie directe, sans ducking ni fondu
    el.volume = Math.min(1, FILE_LEVEL * MASTER);                   // même niveau que la voie normale (≈ −23 dB)
  }
}

function playFile() {
  const el = amb.file;
  if (!el || amb.active !== 'fichier') return;
  amb.filePending = false;
  let p = null;
  try { p = el.play(); } catch (e) { amb.filePending = true; return; }
  if (p && typeof p.catch === 'function') p.catch(() => { amb.filePending = true; });
}

// ---- Démarrage / arrêt --------------------------------------------------------------------------------------------
function ambientStop(fade = AMB_FADE_OUT) {
  amb.swap++;                                                       // annule un redémarrage différé
  amb.req++;                                                        // et une sonde de fichier en cours
  if (!amb.active) return;
  const kind = amb.active; amb.active = null;
  if (amb.timer) { clearInterval(amb.timer); amb.timer = 0; }
  if (audio && amb.bus) {
    rampAmbient(0, fade);
    const when = audio.currentTime + fade + 0.05;
    for (const v of Array.from(amb.voices)) v.stop(when);
  }
  if (kind === 'fichier' && amb.file) {
    const el = amb.file;
    setTimeout(() => { if (amb.active !== 'fichier') { try { el.pause(); } catch (e) { /* rien */ } } }, fade * 1000 + 60);
  }
}

function ambientStart(kind) {
  if (!audio || !graph || !enabled || !gestured || amb.holds.size) return;
  ensureAmbientBus();
  if (amb.active === kind) return;
  if (amb.active) {
    // Changement de source : fondu de sortie, puis l'autre entre. Le jeton `swap` périme ce redémarrage différé si
    // un arrêt, une mise en attente ou un démarrage direct passent entre-temps (deux appuis ◀▶ en moins de 340 ms).
    ambientStop();
    const token = ++amb.swap;
    setTimeout(() => { if (amb.swap === token && !amb.active) ambientStart(kind); }, AMB_FADE_OUT * 1000 + 40);
    return;
  }
  amb.swap++;                                                       // démarrage direct : périme tout différé en attente
  amb.active = kind;
  amb.level = kind === 'fichier' ? FILE_LEVEL : AMBIENT;
  amb.bus.rev.gain.value = kind === 'fichier' ? FILE_REVERB_SEND : AMB_REVERB_SEND;
  amb.bus.duck.gain.value = 1;
  rampAmbient(amb.level, AMB_FADE_IN);
  if (kind === 'celesta') {
    amb.beat = 0;
    amb.beatStart = audio.currentTime + 0.15;
    amb.timer = setInterval(ambientTick, SCHED_MS);
    ambientTick();
  } else {
    connectFile();
    playFile();
  }
}

// Applique le mode en vigueur (explicite ou config), sauf mise en attente. Idempotent : ne redémarre pas une source
// déjà active.
function ambientApply() {
  if (!audio || !graph || !enabled || !gestured || amb.holds.size) return;
  const mode = amb.mode || configuredMode();
  const token = ++amb.req;
  if (mode === 'aucune') { ambientStop(); return; }
  if (mode === 'celesta') { ambientStart('celesta'); return; }
  // 'auto' : le fichier personnel s'il existe, sinon la valse.
  probeFile((el) => {
    if (amb.req !== token || !enabled || amb.holds.size) return;    // une autre demande est passée entre-temps
    ambientStart(el ? 'fichier' : 'celesta');
  });
}

// Planifie toutes les notes d'un cue sur un contexte qui tourne (horloge relue ici, jamais avant).
function schedule(name, dir) {
  const make = CUES[name];
  if (!make) return false;
  const at = audio.currentTime + 0.012;                            // petite avance : toutes les notes partent à l'heure
  for (const note of make(dir)) playNote(note, at + note.t);
  duckAmbient();
  lastAt.set(name, now());
  return true;
}

export const Sound = {
  // Crée le contexte et le graphe (idempotent) si un geste utilisateur a déjà eu lieu ; sinon pose seulement les
  // écouteurs de geste et retourne false : le contexte sera créé au premier geste (si le son est activé) ou au
  // premier cue qui le suit. Jamais de contexte avant un geste. Met aussi la musique de fond en route.
  init() {
    armGesture();
    if (!gestured) return false;
    if (!audio) {
      const AC = audioClass();
      if (!AC) return false;
      try { audio = new AC(); } catch (e) { audio = null; return false; }
      try { graph = buildGraph(audio); } catch (e) { graph = null; audio = null; return false; }
    }
    resume();
    ambientApply();
    return true;
  },

  isEnabled() { return enabled; },

  // Mute instantané : le maître tombe à zéro en 30 ms et les notes en cours sont arrêtées ; l'ambiance fait son
  // fondu de 300 ms (sous le maître déjà à zéro : inaudible, mais l'ordonnanceur s'arrête proprement).
  // Remise en marche : le maître remonte, sans rien jouer (la confirmation appartient à l'écran appelant) ; l'ambiance
  // reprend selon son mode. Ne crée pas le contexte : il naît au premier geste ou au premier cue.
  setEnabled(on) {
    const was = enabled;
    enabled = !!on;
    armGesture();
    if (!enabled) pending = null;
    if (!audio || !graph) return;
    if (was === enabled) return;                                    // rien n'a changé (main.js rappelle à chaque config)
    const t = audio.currentTime;
    const g = graph.master.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    if (!enabled) {
      g.linearRampToValueAtTime(0, t + 0.03);
      stopAll(t + 0.035);
      ambientStop();
    } else {
      g.linearRampToValueAtTime(MASTER, t + 0.03);
      ambientApply();
    }
  },

  // Joue un cue par son nom. opts.dir : 1 (droite / montant) ou −1 (gauche / descendant) pour `move`.
  // Retourne true si le cue est joué (ou gardé pour la fin d'une relance en cours), false sinon :
  // son coupé, nom inconnu, aucun geste encore, Web Audio absent, contexte suspendu, ou doublon trop rapproché.
  cue(name, opts = { dir: 1 }) {
    if (!enabled) return false;
    if (!CUES[name]) return false;
    if (!gestured) { armGesture(); return false; }
    if (!audio && !Sound.init()) return false;
    if (!graph) return false;
    if (amb.filePending) playFile();                                // un cue vient toujours d'un geste
    const dir = opts && opts.dir < 0 ? -1 : 1;
    const t = now(), prev = lastAt.get(name);
    if (prev !== undefined && t - prev < DEDUPE_MS) return false;  // même cue deux fois en quelques ms : un seul
    if (audio.state === 'running') return schedule(name, dir);
    // Contexte suspendu (veille, onglet caché) : on relance et on garde ce cue, le dernier demandé l'emporte.
    resume();
    if (!resuming) return false;
    pending = { name, dir };
    lastAt.set(name, t);
    return true;
  },

  // Noms disponibles (pour les écrans qui voudraient vérifier).
  names() { return Object.keys(CUES); },

  // Musique de fond : 'auto' | 'celesta' | 'aucune', ou null pour revenir à config.music. Retourne false si le mode
  // est inconnu. Un mode explicite REMPLACE config.music jusqu'au prochain appel (il est mémorisé même sans contexte
  // et s'applique au premier geste) : pour couper temporairement sans perdre le mode, utiliser ambientHold().
  ambient(mode) {
    if (mode !== null && !AMBIENT_MODES.includes(mode)) return false;
    amb.mode = mode;
    armGesture();
    if ((mode || configuredMode()) === 'aucune') ambientStop(); else ambientApply();
    return true;
  },

  // Mise en attente sans toucher au mode : ambientHold(true, 'nox') à l'entrée en veille, ambientHold(false, 'nox') au
  // réveil ; idem 'launch' autour du lancement d'une appli. Plusieurs raisons peuvent se cumuler ; la musique reprend
  // quand la dernière est levée. Retourne le nombre de raisons encore actives.
  ambientHold(on, reason) {
    ambientHold(!!on, reason);
    return amb.holds.size;
  },

  // Pour les tests et le débogage : { mode (demandé ou config), active ('celesta' | 'fichier' | null),
  // file (true / false / null = pas encore sondé), holds (raisons de mise en attente) }.
  ambientState() {
    return { mode: amb.mode || configuredMode(), active: amb.active, file: amb.file === undefined ? null : Boolean(amb.file), holds: Array.from(amb.holds) };
  },
};
