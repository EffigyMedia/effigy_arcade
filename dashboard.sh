#!/bin/sh
# Code Continuum - run to open THIS project's dashboard.
#
# THE NAME IS THE INTERFACE (Artifact_Formats.md, Dashboard Launchers): the launcher derives the
# project name from its own folder and hands it to dashboard.py, which owns the paths. Nothing here
# is edited per project - the same file works in every project it is copied into.
#
# It finds the environment root by WALKING UP for the marker, never by a stored path
# (Path_Policy.md section 3) - the drive travels, and an absolute path breaks the first move.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT=$(basename "$HERE")
WALK="$HERE"
while [ ! -f "$WALK/.code-continuum-env-root" ]; do
  NEXT=$(dirname "$WALK")
  if [ "$NEXT" = "$WALK" ]; then
    echo "[dashboard] no .code-continuum-env-root above $HERE - is this inside a CC environment?" >&2
    exit 1
  fi
  WALK="$NEXT"
done
exec "$WALK/Runtime/bin/python" "$WALK/Commands/dashboard.py" "$PROJECT" --open
