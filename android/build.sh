#!/usr/bin/env bash
# Builds PoudlardTV.apk without Gradle or any library, in the manner of Free My TV's build.sh (MIT, see README):
#   web mock-up → assets/web/  ·  aapt2 (resources)  ·  javac (Java 8)  ·  d8 (dex)  ·  zipalign  ·  apksigner
#
# Prerequisites: JDK 17+, Android SDK command-line tools with build-tools 34+ and platforms/android-34, adb.
#   sdkmanager "build-tools;34.0.0" "platforms;android-34" "platform-tools"
# Usage: ./build.sh            → PoudlardTV.apk in this folder
#        ./build.sh --clean    → wipes out/ first
# Variables: ANDROID_HOME or ANDROID_SDK_ROOT (the SDK), JAVA_HOME (optional),
#            POUDLARD_KEYSTORE + POUDLARD_KEYSTORE_PASS (release key; otherwise a local key is created).
# Runs on Linux, macOS and Git Bash (Windows). Paths with spaces are accepted.
set -euo pipefail
cd "$(dirname "$0")"

WEB_SRC="../app"            # the mock-up (ES modules, no dependency)
OUT="out"
APK="PoudlardTV.apk"
KEYSTORE="poudlard.keystore"
MIN_SDK=26
TARGET_SDK=33

if [ "${1:-}" = "--clean" ]; then rm -rf "$OUT"; fi

# ---------------------------------------------------------------- tools
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [ -z "$SDK" ]; then
  # Usual locations. LOCALAPPDATA only exists on Windows: "${LOCALAPPDATA:-}" avoids the "unbound variable" abort
  # from `set -u` on Linux and macOS.
  for d in "$HOME/Library/Android/sdk" "$HOME/Android/Sdk" "${LOCALAPPDATA:-}/Android/Sdk" \
           /opt/homebrew/share/android-commandlinetools /usr/local/share/android-commandlinetools /usr/lib/android-sdk; do
    if [ -n "$d" ] && [ -d "$d/build-tools" ]; then SDK="$d"; break; fi
  done
fi
[ -d "${SDK:-}/build-tools" ] || { echo "Android SDK not found: set ANDROID_HOME (the folder containing build-tools/ and platforms/)." >&2; exit 1; }
BT="$SDK/build-tools/$(ls "$SDK/build-tools" | sort -V | tail -1)"
AJ="$(ls -d "$SDK"/platforms/android-*/android.jar 2>/dev/null | sort -V | tail -1 || true)"
[ -f "${AJ:-}" ] || { echo "platforms/android-34/android.jar not found: sdkmanager \"platforms;android-34\"" >&2; exit 1; }
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
KEYTOOL="${JAVA_HOME:+$JAVA_HOME/bin/}keytool"
JAR="${JAVA_HOME:+$JAVA_HOME/bin/}jar"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) WIN=1; CPSEP=';';; *) WIN=0; CPSEP=':';; esac
# Under Git Bash, the SDK's .bat wrappers do not run through bash: we call the jars directly.
d8() {
  if [ "$WIN" = 1 ] || [ ! -x "$BT/d8" ]; then "$JAVA" -Xmx1024M -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 "$@"; else "$BT/d8" "$@"; fi
}
apksigner() {
  if [ "$WIN" = 1 ] || [ ! -x "$BT/apksigner" ]; then "$JAVA" -jar "$BT/lib/apksigner.jar" "$@"; else "$BT/apksigner" "$@"; fi
}
echo "SDK        : $SDK"
echo "build-tools: $BT"
echo "android.jar: $AJ"

# ---------------------------------------------------------------- 1. assets: the web mock-up
# app/ is copied as is into assets/web/ (index.html, tv.html if present, css/, js/, assets/). Nothing is transformed:
# the WebView serves these files under https://poudlard.invalid/ (WebAssets.java). Working files are left out.
rm -rf "$OUT/assets"
mkdir -p "$OUT/assets/web" "$OUT/gen" "$OUT/classes" "$OUT/res"
[ -f "$WEB_SRC/index.html" ] || { echo "Mock-up not found: $WEB_SRC/index.html" >&2; exit 1; }
DEST="$(pwd)/$OUT/assets/web"
( cd "$WEB_SRC" && find . -type f ! -name '*.md' ! -name 'artifact.html' ! -name '.DS_Store' ! -name '.gitkeep' \
    ! -path '*/node_modules/*' -print0 \
  | while IFS= read -r -d '' f; do mkdir -p "$DEST/$(dirname "$f")"; cp "$f" "$DEST/$f"; done )
