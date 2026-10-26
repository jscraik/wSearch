# Configure the brAInwav wSearch CLI safely

This guide explains environment variables, local config, and encrypted credentials.
Use it for repeatable CLI runs. It helps you avoid retyping flags.
Start with the quickstart if you are new.
Use config for repeat runs. Keep secrets out of files.
Avoid printing tokens in logs or shell history.

Last updated: 2026-01-04

## Table of contents
- [Document requirements](#document-requirements)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Reference](#reference)
- [Risks and assumptions](#risks-and-assumptions)
- [Troubleshooting](#troubleshooting)

## Document requirements
- Audience: developers configuring the CLI for repeatable usage.
- Scope: config file, environment variables, and encrypted credentials.
- Non-scope: command usage details or Wikidata schema guidance.
- Owner: repository maintainers.
- Review cadence: every release or at least quarterly.
- Required approvals: maintainers for public changes.

## Prerequisites
- Required: Node.js 22.12.0 or newer, npm.
- Optional: an OAuth token (file/env) if you want authenticated reads.

## Quickstart
### 1) Set a User-Agent
```sh
export WIKI_USER_AGENT="MyApp/1.0 (https://example.org/contact)"
```

### 2) Run a query
```sh
wsearch --network entity get Q42
```

### 3) Verify
Expected output:
- JSON entity data printed to stdout.

## Common tasks
### Set a default User-Agent
- What you get: a persistent User-Agent for all commands.
- Steps:
```sh
wsearch config set user-agent "MyApp/1.0 (https://example.org/contact)"
```
- Verify:  `wsearch --network entity get Q42` works without `--user-agent`.

### Locate the config file
- Steps:
```sh
wsearch config path
```

### Store an encrypted token
- What you get: encrypted credentials in the XDG config directory.
- Steps:
```sh
cat token.txt | wsearch auth login --token-stdin
```
- Non-interactive example:
```sh
export WIKI_TOKEN="your-token"
export WIKI_PASSPHRASE="your-passphrase"
wsearch auth login
```
- Verify: `~/.config/wsearch-cli/credentials.json` exists and is not plaintext.

### Change endpoints
- What you get: custom API endpoints for other Wikibase instances.
- Steps:
```sh
wsearch --network --api-url https://www.wikidata.org/w/rest.php/wikibase/v1 \
  --action-url https://www.wikidata.org/w/api.php \
  --sparql-url https://query.wikidata.org/sparql \
  entity get Q42
```
- Verify: requests go to the specified endpoints.

## Reference
### Environment variables
- `WIKI_USER_AGENT`: required User-Agent string.
- `WIKI_TOKEN`: token source for  `wsearch auth login`.
- `WIKI_PASSPHRASE`: passphrase source for encrypted token storage.
- `WIKI_API_URL`: REST API base URL.
- `WIKI_ACTION_URL`: Action API URL.
- `WIKI_SPARQL_URL`: SPARQL endpoint URL.
- `WIKI_TIMEOUT`: request timeout in ms.
- `WIKI_RETRIES`: retry count for 429/5xx.
- `WIKI_RETRY_BACKOFF`: base backoff in ms.

### Config keys (for  `wsearch config set|get`)
Use `none` to unset a value.
- `user-agent`
- `api-url`
- `action-url`
- `sparql-url`
- `timeout`
- `retries`
- `retry-backoff`

### Precedence
Flags > Environment > Config file > Defaults.

### Local config paths
- Config dir: `~/.config/wsearch-cli/`
- Config file: `~/.config/wsearch-cli/config.json`
- Credentials: `~/.config/wsearch-cli/credentials.json` (AES-256-GCM + scrypt).

## Risks and assumptions
- Config and credential files are stored locally. Protect filesystem permissions.
- Credential encryption depends on the passphrase. Treat it like a secret.
- Endpoint overrides are powerful. Verify you trust the target Wikibase.

## Troubleshooting
### Symptom: "Passphrase input required"
Cause: encrypted token storage needs a passphrase.
Fix: provide `--passphrase-file`, `--passphrase-stdin`, or `--passphrase-env` (or set `WIKI_PASSPHRASE`).

### Symptom: "No stored token found"
Cause: `--auth` was used before `auth login`.
Fix:
```sh
wsearch auth login --token-stdin < token.txt
```

### Symptom: "User-Agent is required"
Cause: missing User-Agent.
Fix: set `WIKI_USER_AGENT` or pass `--user-agent`.
