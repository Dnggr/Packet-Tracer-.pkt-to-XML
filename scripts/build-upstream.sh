#!/usr/bin/env bash
set -euo pipefail

REPO_URL="https://github.com/mircodz/pka2xml"
PINNED_SHA="22fee2681779a6dd764d6562b0a134ceb339e770"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.upstream/src"
OUT="$ROOT/.upstream/pka2xml"

if [ -x "$OUT" ] && [ -f "$ROOT/.upstream/SHA" ] && [ "$(cat "$ROOT/.upstream/SHA")" = "$PINNED_SHA" ]; then
  echo "upstream already built at $PINNED_SHA"
  exit 0
fi

PACKAGES=(g++ git libcrypto++-dev libre2-dev zlib1g-dev)
MISSING=()
for pkg in "${PACKAGES[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg")
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    SUDO="sudo"
  fi
  $SUDO apt-get update
  $SUDO apt-get install -y --no-install-recommends "${MISSING[@]}"
fi

rm -rf "$WORK"
mkdir -p "$ROOT/.upstream"
git clone --quiet "$REPO_URL" "$WORK"
git -C "$WORK" checkout --quiet "$PINNED_SHA"

ACTUAL_SHA="$(git -C "$WORK" rev-parse HEAD)"
if [ "$ACTUAL_SHA" != "$PINNED_SHA" ]; then
  echo "checked out $ACTUAL_SHA, expected $PINNED_SHA" >&2
  exit 1
fi

g++ -O2 -o "$OUT" "$WORK/main.cpp" -I"$WORK/include" -lcryptopp -lre2 -lz -lpthread

test -x "$OUT"
printf '%s' "$PINNED_SHA" > "$ROOT/.upstream/SHA"
echo "built $OUT"
echo "pinned SHA: $PINNED_SHA"
