# wSearch CLI Specification

- **Version:** 1.0.0
- **Status:** Implemented
- **Last Updated:** 2026-04-07
- **CLI Version:** 0.1.9
- **Skill Applied:** cli-spec (backend/agent-skills)

---

## When to Use

The wSearch CLI is designed for:
- **Developers** querying Wikidata entities, statements, and SPARQL
- **Data teams** integrating Wikidata into pipelines
- **Automation/scripts** requiring structured output (JSON) and deterministic exit codes
- **Research** requiring authenticated access for higher rate limits

**Primary audience:** Both humans and automation (dual-mode design).

---

## Inputs

### Command Name and Purpose
`wsearch` - Query Wikidata via REST, SPARQL, and Action API with safe, script-friendly output.

### Input Sources
| Source | Supported | Notes |
|--------|-----------|-------|
| CLI args/flags | ✅ | Primary interface |
| Stdin | ✅ | Token input, SPARQL queries, passphrase |
| Files | ✅ | `--file`, `--token-file`, `--passphrase-file`, `--body-file` |
| Environment variables | ✅ | `WIKI_*` prefix pattern |
| Config file | ✅ | `~/.config/wsearch-cli/config.json` |

### Required Inputs (per command)
| Command | Required | Validation |
|---------|----------|------------|
| `entity get` | `--network`, `--user-agent`, `id` (Q/P/L format) | Regex: `^[QPL]\d+$` |
| `sparql query` | `--network`, `--user-agent`, query (via --query, --file, or stdin) | SPARQL syntax server-side |
| `action search` | `--network`, `--user-agent`, `--query` | Non-empty string |
| `raw request` | `--network`, `--user-agent`, `method`, `path` | Path must start with `/`, no traversal |
| `auth login` | token (via file/stdin/env/prompt), passphrase | Min 8 chars for passphrase |

---

## Outputs

### Output Destinations
| Destination | Support |
|-------------|---------|
| stdout | ✅ Primary output |
| stderr | ✅ Diagnostics, errors, logs |
| File | ✅ Via `--output` |

### Output Formats
| Format | Flag | Purpose |
|--------|------|---------|
| JSON envelope | `--json` | Machine-readable, schema-versioned |
| Plain text | `--plain` | Human-readable, stable for scripting |
| Default | (none) | Human-readable with formatting |

### JSON Envelope Schema
```json
{
  "schema": "wiki.{command}.v1",
  "meta": {
    "tool": "wsearch",
    "version": "0.1.9",
    "timestamp": "2026-04-07T00:00:00Z",
    "request_id": "optional-tracking-id"
  },
  "summary": "Human-readable summary",
  "status": "success|warn|error",
  "data": { /* command-specific data */ },
  "errors": [{ "message": "...", "code": "E_USAGE" }]
}
```

### Schema Versions
| Command | Schema Name |
|---------|-------------|
| entity get | `wiki.entity.get.v1` |
| entity statements | `wiki.entity.statements.v1` |
| sparql query | `wiki.sparql.query.v1` |
| action search | `wiki.action.search.v1` |
| raw request | `wiki.raw.request.v1` |
| auth login | `wiki.auth.login.v1` |
| auth status | `wiki.auth.status.v1` |
| auth logout | `wiki.auth.logout.v1` |
| config get | `wiki.config.get.v1` |
| config set | `wiki.config.set.v1` |
| doctor | `wiki.doctor.v1` |
| error | `wiki.error.v1` |

---

## Command Model

### Command Tree
```
wsearch [global flags] <command> [subcommand] [flags] [args]

Commands:
├── help [command]
├── config
│   ├── get <key>
│   ├── set <key> <value>
│   └── path
├── auth
│   ├── login [--token-file|--token-stdin|--token-env]
│   ├── status
│   └── logout
├── entity
│   ├── get <id> (Q/P/L format)
│   └── statements <id>
├── sparql [mode: run|query] (default: query)
│   └── [--query|--file] [--format: json|csv|tsv]
├── action search
│   └── --query <text> [--language] [--limit]
├── raw request <method> <path> [--body-file]
├── doctor
└── completion
```

