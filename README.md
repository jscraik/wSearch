```
   ____                _                         __          __
  / __ )_______  ______(_)___  ____ _      ____ _/ /_  ____ _/ /_
 / __  / ___/ / / / __/ / __ \\/ __ \\ | /| / / __ `/ __ \\/ __ `/ __/
/ /_/ / /  / /_/ / /_/ / / / / /_/ / |/ |/ / /_/ / / / / /_/ / /_
/_____/_/   \\__,_/\\__/_/_/ /_/\\____/|__/|__/\\__,_/_/ /_/\\__,_/\\__/
```

[![npm](https://img.shields.io/npm/v/wikidata-cli?color=d97757)](https://www.npmjs.com/package/wikidata-cli)
[![ci](https://github.com/jscraik/wikidata-CLI/actions/workflows/ci.yml/badge.svg)](https://github.com/jscraik/wikidata-CLI/actions/workflows/ci.yml)
[![security](https://img.shields.io/badge/security-policy-6a9bcc)](SECURITY.md)
[![license](https://img.shields.io/badge/license-MIT-788c5d)](LICENSE)

# brAInwav Wikidata CLI helps developers query Wikidata safely and quickly

Safe, script-friendly CLI for Wikidata REST, SPARQL, and Action API queries. Read-only by default.

Last updated: 2026-01-03

## Table of contents
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

## Prerequisites
- Required: Node.js 18+, npm, internet access, and a descriptive User-Agent string for Wikimedia APIs.
- Optional: OAuth token for higher rate limits (still read-only).

## Quickstart
### 1) Install
```sh
npm install -g wikidata-cli
```

### 2) Run a query
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### 3) Verify
Expected output:
- JSON for the entity, or a JSON envelope when using `--json`.
- Exit code `0` on success.

## Common tasks
### Get an entity and save it to a file
- What you get: the entity JSON for a Q/P/L id.
- Steps:
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  entity get Q42 --output ./Q42.json
```
- Verify: `./Q42.json` contains the entity data.

### Run a SPARQL query from a file
- What you get: SPARQL results in JSON/CSV/TSV.
- Steps:
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  sparql query --file ./query.rq --format json
```
- Verify: result set printed to stdout.

### Search via the Action API
- What you get: entity search results by label.
- Steps:
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  action search --query "New York" --language en --limit 5
```
- Verify: results include matches with ids and labels.

### Use an encrypted token for requests
- What you get: authenticated requests using `Authorization: Bearer ...`.
- Steps:
```sh
cat token.txt | wikidata auth login --token-stdin
wikidata --network --auth --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```
- Verify: request succeeds; token is stored in `~/.config/wikidata-cli/credentials.json`.

## Troubleshooting
### Symptom: "User-Agent is required"
Cause: Wikimedia APIs require a descriptive User-Agent.
Fix:
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### Symptom: "Network access is disabled"
Cause: the CLI defaults to no network.
Fix:
```sh
wikidata --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### Symptom: 429 or rate-limit errors
Cause: API throttling.
Fix: retry after a short delay or lower request frequency.

## Reference
- Docs: `docs/GETTING_STARTED.md`, `docs/USAGE.md`, `docs/CONFIG.md`, `docs/TROUBLESHOOTING.md`, `docs/FAQ.md`.
- Changelog: `CHANGELOG.md` (Keep a Changelog).
- License: `LICENSE` (MIT).
- Brand guidelines: `docs/BRAND.md`.
- Commands:
  - `wikidata entity get|statements <id>`
  - `wikidata sparql query --file <query.rq>`
  - `wikidata action search --query <text>`
  - `wikidata raw request <method> <path>`
  - `wikidata auth login|status|logout`
  - `wikidata doctor`
