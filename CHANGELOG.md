# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to Semantic Versioning.

Last updated: 2026-01-04

## Document requirements
- Audience: users and maintainers tracking release history.
- Scope: notable changes by release.
- Non-scope: detailed design docs or internal discussions.
- Owner: repository maintainers.
- Review cadence: every release.
- Required approvals: maintainers for public changes.



## Unreleased
(entries compiled from recent history)
### Added

- [2026-02-23] [853f2d3] chore: add per-repo release notes

### Changed

- [2026-02-23] [22d32e9] chore: sync changes
- [2026-02-23] [e207b31] chore(deps): bump github/codeql-action from 3 to 4 (#23)
- [2026-02-23] [d382ede] chore(deps): bump actions/checkout from 4 to 6 (#22)

### Fixed

## [0.2.0] - 2026-01-04

### Changed (0.2.0)
- **BREAKING**: Rebranded from "wikidata-cli" to "wiki-cli"
- CLI command changed from `wikidata` to `wiki`
- Package name changed from `wikidata-cli` to `wiki-cli`
- Environment variables renamed: `WIKIDATA_*` → `WIKI_*` (e.g., `WIKIDATA_TOKEN` → `WIKI_TOKEN`)
- Config directory changed: `~/.config/wikidata-cli/` → `~/.config/wiki-cli/`
- JSON envelope schemas renamed: `wikidata.*.v1` → `wiki.*.v1`
- All documentation and code examples updated

## [0.1.3] - 2026-01-03

### Added (0.1.3)
- Contributing guide, CI workflows, and Dependabot config.
- Security policy file, README badges, and FAQ.

## [0.1.2] - 2026-01-03

### Added (0.1.2)
- Full public brAInwav documentation set and ASCII header.
- Security contact email and brand documentation.

### Changed (0.1.2)
- Updated README for public developer onboarding.

## [0.1.1] - 2026-01-03

### Added (0.1.1)
- `--auth` flag to attach stored bearer token for read-only requests.
- `help` command, usage examples, and command recommendations.
- `--no-color` flag and clearer exit code documentation.

### Changed (0.1.1)
- Improved error handling and policy exit codes.
- Updated test tooling to remove known vulnerabilities.

## [0.1.0] - 2026-01-03

### Added (0.1.0)
- Initial CLI scaffold with REST entity reads, statements, SPARQL queries, and Action API search.
- Encrypted credential storage in XDG config.
- JSON envelope output mode and plain text output.
- Tests, build scripts, semgrep, and gitleaks commands.
