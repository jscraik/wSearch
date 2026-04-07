# wSearch CLI — Agent Mode Guide

**For AI coding agents using wsearch.**

This guide explains how to use wsearch effectively from AI agents, including the flexible "agent mode" designed specifically for automated tooling.

## Quick Reference

```bash
# Enable agent mode for detailed error help
wsearch --agent --network --user-agent "Agent/1.0" entity get Q42

# Recommended flags for automation
wsearch --agent --network --non-interactive --json \
  --user-agent "Agent/1.0" \
  --request-id "unique-id" \
  entity get Q42
```

## What is Agent Mode?

Agent mode (`--agent`) configures wsearch to be maximally helpful for AI agents:

1. **Detailed error messages** with context-aware examples
2. **Flexible input parsing** that accepts common variations
3. **Actionable fix hints** for every error type
4. **Consistent output** with `--json` for reliable parsing

## Why Use wsearch in Agent Mode?

| Without wsearch | With wsearch --agent |
|-----------------|----------------------|
| Craft curl commands with exact syntax | Intent-based command recognition |
| Parse inconsistent API responses | Schema-versioned JSON output |
| Handle rate limiting manually | Automatic retries with backoff |
| Debug auth issues from cryptic errors | Detailed error messages with examples |
| Guess at ID formats (Q42 vs q42) | Flexible format acceptance with guidance |

## Agent Mode Features

### 1. Flexible Entity ID Parsing

Accepts various formats, normalizes to standard:

```bash
# All of these work and return Q42
wsearch entity get Q42
wsearch entity get q42      # normalized to Q42
wsearch entity get q-42     # normalized to Q42
wsearch entity get q_42     # normalized to Q42
```

**Note**: When normalization occurs, the output includes a note explaining the correct format.

### 2. Intent-Based Command Recognition

Agent mode recognizes common shorthand patterns:

```bash
# These all work:
wsearch get Q42                    # → entity get Q42
wsearch statements Q42             # → entity statements Q42
wsearch search "Paris"             # → action search --query "Paris"
wsearch sparql query.rq            # → sparql query --file query.rq
```

### 3. Detailed Error Messages

When errors occur in agent mode, you get:

```
Error: Network access is disabled. Re-run with --network.

Likely intent: Query Wikidata API

Correct examples:
  $ wsearch --network --user-agent "MyApp/1.0" entity get Q42
    # Basic entity query (Always requires --network)
  $ wsearch --network --user-agent "MyApp/1.0" sparql query --file query.rq
    # SPARQL query (Network required for all API calls)

Fix: All API calls require --network flag (opt-in for safety). Also set --user-agent for Wikimedia APIs.

Agent note: When scripting, use --non-interactive and --json for reliable output parsing.
```

## Recommended Patterns

### Always Use These Flags

For reliable agent operation, always include:

```bash
wsearch \
  --agent \           # Enable agent mode for detailed errors
  --network \         # Required for all API calls
  --non-interactive \ # Never prompt for input
  --json \            # Machine-readable output
  --user-agent "YourAgent/1.0" \
  --request-id "$(uuidgen)"  # For tracing
```

### Entity Lookup Pattern

```bash
# Get entity with full error context
wsearch --agent --network --non-interactive --json \
  --user-agent "Agent/1.0" \
  entity get Q42

# Expected successful output:
{
  "schema": "wiki.entity.get.v1",
  "meta": { "tool": "wsearch", "version": "0.1.9", "timestamp": "..." },
  "summary": "Fetched Q42",
  "status": "success",
  "data": { ... },
  "errors": []
}
```

### Batch Processing Pattern

```bash
#!/bin/bash
set -euo pipefail

IDS=("Q42" "Q5" "Q30")

for id in "${IDS[@]}"; do
  wsearch --agent --network --non-interactive --json \
    --user-agent "BatchAgent/1.0" \
    --request-id "batch-$id-$(date +%s)" \
    entity get "$id" > "output/${id}.json" 2>"logs/${id}.log" || {
      echo "Failed on $id, continuing..."
    }
done
```

### Error Handling Pattern

```bash
# Capture both stdout and stderr
output=$(wsearch --agent --network --non-interactive --json \
  --user-agent "Agent/1.0" \
  entity get "$ID" 2>&1)

exit_code=$?

if [ $exit_code -eq 0 ]; then
  # Parse JSON success
  label=$(echo "$output" | jq -r '.data.labels.en.value')
else
  # In agent mode, stderr contains detailed help
  echo "Error details: $output"
  
  # Exit codes tell you what went wrong:
  # 0 = success
  # 1 = internal error (retry may help)
  # 2 = usage error (fix your command)
  # 3 = policy error (missing --network or --user-agent)
  # 130 = interrupted
fi
```

## Error Code Reference

