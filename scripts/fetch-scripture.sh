#!/usr/bin/env bash
# Fetch the verified scripture text for the build (P1-S3-T5).
#
# With SCRIPTURE_TOKEN set and scripture.lock holding a commit SHA, this shallow-fetches exactly
# that commit of the private biblekarta-scripture repo into .scripture/ and uses
# .scripture/scripture. Otherwise it uses scripture-fixtures/ (a non-scriptural test book).
# The choice is written to .scripture.env (read by verify-scripture and the Astro build), and
# to $GITHUB_ENV when running in GitHub Actions, so later steps see it too.
#
# The token is never printed: it reaches git only through a GIT_ASKPASS helper that reads it
# from the environment, never through the URL or the command line.
set -euo pipefail
set +x

OWNER="${SCRIPTURE_OWNER:-davezking}"
REMOTE="${SCRIPTURE_REMOTE:-https://x-access-token@github.com/${OWNER}/biblekarta-scripture.git}"
LOCK="$(tr -d '[:space:]' < scripture.lock 2>/dev/null || true)"

write_env() { # dir mode version
  printf 'SCRIPTURE_DIR=%s\nBK_SCRIPTURE=%s\nSCRIPTURE_VERSION=%s\n' "$1" "$2" "$3" > .scripture.env
  if [[ -n "${GITHUB_ENV:-}" ]]; then cat .scripture.env >> "$GITHUB_ENV"; fi
  export SCRIPTURE_DIR="$1" BK_SCRIPTURE="$2" SCRIPTURE_VERSION="$3"
}

if [[ -z "${SCRIPTURE_TOKEN:-}" || ! "$LOCK" =~ ^[0-9a-f]{40}$ ]]; then
  if [[ -z "${SCRIPTURE_TOKEN:-}" ]]; then
    reason="SCRIPTURE_TOKEN is not set"
  else
    reason="scripture.lock holds no commit SHA (${LOCK:-empty})"
  fi
  echo "notice: using scripture fixtures (scripture-fixtures/): ${reason}"
  write_env scripture-fixtures fixtures fixtures
  exit 0
fi

askpass="$(mktemp)"
trap 'rm -f "$askpass"' EXIT
# shellcheck disable=SC2016  # expanded when git runs the helper, not here
printf '#!/bin/sh\nprintf "%%s\\n" "$SCRIPTURE_TOKEN"\n' > "$askpass"
chmod 700 "$askpass"

rm -rf .scripture
git init -q .scripture
GIT_ASKPASS="$askpass" GIT_TERMINAL_PROMPT=0 \
  git -C .scripture -c credential.helper= fetch -q --depth 1 "$REMOTE" "$LOCK"
git -C .scripture -c advice.detachedHead=false checkout -q FETCH_HEAD
head="$(git -C .scripture rev-parse HEAD)"
if [[ "$head" != "$LOCK" ]]; then
  echo "error: fetched $head, but scripture.lock says $LOCK" >&2
  exit 1
fi

echo "using scripture ${LOCK}"
write_env .scripture/scripture real "$LOCK"
