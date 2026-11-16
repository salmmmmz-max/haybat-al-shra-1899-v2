#!/usr/bin/env bash
# Merge the files a QA workspace changed into main (3-way against the snapshot the workspaces were created from).
#   tools/qamerge.sh <qa-name>      e.g. qa5      (run from game/)
set -uo pipefail
Q=/home/user/lw/$1/game; B=/home/user/lw/qa-base-src
cd "$Q" && for f in $(find src -name '*.js' -o -name '*.css' | sort); do
  m=/home/user/haybat-alsahra-1899/game/$f; b=$B/${f#src/}
  [ -f "$b" ] && cmp -s "$f" "$b" && continue                      # untouched by the QA engineer
  if [ ! -f "$m" ] || [ ! -f "$b" ]; then cp "$f" "$m"; echo "NEW      $f"; continue; fi
  if cmp -s "$m" "$b"; then cp "$f" "$m"; echo "COPIED   $f"; continue; fi
  if cmp -s "$f" "$m"; then continue; fi
  if git merge-file -q "$m" "$b" "$f"; then echo "MERGED   $f"; else echo "CONFLICT $f"; fi
done
