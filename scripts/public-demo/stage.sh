#!/usr/bin/env bash
# Makes a deploy folder for the public demo: the committed code at HEAD plus
# demo-data/ built from a local METAL data directory (approved recordings only).
#   scripts/public-demo/stage.sh <source data dir> <empty output dir>
# Deploy from that folder (e.g. `railway up`). The footage never enters Git.
set -euo pipefail
SRC="${1:?source data dir}"; OUT="${2:?output dir}"
[ -e "$OUT" ] && [ -n "$(ls -A "$OUT")" ] && { echo "$OUT is not empty" >&2; exit 1; }
mkdir -p "$OUT"
git archive HEAD | tar -x -C "$OUT"
node scripts/public-demo/build-data.mjs "$SRC" "$OUT/demo-data"
# Not a Git checkout: drop .gitignore so upload tools don't skip demo-data/*.db and *.mp4.
rm -f "$OUT/.gitignore"
echo "staged $(git rev-parse --short HEAD) → $OUT"
