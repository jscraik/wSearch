#!/usr/bin/env python3
"""Render docs/agents/tooling.md from repo-local canonical sources."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import tomllib


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def read_toml(path: Path) -> dict:
    with path.open("rb") as f:
        return tomllib.load(f)


def render_markdown(
    repo_root: Path,
    requirements: dict,
    mise_doc: dict,
    env_doc: dict,
    requirements_path: Path,
    mise_path: Path,
    environment_path: Path,
) -> str:
    tool_entries = mise_doc.get("tools", {})
    action_entries = env_doc.get("actions", [])
    action_names = [str(action.get("name", "")).strip() for action in action_entries if action.get("name")]

    required_bins = [str(item) for item in requirements.get("required_bins", [])]
    required_actions = [str(item) for item in requirements.get("required_actions", [])]

    lines: list[str] = []
    lines.append("# Tooling Inventory")
    lines.append("")
    lines.append("## Table of Contents")
    lines.append("- [Canonical Sources](#canonical-sources)")
    lines.append("- [Required Mise Tools](#required-mise-tools)")
    lines.append("- [Required Binaries](#required-binaries)")
    lines.append("- [Required Codex Actions](#required-codex-actions)")
    lines.append("- [Regeneration](#regeneration)")
    lines.append("")
    lines.append("## Canonical Sources")
    lines.append(f"- `{requirements_path.relative_to(repo_root)}` defines `required_bins` and `required_actions`.")
    lines.append(f"- `{mise_path.relative_to(repo_root)}` defines required `[tools]` entries.")
    lines.append(f"- `{environment_path.relative_to(repo_root)}` defines available `[[actions]]` names.")
    lines.append("")
    lines.append("## Required Mise Tools")
    if tool_entries:
        for name, version in tool_entries.items():
            lines.append(f"- `{name}`: `{version}`")
    else:
        lines.append("- No entries found in `[tools]`.")
    lines.append("")
    lines.append("## Required Binaries")
    if required_bins:
        for entry in required_bins:
            lines.append(f"- `{entry}`")
    else:
        lines.append("- No `required_bins` configured.")
    lines.append("")
    lines.append("## Required Codex Actions")
    if required_actions:
        for action_name in required_actions:
            marker = "present" if action_name in action_names else "missing"
            lines.append(f"- `{action_name}` ({marker})")
    else:
        lines.append("- No `required_actions` configured.")
    lines.append("")
    lines.append("## Regeneration")
    lines.append("- Run `bash scripts/check-environment.sh --write-tooling-doc` to refresh this file.")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Render tooling inventory markdown.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--requirements", required=True)
    parser.add_argument("--mise", required=True)
    parser.add_argument("--environment", required=True)
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    requirements_path = Path(args.requirements).resolve()
    mise_path = Path(args.mise).resolve()
    environment_path = Path(args.environment).resolve()

    requirements = read_json(requirements_path)
    mise_doc = read_toml(mise_path)
    env_doc = read_toml(environment_path)

    print(
        render_markdown(
            repo_root=repo_root,
            requirements=requirements,
            mise_doc=mise_doc,
            env_doc=env_doc,
            requirements_path=requirements_path,
            mise_path=mise_path,
            environment_path=environment_path,
        ),
        end="",
    )


if __name__ == "__main__":
    main()
