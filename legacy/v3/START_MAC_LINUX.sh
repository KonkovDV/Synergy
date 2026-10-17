#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then exec python3 launch.py; fi
printf '%s\n' 'Open index.html in Chrome, Edge or Firefox. No installation needed.'
