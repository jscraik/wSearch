#!/bin/bash
# Local environment check using repo-canonical tooling inventory.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

MISE_TOML_PATH="${MISE_TOML_PATH:-${REPO_ROOT}/.mise.toml}"
ENVIRONMENT_TOML_PATH="${ENVIRONMENT_TOML_PATH:-${REPO_ROOT}/.codex/environments/environment.toml}"
HARNESS_CONTRACT_PATH="${HARNESS_CONTRACT_PATH:-${REPO_ROOT}/harness.contract.json}"
TOOLING_REQUIREMENTS_PATH="${TOOLING_REQUIREMENTS_PATH:-${REPO_ROOT}/.agent/tooling.requirements.json}"
TOOLING_DOC_PATH="${TOOLING_DOC_PATH:-${REPO_ROOT}/docs/agents/tooling.md}"
DOC_RENDERER_PATH="${DOC_RENDERER_PATH:-${REPO_ROOT}/scripts/render-tooling-doc.py}"

WRITE_TOOLING_DOC=0
for arg in "$@"; do
    case "$arg" in
        --write-tooling-doc)
            WRITE_TOOLING_DOC=1
            ;;
        *)
            echo "Unknown argument: $arg"
            echo "Usage: bash scripts/check-environment.sh [--write-tooling-doc]"
            exit 2
            ;;
    esac
done

cd "$REPO_ROOT"

echo "Checking environment with repo-canonical tooling contract..."

require_file() {
    local path="$1"
    if [ ! -f "$path" ]; then
        echo "Missing required file: $path"
        exit 1
    fi
}

require_file "$TOOLING_REQUIREMENTS_PATH"
require_file "$MISE_TOML_PATH"
require_file "$ENVIRONMENT_TOML_PATH"
require_file "$HARNESS_CONTRACT_PATH"
require_file "$DOC_RENDERER_PATH"

# Activate repo-local mise tools when available.
if command -v mise >/dev/null 2>&1; then
    mise trust --yes "$MISE_TOML_PATH" >/dev/null 2>&1 || true
    mise install >/dev/null 2>&1 || true
    eval "$(mise activate bash)" >/dev/null 2>&1 || true
fi

# Install ralph if it is not already available.
if ! command -v ralph >/dev/null 2>&1; then
    echo "Installing ralph-gold..."
    uv tool install ralph-gold
fi

readarray -t REQUIRED_BINS < <(
    python3 - "$TOOLING_REQUIREMENTS_PATH" <<'PY'
import json
import sys
from pathlib import Path

doc = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for item in doc.get("required_bins", []):
    print(str(item))
PY
)

readarray -t REQUIRED_ACTIONS < <(
    python3 - "$TOOLING_REQUIREMENTS_PATH" <<'PY'
import json
import sys
from pathlib import Path

doc = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for item in doc.get("required_actions", []):
    print(str(item))
PY
)

readarray -t MISE_TOOLS < <(
    python3 - "$MISE_TOML_PATH" <<'PY'
import sys
import tomllib
from pathlib import Path

with Path(sys.argv[1]).open("rb") as f:
    doc = tomllib.load(f)

for key in doc.get("tools", {}).keys():
    print(str(key))
PY
)

readarray -t ENV_ACTIONS < <(
    python3 - "$ENVIRONMENT_TOML_PATH" <<'PY'
import sys
import tomllib
from pathlib import Path

with Path(sys.argv[1]).open("rb") as f:
    doc = tomllib.load(f)

for action in doc.get("actions", []):
    name = str(action.get("name", "")).strip()
    if name:
        print(name)
PY
)

check_bin_entry() {
    local entry="$1"
    local matched=0
    local candidate
    IFS='|' read -r -a candidates <<<"$entry"
    for candidate in "${candidates[@]}"; do
        if command -v "$candidate" >/dev/null 2>&1; then
            matched=1
            break
        fi
    done
    if [ "$matched" -eq 0 ]; then
        echo "Missing required binary: $entry"
        return 1
    fi
    return 0
}

