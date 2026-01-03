# Report security issues in the brAInwav Wikidata CLI

This policy explains how to report security issues responsibly.

Last updated: 2026-01-03

## Table of contents
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Common tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)
- [Reference](#reference)

## Prerequisites
- Required: a GitHub account to submit a security advisory.

## Quickstart
### 1) Report a vulnerability
- Use GitHub Security Advisories for this repository or email jscraik@brainwav.io.

### 2) Verify
Expected outcome:
- A private advisory thread is created with maintainers.

## Common tasks
### Share reproduction steps
- What you get: a clear report that is easy to triage.
- Steps:
  1. Provide a minimal reproduction.
  2. Include Node.js version and OS.
  3. Describe impact and possible mitigation.

## Troubleshooting
### Symptom: you cannot access advisories
Cause: repo settings may restrict advisories.
Fix: contact jscraik@brainwav.io with details and a reproduction.

## Reference
- Dependency scanning: run `npm audit` and review `npm audit --json` output.
- Security scanning: `npm run semgrep` and `npm run gitleaks`.
