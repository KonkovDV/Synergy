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
# Downloads are retried (Maven Central answers 429 under load) and pinned by SHA-256 (supply chain).
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64; }
fetch() { # fetch <file> <maven path> <sha256>
  # 5.27: a failed download is said as such — before, it ended in «SHA-256 mismatch» for a file that was never there.
  [ -f "$CACHE/$1" ] || { curl -sSfL --retry 4 --retry-delay 5 -o "$CACHE/$1.part" "$MAVEN/$2" && mv "$CACHE/$1.part" "$CACHE/$1"; } \
    || { rm -f "$CACHE/$1.part"; echo "Не удалось скачать $MAVEN/$2 — проверьте сеть или прокси (нужен доступ к Maven Central)"; exit 1; }
  [ "$(sha256 "$CACHE/$1")" = "$3" ] || { echo "SHA-256 mismatch: $1 — удалите tools/.cache/$1 и повторите"; exit 1; }
}
fetch apktool-lib.jar org/apktool/apktool-lib/3.0.3/apktool-lib-3.0.3.jar 983773879fd89ede2cd938858e3efce2a90ac1123f6a5140e9d949dcf4464e3e
fetch dalvik-dx.jar com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar 1e4b645628e3bdb097b5331d669e177ef235a551582a8c646dbe36865e541907
# Windows (5.16): Git Bash — the same apktool-lib carries aapt2.exe; MSYS converts the paths for native programs.
case "$(uname -s)" in Darwin) PLAT=macosx; EXE=;; MINGW*|MSYS*|CYGWIN*) PLAT=windows; EXE=.exe;; *) PLAT=linux; EXE=;; esac
(cd "$CACHE" && unzip -o -q apktool-lib.jar "prebuilt/$PLAT/aapt2$EXE" prebuilt/android-framework.jar && chmod +x "prebuilt/$PLAT/aapt2$EXE")
AAPT2="$CACHE/prebuilt/$PLAT/aapt2$EXE"; FRAMEWORK="$CACHE/prebuilt/android-framework.jar"
# Adds one file to a zip: `zip` where there is one, else Python's zipfile (Git Bash has no zip).
add_to_zip() { # add_to_zip <archive> <file>
  if command -v zip >/dev/null; then zip -q -j "$1" "$2"; return; fi
  PY=$(command -v python || command -v python3) || { echo "Нужен zip или Python"; exit 1; }
  "$PY" -c 'import sys, zipfile, os; z = zipfile.ZipFile(sys.argv[1], "a", zipfile.ZIP_DEFLATED); z.write(sys.argv[2], os.path.basename(sys.argv[2])); z.close()' "$1" "$2"
}

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/res" "$OUT/assets/www"
(cd "$ROOT" && node tools/build.mjs)
mkdir -p "$OUT/assets/www/icons" # the APK has launcher mipmaps: of the PWA icons only the favicon is needed
cp "$ROOT/dist/index.html" "$ROOT/dist/app.js" "$ROOT/dist/app.css" "$ROOT/dist/manifest.webmanifest" "$OUT/assets/www/" && cp "$ROOT/dist/icons/icon-48.png" "$OUT/assets/www/icons/" && cp -r "$ROOT/dist/fonts" "$OUT/assets/www/" # brand fonts (5.12) and their OFL licence
cp -r "$ROOT/dist/art" "$OUT/assets/www/" # the team's illustrations (5.16, WebP — aapt2 keeps them as they are)

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
  fetch android-all-29.jar org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar a0ad701eedd47bdaefbac1c2cc80dd400c0adea3cccd8a3ad286f79da1ca294c
  mkdir -p "$OUT/verify"
  javac -encoding UTF-8 --release 8 -nowarn -cp "$API_JAR" -d "$OUT/verify" $SRC 2>/dev/null
  for f in $(cd "$OUT/classes" && find . -name '*.class'); do
    javap -c -p "$OUT/classes/$f" | grep -v 'Compiled from' > "$OUT/a.txt"; javap -c -p "$OUT/verify/$f" | grep -v 'Compiled from' > "$OUT/b.txt"
    cmp -s "$OUT/a.txt" "$OUT/b.txt" || { echo "API mismatch in $f"; exit 1; }
  done
  echo "API check: stubs match android-29"
fi
java -cp "$CACHE/dalvik-dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
(cd "$OUT" && add_to_zip unsigned.apk classes.dex)

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

# Release files (5.17): built here and carried by the archive (tools/pack.sh), not by git history — two binaries
# a release grew the archive by ≈ 4 MB, 5.16.0 reached 25 of the 30 MB the platform accepts.
VERSION="$(cd "$ROOT" && node -p "require('./package.json').version")"
mkdir -p "$ROOT/release" && rm -f "$ROOT"/release/Synergy-*.apk
cp "$OUT/synergy.apk" "$ROOT/release/Synergy-$VERSION.apk" && cp "$ROOT/dist/synergy-standalone.html" "$ROOT/release/"
echo "release/: Synergy-$VERSION.apk, synergy-standalone.html"
