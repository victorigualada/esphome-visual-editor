#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

# Make sure the shared hooks path is configured (idempotent).
git config core.hooksPath .githooks

# Make sure the hook script is executable (idempotent).
chmod +x .githooks/pre-commit || true


