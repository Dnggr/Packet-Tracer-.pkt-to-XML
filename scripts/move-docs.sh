#!/usr/bin/env bash
# Moves the planning documents into docs/ and rewrites README.md links to match.
# Run once from the repository root:  bash scripts/move-docs.sh
# Safe to re-run. Works with GNU or BSD sed (Linux, macOS, Git Bash, WSL).
set -euo pipefail

DOCS=(
  ARCHITECTURE.md CHECKLIST.md DECISIONS.md DEPLOYMENT.md FILE_STRUCTURE.md
  IMPLEMENTATION_ROADMAP.md PROJECT_PLAN.md SECURITY_AND_PRIVACY.md
  TECHNICAL_FEASIBILITY.md TESTING_PLAN.md
)

mkdir -p docs

for f in "${DOCS[@]}"; do
  [ -f "$f" ] || continue
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
    git mv "$f" "docs/$f"
  else
    mv "$f" "docs/$f"
  fi
  echo "moved $f -> docs/$f"
done

# README.md stays at the root. Point its links at docs/ (skips already-fixed links).
if [ -f README.md ]; then
  pattern=''
  for f in "${DOCS[@]}"; do pattern="${pattern:+$pattern|}${f//./\\.}"; done
  sed -i.bak -E "s#\]\(($pattern)(\#[^)]*)?\)#](docs/\1\2)#g" README.md
  rm -f README.md.bak
  echo "updated README.md links"
fi
