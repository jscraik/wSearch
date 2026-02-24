# Instruction map

Use this file to understand which instructions apply first.

## Table of Contents
- [Priority order](#priority-order)
- [Repo facts](#repo-facts)
- [Linked docs](#linked-docs)

## Priority order
1. `/Users/jamiecraik/.codex/AGENTS.md`
2. `/Users/jamiecraik/dev/wsearch/AGENTS.md`
3. Files under `/Users/jamiecraik/dev/wsearch/docs/agents/`
4. Task-specific user instructions in the active chat

If two instructions conflict at the same priority level, stop and ask the user which one wins.

## Repo facts
- Runtime: Node.js 18+
- Package manager: npm
- Primary language: TypeScript
- Build command: `npm run build`
- Typecheck command: `npm run lint:types`
- Tests: `npm test`

## Linked docs
- Development workflow: `/Users/jamiecraik/dev/wsearch/docs/DEVELOPMENT.md`
- Contribution guide: `/Users/jamiecraik/dev/wsearch/CONTRIBUTING.md`
- Public docs index: `/Users/jamiecraik/dev/wsearch/docs/README.md`
