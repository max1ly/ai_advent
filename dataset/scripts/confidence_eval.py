import json
import sys
import time
from collections import Counter
from pathlib import Path

from openai import OpenAI

MODEL = "gpt-4o-mini"
VALID_LABELS = {"Positive", "Negative", "Neutral"}
SYSTEM_PROMPT = "Classify the sentiment of the following Reddit comment as exactly one of: Positive, Negative, or Neutral."


def classify(client, text, temperature=0.0):
    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=temperature,
        max_tokens=50,
    )
    return response.choices[0].message.content.strip()


def self_check(client, text):
    t0 = time.time()
    label = classify(client, text)
    verify_response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are a sentiment classification verifier."},
            {"role": "user", "content": (
                f"A sentiment classifier labeled the following Reddit comment as \"{label}\".\n\n"
                f"Comment: \"{text}\"\n\n"
                f"Is \"{label}\" the correct sentiment? Respond with exactly AGREE or DISAGREE "
                f"on the first line, then a one-sentence rationale on the second line."
            )},
        ],
        temperature=0.0,
        max_tokens=100,
    )
    verification = verify_response.choices[0].message.content.strip()
    first_line = verification.split("\n")[0].strip().upper()
    agreed = "AGREE" in first_line and "DISAGREE" not in first_line
    status = "OK" if agreed else "UNSURE"
    latency = time.time() - t0
    return label, status, {"rationale": verification, "api_calls": 2, "latency": latency}


def redundancy_check(client, text):
    t0 = time.time()
    labels = []
    for _ in range(3):
        label = classify(client, text, temperature=0.7)
        labels.append(label)
    counts = Counter(labels)
    most_common_label, most_common_count = counts.most_common(1)[0]
    if most_common_count == 3:
        status = "OK"
    elif most_common_count == 2:
        status = "UNSURE"
    else:
        status = "FAIL"
    latency = time.time() - t0
    return most_common_label, status, {"runs": labels, "api_calls": 3, "latency": latency}


def constraint_check(client, text):
    t0 = time.time()
    label = classify(client, text)
    api_calls = 1
    retried = False
    if label not in VALID_LABELS:
        retried = True
        label = client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT + " You MUST respond with exactly one word: Positive, Negative, or Neutral. No other text."},
                {"role": "user", "content": text},
            ],
            temperature=0.0,
            max_tokens=10,
        ).choices[0].message.content.strip()
        api_calls = 2
    if label not in VALID_LABELS:
        status = "FAIL"
    else:
        status = "OK"
    latency = time.time() - t0
    return label, status, {"retried": retried, "api_calls": api_calls, "latency": latency}


def combined_status(statuses):
    if "FAIL" in statuses:
        return "FAIL"
    if "UNSURE" in statuses:
        return "UNSURE"
    return "OK"


def run_evaluation(eval_path, output_path):
    client = OpenAI()
    lines = Path(eval_path).read_text().strip().split("\n")
    examples = [json.loads(line) for line in lines]

    print(f"Running confidence evaluation on {len(examples)} examples using {MODEL}...\n")

    results = []
    for i, example in enumerate(examples):
        text = example["messages"][1]["content"]
        expected_raw = example["messages"][2]["content"]
        expected = expected_raw if expected_raw else None
        category = example.get("category", "unknown")

        print(f"  [{i+1}/{len(examples)}] Category: {category:12s} | ", end="", flush=True)

        sc_label, sc_status, sc_meta = self_check(client, text)
        rd_label, rd_status, rd_meta = redundancy_check(client, text)
        cv_label, cv_status, cv_meta = constraint_check(client, text)

        final_status = combined_status([sc_status, rd_status, cv_status])

        sc_correct = (sc_label == expected) if expected else None
        rd_correct = (rd_label == expected) if expected else None
        cv_correct = (cv_label == expected) if expected else None

        result = {
            "index": i + 1,
            "input": text[:80] + ("..." if len(text) > 80 else ""),
            "input_full": text,
            "expected": expected,
            "category": category,
            "self_check": {"label": sc_label, "status": sc_status, "correct": sc_correct, **sc_meta},
            "redundancy": {"label": rd_label, "status": rd_status, "correct": rd_correct, **rd_meta},
            "constraint": {"label": cv_label, "status": cv_status, "correct": cv_correct, **cv_meta},
            "combined_status": final_status,
        }
        results.append(result)

        total_latency = sc_meta["latency"] + rd_meta["latency"] + cv_meta["latency"]
        print(f"SC:{sc_status:6s} RD:{rd_status:6s} CV:{cv_status:6s} → {final_status:6s} ({total_latency:.1f}s)")

    report = build_report(results)
    Path(output_path).write_text(json.dumps(report, indent=2) + "\n")
    print_summary(report)
    print(f"\nDetailed results saved to: {output_path}")


