#!/bin/sh
# Builds android/build/synergy.apk without Android Studio or the Android SDK:
#   aapt2 + framework resources (from apktool-lib, Maven Central), dx (dalvik-dx, Maven Central),
#   javac/keytool/jarsigner from the JDK. Requires: JDK 11+, Node 18+, curl, zip.
# The APK is a WebView shell around the offline web build (dist/). Signed with a debug key (v1),
# targetSdk 29 — fine for sideloading on Android 5–16; for Google Play/RuStore re-sign with your key.
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
java -cp "$CACHE/dalvik-dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)

KEY="$ROOT/android/debug.keystore"
[ -f "$KEY" ] || keytool -genkeypair -keystore "$KEY" -storepass synergy -keypass synergy -alias synergy \
  -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Synergy Debug, O=Synergy, C=RU" >/dev/null 2>&1
cp "$OUT/unsigned.apk" "$OUT/synergy.apk"
jarsigner -keystore "$KEY" -storepass synergy -sigalg SHA256withRSA -digestalg SHA-256 "$OUT/synergy.apk" synergy >/dev/null
jarsigner -verify "$OUT/synergy.apk" >/dev/null && echo "APK: $OUT/synergy.apk ($(du -k "$OUT/synergy.apk" | cut -f1) KB)"
"$AAPT2" dump badging "$OUT/synergy.apk" 2>/dev/null | head -3 || true
