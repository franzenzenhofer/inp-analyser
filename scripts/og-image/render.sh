#!/bin/bash
# Render the share images from HTML with a headless browser (agent-browser).
# Usage: bash scripts/og-image/render.sh <base-url-of-repo-root>
#   e.g. serve the repo root with `npx http-server . -p 8766` and pass http://127.0.0.1:8766
# Writes docs/assets/og-image.png (1200x630), docs/assets/og-image-square.png (1200x1200)
# and docs/assets/apple-touch-icon.png (180x180).
set -euo pipefail
BASE="$1"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
render() {
  agent-browser set viewport "$2" "$3" >/dev/null
  agent-browser open "$BASE/scripts/og-image/$1" >/dev/null
  agent-browser wait 800 >/dev/null
  agent-browser screenshot "$ROOT/docs/assets/$4" >/dev/null
  echo "rendered docs/assets/$4"
}
render og-1200x630.html 1200 630 og-image.png
render og-1200x1200.html 1200 1200 og-image-square.png
render apple-touch-icon.html 180 180 apple-touch-icon.png
