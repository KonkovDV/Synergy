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
# Tracked files and the git history only (5.10): zipping the working tree also took gitignored files —
# a release keystore, tools/.cache — and the gate, which looks at tracked files, did not notice.
(cd "$ROOT" && { git ls-files --cached | while IFS= read -r f; do [ -e "$f" ] && printf '%s\n' "$f"; done; find .git -type f; }) \
  | sed "s|^|$BASE/|" | (cd "$PARENT" && zip -q "$OUTDIR/$NAME.zip" -@)
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
unzip -q "$OUTDIR/$NAME.zip" -d "$TMP"
KEYS="$(find "$TMP" \( -name '*.keystore' -o -name '*.jks' -o -name '*.p12' -o -name '*.pem' -o -name '*.key' \) -not -path '*/.git/*' | head -5)"
[ -z "$KEYS" ] || { echo "✗ в архиве ключи: $KEYS"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
# node_modules is not in the archive (the receiver runs npm ci): link ours so the bundle test can run.
[ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" "$TMP/$BASE/node_modules"
echo "Проверка распакованного архива:"
(cd "$TMP/$BASE" && node tools/check-submission.mjs --draft)
KB=$(du -k "$OUTDIR/$NAME.zip" | cut -f1)
echo "Архив: $OUTDIR/$NAME.zip ($KB КБ)"
# Upload limit of the hand-off (30 MB): git history carries every screenshot ever committed — keep new ones light (JPEG, CSS px).
[ "$KB" -le 29296 ] || echo "⚠ архив больше 30 МБ ($KB КБ): git gc, лёгкие скриншоты (tests/e2e/*.mjs пишут JPEG)"
