import json
import random
import sys
from collections import defaultdict
from pathlib import Path

TRAIN_RATIO = 0.8
RANDOM_SEED = 42


def split_dataset(input_path: str, train_path: str, eval_path: str):
    lines = Path(input_path).read_text().strip().split("\n")

    by_class = defaultdict(list)
    for line in lines:
        obj = json.loads(line)
        label = obj["messages"][2]["content"].strip()
        by_class[label].append(line)

    random.seed(RANDOM_SEED)
    train_lines = []
    eval_lines = []

    for label, examples in sorted(by_class.items()):
        random.shuffle(examples)
        split_idx = int(len(examples) * TRAIN_RATIO)
        train_lines.extend(examples[:split_idx])
        eval_lines.extend(examples[split_idx:])

    random.shuffle(train_lines)
    random.shuffle(eval_lines)

    Path(train_path).write_text("\n".join(train_lines) + "\n")
    Path(eval_path).write_text("\n".join(eval_lines) + "\n")

    print(f"Split complete:")
    print(f"  Train: {len(train_lines)} examples -> {train_path}")
    print(f"  Eval:  {len(eval_lines)} examples -> {eval_path}")

    for split_name, split_lines in [("Train", train_lines), ("Eval", eval_lines)]:
        counts = defaultdict(int)
        for line in split_lines:
            label = json.loads(line)["messages"][2]["content"].strip()
            counts[label] += 1
        print(f"\n  {split_name} distribution:")
        for label in sorted(counts):
            print(f"    {label}: {counts[label]}")


if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else "data/dataset_full.jsonl"
    split_dataset(input_file, "data/train.jsonl", "data/eval.jsonl")