echo "web        : $(find "$OUT/assets/web" -type f | wc -l | tr -d ' ') files copied"
# Private files (outside the repo, see ../.gitignore): they go into the APK if they are there. We say so, so that an APK
# meant for other people is built from a clean clone (logos.example.js, no music).
PRIVATE=""
[ -f "$WEB_SRC/assets/logos.js" ] && ! cmp -s "$WEB_SRC/assets/logos.js" "$WEB_SRC/assets/logos.example.js" && PRIVATE="$PRIVATE logos.js"
[ -n "$(find "$WEB_SRC/assets/music" -type f ! -name '*.md' ! -name '.gitkeep' 2>/dev/null)" ] && PRIVATE="$PRIVATE music/"
if [ -n "$PRIVATE" ]; then
  echo "WARNING: private files embedded in the APK:$PRIVATE (personal use; do not distribute this APK)." >&2
fi
# Fonts: if app/assets/fonts/ exists, they are shipped too (CSS @font-face to be added in base.css). Otherwise the page
# requests fonts.googleapis.com, which the APK (no INTERNET) cleanly refuses: fallback to system fonts.
if [ ! -d "$WEB_SRC/assets/fonts" ]; then
  echo "WARNING: no embedded fonts (app/assets/fonts/); the TV will display its system fonts." >&2
fi

# ---------------------------------------------------------------- 2. resources
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$AJ" --manifest AndroidManifest.xml --java "$OUT/gen" "$OUT/res.zip" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK"
# Assets do NOT go through `aapt2 link -A`: on Windows, aapt2 stores paths with backslashes and the TV can no
# longer find the files (known bug, which Free My TV patches afterwards with a FixAssets.java). We add them
# with `jar`, which always writes "/": -0 = stored uncompressed (fonts and images are read as they are).
"$JAR" -u -M -0 -f "$OUT/base.apk" -C "$OUT" assets
if "$JAR" tf "$OUT/base.apk" | grep -q '\\'; then
  echo "Backslash paths in the APK: unexpected anomaly, the APK is unusable." >&2; exit 1
fi

# ---------------------------------------------------------------- 3. Java 8 → classes → dex
# No library: -bootclasspath = android.jar alone (+ the build-tools lambda stubs, as in Free My TV).
# File lists go through arrays: a repo cloned into a path with spaces works.
SRC=()
while IFS= read -r -d '' f; do SRC+=("$f"); done < <(find src "$OUT/gen" -name '*.java' -print0)
"$JAVAC" -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$AJ$CPSEP$BT/core-lambda-stubs.jar" -classpath "$AJ" -d "$OUT/classes" "${SRC[@]}"
CLS=()
while IFS= read -r -d '' f; do CLS+=("$f"); done < <(find "$OUT/classes" -name '*.class' -print0)
d8 --release --min-api "$MIN_SDK" --lib "$AJ" --output "$OUT" "${CLS[@]}"
"$JAR" -u -M -f "$OUT/base.apk" -C "$OUT" classes.dex

# ---------------------------------------------------------------- 4. align, sign
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
if [ -n "${POUDLARD_KEYSTORE:-}" ]; then
  apksigner sign --ks "$POUDLARD_KEYSTORE" --ks-pass env:POUDLARD_KEYSTORE_PASS --key-pass env:POUDLARD_KEYSTORE_PASS \
    --out "$APK" "$OUT/aligned.apk"
else
  # Local development key. An update must be signed with the SAME key: keep poudlard.keystore
  # (it is in .gitignore); otherwise you will have to uninstall before reinstalling.
  if [ ! -f "$KEYSTORE" ]; then
    "$KEYTOOL" -genkeypair -keystore "$KEYSTORE" -alias poudlard -keyalg RSA -keysize 2048 -validity 20000 \
      -storepass poudlard -keypass poudlard -dname "CN=Poudlard TV" >/dev/null 2>&1
  fi
  apksigner sign --ks "$KEYSTORE" --ks-pass pass:poudlard --key-pass pass:poudlard --out "$APK" "$OUT/aligned.apk"
fi

# ---------------------------------------------------------------- 5. check: zero permissions
# The README's promise is verified here, on every build: if a permission shows up, we stop.
if [ -x "$BT/aapt" ] || [ -f "$BT/aapt.exe" ]; then
  if "$BT/aapt" dump permissions "$APK" | grep -q 'uses-permission'; then
    echo "The APK declares a permission: forbidden. See AndroidManifest.xml." >&2; exit 1
  fi
else
  echo "(aapt missing: check by hand with \"aapt dump permissions $APK\" or apkanalyzer)" >&2
fi
echo "OK: $APK ($(du -h "$APK" | cut -f1)), no permissions."
echo "Install: adb connect <tv-ip>:5555 && adb install -r $APK"
