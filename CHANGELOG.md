# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

## [0.1.1] - 2026-01-03

### Added
- `--auth` flag to attach stored bearer token for read-only requests.
- `help` command, usage examples, and command recommendations.
- `--no-color` flag and clearer exit code documentation.

### Changed
- Improved error handling and policy exit codes.
- Updated test tooling to remove known vulnerabilities.

## [0.1.0] - 2026-01-03

### Added
- Initial CLI scaffold with REST entity reads, statements, SPARQL queries, and Action API search.
- Encrypted credential storage in XDG config.
- JSON envelope output mode and plain text output.
- Tests, build scripts, semgrep, and gitleaks commands.
