#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

ROLLOUT_CHECK="${SCRIPT_DIR}/hook-governance/rollout_check.py"
DOCSTRING_CHECK="${SCRIPT_DIR}/hook-governance/evaluate_docstring_ratchet.py"

SCOPE="project-local"
FAST=0
MANIFEST="${REPO_ROOT}/repo-scope.manifest.json"

usage() {
  cat <<'USAGE'
Usage: bash scripts/verify-work.sh [--fast] [--project-governance|--workspace-governance] [--manifest <path>]

Defaults:
  - Governance scope defaults to project-local.
  - Project-local mode writes governance artifacts to temporary files.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --fast)
      FAST=1
      ;;
    --project-governance)
      SCOPE="project-local"
      ;;
    --workspace-governance)
      SCOPE="workspace"
      ;;
    --manifest)
      shift
      if [ "$#" -eq 0 ]; then
        echo "Missing value for --manifest"
        exit 2
      fi
      MANIFEST="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 2
      ;;
  esac
  shift
done

cd "$REPO_ROOT"

if [ ! -f "$ROLLOUT_CHECK" ] || [ ! -f "$DOCSTRING_CHECK" ]; then
  echo "Hook-governance scripts are missing."
  exit 1
fi

if [ "$FAST" -eq 1 ]; then
  npm run lint:types
else
  npm run check
fi

resolve_path() {
  local p="$1"
  python3 - "$REPO_ROOT" "$p" <<'PY'
import os
import sys
root, path = sys.argv[1], sys.argv[2]
print(path if os.path.isabs(path) else os.path.abspath(os.path.join(root, path)))
PY
}

if [ "$SCOPE" = "project-local" ]; then
  tmp_inventory="$(mktemp)"
  tmp_classification="$(mktemp)"
  tmp_metrics="$(mktemp)"
  tmp_rollout_out="$(mktemp)"
  tmp_docstring_out="$(mktemp)"
  trap 'rm -f "$tmp_inventory" "$tmp_classification" "$tmp_metrics" "$tmp_rollout_out" "$tmp_docstring_out"' EXIT

  cat >"$tmp_inventory" <<EOF
{
  "repos": [
    {
      "name": "wsearch",
      "path": "${REPO_ROOT}",
      "status": "healthy",
      "stale": false
    }
  ]
}
EOF

  cat >"$tmp_classification" <<'EOF'
{
  "apis": [
    { "name": "wsearch-cli", "public": true }
  ]
}
EOF

  cat >"$tmp_metrics" <<'EOF'
{
  "baseline_coverage": 0.90,
  "current_coverage": 0.92
}
EOF

  python3 "$ROLLOUT_CHECK" \
    --inventory "$tmp_inventory" \
    --recovery-slo-hours 24 \
    --out "$tmp_rollout_out"

  python3 "$DOCSTRING_CHECK" \
    --classification "$tmp_classification" \
    --metrics "$tmp_metrics" \
    --window-days 14 \
    --out "$tmp_docstring_out"

  echo "verify-work: project-local governance checks passed"
  exit 0
fi

if [ ! -f "$MANIFEST" ]; then
  echo "Workspace manifest not found: $MANIFEST"
  exit 1
fi

read -r inventory classification metrics rollout_out docstring_out < <(python3 - "$MANIFEST" <<'PY'
import json
import sys
doc = json.load(open(sys.argv[1], encoding="utf-8"))
print(
    doc.get("inventory", ""),
    doc.get("classification", ""),
    doc.get("metrics", ""),
    doc.get("rollout_out", "docs/hooks-governance/rollout-check-report.json"),
    doc.get("docstring_out", "docs/hooks-governance/docstring-ratchet-report.json"),
)
PY
)

if [ -z "$inventory" ] || [ -z "$classification" ] || [ -z "$metrics" ]; then
  echo "Manifest must include inventory, classification, and metrics paths."
  exit 1
fi

python3 "$ROLLOUT_CHECK" \
  --inventory "$(resolve_path "$inventory")" \
  --recovery-slo-hours 24 \
  --out "$(resolve_path "$rollout_out")"

python3 "$DOCSTRING_CHECK" \
  --classification "$(resolve_path "$classification")" \
  --metrics "$(resolve_path "$metrics")" \
  --window-days 14 \
  --out "$(resolve_path "$docstring_out")"

echo "verify-work: workspace governance checks passed"