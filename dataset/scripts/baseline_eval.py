import json
import sys
from collections import Counter
from pathlib import Path

from openai import OpenAI

MODEL = "gpt-4o-mini"
NUM_EXAMPLES = 10


def run_baseline(eval_path: str, output_path: str):
    client = OpenAI()

    lines = Path(eval_path).read_text().strip().split("\n")
    examples = [json.loads(line) for line in lines[:NUM_EXAMPLES]]

    results = []
    correct = 0
    format_ok = 0
    valid_labels = {"Positive", "Negative", "Neutral"}

    print(f"Running baseline evaluation on {len(examples)} examples using {MODEL}...\n")

    for i, example in enumerate(examples):
        system_msg = example["messages"][0]
        user_msg = example["messages"][1]
        expected = example["messages"][2]["content"].strip()

        response = client.chat.completions.create(
            model=MODEL,
            messages=[system_msg, user_msg],
            temperature=0.0,
            max_tokens=50,
        )

        predicted = response.choices[0].message.content.strip()
        is_match = predicted == expected
        is_valid_format = predicted in valid_labels

        if is_match:
            correct += 1
        if is_valid_format:
            format_ok += 1

        result = {
            "index": i + 1,
            "input": user_msg["content"],
            "expected": expected,
            "predicted": predicted,
            "match": is_match,
            "valid_format": is_valid_format,
        }
        results.append(result)
        status = "MATCH" if is_match else "MISMATCH"
        print(f"  [{i+1}/{len(examples)}] Expected: {expected:8s} | Predicted: {predicted:8s} | {status}")

    accuracy = correct / len(examples)
    format_rate = format_ok / len(examples)

    predicted_labels = [r["predicted"] for r in results]
    expected_labels = [r["expected"] for r in results]
    pred_dist = dict(Counter(predicted_labels))
    expected_dist = dict(Counter(expected_labels))

    summary = {
        "model": MODEL,
        "num_examples": len(examples),
        "accuracy": accuracy,
        "format_compliance": format_rate,
        "correct": correct,
        "total": len(examples),
        "predicted_distribution": pred_dist,
        "expected_distribution": expected_dist,
        "results": results,
    }

    Path(output_path).write_text(json.dumps(summary, indent=2) + "\n")

    print(f"\nBaseline Results:")
    print(f"  Accuracy: {accuracy:.0%} ({correct}/{len(examples)})")
    print(f"  Format compliance: {format_rate:.0%} ({format_ok}/{len(examples)})")
    print(f"  Results saved to: {output_path}")


if __name__ == "__main__":
    eval_file = sys.argv[1] if len(sys.argv) > 1 else "data/eval.jsonl"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "results/baseline_results.json"
    run_baseline(eval_file, output_file)