def build_report(results):
    categories = ["correct", "edge", "adversarial"]
    methods = ["self_check", "redundancy", "constraint"]

    per_method = {}
    for method in methods:
        per_method[method] = {
            "total": len(results),
            "ok": sum(1 for r in results if r[method]["status"] == "OK"),
            "unsure": sum(1 for r in results if r[method]["status"] == "UNSURE"),
            "fail": sum(1 for r in results if r[method]["status"] == "FAIL"),
            "api_calls": sum(r[method]["api_calls"] for r in results),
            "total_latency": round(sum(r[method]["latency"] for r in results), 2),
            "avg_latency": round(sum(r[method]["latency"] for r in results) / len(results), 3),
        }
        with_expected = [r for r in results if r[method]["correct"] is not None]
        if with_expected:
            per_method[method]["accuracy"] = round(
                sum(1 for r in with_expected if r[method]["correct"]) / len(with_expected), 3
            )
        if method == "constraint":
            per_method[method]["retries"] = sum(1 for r in results if r[method].get("retried"))

    per_tier = {}
    for cat in categories:
        tier_results = [r for r in results if r["category"] == cat]
        if not tier_results:
            continue
        tier = {"count": len(tier_results)}
        for method in methods:
            with_expected = [r for r in tier_results if r[method]["correct"] is not None]
            tier[method] = {
                "ok": sum(1 for r in tier_results if r[method]["status"] == "OK"),
                "unsure": sum(1 for r in tier_results if r[method]["status"] == "UNSURE"),
                "fail": sum(1 for r in tier_results if r[method]["status"] == "FAIL"),
            }
            if with_expected:
                tier[method]["accuracy"] = round(
                    sum(1 for r in with_expected if r[method]["correct"]) / len(with_expected), 3
                )
        tier["combined"] = {
            "ok": sum(1 for r in tier_results if r["combined_status"] == "OK"),
            "unsure": sum(1 for r in tier_results if r["combined_status"] == "UNSURE"),
            "fail": sum(1 for r in tier_results if r["combined_status"] == "FAIL"),
        }
        per_tier[cat] = tier

    combined = {
        "ok": sum(1 for r in results if r["combined_status"] == "OK"),
        "unsure": sum(1 for r in results if r["combined_status"] == "UNSURE"),
        "fail": sum(1 for r in results if r["combined_status"] == "FAIL"),
    }

    total_api_calls = sum(per_method[m]["api_calls"] for m in methods)
    est_cost_per_call = 0.00015
    estimated_cost = round(total_api_calls * est_cost_per_call, 4)

    return {
        "model": MODEL,
        "num_examples": len(results),
        "per_method": per_method,
        "per_tier": per_tier,
        "combined": combined,
        "total_api_calls": total_api_calls,
        "estimated_cost_usd": estimated_cost,
        "results": results,
    }


def print_summary(report):
    print("\n" + "=" * 80)
    print("CONFIDENCE ESTIMATION REPORT")
    print("=" * 80)

    print(f"\nModel: {report['model']}  |  Examples: {report['num_examples']}  |  "
          f"API calls: {report['total_api_calls']}  |  Est. cost: ${report['estimated_cost_usd']:.4f}")

    print("\n--- Per Method ---")
    print(f"{'Method':<15} {'OK':>5} {'UNSURE':>7} {'FAIL':>5} {'Acc':>7} {'Avg Lat':>8} {'API Calls':>10}")
    print("-" * 60)
    for method in ["self_check", "redundancy", "constraint"]:
        m = report["per_method"][method]
        acc = f"{m['accuracy']:.1%}" if "accuracy" in m else "N/A"
        print(f"{method:<15} {m['ok']:>5} {m['unsure']:>7} {m['fail']:>5} {acc:>7} {m['avg_latency']:>7.2f}s {m['api_calls']:>10}")

    print("\n--- Per Tier ---")
    for tier_name in ["correct", "edge", "adversarial"]:
        if tier_name not in report["per_tier"]:
            continue
        tier = report["per_tier"][tier_name]
        print(f"\n  {tier_name.upper()} ({tier['count']} examples):")
        print(f"  {'Method':<15} {'OK':>5} {'UNSURE':>7} {'FAIL':>5} {'Accuracy':>9}")
        print(f"  {'-'*45}")
        for method in ["self_check", "redundancy", "constraint"]:
            m = tier[method]
            acc = f"{m['accuracy']:.1%}" if "accuracy" in m else "N/A"
            print(f"  {method:<15} {m['ok']:>5} {m['unsure']:>7} {m['fail']:>5} {acc:>9}")
        c = tier["combined"]
        print(f"  {'combined':<15} {c['ok']:>5} {c['unsure']:>7} {c['fail']:>5}")

    print("\n--- Combined Status ---")
    c = report["combined"]
    total = report["num_examples"]
    print(f"  OK:     {c['ok']:>3} ({c['ok']/total:.0%})")
    print(f"  UNSURE: {c['unsure']:>3} ({c['unsure']/total:.0%})")
    print(f"  FAIL:   {c['fail']:>3} ({c['fail']/total:.0%})")


if __name__ == "__main__":
    eval_file = sys.argv[1] if len(sys.argv) > 1 else "data/confidence_eval.jsonl"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "results/confidence_report.json"
    run_evaluation(eval_file, output_file)
