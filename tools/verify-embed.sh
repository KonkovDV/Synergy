#!/bin/sh
# Re-runs the «Как проверено» checks of docs/embed/README.md that need a toolchain (5.15):
#   Android — the Kotlin host compiled by kotlinc against Android API 29 (the android-all jar VERIFY_API=1 uses);
#   React Native — the host type-checked by tsc --strict against react-native-webview and react-native.
# The web host is checked by node tests/e2e/embed.mjs. Downloads are pinned by SHA-256 / exact versions, cached in
# tools/.cache (never committed). Requires: JDK 11+, Node 18+, curl, unzip.
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; CACHE="$ROOT/tools/.cache"; mkdir -p "$CACHE"
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -c1-64; }
fetch() { # fetch <file> <url> <sha256>
  [ -f "$CACHE/$1" ] || { curl -sSfL --retry 4 --retry-delay 5 -o "$CACHE/$1.part" "$2" && mv "$CACHE/$1.part" "$CACHE/$1"; }
  [ "$(sha256 "$CACHE/$1")" = "$3" ] || { echo "SHA-256 mismatch: $1 — удалите tools/.cache/$1 и повторите"; exit 1; }
}
fetch android-all-29.jar https://repo.maven.apache.org/maven2/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar a0ad701eedd47bdaefbac1c2cc80dd400c0adea3cccd8a3ad286f79da1ca294c
fetch kotlin-compiler-2.1.21.zip https://github.com/JetBrains/kotlin/releases/download/v2.1.21/kotlin-compiler-2.1.21.zip 1ba08a8b45da99339a0601134cc037b54cf85e9bc0edbe76dcbd27c2d684a977
[ -x "$CACHE/kotlinc/bin/kotlinc" ] || (cd "$CACHE" && unzip -q -o kotlin-compiler-2.1.21.zip)
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
"$CACHE/kotlinc/bin/kotlinc" "$ROOT/docs/embed/android/SynergyHostActivity.kt" "$ROOT/docs/embed/android/MotoricaStartLink.kt" -cp "$CACHE/android-all-29.jar" -jvm-target 1.8 -Werror -d "$TMP/kt" 2>/dev/null
echo "Android: SynergyHostActivity.kt и MotoricaStartLink.kt скомпилированы (Kotlin 2.1.21, API 29, без предупреждений)"

mkdir -p "$TMP/rn" && cp "$ROOT/docs/embed/react-native/SynergyHost.tsx" "$TMP/rn/"
(cd "$TMP/rn" && echo '{"name":"rn-check","private":true}' > package.json \
  && npm install -s --no-audit --no-fund --ignore-scripts react@19.2.3 react-native@0.87.1 react-native-webview@14.0.1 @types/react@19.1.1 typescript@5.9.3 \
  && printf '%s' '{"compilerOptions":{"strict":true,"noEmit":true,"jsx":"react-jsx","module":"esnext","moduleResolution":"bundler","target":"es2022","skipLibCheck":true,"types":[],"lib":["es2022"]},"files":["SynergyHost.tsx"]}' > tsconfig.json \
  && npx tsc -p tsconfig.json)
echo "React Native: SynergyHost.tsx — типы верны (tsc 5.9.3 --strict, react-native-webview 14.0.1, react-native 0.87.1)"
