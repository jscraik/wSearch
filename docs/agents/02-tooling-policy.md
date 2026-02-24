# Tooling and command policy

Follow this policy before running commands.

## Table of Contents
- [Command shell](#command-shell)
- [Preferred tools](#preferred-tools)
- [Do not do](#do-not-do)

## Command shell
- Use `zsh -lc` for shell commands.
- Keep command output reads short (prefer targeted context).

## Preferred tools
- Search content: `rg`
- Find files: `fd` (or `rg --files`)
- Parse JSON: `jq`
- Validate npm scripts: `npm run`

## Do not do
- Do not use project-wide `grep`; use `rg`.
- Do not parallelize tasks or spawn subagents unless explicitly requested.
- Do not add dependencies or change system settings without user approval.
- Do not invent commands not present in repo docs or `package.json`.
