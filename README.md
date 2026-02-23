<div align="center">
  <img src="brand/wSearch-brand-logo.png" alt="wSearch CLI Logo" width="600"/>
</div>

[![npm](https://img.shields.io/npm/v/@brainwav/wsearch-cli?color=d97757)](https://www.npmjs.com/package/@brainwav/wsearch-cli)
[![ci](https://github.com/jscraik/wSearch-CLI/actions/workflows/ci.yml/badge.svg)](https://github.com/jscraik/wSearch-CLI/actions/workflows/ci.yml)
[![security](https://img.shields.io/badge/security-policy-6a9bcc)](SECURITY.md)
[![license](https://img.shields.io/badge/license-MIT-788c5d)](LICENSE)

# brAInwav wSearch helps developers query Wikidata safely and quickly

Safe, script-friendly CLI for Wikidata REST, SPARQL, and Action API queries. Read-only by default.

Last updated: 2026-01-04

## Table of contents
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Risks and assumptions](#risks-and-assumptions)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)
- [About this document](#about-this-document)

## Prerequisites
- **Required**: Node.js 18 or later, npm, internet access, and a descriptive User-Agent string for Wikimedia APIs
- **Optional**: OAuth token for higher rate limits (still read-only access)

## Quickstart

**What you'll achieve**: Install the CLI and run your first Wikidata query in under 2 minutes.

### 1) Install
```sh
npm install -g @brainwav/wsearch-cli
```

### 2) Run a query
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### 3) Verify
Expected output:
- JSON containing entity data with fields: `id`, `labels`, `descriptions`, `aliases`, and `sitelinks`
- Exit code `0` on success
- No error messages about User-Agent or network access

## Common tasks
### Get an entity and save it to a file
**What you get**: The complete entity JSON for any Q/P/L identifier saved to a local file.

**Steps**:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  entity get Q42 --output ./Q42.json
```

**Verify**:
- File `./Q42.json` exists and contains entity data
- File includes `id`, `labels`, `descriptions`, and `claims` fields
- File size is greater than 0 bytes

### Run a SPARQL query from a file
**What you get**: SPARQL query results in JSON, CSV, or TSV format.

**Steps**:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  sparql query --file ./query.rq --format json
```

**Verify**:
- Results printed to stdout with `head` and `results` fields
- Exit code `0` indicates successful query execution

### Search via the Action API
**What you get**: Entity search results matching your query, with IDs and labels.

**Steps**:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" \
  action search --query "New York" --language en --limit 5
```

**Verify**:
- Results include entity IDs (e.g., Q60 for New York City)
- Each result contains `id`, `label`, and `description` fields
- Number of results matches your `--limit` value or fewer

### Use an encrypted token for requests
**What you get**: Authenticated requests using `Authorization: Bearer ...` header with encrypted token storage.

**Steps**:
```sh
cat token.txt | wsearch auth login --token-stdin
wsearch --network --auth --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

**Non-interactive (CI-friendly) example**:
```sh
export WIKI_TOKEN="your-token"
export WIKI_PASSPHRASE="your-passphrase"
wsearch auth login
```

**Custom env var names**:
```sh
export MY_WIKI_TOKEN="your-token"
export MY_WIKI_PASSPHRASE="your-passphrase"
wsearch auth login --token-env MY_WIKI_TOKEN --passphrase-env MY_WIKI_PASSPHRASE
```

**Verify**:
- Command `wsearch auth status` shows "Logged in"
- Token stored in `~/.config/wsearch-cli/credentials.json`
- Authenticated requests succeed without errors

### Set a default User-Agent
**What you get**: A persistent User-Agent configuration, eliminating the need to specify `--user-agent` on every command.

**Steps**:
```sh
wsearch config set user-agent "MyApp/1.0 (https://example.org/contact)"
wsearch --network entity get Q42
```

**Verify**:
- Command `wsearch config get user-agent` returns your configured value
- Requests succeed without the `--user-agent` flag

### Preview a request without sending it
**What you get**: A preview of the HTTP method, URL, and headers (with tokens redacted) without making an actual network call.

**Steps**:
```sh
wsearch --print-request --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

**Verify**:
- Output shows request method (GET/POST), full URL, and headers
- No actual API call is made (check with network monitoring)
- Sensitive values like tokens are redacted in output

### Check local setup
**What you get**: A quick diagnostic view of your configuration state without making any network requests.

**Steps**:
```sh
wsearch doctor
```

**Verify**:
- Output reports User-Agent configuration status
- Output shows whether authentication token is present
- Output indicates config file location
- Exit code `0` indicates no critical issues

## Risks and assumptions

**Network access**: The CLI requires internet connectivity for API calls. Network access is disabled by default and must be explicitly enabled with `--network`.

**User-Agent requirement**: Wikimedia APIs require a descriptive User-Agent header. Missing or empty values will block requests.

**Token storage**: Authentication tokens are encrypted and stored on disk. Protect your passphrase and avoid sharing logs containing sensitive data.

**Read-only operations**: The CLI provides read-only access to Wikidata. It does not mutate data, but API responses may contain sensitive information.

**File overwrites**: Output files are overwritten if the path already exists. Choose file paths carefully to avoid data loss.

## Troubleshooting

### Symptom: "User-Agent is required"
**Cause**: Wikimedia APIs require a descriptive User-Agent header for all requests.

**Fix**:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

Or set it permanently:
```sh
wsearch config set user-agent "MyApp/1.0 (https://example.org/contact)"
```

### Symptom: "Network access is disabled"
**Cause**: The CLI defaults to no-network mode for safety.

**Fix**:
```sh
wsearch --network --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### Symptom: 429 or rate-limit errors
**Cause**: API throttling due to too many requests in a short time period.

**Fix**:
- Wait 60 seconds before retrying
- Reduce request frequency in your scripts
- Consider using authentication for higher rate limits:
```sh
wsearch auth login
wsearch --network --auth --user-agent "MyApp/1.0 (https://example.org/contact)" entity get Q42
```

### Symptom: "Invalid token" or authentication failed
**Cause**: Token is expired, malformed, or passphrase is incorrect.

**Fix**:
```sh
# Log out and log back in with a fresh token
wsearch auth logout
cat new-token.txt | wsearch auth login --token-stdin
wsearch auth status  # Verify login succeeded
```

## Reference

### Documentation
- [Docs index](docs/README.md)
- [Getting started guide](docs/GETTING_STARTED.md)
- [Usage reference](docs/USAGE.md)
- [Configuration guide](docs/CONFIG.md)
- [Troubleshooting guide](docs/TROUBLESHOOTING.md)
- [FAQ](docs/FAQ.md)
- [Changelog](CHANGELOG.md) (Keep a Changelog format)
- [License](LICENSE) (MIT)
- [Brand guidelines](docs/BRAND.md)

### Commands
- `wsearch help [command]` - Show help for any command
- `wsearch entity get|statements <id>` - Fetch entity data or statements
- `wsearch sparql query --file <query.rq>` - Run SPARQL queries
- `wsearch action search --query <text>` - Search entities by label
- `wsearch raw request <method> <path>` - Make raw API requests
- `wsearch auth login|status|logout` - Manage authentication tokens
- `wsearch config get|set|path` - Manage configuration
- `wsearch doctor` - Check local setup and configuration
- `wsearch completion` - Generate shell completion scripts

## About this document
- **Audience**: Developers and data teams using the CLI (beginner to intermediate)
- **Scope**: Install, configure, and run read-only Wikidata queries with the CLI
- **Non-scope**: Wikidata data modeling, write operations, or hosting a Wikibase instance
- **Owner**: Repository maintainers
- **Review cadence**: Every release or at least quarterly
- **Required approvals**: Maintainers for public changes

---

<img
  src="./brand/brand-mark.webp"
  srcset="./brand/brand-mark.webp 1x, ./brand/brand-mark@2x.webp 2x"
  alt="brAInwav"
  height="28"
  align="left"
/>

<br clear="left" />

**brAInwav**  
_from demo to duty_
