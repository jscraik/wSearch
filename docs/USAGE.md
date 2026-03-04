# Use the brAInwav wSearch CLI to query Wikidata end to end

This reference lists commands, flags, and examples for the public CLI.

Last updated: 2026-01-04

## Table of contents
- [Document requirements](#document-requirements)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Command reference](#command-reference)
- [Global flags](#global-flags)
- [Auth login options](#auth-login-options)
- [Exit codes](#exit-codes)
- [Risks and assumptions](#risks-and-assumptions)
- [Troubleshooting](#troubleshooting)

## Document requirements
- Audience: developers using the CLI in scripts or pipelines.
- Scope: CLI commands, flags, and output contracts.
- Non-scope: Wikidata schema design or write operations.
- Owner: repository maintainers.
- Review cadence: every release or at least quarterly.
- Required approvals: maintainers for public changes.

## Prerequisites
- Required: Node.js 18+, npm, internet access, and a User-Agent string.

## Quickstart
### 1) Run a basic query
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### 2) Verify
Expected output:
- JSON entity data printed to stdout.

## Common tasks
### Query an entity
- What you get: the entity JSON for Q/P/L ids.
- Steps:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```
- Verify: output includes `id` and `labels`.

### Fetch statements
- What you get: statements for the entity.
- Steps:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity statements Q42
```
- Verify: output includes statement arrays.

### Run SPARQL
- What you get: query results in JSON/CSV/TSV.
- Steps:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  sparql query --file ./query.rq --format json
```
- Verify: results include `head` and `results`.

### Search with the Action API
- What you get: entity search results.
- Steps:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  action search --query "New York" --language en --limit 5
```
- Verify: results include `id` and `label` fields.

### Raw REST request
- What you get: raw REST response for a path under the REST API base.
- Steps:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  raw request GET /entities/items/Q42
```
- Verify: response contains the entity data.

### Authenticate reads (optional)
- What you get: `Authorization: Bearer` header added.
- Steps:
```sh
cat token.txt | wsearch auth login --token-stdin
wsearch --network --auth --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```
- Non-interactive example:
```sh
export WIKI_TOKEN="your-token"
export WIKI_PASSPHRASE="your-passphrase"
wsearch auth login
```
- Custom env var names:
```sh
export MY_WIKI_TOKEN="your-token"
export MY_WIKI_PASSPHRASE="your-passphrase"
wsearch auth login --token-env MY_WIKI_TOKEN --passphrase-env MY_WIKI_PASSPHRASE
```

### Set a default User-Agent
- What you get: a persistent User-Agent without repeating flags.
- Steps:
```sh
wsearch config set user-agent "MyApp/1.0 (https://example.org/contact)"
```
- Verify:  `wsearch --network entity get Q42` works without `--user-agent`.

### Preview a request without sending it
- What you get: method, URL, headers (tokens redacted).
- Steps:
```sh
wsearch --print-request --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```
- Verify: output contains a preview and no network call is made.

## Command reference
- `wsearch help [command]`
- `wsearch entity get <id>`
- `wsearch entity statements <id>`
- `wsearch sparql query --file <query.rq> --format json|csv|tsv`
- `wsearch action search --query <text> [--language <lang>] [--limit <n>]`
- `wsearch raw request <method> <path> [--body-file <json>]`
- `wsearch auth login|status|logout`
- `wsearch config get|set|path`
- `wsearch doctor`
- `wsearch completion`

## Global flags
- `--network`: enable network access (required for any API call).
- `--user-agent`: required for Wikimedia APIs.
- `--auth`: use stored token for `Authorization: Bearer`.
- `--request-id <id>`: attach a request id to JSON output.
- `--print-request`: print request preview and exit.
- `--passphrase-file <file>`: read passphrase from file.
- `--passphrase-stdin`: read passphrase from stdin.
- `--passphrase-env <name>`: read passphrase from env var (name).
- `--json`: JSON envelope output.
- `--plain`: plain output for scripts.
- `-o, --output <file>`: write to file or `-` for stdout.
- `--timeout <ms>`: request timeout (default 15000).
- `--retries <n>`: retries for 429/5xx (default 2).
- `--retry-backoff <ms>`: base backoff in ms (default 400).
- `--quiet` / `--verbose` / `--debug`: logging levels.
- `--non-interactive`: disable prompts (non-interactive mode).
- `--no-color`: disable color.

## Auth login options
- `--token-file <file>`: read token from file.
- `--token-stdin`: read token from stdin.
- `--token-env <name>`: read token from env var (name).

## Exit codes
- `0` success
- `1` generic failure
- `2` invalid usage/validation
- `3` policy refusal (missing `--network` or `--user-agent`)
- `4` partial success
- `130` user abort

## Risks and assumptions
- Requests are read-only, but responses may still contain sensitive data.
- `--print-request` skips network calls; data is not fetched in preview mode.
- Raw requests require absolute paths and may expose more data than expected.
- `--output` overwrites existing files.

## Troubleshooting
### Symptom: "Path must start with '/'"
Cause: raw requests require an absolute path.
Fix:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  raw request GET /entities/items/Q42
```

### Symptom: "Passphrase input required"
Cause: encrypted token storage needs a passphrase.
Fix: provide `--passphrase-file`, `--passphrase-stdin`, or `--passphrase-env` (or set `WIKI_PASSPHRASE`).

### Symptom: "User-Agent is required"
Cause: User-Agent is missing.
Fix: add `--user-agent` or set `WIKI_USER_AGENT`.
