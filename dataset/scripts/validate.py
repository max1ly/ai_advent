from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

VALID_LABELS = {"Positive", "Negative", "Neutral"}
REQUIRED_ROLES = ["system", "user", "assistant"]


def validate_line(line_num: int, line: str) -> tuple[bool, str, str | None]:
    try:
        obj = json.loads(line)
    except json.JSONDecodeError as e:
        return False, f"Line {line_num}: Invalid JSON — {e}", None

    if "messages" not in obj:
        return False, f"Line {line_num}: Missing 'messages' key", None

    messages = obj["messages"]
    if not isinstance(messages, list) or len(messages) != 3:
        return False, f"Line {line_num}: 'messages' must be an array of exactly 3 objects", None

    for i, (msg, expected_role) in enumerate(zip(messages, REQUIRED_ROLES)):
        if not isinstance(msg, dict):
            return False, f"Line {line_num}: Message {i} is not an object", None
        if msg.get("role") != expected_role:
            return False, f"Line {line_num}: Message {i} role is '{msg.get('role')}', expected '{expected_role}'", None
        content = msg.get("content", "")
        if not isinstance(content, str) or not content.strip():
            return False, f"Line {line_num}: Message {i} has empty or missing content", None

    label = messages[2]["content"].strip()
    if label not in VALID_LABELS:
        return False, f"Line {line_num}: Invalid label '{label}', expected one of {VALID_LABELS}", None

    return True, f"Line {line_num}: OK", label


def validate_file(filepath: str) -> bool:
    path = Path(filepath)
    if not path.exists():
        print(f"ERROR: File not found: {filepath}")
        return False

    lines = path.read_text().strip().split("\n")
    total = len(lines)
    passed = 0
    failed = 0
    errors = []
    label_counts = Counter()

    for i, line in enumerate(lines, start=1):
        ok, msg, label = validate_line(i, line)
        if ok:
            passed += 1
            label_counts[label] += 1
        else:
            failed += 1
            errors.append(msg)

    print(f"\n{'=' * 50}")
    print(f"Validation Report: {filepath}")
    print(f"{'=' * 50}")
    print(f"Total examples: {total}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"\nClass distribution:")
    for label in sorted(label_counts):
        print(f"  {label}: {label_counts[label]}")

    if errors:
        print(f"\nErrors:")
        for err in errors:
            print(f"  {err}")

    print(f"\nResult: {'PASS' if failed == 0 else 'FAIL'}")
    return failed == 0


if __name__ == "__main__":
    filepath = sys.argv[1] if len(sys.argv) > 1 else "data/dataset_full.jsonl"
    success = validate_file(filepath)
    sys.exit(0 if success else 1)
