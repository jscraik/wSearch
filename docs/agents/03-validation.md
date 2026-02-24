# Validation and checks

Run the smallest useful checks for the change scope.

## Table of Contents
- [Core checks](#core-checks)
- [Docs checks](#docs-checks)
- [Release gates](#release-gates)

## Core checks
- Tests: `npm test`
- Typecheck: `npm run lint:types`
- Build: `npm run build`

## Docs checks
- Markdown lint: `npm run lint:docs`
- Vale style lint: `npm run lint:docs:vale`
- Readability: `npm run lint:docs:readability`
- Brand checks: `npm run lint:docs:brand`

## Release gates
- Prepublish gate: `npm run prepublishOnly`
- Version gate (must be on `main`): enforced by `npm run preversion`

Fail fast: stop at first failing gate, fix, then rerun only impacted checks.
