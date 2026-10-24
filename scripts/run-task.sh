#!/usr/bin/env bash
# Run one task headlessly with the model (and in the repo) named in its task file.
# Usage: scripts/run-task.sh P1-S2-T3
# Site tasks run here; scripture tasks run in ../biblekarta-scripture (override with SCRIPTURE_REPO).
set -euo pipefail
ID="${1:?usage: scripts/run-task.sh <TASK-ID>}"
ROOT=$(git rev-parse --show-toplevel)
FILE="$ROOT/docs/tasks/$ID.md"
[ -f "$FILE" ] || { echo "No task file: $FILE" >&2; exit 1; }
MODEL=$(grep -m1 '^model:' "$FILE" | awk '{print $2}')
REPO=$(grep -m1 '^repo:' "$FILE" | sed 's/^repo:[[:space:]]*//')
SCRIPTURE_REPO="${SCRIPTURE_REPO:-$ROOT/../biblekarta-scripture}"

run() { echo "▶ $ID · model $MODEL · in $1"; (cd "$1" && claude -p "/run-task $ID" --model "$MODEL" --permission-mode acceptEdits); }

case "$REPO" in
  site)       run "$ROOT" ;;
  scripture)  run "$SCRIPTURE_REPO" ;;
  "site + scripture") run "$SCRIPTURE_REPO"; run "$ROOT" ;;
  *) echo "Unknown repo field: '$REPO'" >&2; exit 1 ;;
esac
