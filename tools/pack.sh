#!/bin/sh
# Packs the repository for hand-off / submission and verifies the archive exactly as the receiver sees it:
# unzip into a temp dir → node tools/check-submission.mjs --draft there (tests, versions, numbers, wording).
# Usage: sh tools/pack.sh [archive-name-without-.zip] [output-dir]
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; BASE="$(basename "$ROOT")"; PARENT="$(dirname "$ROOT")"
VERSION="$(cd "$ROOT" && node -p "require('./package.json').version")" # a relative path: Node on Windows does not read /c/… of Git Bash
NAME="${1:-SYNERGY_v$VERSION}"; OUTDIR="$(cd "${2:-$PARENT}" && pwd)"
[ -f "$ROOT/release/Synergy-$VERSION.apk" ] || { echo "Нет release/Synergy-$VERSION.apk — сначала sh tools/build-apk.sh"; exit 1; }
rm -f "$OUTDIR/$NAME.zip"
TMP="$(mktemp -d)"; STAGE="$(mktemp -d)"; trap 'rm -rf "$TMP" "$STAGE"' EXIT
# The archive is a fresh clone of HEAD (5.11, Red Team): the working .git carried reflogs and unreachable objects —
# a key staged and then unstaged stayed recoverable — and zipping the working tree took gitignored files (5.10).
git -C "$ROOT" diff --quiet HEAD -- || echo "⚠ есть незакоммиченные изменения — в архив попадает только HEAD"
# 5.31: blobs over 10 MB stay out — the organizer's meetup deck (85 MB, logos and people, п. 5.5) is in the history.
# A partial clone keeps every commit with its hash and date; the working tree leaves out the deck and videos.
git clone -q --no-local --no-checkout --filter=blob:limit=10m --upload-pack="git -c uploadpack.allowFilter=true upload-pack" "$ROOT" "$STAGE/$BASE"
# 6.3.4: the screencast of the build is the product's own file (submission/), the last pattern brings it back.
git -C "$STAGE/$BASE" sparse-checkout set --no-cone '/*' '!*.pptx' '!*.mp4' '!*.mov' '/submission/Synergy-*-screencast.mp4'
git -C "$STAGE/$BASE" checkout -q "$(git -C "$STAGE/$BASE" symbolic-ref --short HEAD)"
git -C "$STAGE/$BASE" remote remove origin
git -C "$STAGE/$BASE" reflog expire --expire=now --all
git -C "$STAGE/$BASE" gc -q --prune=now
git -C "$STAGE/$BASE" repack -a -d -f -q --window=250 --depth=250 # tighter deltas
# The release files of this version: tracked since 6.3.3 (the organizers ask for the APK in release/ of the repository);
# the copy makes sure the archive carries the files of this very build.
mkdir -p "$STAGE/$BASE/release" && cp "$ROOT/release/Synergy-$VERSION.apk" "$ROOT/release/synergy-standalone.html" "$STAGE/$BASE/release/"
if command -v zip >/dev/null; then (cd "$STAGE" && zip -9 -qr "$OUTDIR/$NAME.zip" "$BASE")
else "$(command -v python || command -v python3)" "$ROOT/tools/zipdir.py" "$OUTDIR/$NAME.zip" "$STAGE" "$BASE"; fi # Git Bash on Windows (5.16)
unzip -q "$OUTDIR/$NAME.zip" -d "$TMP"
KEYS="$(find "$TMP" \( -name '*.keystore' -o -name '*.jks' -o -name '*.p12' -o -name '*.pem' -o -name '*.key' \) | head -5)"
# «missing blob» lines are the blobs the partial clone left out on purpose; unreachable objects are what we look for.
[ -z "$(git -C "$TMP/$BASE" fsck --unreachable --no-reflogs 2>/dev/null | grep '^unreachable' | head -1)" ] || { echo "✗ в архиве недостижимые объекты git"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
BIG="$(find "$TMP/$BASE" -path "$TMP/$BASE/.git" -prune -o -type f \( -name '*.pptx' -o -name '*.mp4' -o -name '*.mov' -o -size +10M \) -print | grep -v '/submission/Synergy-[0-9.]*-screencast\.mp4$' | head -5)"
[ -z "$BIG" ] || { echo "✗ в архиве материалы организатора или файлы больше 10 МБ: $BIG"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
[ -z "$KEYS" ] || { echo "✗ в архиве ключи: $KEYS"; rm -f "$OUTDIR/$NAME.zip"; exit 1; }
# node_modules is not in the archive (the receiver runs npm ci): link ours so the bundle test can run.
[ -d "$ROOT/node_modules" ] && ln -s "$ROOT/node_modules" "$TMP/$BASE/node_modules"
echo "Проверка распакованного архива:"
(cd "$TMP/$BASE" && node tools/check-submission.mjs --draft)
KB=$(du -k "$OUTDIR/$NAME.zip" | cut -f1)
echo "Архив: $OUTDIR/$NAME.zip ($KB КБ)"
# Target of the hand-off (5.12: ≈ 20 MB, the upload limit is 30 MB): git history carries every file ever committed —
# screenshots only as light JPEG (CSS px) and only those the README and the pitch show.
[ "$KB" -le 20480 ] || echo "⚠ архив больше 20 МБ ($KB КБ): лёгкие скриншоты (tests/e2e/*.mjs пишут JPEG), без лишних бинарных файлов в истории"