| Code | Meaning | Agent Action |
|------|---------|--------------|
| 0 | Success | Parse JSON output |
| 1 | Internal error | Retry with backoff, check logs |
| 2 | Usage error | Read error message, fix command syntax |
| 3 | Policy error | Add --network and --user-agent |
| 130 | Interrupted | Handle Ctrl+C gracefully |

## Common Scenarios

### Missing Network Flag

```bash
# Wrong:
wsearch --user-agent "Agent/1.0" entity get Q42
# Error: Network access is disabled. Re-run with --network.

# Right:
wsearch --network --user-agent "Agent/1.0" entity get Q42
```

### Missing User-Agent

```bash
# Wrong:
wsearch --network entity get Q42
# Error: User-Agent is required. Provide --user-agent or WIKI_USER_AGENT.

# Right:
wsearch --network --user-agent "MyAgent/1.0" entity get Q42

# Better (set once):
wsearch config set user-agent "MyAgent/1.0"
wsearch --network entity get Q42  # Now works without --user-agent
```

### Invalid Entity ID

```bash
# Wrong:
wsearch --network --user-agent "Agent/1.0" entity get 42
# Error: Invalid entity id "42". Expected Q*, P*, or L* id format.

# Right:
wsearch --network --user-agent "Agent/1.0" entity get Q42
```

### Authentication Issues

```bash
# Check auth status first
wsearch auth status

# If no token stored:
wsearch auth login --token-file ./token.txt

# Then use auth flag (assumes user-agent configured)
wsearch --network --auth --user-agent "Agent/1.0" entity get Q42
```

## SPARQL Best Practices

### From File (Recommended)

```bash
# Store query in file
cat > query.rq << 'EOF'
SELECT ?item ?itemLabel WHERE {
  ?item wdt:P31 wd:Q5.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 10
EOF

# Run with agent mode
wsearch --agent --network --non-interactive --json \
  --user-agent "Agent/1.0" \
  sparql query --file query.rq --format json
```

### From Stdin

```bash
echo 'SELECT * WHERE { ?s ?p ?o } LIMIT 5' | \
  wsearch --agent --network --non-interactive --json \
    --user-agent "Agent/1.0" \
    sparql query
```

## Configuration for Agents

### One-Time Setup

```bash
# Set persistent defaults
wsearch config set user-agent "YourAgent/1.0"
wsearch config set timeout 30000

# Verify
wsearch doctor
```

### Environment Variables

For CI/CD or containerized agents:

```bash
export WIKI_USER_AGENT="YourAgent/1.0"
export WIKI_TOKEN="your-oauth-token"
export WIKI_PASSPHRASE="your-secure-passphrase"

# Login non-interactively
wsearch auth login

# Now run commands (no --user-agent needed if set in config)
wsearch --agent --network --non-interactive --json entity get Q42
```

## Debugging Tips

### Preview Mode

Before running batch operations, preview the request:

```bash
wsearch --print-request --user-agent "Agent/1.0" entity get Q42
# Shows: method, URL, headers (tokens redacted)
# No network call made
```

### Verbose Logging

```bash
# See detailed request/response info
wsearch --agent --network --verbose --json entity get Q42
```

### Doctor Command

```bash
# Check entire setup
wsearch doctor

# Example output:
# User-Agent configured: yes
# Encrypted token present: yes
# Credentials readable: yes
# Config path: /home/user/.config/wsearch-cli/config.json
```

## JSON Output Schema

All successful responses follow this structure:

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
  "errors": []
}
```

Error responses have the same structure with `status: "error"` and populated `errors` array.

## Security Considerations

1. **Never pass tokens as CLI arguments** — use `--token-file`, `--token-stdin`, or `--token-env`
2. **Network is opt-in** — must explicitly use `--network` for all API calls
3. **Tokens are encrypted at rest** — uses scrypt + AES-256-GCM
4. **Preview mode is safe** — `--print-request` never makes network calls

## Troubleshooting

### Command not found

```bash
# Check installation
which wsearch
npm list -g @brainwav/wsearch-cli

# If not found:
npm install -g @brainwav/wsearch-cli
```

### Permission denied on config

```bash
# Config directory must be writable
ls -la ~/.config/wsearch-cli/

# Fix permissions:
chmod 700 ~/.config/wsearch-cli/
chmod 600 ~/.config/wsearch-cli/credentials
```

### Rate limiting

```bash
# Automatic retry with exponential backoff is built-in
# To increase retries:
wsearch --network --retries 5 --retry-backoff 1000 entity get Q42
```

## Further Reading

- [USAGE.md](USAGE.md) — Complete command reference
- [CONFIG.md](CONFIG.md) — Configuration options
- [SECURITY.md](SECURITY.md) — Security best practices
- [README.md](../README.md) — Overview and quick start

---

**Agent Mode Tip**: Always use `--agent --json --non-interactive` together for the most reliable automation experience.
