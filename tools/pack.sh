#!/bin/sh
# Packs the repository for hand-off / submission and verifies the archive exactly as the receiver sees it:
# unzip into a temp dir → node tools/check-submission.mjs --draft there (tests, versions, numbers, wording).
# Usage: sh tools/pack.sh [archive-name-without-.zip] [output-dir]
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BASE="$(basename "$ROOT")"; PARENT="$(dirname "$ROOT")"
VERSION="$(node -p "require('$ROOT/package.json').version")"
NAME="${1:-SYNERGY_v$VERSION}"; OUTDIR="${2:-$PARENT}"
[ -f "$ROOT/release/Synergy-$VERSION.apk" ] || { echo "Нет release/Synergy-$VERSION.apk — сначала sh tools/build-apk.sh"; exit 1; }
rm -f "$OUTDIR/$NAME.zip"
(cd "$PARENT" && zip -qr "$OUTDIR/$NAME.zip" "$BASE" -x "$BASE/node_modules/*" "$BASE/dist/*" "$BASE/tools/.cache/*" "$BASE/android/build/*")
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$OUTDIR/$NAME.zip" -d "$TMP"
echo "Проверка распакованного архива:"
(cd "$TMP/$BASE" && node tools/check-submission.mjs --draft)
echo "Архив: $OUTDIR/$NAME.zip ($(du -k "$OUTDIR/$NAME.zip" | cut -f1) КБ)"