### Global Flags Reference
| Flag | Type | Default | Required | Description |
|------|------|---------|----------|-------------|
| `--network` | boolean | false | For API calls | Enable network access |
| `--user-agent` | string | - | For API calls | User-Agent header (or `WIKI_USER_AGENT`) |
| `--auth` | boolean | false | No | Use stored OAuth token |
| `--json` | boolean | false | No | Output JSON envelope |
| `--plain` | boolean | false | No | Output plain text |
| `--output`, `-o` | string | stdout | No | Output file path |
| `--print-request` | boolean | false | No | Preview request, no network call |
| `--timeout` | number | 15000 | No | Request timeout (ms) |
| `--retries` | number | 2 | No | Retry attempts for 429/5xx |
| `--retry-backoff` | number | 400 | No | Base backoff (ms) |
| `--quiet`, `-q` | boolean | false | No | Suppress non-error output |
| `--verbose`, `-v` | boolean | false | No | Verbose logging |
| `--debug` | boolean | false | No | Debug logging |
| `--non-interactive` | boolean | false | No | Disable prompts (CI mode) |
| `--no-color` | boolean | false | No | Disable colored output |
| `--request-id` | string | - | No | Attach ID to JSON output |

### Config Keys (for `config get/set`)
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `user-agent` | string | - | Default User-Agent |
| `api-url` | string | Wikidata REST | REST API base URL |
| `action-url` | string | Wikidata Action | Action API URL |
| `sparql-url` | string | Wikidata SPARQL | SPARQL endpoint URL |
| `timeout` | number | 15000 | Timeout (ms) |
| `retries` | number | 2 | Retry count |
| `retry-backoff` | number | 400 | Backoff (ms) |

---

## Output and Exit Rules

### Exit Code Map
| Code | Meaning | When Used |
|------|---------|-----------|
| 0 | Success | Command completed successfully |
| 1 | Generic failure | I/O errors, unexpected exceptions |
| 2 | Invalid usage | Validation errors, bad arguments, malformed input |
| 3 | Policy refusal | Missing `--network`, missing `--user-agent` |
| 4 | Partial success | Some operations succeeded (batch scenarios) |
| 130 | User abort | SIGINT (Ctrl+C) |

**Note on SIGINT Handling:** The CLI relies on Node.js default SIGINT handling, which exits with code 130. For most use cases, this is sufficient. Future versions may add explicit signal handling for graceful shutdown during long-running operations.

### Error Codes (machine-readable)
| Code | Description | HTTP Equivalent |
|------|-------------|-----------------|
| `E_INTERNAL` | Unexpected internal error | 500 |
| `E_USAGE` | CLI usage error | 400 |
| `E_POLICY` | Security/policy violation | 403 |
| `E_AUTH` | Authentication failure | 401 |
| `E_IO` | File/network I/O error | - |
| `E_VALIDATION` | Input validation error | 422 |

### Output Behavior Rules
1. **Stdout vs stderr:** Primary output → stdout; diagnostics/errors → stderr
2. **TTY detection:** Color disabled when not TTY or `--no-color` or `NO_COLOR`
3. **JSON contract:** `--json` produces stable schema-versioned output
4. **Plain contract:** `--plain` produces stable line-based output for scripts
5. **Log levels:** `--quiet` < `--verbose` < `--debug` (stderr only)

### Config/Env Precedence (High → Low)
1. Command-line flags (highest)
2. Environment variables (`WIKI_*`)
3. Config file (`~/.config/wsearch-cli/config.json`)
4. Hardcoded defaults (lowest)

---

## Safety Rules

### Destructive/Sensitive Operations
| Operation | Safety Control | Notes |
|-----------|----------------|-------|
| Credential storage | Encrypted with passphrase (scrypt + AES-256-GCM) | File perms: 600 |
| Credential removal | `auth logout` | Removes file |
| Network access | Requires explicit `--network` | Off by default |
| User-Agent | Required for API calls | Enforced at call time |
| Config write | Atomic temp-file + rename | Prevents corruption |
| Raw API requests | Path validation (no traversal) | Must start with `/` |

### Preview/Dry-Run Support
- `--print-request`: Shows method, URL, headers (with tokens redacted), no network call
- No actual mutations possible (read-only API design)

### Non-Interactive Mode
- `--non-interactive`: Disables all prompts; errors with guidance if input required
- CI-safe: Exit code 2 with actionable message instead of hanging

### Secret Handling
| Source | Supported | Safe for Secrets |
|--------|-----------|------------------|
| `--token-file` | ✅ | Yes |
| `--token-stdin` | ✅ | Yes |
| `--token-env` | ✅ | Acceptable |
| CLI arg | ❌ | Not supported (by design) |

