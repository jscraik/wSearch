# Contributing to brAInwav Wikidata CLI

Thanks for contributing. This guide explains how to set up your dev environment, run checks, and keep changes consistent.

## Prerequisites
- Node.js 18+ and npm.
- A descriptive User-Agent for Wikimedia APIs when running live queries.

## Local setup
```sh
npm install
```

## Run the test suite
```sh
npm test
```

## Type checking
```sh
npm run lint:types
```

## Security scans
```sh
npm run semgrep
npm run gitleaks
```

## Build
```sh
npm run build
```

## Code style expectations
- Keep TypeScript strict and avoid `any` in new code.
- Use explicit error messages with actionable fixes.
- Keep CLI output stable for `--plain` and `--json`.
- Do not accept secrets via flags; use stdin or files.
- Prefer small, focused changes with tests.

## Commit and release
- Update `CHANGELOG.md` for user-facing changes.
- Use SemVer for version changes.
- Tag releases with `vX.Y.Z`.
