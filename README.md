# wSearch CLI

[![npm](https://img.shields.io/npm/v/@brainwav/wsearch-cli?color=d97757)](https://www.npmjs.com/package/@brainwav/wsearch-cli)
[![ci](https://github.com/jscraik/wSearch-CLI/actions/workflows/ci.yml/badge.svg)](https://github.com/jscraik/wSearch-CLI/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-Apache%202.0-788c5d)](LICENSE)

**Query Wikidata safely from the command line.** Built for automation, designed for humans.

```bash
# Get an entity
wsearch --network --user-agent "MyApp/1.0" entity get Q42

# Run SPARQL with CSV output for spreadsheets
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format csv

# Preview before you run
wsearch --print-request entity get Q42
```

## Why wSearch?

| Without wSearch | With wSearch |
|-----------------|--------------|
| Craft curl commands by hand | Purpose-built Wikidata commands |
| Handle auth tokens insecurely | Encrypted storage (scrypt + AES-256-GCM) |
| Parse inconsistent JSON | Schema-versioned output you can rely on |
| Retry logic? You build it | Automatic retries with exponential backoff |
| Guess if commands work | Preview mode shows exactly what will be sent |
| Confusing errors for AI agents | **Agent mode** with detailed, actionable help |

**Read-only by default.** Network disabled until you explicitly enable it. No accidental data changes.

## Install

```bash
npm install -g @brainwav/wsearch-cli
```

Requires Node.js 18+.

## Quick Start

```bash
# 1. Query an entity (items, properties, lexemes)
wsearch --network --user-agent "MyApp/1.0 (https://example.com)" entity get Q42

# 2. Run SPARQL from a file
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format json

# 3. Search by name
wsearch --network --user-agent "MyApp/1.0" action search --query "Paris" --limit 5
```

API commands require `--network` (opt-in for safety) and `--user-agent` (Wikimedia API requirement).

## Core Commands

```bash
# Entities: get data or statements for any Q/P/L ID
wsearch --network --user-agent "MyApp/1.0" entity get Q42
wsearch --network --user-agent "MyApp/1.0" entity get P31
wsearch --network --user-agent "MyApp/1.0" entity statements Q42

# SPARQL: query with multiple output formats
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format json
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format csv
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format tsv

# Search: find entities by name
wsearch --network --user-agent "MyApp/1.0" action search --query "New York" --language en --limit 10

# Raw requests: full API access when you need it
wsearch --network --user-agent "MyApp/1.0" raw request GET /entities/items/Q42

# Configuration: set defaults so flags are optional
wsearch config set user-agent "MyApp/1.0"
wsearch config set timeout 30000
wsearch config get user-agent

# Authentication: encrypted token storage
wsearch auth login                        # Store token securely
wsearch --network --auth entity get Q42   # Use stored token
wsearch auth logout                       # Remove stored token

# Diagnostics
wsearch doctor                            # Check your setup
wsearch --print-request entity get Q42    # Preview without sending
```

## Output Formats

**Default** — Human-readable, colored when TTY detected  
**`--json`** — Machine-readable envelope with schema versioning  
**`--plain`** — Stable text output for scripts

```bash
# JSON: structured, schema-versioned, ideal for automation
wsearch --network --user-agent "MyApp/1.0" --json entity get Q42 | jq .data.labels.en.value

# Plain: pipe-friendly, predictable
wsearch --network --user-agent "MyApp/1.0" --plain entity get Q42 | grep -o Q[0-9]*
```

JSON output includes:
- Schema version (e.g., `wiki.entity.get.v1`)
- Request ID tracking
- Structured errors with codes
- Timestamp and tool version

## Security Features

| Feature | What it does |
|---------|--------------|
| **Network opt-in** | `--network` required for all API calls; disabled by default |
| **Encrypted tokens** | scrypt + AES-256-GCM with 0o600 file permissions |
| **Path traversal prevention** | Raw requests validated; no .. or encoded separators allowed |
| **Token redaction** | Authorization headers redacted in logs and previews |
| **No secrets in args** | Tokens only via files, stdin, or env vars—never CLI args |

## Exit Codes for Automation

| Code | Meaning | When you will see it |
|------|---------|-------------------|
| 0 | Success | Command completed |
| 1 | Internal error | Unexpected failure, I/O error |
| 2 | Usage error | Invalid arguments or validation failure |
| 3 | Policy error | Missing `--network` or `--user-agent` |
| 130 | Interrupted | User pressed Ctrl+C |

Use `--non-interactive` in scripts to ensure commands never hang on prompts.

## Configuration Hierarchy

Settings are resolved in this order (first wins):

1. CLI flags (e.g., `--timeout 5000`)
2. Environment variables (e.g., `WIKI_TIMEOUT=5000`)
3. Config file (`~/.config/wsearch-cli/config.json`)
4. Defaults

```bash
# Environment variables for CI/CD
export WIKI_USER_AGENT="MyApp/1.0"
export WIKI_TOKEN="..."
export WIKI_PASSPHRASE="..."
wsearch auth login
wsearch --network --auth entity get Q42
```

## Practical Examples

### Save entity to file
```bash
wsearch --network --user-agent "MyApp/1.0" entity get Q42 --output Q42.json
```

### SPARQL to CSV for Excel
```bash
wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq --format csv > results.csv
```

### Batch process in a script
```bash
#!/bin/bash
set -euo pipefail

for id in Q42 Q5 Q30; do
  wsearch --network --json --non-interactive \
    --user-agent "Batch/1.0" \
    --request-id "batch-$id" \
    entity get "$id" > "entities/${id}.json"
done
```

### Preview before automation
```bash
wsearch --print-request --user-agent "Test/1.0" entity get Q42
# Shows: method, URL, headers (tokens redacted)
# No network call made
```

## AI Agent Mode

Designed for AI coding agents that need reliable automation:

```bash
# Agent mode provides detailed error help with examples
wsearch --agent --network --non-interactive --json \
  --user-agent "Agent/1.0" \
  entity get Q42
```

**Agent mode features:**
- **Flexible parsing**: `wsearch get q42` → normalized to `entity get Q42` (when combined with full command: `wsearch --agent --network --user-agent "Agent/1.0" get q42`)
- **Detailed errors**: Every error includes context, examples, and fix hints
- **Intent recognition**: Understands common shorthand patterns
- **Consistent JSON**: Schema-versioned output for reliable parsing

See [docs/AGENTS.md](docs/AGENTS.md) for complete agent integration guide.

## Documentation

- [Usage reference](docs/USAGE.md) — Complete command and flag documentation
- [Configuration](docs/CONFIG.md) — Config file, environment variables, precedence
- [Security](docs/SECURITY.md) — Token encryption, permissions, best practices
- [Troubleshooting](docs/TROUBLESHOOTING.md) — Common issues and fixes
- [AI Agent Guide](docs/AGENTS.md) — Using wsearch from AI agents

## License

Apache 2.0 — See [LICENSE](LICENSE)

---

**brAInwav** — _from demo to duty_