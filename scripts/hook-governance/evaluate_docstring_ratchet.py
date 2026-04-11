#!/usr/bin/env python3
"""Evaluate docstring ratchet from explicit classification and metrics inputs."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _to_float(value: Any, *, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _classification_count(doc: Any) -> int:
    if isinstance(doc, dict):
        if isinstance(doc.get("apis"), list):
            return len(doc["apis"])
        if isinstance(doc.get("public_api"), list):
            return len(doc["public_api"])
    if isinstance(doc, list):
        return len(doc)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--classification", required=True, help="Path to public API classification JSON.")
    parser.add_argument("--metrics", required=True, help="Path to docstring metrics JSON.")
    parser.add_argument("--window-days", type=int, default=14, help="Evaluation window in days.")
    parser.add_argument("--out", required=True, help="Output report path.")
    args = parser.parse_args()

    classification_path = Path(args.classification).resolve()
    metrics_path = Path(args.metrics).resolve()
    out_path = Path(args.out).resolve()

    try:
        classification_doc = _read_json(classification_path)
    except FileNotFoundError as e:
        print(f"Error: Classification file not found: {classification_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in classification file: {classification_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Failed to read classification file: {classification_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1

    try:
        metrics_doc = _read_json(metrics_path)
    except FileNotFoundError as e:
        print(f"Error: Metrics file not found: {metrics_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in metrics file: {metrics_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: Failed to read metrics file: {metrics_path}", file=sys.stderr)
        print(f"  Original error: {e}", file=sys.stderr)
        return 1

    baseline = _to_float(metrics_doc.get("baseline_coverage"), default=0.0)
    current = _to_float(metrics_doc.get("current_coverage"), default=0.0)
    delta = current - baseline
    # Use epsilon tolerance to handle floating-point precision issues near boundaries
    eps = 1e-9
    passing = delta >= -eps

    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "classification": str(classification_path),
        "metrics": str(metrics_path),
        "window_days": args.window_days,
        "public_api_count": _classification_count(classification_doc),
        "baseline_coverage": baseline,
        "current_coverage": current,
        "coverage_delta": delta,
        "pass": passing,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return 0 if passing else 1


if __name__ == "__main__":
    raise SystemExit(main())