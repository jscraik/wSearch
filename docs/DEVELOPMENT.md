# Develop and release the brAInwav Wikidata CLI

This guide explains how to build, test, scan, and release the CLI.
It is for contributors and maintainers. It assumes local tooling.
Run checks before you open a PR.
Keep changes small. Keep tests green.
Document user-facing changes as you go.

Last updated: 2026-01-04

## Table of contents
- [Document requirements](#document-requirements)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Risks and assumptions](#risks-and-assumptions)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

## Document requirements
- Audience: contributors and maintainers.
- Scope: local development, tests, scans, and release steps.
- Non-scope: CI pipeline configuration or infrastructure provisioning.
- Owner: repository maintainers.
- Review cadence: every release or at least quarterly.
- Required approvals: maintainers for release changes.

## Prerequisites
- Required: Node.js 18+, npm.
- Optional: semgrep and gitleaks installed locally.

## Quickstart
### 1) Install dependencies
```sh
npm install
```

### 2) Run tests
```sh
npm test
```

### 3) Verify
Expected output:
- All tests pass.

## Common tasks
### Build the CLI
- What you get: compiled output in `dist/`.
- Steps:
```sh
npm run build
```
- Verify: `dist/cli.js` exists.

### Run type checks
- What you get: strict type validation.
- Steps:
```sh
npm run lint:types
```
- Verify: no TypeScript errors.

### Run security scans
- What you get: static checks for common issues.
- Steps:
```sh
npm run semgrep
npm run gitleaks
```
- Verify: no findings.

### Run documentation checks
- What you get: markdown lint, prose lint, and readability scores.
- Steps:
```sh
npm run lint:docs
npm run lint:docs:vale
npm run lint:docs:readability
npm run lint:docs:brand
```
- Verify: no lint failures and readability scores are within the target range.
Note: run `vale sync` once to download the Microsoft style package.

### Run the CLI locally (dev)
- What you get: execute the CLI without building.
- Steps:
```sh
npm run dev -- --help
```
- Verify: help output is printed.

### Cut a release
- What you get: an automated workflow to test, build, tag, and publish to the public npm registry.
- Steps:
```sh
npm version patch
```
- Verify: tag exists in the remote repository and the GitHub Action
  automatically publishes the package via `npm publish --access public`.

## Risks and assumptions
- Security scans depend on local installations of semgrep and gitleaks.
- Releasing requires pushing tags directly to GitHub (`npm version` handles this automatically).
- The package is now fully public and uses GitHub Actions continuous deployment.

## Troubleshooting
### Symptom: npm audit fails on dev dependencies
Cause: transient advisories in tooling.
Fix: update the affected dev dependency and re-run `npm audit`.

### Symptom: gitleaks says "not a git repository"
Cause: running outside a git repo.
Fix: initialize git or run with `--no-git` if appropriate.

## Reference
- Package scripts: `package.json`.
- Changelog: `CHANGELOG.md`.
