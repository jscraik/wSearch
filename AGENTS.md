schema_version: 1

# wSearch CLI Repository Guidelines

This repository contains the TypeScript CLI for safe, script-friendly Wikidata queries (REST, SPARQL, Action API).

## Mandatory workflow snippet
1. Explore project first, then invoke skill.
2. IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any React, Tauri, Apps-SDK-ui, Tailwind, Vite, Storybook + Chat Widget tasks.
3. Add a Table of Contents for docs.

## Required essentials
- Package manager: npm.
- Non-standard build/typecheck commands: `npm run lint:types` and `npm run prepublishOnly`.
- Default compatibility posture: canonical-only.

## References (informational)
- Global protocol: /Users/jamiecraik/.codex/AGENTS.md
- Security and standards baseline: /Users/jamiecraik/.codex/instructions/standards.md
- RVCP source of truth: /Users/jamiecraik/.codex/instructions/rvcp-common.md

## Tooling essentials
- Run shell commands with `zsh -lc`.
- Prefer `rg`, `fd`, and `jq`.
- Before choosing tools, read `/Users/jamiecraik/.codex/instructions/tooling.md`.
- Ask before adding dependencies or changing system settings.
- Execution mode: single-threaded by default; do not parallelize or spawn subagents unless explicitly requested.

## Global discovery order
1. /Users/jamiecraik/.codex/AGENTS.md
2. /Users/jamiecraik/dev/wsearch/AGENTS.md
3. Linked instruction files in `docs/agents/`
4. If conflicts appear, pause and ask which instruction wins.

## Documentation map
### Table of Contents
- [Instruction map](/Users/jamiecraik/dev/wsearch/docs/agents/01-instruction-map.md)
- [Tooling and command policy](/Users/jamiecraik/dev/wsearch/docs/agents/02-tooling-policy.md)
- [Validation and checks](/Users/jamiecraik/dev/wsearch/docs/agents/03-validation.md)
- [Security and governance](/Users/jamiecraik/dev/wsearch/docs/agents/04-security-and-governance.md)
- [AI artifact governance](/Users/jamiecraik/dev/wsearch/docs/agents/05-ai-artifact-governance.md)
- [Contradictions and cleanup](/Users/jamiecraik/dev/wsearch/docs/agents/06-contradictions-and-cleanup.md)

## Flaky Test Artifact Capture
- Run `bash scripts/test-with-artifacts.sh all` (or `pnpm run test:artifacts` / `npm run test:artifacts` / `bun run test:artifacts`) to emit machine-readable flaky evidence under `artifacts/test`.
- Optional targeted modes:
  - `bash scripts/test-with-artifacts.sh unit`
  - `bash scripts/test-with-artifacts.sh integration`
  - `bash scripts/test-with-artifacts.sh e2e`
- Commit/retain stable artifact paths for local automation ingestion:
  - `artifacts/test/summary-*.json`
  - `artifacts/test/test-output-*.log`
  - `artifacts/test/junit-*.xml` (when supported by test runner)
  - `artifacts/test/*-results.json` (when supported by test runner)
  - `artifacts/test/artifact-manifest.json`
- Keep artifact filenames stable (no timestamps in filenames) so recurring flake scans can compare runs.

