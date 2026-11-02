#!/usr/bin/env bash
# Construit PoudlardTV.apk sans Gradle ni bibliothèque, à la manière de build.sh de Free My TV (MIT, voir README) :
#   maquette web → assets/web/  ·  aapt2 (ressources)  ·  javac (Java 8)  ·  d8 (dex)  ·  zipalign  ·  apksigner
#
# Prérequis : JDK 17+, Android SDK command-line tools avec build-tools 34+ et platforms/android-34, adb.
#   sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"
# Usage : ./build.sh            → PoudlardTV.apk dans ce dossier
#         ./build.sh --clean    → efface out/ d'abord
# Variables : ANDROID_HOME ou ANDROID_SDK_ROOT (le SDK), JAVA_HOME (facultatif),
#             POUDLARD_KEYSTORE + POUDLARD_KEYSTORE_PASS (clé de publication ; sinon une clé locale est créée).
# Tourne sous Linux, macOS et Git Bash (Windows). Les chemins avec espaces sont acceptés.
set -euo pipefail
cd "$(dirname "$0")"

WEB_SRC="../app"            # la maquette (modules ES, aucune dépendance)
OUT="out"
APK="PoudlardTV.apk"
KEYSTORE="poudlard.keystore"
MIN_SDK=26
TARGET_SDK=33

if [ "${1:-}" = "--clean" ]; then rm -rf "$OUT"; fi

# ---------------------------------------------------------------- outils
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
  # Chemins usuels. LOCALAPPDATA n'existe que sous Windows : "${LOCALAPPDATA:-}" évite l'arrêt « unbound variable »
  # de `set -u` sous Linux et macOS.
  for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "${LOCALAPPDATA:-}/Android/Sdk" \
           /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools /usr/lib/android-sdk; do
    if [ -n "$d" ] && [ -d "$d/build-tools" ]; then SDK="$d"; break; fi
  done
fi
[ -d "${SDK:-}/build-tools" ] || { echo "SDK Android introuvable : définir ANDROID_HOME (dossier contenant build-tools/ et platforms/)." >&2; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
AJ="$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
[ -f "${AJ:-}" ] || { echo "platforms/android-34/android.jar introuvable : sdkmanager \"platforms;android-34\"" >&2; exit 1; }
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
KEYTOOL="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
JAR="${JAVA_HOME:+$JAVA_HOME/bin/}jar"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WIN=1; CPSEP=';';; *) WIN=0; CPSEP=':';; esac
# Sous Git Bash, les .bat du SDK ne passent pas par bash : on appelle les jars directement.
d8() {
  if [ "$WIN" = 1 ] || [ ! -x "$BT/d8" ]; then "$JAVA" -Xmx1024M -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 "$@"; else "$BT/d8" "$@"; fi
}
apksigner() {
  if [ "$WIN" = 1 ] || [ ! -x "$BT/apksigner" ]; then "$JAVA" -jar "$BT/lib/apksigner.jar" "$@"; else "$BT/apksigner" "$@"; fi
}
echo "SDK        : $SDK"
echo "build-tools: $BT"
echo "android.jar: $AJ"

# ---------------------------------------------------------------- 1. assets : la maquette web
# On copie app/ tel quel dans assets/web/ (index.html, tv.html si présent, css/, js/, assets/). Rien n'est transformé :
# la WebView sert ces fichiers sous https://poudlard.invalid/ (WebAssets.java). Les fichiers de travail sont écartés.
rm -rf "$OUT/assets"
mkdir -p "$OUT/assets/web" "$OUT/gen" "$OUT/classes" "$OUT/res"
[ -f "$WEB_SRC/index.html" ] || { echo "Maquette introuvable : $WEB_SRC/index.html" >&2; exit 1; }
DEST="$(pwd)/$OUT/assets/web"
( cd "$WEB_SRC" && find . -type f ! -name '*.md' ! -name 'artifact.html' ! -name '.DS_Store' ! -name '.gitkeep' \
    ! -path '*/node_modules/*' -print0 \
  | while IFS= read -r -d '' f; do mkdir -p "$DEST/$(dirname "$f")"; cp "$f" "$DEST/$f"; done )
echo "web        : $(find "$OUT/assets/web" -type f | wc -l | tr -d ' ') fichiers copiés"
# Fichiers privés (hors dépôt, voir ../.gitignore) : ils partent dans l'APK s'ils sont là. On le dit, pour qu'un APK
# destiné à d'autres soit construit depuis un clone propre (logos.example.js, pas de musique).
PRIVATE=""
[ -f "$WEB_SRC/assets/logos.js" ] && ! cmp -s "$WEB_SRC/assets/logos.js" "$WEB_SRC/assets/logos.example.js" && PRIVATE="$PRIVATE logos.js"
[ -n "$(find "$WEB_SRC/assets/music" -type f ! -name '*.md' ! -name '.gitkeep' 2>/dev/null)" ] && PRIVATE="$PRIVATE music/"
if [ -n "$PRIVATE" ]; then
  echo "AVERTISSEMENT : fichiers privés embarqués dans l'APK :$PRIVATE (usage personnel ; ne pas distribuer cet APK)." >&2
