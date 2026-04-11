#!/usr/bin/env python3
"""Evaluate rollout freshness from an explicit inventory input."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


STALE_STATUSES = {"stale", "outdated", "failing", "failed"}


def _extract_repos(doc: Any) -> list[dict[str, Any]]:
    if isinstance(doc, list):
        return [item for item in doc if isinstance(item, dict)]
    if isinstance(doc, dict):
        repos = doc.get("repos")
        if isinstance(repos, list):
            return [item for item in repos if isinstance(item, dict)]
    return []


def _is_stale(repo: dict[str, Any]) -> bool:
    if bool(repo.get("stale", False)):
        return True
    status = str(repo.get("status", "")).strip().lower()
    return status in STALE_STATUSES


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", required=True, help="Path to repo inventory JSON.")
    parser.add_argument(
        "--recovery-slo-hours",
        type=int,
        default=24,
        help="SLO for stale repo recovery in hours.",
    )
    parser.add_argument("--out", required=True, help="Output report path.")
    args = parser.parse_args()

    inventory_path = Path(args.inventory).resolve()
    out_path = Path(args.out).resolve()

    inventory_doc = json.loads(inventory_path.read_text(encoding="utf-8"))
    repos = _extract_repos(inventory_doc)
    stale_repos = [repo for repo in repos if _is_stale(repo)]

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "inventory": str(inventory_path),
        "recovery_slo_hours": args.recovery_slo_hours,
        "repo_count": len(repos),
        "stale_count": len(stale_repos),
        "stale_repos": stale_repos,
        "pass": len(stale_repos) == 0,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
