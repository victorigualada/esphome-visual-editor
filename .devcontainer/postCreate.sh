#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Make corepack non-interactive (no "Do you want to continue?").
export COREPACK_ENABLE_DOWNLOAD_PROMPT="${COREPACK_ENABLE_DOWNLOAD_PROMPT:-0}"

# Create + "activate" a container-local virtualenv by default (we also wire PATH via devcontainer.json).
VENV_DIR="${VIRTUAL_ENV:-/home/vscode/.venv}"
if [ ! -x "${VENV_DIR}/bin/python" ]; then
  python -m venv "${VENV_DIR}"
fi

# Ensure pre-commit is available in the container venv.
"${VENV_DIR}/bin/python" -m pip install --upgrade pip pre-commit

# Use a repo-tracked hooks directory so host + devcontainer can share a single hook script.
git config core.hooksPath .githooks
chmod +x .githooks/pre-commit || true

# Optional but convenient for frontend development.
if command -v corepack >/dev/null 2>&1 && [ -f frontend/package.json ]; then
  corepack enable
  (cd frontend && yarn install --frozen-lockfile)
fi