fi
# Polices : si app/assets/fonts/ existe, elles partent avec (CSS @font-face à prévoir dans base.css). Sinon, la page
# demande fonts.googleapis.com, ce que l'APK (sans INTERNET) refuse proprement : repli sur les polices système.
if [ ! -d "$WEB_SRC/assets/fonts" ]; then
  echo "AVERTISSEMENT : pas de polices embarquées (app/assets/fonts/) ; la télé affichera les polices système." >&2
fi

# ---------------------------------------------------------------- 2. ressources
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJ" --manifest AndroidManifest.xml --java "$OUT/gen" "$OUT/res.zip" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK"
# Les assets ne passent PAS par `aapt2 link -A` : sous Windows, aapt2 range les chemins avec des antislashs et la télé
# ne retrouve plus les fichiers (bug connu, que Free My TV corrige après coup avec un FixAssets.java). On les ajoute
# avec `jar`, qui écrit toujours des « / » : -0 = stockés sans compression (polices et images lues telles quelles).
"$JAR" -u -M -0 -f "$OUT/base.apk" -C "$OUT" assets
if "$JAR" tf "$OUT/base.apk" | grep -q '\\'; then
  echo "Chemins avec antislash dans l'APK : anomalie inattendue, l'APK n'est pas utilisable." >&2; exit 1
fi

# ---------------------------------------------------------------- 3. Java 8 → classes → dex
# Pas de bibliothèque : -bootclasspath = android.jar seul (+ les stubs lambda des build-tools, comme Free My TV).
# Les listes de fichiers passent par des tableaux : un dépôt cloné dans un chemin avec espace fonctionne.
SRC=()
while IFS= read -r -d '' f; do SRC+=("$f"); done < <(find src "$OUT/gen" -name '*.java' -print0)
"$JAVAC" -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$AJ$CPSEP$BT/core-lambda-stubs.jar" -classpath "$AJ" -d "$OUT/classes" "${SRC[@]}"
CLS=()
while IFS= read -r -d '' f; do CLS+=("$f"); done < <(find "$OUT/classes" -name '*.class' -print0)
d8 --release --min-api "$MIN_SDK" --lib "$AJ" --output "$OUT" "${CLS[@]}"
"$JAR" -u -M -f "$OUT/base.apk" -C "$OUT" classes.dex

# ---------------------------------------------------------------- 4. aligner, signer
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
if [ -n "${POUDLARD_KEYSTORE:-}" ]; then
  apksigner sign --ks "$POUDLARD_KEYSTORE" --ks-pass env:POUDLARD_KEYSTORE_PASS --key-pass env:POUDLARD_KEYSTORE_PASS \
    --out "$APK" "$OUT/aligned.apk"
else
  # Clé locale de développement. Une mise à jour doit être signée avec la MÊME clé : conserver poudlard.keystore
  # (il est dans .gitignore) ; sinon il faudra désinstaller avant de réinstaller.
  if [ ! -f "$KEYSTORE" ]; then
    "$KEYTOOL" -genkeypair -keystore "$KEYSTORE" -alias poudlard -keyalg RSA -keysize 2048 -validity 20000 \
      -storepass poudlard -keypass poudlard -dname "CN=Poudlard TV" >/dev/null 2>&1
  fi
  apksigner sign --ks "$KEYSTORE" --ks-pass pass:poudlard --key-pass pass:poudlard --out "$APK" "$OUT/aligned.apk"
fi

# ---------------------------------------------------------------- 5. contrôle : zéro permission
# La promesse du README se vérifie ici, à chaque build : si une permission apparaît, on s'arrête.
if [ -x "$BT/aapt" ] || [ -f "$BT/aapt.exe" ]; then
  if "$BT/aapt" dump permissions "$APK" | grep -q 'uses-permission'; then
    echo "L'APK déclare une permission : interdit. Voir AndroidManifest.xml." >&2; exit 1
  fi
else
  echo "(aapt absent : vérifier à la main avec « aapt dump permissions $APK » ou apkanalyzer)" >&2
fi
echo "OK : $APK ($(du -h "$APK" | cut -f1)), aucune permission."
echo "Installer : adb connect <ip-de-la-tv>:5555 && adb install -r $APK"
