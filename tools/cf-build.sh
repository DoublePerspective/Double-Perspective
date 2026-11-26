#!/bin/sh
# Cloudflare Pages build: copy the public site into dist/, leaving out
# repo-only files (tools, notes, dotfiles such as .git and .github).
set -e
rm -rf dist
mkdir dist
for f in * .well-known; do
  case "$f" in dist|tools|admin|maps|follow|HANDOFF.md|README.md) continue ;; esac
  [ -e "$f" ] && cp -R "$f" dist/
done
echo "Copied $(find dist -type f | wc -l) files to dist/"
