#!/usr/bin/env bash
# Idempotent one-time setup (macOS / Linux). Safe to re-run.
set -eu
cd "$(dirname "$0")/.."

echo "▶ Activating the pre-commit Inspector..."
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit 2>/dev/null || true
echo "  core.hooksPath = $(git config core.hooksPath)"

if [ -f package.json ]; then
  echo "▶ Installing dependencies..."
  npm install
fi

if command -v gitleaks >/dev/null 2>&1; then
  echo "✓ gitleaks present: $(gitleaks version)"
else
  echo "⚠ gitleaks not found, install it for the secret-scan backstop:"
  echo "    macOS:  brew install gitleaks"
  echo "    Linux:  https://github.com/gitleaks/gitleaks#installing"
fi

echo "✅ Setup complete, commits are now gated by .githooks/pre-commit."
