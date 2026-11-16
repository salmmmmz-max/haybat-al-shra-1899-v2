#!/usr/bin/env bash
# Build the production bundle and pack the repository content for the deploy sandbox.  usage: game/tools/pack.sh <out.zip>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OUT="${1:?out.zip}"
(cd "$ROOT/game" && node tools/build.mjs | grep -E "KB|build ")
rm -f "$OUT"; (cd "$ROOT" && zip -r -q "$OUT" app/public app/src/app-meta.json docs game -x 'game/node_modules/*' 'game/.cache/*' 'docs/arch-findings/*' 'docs/.arch-findings.json')
ls -la "$OUT" | awk '{print $5 " bytes"}'; sha256sum "$OUT" | cut -c1-16
