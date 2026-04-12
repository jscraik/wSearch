# Tooling Inventory

## Table of Contents
- [Canonical Sources](#canonical-sources)
- [Required Mise Tools](#required-mise-tools)
- [Required Binaries](#required-binaries)
- [Required Codex Actions](#required-codex-actions)
- [Regeneration](#regeneration)

## Canonical Sources
- `.agent/tooling.requirements.json` defines `required_bins` and `required_actions`.
- `.mise.toml` defines required `[tools]` entries.
- `.codex/environments/environment.toml` defines available `[[actions]]` names.

## Required Mise Tools
- `node`: `20`
- `python`: `3.12`
- `uv`: `0.11.3`

## Required Binaries
- `git`
- `mise`
- `node`
- `npm`
- `python3|python`
- `ralph`
- `uv`

## Required Codex Actions
- `Tooling` (present)
- `Install deps` (present)
- `Typecheck` (present)
- `Check` (present)
- `Lint` (present)
- `Build` (present)
- `Run tests` (present)
- `Run app` (present)

## Regeneration
- Run `bash scripts/check-environment.sh --write-tooling-doc` to refresh this file.
