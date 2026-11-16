#!/usr/bin/env bash
# Merge one fix workspace into main, 3-way against the audited baseline commit.
#   tools/fixmerge.sh <workspace-name> [baseline-commit=65c0fc0]      (run from game/)
set -uo pipefail
W=/home/user/lw/$1; BASE=${2:-65c0fc0}; ROOT=/home/user/haybat-alsahra-1899
cd "$W" || exit 2
files=$(find game/src game/harness game/tools game/tests -type f \( -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.css' -o -name '*.json' -o -name '*.html' \) 2>/dev/null; ls app/public/index.html game/assets.sources.json 2>/dev/null)
for f in $(echo "$files" | sort -u); do
  m="$ROOT/$f"; b=$(mktemp)
  if git -C "$ROOT" cat-file -e "$BASE:$f" 2>/dev/null; then git -C "$ROOT" show "$BASE:$f" > "$b"; hasb=1; else hasb=0; fi
  if [ $hasb = 1 ] && cmp -s "$f" "$b"; then rm -f "$b"; continue; fi            # untouched by this group
  if [ ! -f "$m" ]; then mkdir -p "$(dirname "$m")"; cp "$f" "$m"; echo "NEW      $f"; rm -f "$b"; continue; fi
  if [ $hasb = 0 ]; then if cmp -s "$f" "$m"; then :; else echo "CLASH    $f (new in both, kept main; theirs at $W/$f)"; fi; rm -f "$b"; continue; fi
  if cmp -s "$m" "$b"; then cp "$f" "$m"; echo "COPIED   $f"; rm -f "$b"; continue; fi
  if cmp -s "$f" "$m"; then rm -f "$b"; continue; fi
  if git merge-file -q "$m" "$b" "$f"; then echo "MERGED   $f"; else echo "CONFLICT $f"; fi
  rm -f "$b"
done
