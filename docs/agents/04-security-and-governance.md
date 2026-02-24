# Security and governance

Security and governance rules for coding-agent work in this repository.

## Table of Contents
- [Security checks](#security-checks)
- [Data handling](#data-handling)
- [Change scope](#change-scope)

## Security checks
- Run Semgrep: `npm run semgrep`
- Run Gitleaks: `npm run gitleaks`
- Follow repository security guidance in `/Users/jamiecraik/dev/wsearch/SECURITY.md`

## Data handling
- Redact secrets, tokens, and private endpoints in outputs.
- Do not pass secrets via CLI flags when safer stdin/file options exist.
- Keep token handling aligned with CLI auth docs and existing commands.

## Change scope
- Prefer small, reviewable edits.
- Remove redundant instructions before adding new ones.
- Do not add compatibility shims unless explicitly requested.
