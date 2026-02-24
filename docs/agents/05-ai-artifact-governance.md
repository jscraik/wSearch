# AI artifact governance

This repository uses Model A AI artifact governance.

## Table of Contents
- [Required artifacts](#required-artifacts)
- [Locations](#locations)
- [PR expectations](#pr-expectations)

## Required artifacts
When creating a PR with AI assistance, create both files:
1. Prompt artifact (`.yaml`)
2. Session summary (`.json`)

## Locations
- Prompt: `/Users/jamiecraik/dev/wsearch/ai/prompts/YYYY-MM-DD-<slug>.yaml`
- Session: `/Users/jamiecraik/dev/wsearch/ai/sessions/YYYY-MM-DD-<slug>.json`
- Templates:
  - `/Users/jamiecraik/dev/wsearch/ai/prompts/.template.yaml`
  - `/Users/jamiecraik/dev/wsearch/ai/sessions/.template.json`

## PR expectations
- Reference exact artifact paths in the PR body.
- Do not paste prompt/session contents into the PR body.
- If artifacts cannot be created and committed, stop and report the block.
- See `/Users/jamiecraik/dev/wsearch/CLAUDE.md` for the current detailed policy text.
