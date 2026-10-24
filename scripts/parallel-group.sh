#!/usr/bin/env bash
# Create one git worktree per task in a parallel group (in the right repo) and print the command to run each.
# Usage: scripts/parallel-group.sh <phase> <group>     e.g. scripts/parallel-group.sh 1 S1-B
# After merge: git worktree remove <dir>   (run inside the repo that owns the worktree)
set -euo pipefail
PHASE="${1:?usage: scripts/parallel-group.sh <phase> <group>}"
GROUP="${2:?usage: scripts/parallel-group.sh <phase> <group>}"
ROOT=$(git rev-parse --show-toplevel)
SCRIPTURE_REPO="${SCRIPTURE_REPO:-$ROOT/../biblekarta-scripture}"
PARENT=$(dirname "$ROOT")

found=0
for f in "$ROOT"/docs/tasks/P"${PHASE}"-*.md; do
  g=$(awk '/^parallel_group:/{print $2; exit}' "$f")
  [ "$g" = "$GROUP" ] || continue
  id=$(awk '/^id:/{print $2; exit}' "$f")
  repo=$(grep -m1 '^repo:' "$f" | sed 's/^repo:[[:space:]]*//')
  if [ "$repo" = "scripture" ]; then
    src="$SCRIPTURE_REPO"; base="main"; dir="$PARENT/biblekarta-scripture-$id"
  else
    src="$ROOT"; base="phase-$PHASE"; dir="$PARENT/biblekarta-$id"
  fi
  git -C "$src" fetch origin "$base" >/dev/null
  [ -d "$dir" ] || git -C "$src" worktree add --detach "$dir" "origin/$base" >/dev/null
  # run-task.sh always lives in the site repo; point it at this worktree for scripture tasks
  if [ "$repo" = "scripture" ]; then
    echo "SCRIPTURE_REPO=\"$dir\" \"$ROOT/scripts/run-task.sh\" $id"
  else
    echo "cd \"$dir\" && scripts/run-task.sh $id"
  fi
  found=$((found+1))
done

[ "$found" -gt 0 ] || { echo "No tasks in phase $PHASE group $GROUP" >&2; exit 1; }
echo
echo "Run each command above in its own terminal. Remove worktrees after merge with: git -C <repo> worktree remove <dir>"
