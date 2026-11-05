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
# Left out: documentation (*.md), the claude.ai artifact page (artifact.html), the example logos (logos.example.js,
# never loaded by the page), the scene's reference notes (scene.json, windows.json: no page fetches them, home.js holds hand
# copies of the numbers it needs), tools and scripts (tools/, *.py, *.ps1, *.sh, __pycache__), editor and OS litter.
( cd "$WEB_SRC" && find . -type f ! -name '*.md' ! -name 'artifact.html' ! -name 'logos.example.js' ! -path './assets/scene/*.json' \
    ! -name '.DS_Store' ! -name 'Thumbs.db' ! -name '.gitkeep' ! -name '*.py' ! -name '*.pyc' ! -name '*.ps1' ! -name '*.sh' \
    ! -path './tools/*' ! -path '*/__pycache__/*' ! -path '*/node_modules/*' ! -path '*/.git/*' -print0 \
  | while IFS= read -r -d '' f; do mkdir -p "$DEST/$(dirname "$f")"; cp "$f" "$DEST/$f"; done )
echo "web        : $(find "$OUT/assets/web" -type f | wc -l | tr -d ' ') files copied ($(du -sh "$OUT/assets/web" | cut -f1))"
LEAK="$(cd "$OUT/assets/web" && find . -type f \( -name '*.md' -o -name 'artifact.html' -o -path './tools/*' -o -name '*.py' -o -name '*.ps1' \) | head -5)"
[ -z "$LEAK" ] || { echo "Working files in assets/web, the copy filter is broken: $LEAK" >&2; exit 1; }
# The tracked logos, house crests and background music go into the APK on purpose (maintainer's decision, see
# DISCLAIMER): we just list them, so the size of the APK is never a surprise.
NOTE=""
[ -f "$OUT/assets/web/assets/logos.js" ] && NOTE="$NOTE logos.js"
ls "$OUT"/assets/web/assets/crest-*.webp >/dev/null 2>&1 && NOTE="$NOTE crest-*.webp"
MUSIC="$(find "$OUT/assets/web/assets/music" -type f 2>/dev/null | head -1)"
[ -n "$MUSIC" ] && NOTE="$NOTE music/ ($(du -sh "$OUT/assets/web/assets/music" | cut -f1))"
[ -n "$NOTE" ] && echo "embedded   :$NOTE"
# Fonts: app/assets/fonts/ is shipped with the rest. Without it the page asks fonts.googleapis.com, which the WebView
# refuses (no INTERNET, setBlockNetworkLoads): the TV then shows its system fonts.
if [ ! -d "$WEB_SRC/assets/fonts" ]; then
  echo "WARNING: no embedded fonts (app/assets/fonts/); the TV will display its system fonts." >&2
fi

# ---------------------------------------------------------------- 1b. check: installing never takes the Home key
# Exactly one HOME component, the .Home activity-alias, and it is android:enabled="false" (HomeMode enables it at
# runtime when the person asks). HomeActivity itself must have no intent filter.
HOME_COUNT="$(grep -c 'android.intent.category.HOME"' AndroidManifest.xml || true)"
# The <queries> block also names HOME (to see the other homes): it does not declare a component.
HOME_ALIAS="$(awk '/<activity-alias/{blk=""; inb=1} inb{blk=blk $0 "\n"} /<\/activity-alias>/{if (blk ~ /category.HOME"/) print blk; inb=0}' AndroidManifest.xml)"
if [ "$HOME_COUNT" != 2 ] || ! printf '%s' "$HOME_ALIAS" | grep -q 'android:name=".Home"' \
   || ! printf '%s' "$HOME_ALIAS" | grep -q 'android:enabled="false"'; then
  echo "AndroidManifest.xml: the HOME category must appear only in <queries> and in the .Home alias, with android:enabled=\"false\"." >&2
  exit 1
fi

# ---------------------------------------------------------------- 2. resources
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link ${POUDLARD_DEBUG:+--debug-mode} -o "$OUT/base.apk" -I "$AJ" --manifest AndroidManifest.xml --java "$OUT/gen" "$OUT/res.zip" \
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
# POUDLARD_DEBUG=1 is for measuring on a TV (README, Debugging): run-as, the configuration and the page's DevTools open. Never published.
[ -z "${POUDLARD_DEBUG:-}" ] || echo "WARNING: POUDLARD_DEBUG is set, this APK is DEBUGGABLE. Rebuild without it before any release." >&2
echo "Install: adb connect <tv-ip>:5555 && adb install -r $APK"