tool_to_bin_entry() {
    local tool="$1"
    case "$tool" in
        node)
            echo "node"
            ;;
        python)
            echo "python3|python"
            ;;
        uv)
            echo "uv"
            ;;
        pnpm)
            echo "pnpm|corepack"
            ;;
        npm:*)
            echo "npm"
            ;;
        cargo:*)
            echo "cargo"
            ;;
        *)
            echo "$tool"
            ;;
    esac
}

for bin_entry in "${REQUIRED_BINS[@]}"; do
    check_bin_entry "$bin_entry"
done

if [ "${#MISE_TOOLS[@]}" -eq 0 ]; then
    echo "No [tools] entries found in $MISE_TOML_PATH"
    exit 1
fi

for tool in "${MISE_TOOLS[@]}"; do
    check_bin_entry "$(tool_to_bin_entry "$tool")"
done

for required_action in "${REQUIRED_ACTIONS[@]}"; do
    found=0
    for action_name in "${ENV_ACTIONS[@]}"; do
        if [ "$action_name" = "$required_action" ]; then
            found=1
            break
        fi
    done
    if [ "$found" -eq 0 ]; then
        echo "Missing required Codex action in ${ENVIRONMENT_TOML_PATH}: ${required_action}"
        exit 1
    fi
done

generated_tooling_doc="$(mktemp)"
python3 "$DOC_RENDERER_PATH" \
    --repo-root "$REPO_ROOT" \
    --requirements "$TOOLING_REQUIREMENTS_PATH" \
    --mise "$MISE_TOML_PATH" \
    --environment "$ENVIRONMENT_TOML_PATH" \
    >"$generated_tooling_doc"

if [ "$WRITE_TOOLING_DOC" -eq 1 ]; then
    mkdir -p "$(dirname "$TOOLING_DOC_PATH")"
    install -m 0644 "$generated_tooling_doc" "$TOOLING_DOC_PATH"
    echo "Wrote tooling inventory: $TOOLING_DOC_PATH"
fi

if [ ! -f "$TOOLING_DOC_PATH" ] || ! cmp -s "$generated_tooling_doc" "$TOOLING_DOC_PATH"; then
    echo "Tooling inventory is missing or out of date: $TOOLING_DOC_PATH"
    echo "Run: bash scripts/check-environment.sh --write-tooling-doc"
    rm -f "$generated_tooling_doc"
    exit 1
fi
rm -f "$generated_tooling_doc"

# Prefer legacy `check-environment` when present.
if ralph --help 2>/dev/null | grep -q "check-environment"; then
    ralph check-environment --contract "$HARNESS_CONTRACT_PATH"
else
    echo "ralph check-environment not available; running fallback contract checks."
    ralph doctor || true

    required_node="$(node -e "const c=require(process.argv[1]); process.stdout.write(c?.runtimePolicy?.nodeVersion ?? '')" "$HARNESS_CONTRACT_PATH")"
    if [ -n "$required_node" ] && [[ "$required_node" =~ ^([0-9]+)\.x$ ]]; then
        required_node_major="${BASH_REMATCH[1]}"
        current_node_major="$(node -p "process.versions.node.split('.')[0]")"
        if [ "$current_node_major" != "$required_node_major" ]; then
            echo "Node version mismatch: required ${required_node}, found v$(node -v | sed 's/^v//')"
            exit 1
        fi
    fi

    required_manager="$(node -e "const c=require(process.argv[1]); process.stdout.write(c?.packageManagerPolicy?.requiredManager ?? 'npm')" "$HARNESS_CONTRACT_PATH")"
    if ! command -v "$required_manager" >/dev/null 2>&1; then
        echo "Missing required package manager: ${required_manager}"
        exit 1
    fi
fi

echo "Environment check passed!"