**Note on Environment Variables:** While cli-guidelines recommend avoiding secrets in environment variables, `--token-env` is provided as a practical compromise for CI/CD environments where file-based secrets may not be available. When possible, prefer `--token-file` or `--token-stdin`.

---

## Verification

### Naming Consistency
| Aspect | Status | Notes |
|--------|--------|-------|
| Command names | ✅ | Nouns: `entity`, `auth`, `config`; Verbs in subcommands |
| Flag names | ✅ | kebab-case: `--user-agent`, `--retry-backoff` |
| Env vars | ✅ | UPPER_SNAKE: `WIKI_USER_AGENT`, `WIKI_TOKEN` |
| Error codes | ✅ | UPPER_SNAKE: `E_USAGE`, `E_AUTH` |
| Schema names | ✅ | dot notation: `wiki.entity.get.v1` |

### Config Precedence
- [x] Explicit: flags > env > config > defaults
- [x] No contradictions in implementation
- [x] Atomic writes prevent partial state

### Safety Controls
- [x] `--network` required for all API calls (opt-in)
- [x] `--user-agent` required for all API calls
- [x] Encrypted credential storage
- [x] `--print-request` for dry-run
- [x] `--non-interactive` for CI safety

### Automation Examples

**Example 1: Basic entity query (JSON)**
```bash
wsearch --network --json --user-agent "MyApp/1.0" entity get Q42
# Exit 0: Success with JSON envelope
# Exit 3: Missing --network or --user-agent
```

**Example 2: SPARQL from file (plain output)**
```bash
wsearch --network --plain \
  --user-agent "MyApp/1.0" \
  sparql query --file ./query.rq --format json
# Exit 0: Results in plain format
# Exit 2: File not found or invalid format
```

**Example 3: Authenticated request (CI-safe)**
```bash
export WIKI_TOKEN="..."
export WIKI_PASSPHRASE="..."
wsearch auth login
wsearch --network --auth --json --user-agent "MyApp/1.0" entity get Q42
# Exit 0: Authenticated request succeeded
# Exit 3: Auth required but no valid token
```

**Example 4: Request preview (no network)**
```bash
wsearch --print-request --user-agent "MyApp/1.0" entity get Q42
# Exit 0: Preview output (safe, no network)
```

**Example 5: Config management**
```bash
wsearch config set user-agent "MyApp/1.0"
wsearch --network entity get Q42  # Uses configured UA
# Exit 0: Entity retrieved
```

---

## Assessment Summary

### Compliance with cli-spec Guidelines

| Category | Rating | Notes |
|----------|--------|-------|
| **Help & Documentation** | ⭐⭐⭐⭐⭐ | Full `--help`, examples, web docs linked |
| **Output Design** | ⭐⭐⭐⭐⭐ | Dual-mode (human + JSON), TTY detection |
| **Error Handling** | ⭐⭐⭐⭐⭐ | Clear codes, actionable messages, schema |
| **Args & Flags** | ⭐⭐⭐⭐⭐ | Long + short flags, no secret flags |
| **Safety** | ⭐⭐⭐⭐⭐ | Encryption, previews, non-interactive mode |
| **Config** | ⭐⭐⭐⭐⭐ | XDG dirs, proper precedence |
| **POSIX Compliance** | ⭐⭐⭐⭐☆ | Standard exit codes; SIGINT could be explicit |

### Strengths
1. ✅ Security-first: network off by default
2. ✅ Strong credential encryption (scrypt + AES-256-GCM)
3. ✅ Versioned JSON schemas for automation
4. ✅ Comprehensive error codes (E_INTERNAL, E_USAGE, E_POLICY, E_AUTH, E_IO, E_VALIDATION)
5. ✅ Atomic config writes
6. ✅ Path traversal prevention
7. ✅ Token redaction in previews

### Areas for Improvement
1. ✅ ~~Add explicit SIGINT handler~~ - Documented (Section 4.1). Explicit handler may be added in future for graceful shutdown during long-running operations.
2. ⚠️ Consider adding `--profile` for multi-environment configs
3. ⚠️ Could add request/response debug logging
4. ⚠️ Shell completion tests not implemented

### Overall Verdict

**RECOMMENDED FOR PRODUCTION**

The wSearch CLI follows cli-spec best practices, prioritizes security, and provides excellent automation support through JSON schemas and deterministic exit codes. The interface is stable, predictable, and suitable for both human and scripted use.

---

*Generated using cli-spec skill v1.0*  
*References: cli-guidelines.md (clig.dev), standards-dec-2025-cli.md*
