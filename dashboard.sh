#!/bin/sh
# Code Continuum - run to open this project's dashboard.
#
# GENERATED. The source is Templates/_Project_Template/dashboard.sh in the Code Continuum
# environment, and `Commands/materialize-projects.py` writes it into each project. An edit here is
# overwritten the next time that runs, and reported as drift before then. Change the template.
#
# The name is the interface (Artifact_Formats.md, Dashboard Launchers): the launcher derives the
# project name from its own folder and hands it to dashboard.py, which owns the paths. Nothing here
# is edited per project - the same file works in every project it is written into.
#
# It finds the environment root by walking up for the marker, never by a stored path
# (Path_Policy.md section 3) - the drive travels, and an absolute path breaks the first move.
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project=$(basename "$here")
WALK="$here"
while [ ! -f "$WALK/.code-continuum-env-root" ]; do
  NEXT=$(dirname "$WALK")
  if [ "$NEXT" = "$WALK" ]; then
    echo "[dashboard] no .code-continuum-env-root above $here - is this inside a CC environment?" >&2
    exit 1
  fi
  WALK="$NEXT"
done
exec "$WALK/Runtime/bin/python" "$WALK/Commands/dashboard.py" "$project" --open
