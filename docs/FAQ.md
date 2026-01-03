# brAInwav Wikidata CLI FAQ

Short answers to common questions.

Last updated: 2026-01-03

## Table of contents
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

## Prerequisites
- Required: Node.js 18+, npm.

## Quickstart
### 1) Confirm installation
```sh
wikidata --version
```

### 2) Verify
Expected output:
- A version string like `0.1.2`.

## Common tasks
### Does this CLI write to Wikidata?
No. All commands are read-only.

### How do I pass a User-Agent?
Use `--user-agent` or set `WIKIDATA_USER_AGENT`.

### Can I use a token?
Yes. Store it with `wikidata auth login` and pass `--auth`.

### Does this work with other Wikibase instances?
Yes. Provide `--api-url`, `--action-url`, and `--sparql-url`.

## Troubleshooting
### Symptom: 401 or 403
Cause: missing or invalid token.
Fix: re-run `wikidata auth login` and confirm the token.

## Reference
- Usage: `docs/USAGE.md`.
- Config: `docs/CONFIG.md`.
