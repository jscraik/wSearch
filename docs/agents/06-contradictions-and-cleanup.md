# Contradictions and cleanup

Track conflicts and cleanup candidates here.

## Table of Contents
- [Contradictions](#contradictions)
- [Flags for deletion or merge](#flags-for-deletion-or-merge)

## Contradictions
1. Package manager conflict
   - Observed: incoming template text says "package manager: none".
   - Repo fact: `package.json` and docs use npm.
   - Resolution: confirmed. This repo remains npm-first.

2. Repository identity conflict
   - Observed: incoming template description targets the Codex config repo.
   - Repo fact: this repo is `@brainwav/wsearch-cli`.
   - Resolution: confirmed. wSearch-specific wording remains canonical.

## Flags for deletion or merge
- Candidate: duplicate AI-governance prose in multiple files.
  - Rationale: keep detailed policy in one place (`CLAUDE.md`) and link from AGENTS docs.
- Candidate: any future "misc" sections with mixed policy categories.
  - Rationale: split by single responsibility to keep instructions scannable.
