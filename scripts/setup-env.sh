#!/usr/bin/env bash
# Stable, repeatable onboarding entry point. Production setup owns the stages.
set +x
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec bash "$ROOT/scripts/setup-production.sh" "$@"
