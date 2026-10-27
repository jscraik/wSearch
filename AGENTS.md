# wSearch Agent Guide


<!-- AGENT-FIRST-SCAFFOLD:START -->
## Agent-First Scaffold Contract (managed by ~/.codex)

Use this route only when the user or an applicable repository contract explicitly
selects plan-graph orchestration. Ordinary edits use the task's scoped instructions
and relevant repository checks.

For the selected route, read the canonical
[scaffold specification](/Users/jamiecraik/dev/configs/codex/instructions/agent-first-scaffold-spec.md).
Preserve its plan graph contract and validate changed plan files with:

```bash
python3 /Users/jamiecraik/dev/configs/codex/scripts/plan-graph-lint.py <plan-file>
```

Use this repository's verification commands for project validation. The Configs
verification wrapper validates its own repository and does not replace local checks.
<!-- AGENT-FIRST-SCAFFOLD:END -->
