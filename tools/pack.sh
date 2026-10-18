#!/bin/sh
# Packs the repository for hand-off / submission and verifies the archive exactly as the receiver sees it:
# unzip into a temp dir → node tools/check-submission.mjs --draft there (tests, versions, numbers, wording).
# Usage: sh tools/pack.sh [archive-name-without-.zip] [output-dir]
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BASE="$(basename "$ROOT")"; PARENT="$(dirname "$ROOT")"
VERSION="$(node -p "require('$ROOT/package.json').version")"
NAME="${1:-SYNERGY_v$VERSION}"; OUTDIR="$(cd "${2:-$PARENT}" && pwd)"
[ -f "$ROOT/release/Synergy-$VERSION.apk" ] || { echo "Нет release/Synergy-$VERSION.apk — сначала sh tools/build-apk.sh"; exit 1; }
rm -f "$OUTDIR/$NAME.zip"
TMP="$(mktemp -d)"; STAGE="$(mktemp -d)"; trap 'rm -rf "$TMP" "$STAGE"' EXIT
# The archive is a fresh clone of HEAD (5.11, Red Team): the working .git carried reflogs and unreachable objects —
# a key staged and then unstaged stayed recoverable — and zipping the working tree took gitignored files (5.10).
git -C "$ROOT" diff --quiet HEAD -- || echo "⚠ есть незакоммиченные изменения — в архив попадает только HEAD"
git clone -q --no-local "$ROOT" "$STAGE/$BASE"
git -C "$STAGE/$BASE" remote remove origin
git -C "$STAGE/$BASE" reflog expire --expire=now --all
git -C "$STAGE/$BASE" gc -q --prune=now
git -C "$STAGE/$BASE" repack -a -d -f -q --window=250 --depth=250 # tighter deltas: the history is close to the 30 MB limit
(cd "$STAGE" && zip -9 -qr "$OUTDIR/$NAME.zip" "$BASE")
unzip -q "$OUTDIR/$NAME.zip" -d "$TMP"
KEYS="$(find "$TMP" \( -name '*.keystore' -o -name '*.jks' -o -name '*.p12' -o -name '*.pem' -o -name '*.key' \) | head -5)"
[ -z "$(git -C "$TMP/$BASE" fsck --unreachable --no-reflogs 2>/dev/null | head -1)" ] || { echo "✗ в архиве недостижимые объекты git"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
[ -z "$KEYS" ] || { echo "✗ в архиве ключи: $KEYS"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
# node_modules is not in the archive (the receiver runs npm ci): link ours so the bundle test can run.
[ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" "$TMP/$BASE/node_modules"
echo "Проверка распакованного архива:"
(cd "$TMP/$BASE" && node tools/check-submission.mjs --draft)
KB=$(du -k "$OUTDIR/$NAME.zip" | cut -f1)
echo "Архив: $OUTDIR/$NAME.zip ($KB КБ)"
# Upload limit of the hand-off (30 MB): git history carries every screenshot ever committed — keep new ones light (JPEG, CSS px).
[ "$KB" -le 29296 ] || echo "⚠ архив больше 30 МБ ($KB КБ): git gc, лёгкие скриншоты (tests/e2e/*.mjs пишут JPEG)"
