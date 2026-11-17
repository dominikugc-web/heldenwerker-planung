#!/usr/bin/env bash
# Legt den Inhalt von web/ auf den Branch gh-pages (GitHub Pages). Vorher Prüfung auf private Daten.
set -euo pipefail
cd "$(dirname "$0")"
if grep -rIl -E 'ts\.net[^"]|[A-Z]:\|@heldenwerker|@gmail|sk-ant' web --exclude=app.js; then echo "Abbruch: private Angaben in web/"; exit 1; fi
git diff --quiet && git diff --cached --quiet || { echo "Abbruch: erst committen"; exit 1; }
commit=$(git subtree split --prefix web HEAD)
git push origin "$commit:refs/heads/gh-pages" --force
echo "Fertig: https://dominikugc-web.github.io/heldenwerker-planung/"
