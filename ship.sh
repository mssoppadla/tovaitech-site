#!/usr/bin/env bash
# One-command ship for the company site. Usage: ./ship.sh "commit message"
set -euo pipefail
cd "$(dirname "$0")"
REPO="mssoppadla/tovaitech-site"
MSG="${*:-chore: update site}"
BR="ship/$(date +%Y%m%d-%H%M%S)"
if [ -z "$(git status --porcelain)" ]; then echo "Nothing to ship."; exit 0; fi
echo "==> preflight"; test -f public/index.html && grep -q 'styles/app.css' public/index.html && echo "  ok"
echo "==> branch $BR"; git checkout -b "$BR"
git add -A && git commit -m "$MSG"
git push -u origin "$BR"
if ! command -v gh >/dev/null 2>&1; then
  echo "gh not installed — open PR: https://github.com/$REPO/compare/main...$BR?expand=1"; git checkout main >/dev/null 2>&1 || true; exit 0
fi
gh pr create --repo "$REPO" --base main --head "$BR" --title "$MSG" --body "Automated ship."
gh pr checks "$BR" --repo "$REPO" --watch || { echo "CI failed — PR left open."; git checkout main >/dev/null 2>&1 || true; exit 1; }
gh pr merge "$BR" --repo "$REPO" --squash --delete-branch
git checkout main >/dev/null 2>&1 || true; git pull --ff-only >/dev/null 2>&1 || true
echo "✅ Merged. Approve the site deploy: https://github.com/$REPO/actions"
