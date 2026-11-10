#!/bin/sh
# Type-checks the iPhone app without a Mac (6.3.2): ios/Synergy/*.swift against stubs of the SDK (ios/stubs), with the
# Swift toolchain for Linux or macOS (https://www.swift.org/install). The stubs follow Apple's signatures, and the
# delegate methods the app implements are required in them, so a misspelt method fails here instead of being silently
# never called. It is not the SDK: the real build is Xcode (.github/workflows/ios.yml, ios/README.md).
#   sh tools/check-ios.sh            # SWIFTC=/path/to/swiftc to use another compiler
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWIFTC="${SWIFTC:-swiftc}"
command -v "$SWIFTC" >/dev/null 2>&1 || [ -x "$SWIFTC" ] || { echo "Нет swiftc: установите Swift (swift.org/install) или задайте SWIFTC"; exit 2; }
OUT="$(mktemp -d)"; trap 'rm -rf "$OUT"' EXIT
# the modules in the order they import each other; libraries too, for the unit tests below
LIBS=""
for module in UIKit AVFoundation WebKit SwiftUI; do
  "$SWIFTC" -parse-as-library -swift-version 5 -module-name "$module" -emit-module -emit-module-path "$OUT/$module.swiftmodule" \
    -emit-library -o "$OUT/lib$module$(uname -s | grep -q Darwin && echo .dylib || echo .so)" -I "$OUT" -L "$OUT" $LIBS "$ROOT/ios/stubs/$module.swift"
  LIBS="$LIBS -l$module"
done
# Debug and Release: the DEBUG branch (the Web Inspector) is checked too
"$SWIFTC" -typecheck -swift-version 5 -D DEBUG -I "$OUT" "$ROOT"/ios/Synergy/*.swift
"$SWIFTC" -typecheck -swift-version 5 -I "$OUT" "$ROOT"/ios/Synergy/*.swift
"$SWIFTC" -typecheck -swift-version 5 -I "$OUT" "$ROOT"/docs/embed/ios/SynergyHostView.swift
# the app's own logic: launch links, x-success, the answer to the caller, the bundled files (tests/ios/main.swift)
"$SWIFTC" -swift-version 5 -I "$OUT" -L "$OUT" -lUIKit -lAVFoundation -lWebKit -o "$OUT/ios-tests" \
  "$ROOT/ios/Synergy/LaunchRequest.swift" "$ROOT/ios/Synergy/BundleSchemeHandler.swift" "$ROOT/ios/Synergy/NativeBridge.swift" "$ROOT/tests/ios/main.swift"
LD_LIBRARY_PATH="$OUT${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" DYLD_LIBRARY_PATH="$OUT" "$OUT/ios-tests"
echo "iOS: ios/Synergy/*.swift и docs/embed/ios/SynergyHostView.swift проходят проверку типов по заглушкам SDK, тесты логики — зелёные"
