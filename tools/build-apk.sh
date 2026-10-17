#!/bin/sh
# Builds android/build/synergy.apk without Android Studio or the Android SDK:
#   aapt2 + framework resources (from apktool-lib, Maven Central), dx (dalvik-dx, Maven Central),
#   javac/keytool/jarsigner from the JDK. Requires: JDK 11+, Node 18+, curl, zip.
# The APK is a WebView shell around the offline web build (dist/). Signed with a debug key (v1),
# VERIFY_API=1 additionally checks the API stubs against the real framework (see below).
# targetSdk 29 — fine for sideloading on Android 5–16. Release key: see «Signing» below.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/tools/.cache"; OUT="$ROOT/android/build"
MAVEN=https://repo.maven.apache.org/maven2
mkdir -p "$CACHE"
[ -f "$CACHE/apktool-lib.jar" ] || curl -sSfL -o "$CACHE/apktool-lib.jar" "$MAVEN/org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar"
[ -f "$CACHE/dalvik-dx.jar" ] || curl -sSfL -o "$CACHE/dalvik-dx.jar" "$MAVEN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar"
case "$(uname -s)" in Darwin) PLAT=macosx;; *) PLAT=linux;; esac
(cd "$CACHE" && unzip -o -q apktool-lib.jar "prebuilt/$PLAT/aapt2" prebuilt/android-framework.jar && chmod +x "prebuilt/$PLAT/aapt2")
AAPT2="$CACHE/prebuilt/$PLAT/aapt2"; FRAMEWORK="$CACHE/prebuilt/android-framework.jar"

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/res" "$OUT/assets/www"
(cd "$ROOT" && node tools/build.mjs)
cp -r "$ROOT/dist/index.html" "$ROOT/dist/app.js" "$ROOT/dist/app.css" "$ROOT/dist/manifest.webmanifest" "$ROOT/dist/icons" "$OUT/assets/www/"

"$AAPT2" compile --dir "$ROOT/android/res" -o "$OUT/res/compiled.zip"
"$AAPT2" link -I "$FRAMEWORK" --manifest "$ROOT/android/AndroidManifest.xml" --min-sdk-version 21 --target-sdk-version 29 \
  -A "$OUT/assets" -o "$OUT/unsigned.apk" "$OUT/res/compiled.zip"

STUBS=$(find "$ROOT/android/stubs" -name '*.java'); SRC=$(find "$ROOT/android/src" -name '*.java')
javac -encoding UTF-8 --release 8 -nowarn -d "$OUT/stubs" $STUBS 2>/dev/null
javac -encoding UTF-8 --release 8 -nowarn -cp "$OUT/stubs" -d "$OUT/classes" $SRC 2>/dev/null

# VERIFY_API=1: compile against the real Android 10 (API 29) framework (Robolectric android-all, 131 MB,
# cached) and require identical bytecode — proves every stub signature matches the platform.
if [ "${VERIFY_API:-0}" = "1" ]; then
  API_JAR="$CACHE/android-all-29.jar"
  [ -f "$API_JAR" ] || curl -sSfL -o "$API_JAR" "$MAVEN/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar"
  mkdir -p "$OUT/verify"
  javac -encoding UTF-8 --release 8 -nowarn -cp "$API_JAR" -d "$OUT/verify" $SRC 2>/dev/null
  for f in $(cd "$OUT/classes" && find . -name '*.class'); do
    javap -c -p "$OUT/classes/$f" | grep -v 'Compiled from' > "$OUT/a.txt"; javap -c -p "$OUT/verify/$f" | grep -v 'Compiled from' > "$OUT/b.txt"
    cmp -s "$OUT/a.txt" "$OUT/b.txt" || { echo "API mismatch in $f"; exit 1; }
  done
  echo "API check: stubs match android-29"
fi
java -cp "$CACHE/dalvik-dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

# Signing: SYNERGY_KEYSTORE / SYNERGY_KEYSTORE_PASS / SYNERGY_KEY_ALIAS = your release key (CI secrets).
# Without them a throwaway debug key is generated in tools/.cache (never committed) — NOT for submission.
if [ -n "${SYNERGY_KEYSTORE:-}" ]; then
  KEY="$SYNERGY_KEYSTORE"; PASS="${SYNERGY_KEYSTORE_PASS:?set SYNERGY_KEYSTORE_PASS}"; ALIAS="${SYNERGY_KEY_ALIAS:?set SYNERGY_KEY_ALIAS}"
else
  KEY="$CACHE/debug.keystore"; PASS=synergy-debug; ALIAS=debug
  [ -f "$KEY" ] || keytool -genkeypair -keystore "$KEY" -storepass "$PASS" -keypass "$PASS" -alias "$ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Synergy Debug (local), O=Synergy, C=RU" >/dev/null 2>&1
  echo "ВНИМАНИЕ: отладочная подпись (локальный ключ). Для сдачи задайте SYNERGY_KEYSTORE*."
fi
cp "$OUT/unsigned.apk" "$OUT/synergy.apk"
jarsigner -keystore "$KEY" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/synergy.apk" "$ALIAS" >/dev/null
jarsigner -verify "$OUT/synergy.apk" >/dev/null && echo "APK: $OUT/synergy.apk ($(du -k "$OUT/synergy.apk" | cut -f1) KB)"
"$AAPT2" dump badging "$OUT/synergy.apk" 2>/dev/null | head -3 || true
