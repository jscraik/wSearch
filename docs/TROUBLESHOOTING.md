# Fix common brAInwav wSearch CLI issues quickly

This guide lists the most common errors and how to fix them.

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
- Audience: developers who hit errors while using the CLI.
- Scope: common failure modes and recovery steps.
- Non-scope: debugging the Wikidata services themselves.
- Owner: repository maintainers.
- Review cadence: every release or at least quarterly.
- Required approvals: maintainers for public changes.

## Prerequisites
- Required: Node.js 22.12.0 or newer, npm.

## Quickstart
### 1) Confirm the CLI is installed
```sh
wsearch --version
```

### 2) Verify network and User-Agent
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### 3) Verify
Expected output:
- JSON entity data or a helpful error.

## Common tasks
### Capture errors for debugging
- What you get: detailed diagnostics in stderr.
- Steps:
```sh
wsearch --network --debug --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```
- Verify: stderr includes debug output.

## Risks and assumptions
- Network calls may fail due to upstream rate limits; retry with backoff.
- Token and User-Agent issues cause hard failures until corrected.

## Troubleshooting
### Symptom: "Network access is disabled"
Cause: the CLI defaults to no network.
Fix: add `--network` to any API request.

### Symptom: "User-Agent is required"
Cause: missing or empty User-Agent.
Fix: add `--user-agent` or set `WIKI_USER_AGENT`.

### Symptom: 429 rate limit or 5xx responses
Cause: server throttling or temporary outage.
Fix: retry with backoff or wait before re-running.

### Symptom: "Passphrase input required"
Cause: encrypted token entry needs a passphrase.
Fix: provide `--passphrase-file`, `--passphrase-stdin`, or `--passphrase-env` (or set `WIKI_PASSPHRASE`).

### Symptom: "Failed to read config file"
Cause: malformed JSON in `~/.config/wsearch-cli/config.json`.
Fix: fix the JSON or delete the file and retry.

## Reference
- Usage: `docs/USAGE.md`.
- Config: `docs/CONFIG.md`.
- Start here: `docs/GETTING_STARTED.md`.
