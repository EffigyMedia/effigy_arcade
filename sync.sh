#!/usr/bin/env bash
# =====================================================================
# EFFIGY ARCADE — sync.sh
#
# Pushes this folder to github.com/EffigyMedia/effigy_arcade, preserving
# the repo's history. Run it from inside the unzipped folder:
#
#     chmod +x sync.sh      (first time only)
#     ./sync.sh "what changed"
#
# It clones the repo to a temp directory, copies these files over the
# top, and commits only what actually differs. Nothing is force-pushed
# and nothing is deleted that you added on GitHub yourself.
#
# © 2026 Effigy Media. All rights reserved.
# =====================================================================
set -euo pipefail

REPO="${EFFIGY_ARCADE_REPO:-https://github.com/EffigyMedia/effigy_arcade.git}"
MSG="${1:-Update from Effigy Arcade build}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "→ cloning $REPO"
git clone --quiet "$REPO" "$WORK/repo"

echo "→ copying files"
cd "$HERE"
# ---------------------------------------------------------------------------
# THIS LIST IS WHY EVERY CABINET 404ED ON GITHUB PAGES. It predated the
# games/<cat>/ folders, the road.js split and assets.js — so a push shipped a
# launcher whose catalogue pointed at eighteen files that were never copied,
# and `cp games/*.html` matched nothing with its failure eaten by `|| true`.
# The launcher loaded, every machine on it was a dead link, and it looked
# like a hosting problem rather than a deploy that had quietly shipped half
# the app.
#
# The list below matches what pack.sh whitelists and what sw.js caches. If a
# file is added to one, it goes in all three. games/ and fonts/ are mirrored
# exactly (deletions included) because the build owns those two directories
# outright; nothing outside them is ever deleted from the repo.
# ---------------------------------------------------------------------------
for f in index.html arcade.js audio.js road.js assets.js games.js sw.js \
         manifest.webmanifest icon.png icon-512.png effigy.png \
         README.md START-HERE.md DRIVING.md REFACTOR.md DESIGN.md \
         SHIPPING.md PRIVATEER.md pack.sh sync.sh; do
  [ -f "$f" ] && cp "$f" "$WORK/repo/$f"
done
for d in games fonts; do
  rm -rf "${WORK:?}/repo/$d"
  mkdir -p "$WORK/repo/$d"
  cp -R "$d/." "$WORK/repo/$d/"
done
# a build must not push scratch: same rule pack.sh enforces on the zip
find "$WORK/repo/games" -name '_*' -o -name '.*' -o -name '*.py' | while read -r junk; do
  rm -f "$junk"
done
# refuse to push a catalogue that points at files not in the staging area
missing=0
while read -r rel; do
  [ -f "$WORK/repo/$rel" ] || { echo "   MISSING from push: $rel"; missing=1; }
done < <(node -e 'global.window={};eval(require("fs").readFileSync("games.js","utf8"));window.EFFIGY_ARCADE.forEach(g=>console.log(g.file))')
[ "$missing" -eq 0 ] || { echo "→ refusing to push a build with dead links"; exit 1; }

cd "$WORK/repo"
# stage FIRST: `git diff --quiet` ignores untracked files, so a push made of
# nothing but NEW files — a fresh cabinet, the fonts folder the first time —
# reported "nothing changed" and exited without pushing it
git add -A
if git diff --cached --quiet; then
  echo "→ nothing changed, repo is already up to date"
  exit 0
fi

echo "→ changed:"
git --no-pager diff --cached --stat | sed 's/^/    /'

git commit --quiet -m "$MSG"
echo "→ pushing"
git push --quiet
echo "✓ done — https://github.com/EffigyMedia/effigy_arcade"
