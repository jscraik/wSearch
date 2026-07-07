# Contributing to brAInwav wSearch CLI

Thanks for contributing. This guide explains how to set up your dev environment, run checks, and keep changes consistent.

Last updated: 2026-01-04

## Table of contents
- [Document requirements](#document-requirements)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Run checks](#run-checks)
- [Code style expectations](#code-style-expectations)
- [Commit and release](#commit-and-release)

## Document requirements
- Audience: contributors and maintainers.
- Scope: local setup and contribution expectations.
- Non-scope: CI configuration and release automation.
- Owner: repository maintainers.
- Review cadence: every release or at least quarterly.
- Required approvals: maintainers for public changes.

## Prerequisites
- Node.js 18+ and npm.
- A descriptive User-Agent for Wikimedia APIs when running live queries.

## Local setup
```sh
npm install
```

## Run checks
### Test suite
```sh
npm test
```

### Type checking
```sh
npm run lint:types
```

### Security scans
```sh
npm run semgrep
npm run gitleaks
```

### Documentation checks
```sh
npm run lint:docs
npm run lint:docs:vale
npm run lint:docs:readability
npm run lint:docs:brand
```
Note: run `vale sync` once to download the Microsoft style package.

### Build
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

## Link Policy

No third-party directory, marketplace, mirror, sponsorship, or promotional links without maintainer approval.
