import json
import os
import sys
import time
from pathlib import Path

from openai import OpenAI


def load_env():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


load_env()

LOCAL_MODEL = "llama3.1:8b"
API_MODEL = "gpt-4o-mini"
VALID_LABELS = {"Positive", "Negative", "Neutral"}
SYSTEM_PROMPT = "Classify the sentiment of the following Reddit comment as exactly one of: Positive, Negative, or Neutral."
LOCAL_SYSTEM_PROMPT = SYSTEM_PROMPT + " You MUST respond with exactly one word: Positive, Negative, or Neutral. No other text."
EST_COST_PER_API_CALL = 0.00015


def make_clients():
    import httpx
    local = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
    try:
        httpx.get("http://localhost:11434/v1/models", timeout=5)
    except httpx.ConnectError:
        print("ERROR: Ollama is not running. Start it with: ollama serve")
        sys.exit(1)
    api = OpenAI()
    return local, api


def classify(client, model, text, temperature=0.0):
    is_local = model == LOCAL_MODEL
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": LOCAL_SYSTEM_PROMPT if is_local else SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=temperature,
        max_tokens=10 if is_local else 50,
    )
    raw = response.choices[0].message.content.strip().rstrip(".")
    return raw


def check_format(response):
    return response in VALID_LABELS


def extract_label(response):
    for label in VALID_LABELS:
        if label.lower() in response.lower():
            return label
    return None


def consistency_check(client, text, first_label):
    second_raw = classify(client, LOCAL_MODEL, text, temperature=0.8)
    second_label = second_raw if check_format(second_raw) else extract_label(second_raw)
    agreed = first_label is not None and first_label == second_label
    return agreed, f"1st={first_label}, 2nd={second_label}"


def route(local_client, api_client, text):
    t0 = time.time()
    escalation_reason = None
    api_calls_local = 0
    api_calls_api = 0

    raw_response = classify(local_client, LOCAL_MODEL, text)
    api_calls_local += 1

    format_ok = check_format(raw_response)
    if format_ok:
        local_label = raw_response
    else:
        local_label = extract_label(raw_response)

    if not format_ok:
        escalation_reason = "invalid format"
    else:
        agreed, check_detail = consistency_check(local_client, text, local_label)
        api_calls_local += 1
        if not agreed:
            escalation_reason = "consistency mismatch"

    if escalation_reason:
        final_label = classify(api_client, API_MODEL, text)
        api_calls_api += 1
        route_taken = "ESCALATED"
    else:
        final_label = local_label
        route_taken = "LOCAL"

    latency = time.time() - t0

    return {
        "route": route_taken,
        "final_label": final_label,
        "local_raw_response": raw_response,
        "local_label": local_label,
        "format_ok": format_ok,
        "escalation_reason": escalation_reason,
        "api_calls_local": api_calls_local,
        "api_calls_api": api_calls_api,
        "latency": round(latency, 3),
    }


def run_local_only(local_client, text):
    t0 = time.time()
    raw = classify(local_client, LOCAL_MODEL, text)
    latency = time.time() - t0
    label = raw if check_format(raw) else extract_label(raw)
    return label, round(latency, 3)


def run_api_only(api_client, text):
    t0 = time.time()
    label = classify(api_client, API_MODEL, text)
    latency = time.time() - t0
    return label, round(latency, 3)


def run_evaluation(eval_path, output_path):
    local_client, api_client = make_clients()
    lines = Path(eval_path).read_text().strip().split("\n")
    examples = [json.loads(line) for line in lines]

    print(f"Model Routing Evaluation: {len(examples)} examples")
    print(f"  Local model:  {LOCAL_MODEL} (Ollama)")
    print(f"  API model:    {API_MODEL} (OpenAI)")
    print(f"  Heuristics:   format check + consistency check (classify twice)")
    print("=" * 80)

    results = []
    for i, example in enumerate(examples):
        text = example["messages"][1]["content"]
        expected_raw = example["messages"][2]["content"]
        expected = expected_raw if expected_raw else None
        category = example.get("category", "unknown")

        snippet = text[:60] + ("..." if len(text) > 60 else "")
        print(f"\n[{i+1}/{len(examples)}] \"{snippet}\"")

        routed = route(local_client, api_client, text)

        if routed["format_ok"]:
            print(f"  LOCAL {LOCAL_MODEL} → {routed['local_label']} (valid format ✓)")
        else:
            print(f"  LOCAL {LOCAL_MODEL} → \"{routed['local_raw_response'][:50]}\" (invalid format ✗)")
            if routed["local_label"]:
                print(f"    extracted label: {routed['local_label']}")

        if routed["format_ok"] and routed["route"] == "LOCAL":
            print(f"  Consistency check: MATCH ✓")
        elif routed["format_ok"] and routed["escalation_reason"] == "consistency mismatch":
            print(f"  Consistency check: MISMATCH ✗")

        if routed["route"] == "LOCAL":
            print(f"  → ROUTED: LOCAL | Label: {routed['final_label']} | {routed['latency']:.1f}s")
        else:
            print(f"  → ESCALATED to {API_MODEL} | Label: {routed['final_label']} | {routed['latency']:.1f}s | Reason: {routed['escalation_reason']}")

        local_label, local_latency = run_local_only(local_client, text)
        api_label, api_latency = run_api_only(api_client, text)

        routed_correct = (routed["final_label"] == expected) if expected else None
        local_correct = (local_label == expected) if expected else None
        api_correct = (api_label == expected) if expected else None

        result = {
            "index": i + 1,
            "input": snippet,
            "input_full": text,
            "expected": expected,
            "category": category,
            "routed": {**routed, "correct": routed_correct},
            "local_only": {"label": local_label, "correct": local_correct, "latency": local_latency},
            "api_only": {"label": api_label, "correct": api_correct, "latency": api_latency},
        }
        results.append(result)

        if expected:
            marks = {True: "✓", False: "✗", None: "?"}
            print(f"  Accuracy: routed={marks[routed_correct]} local={marks[local_correct]} api={marks[api_correct]} (expected: {expected})")

    report = build_report(results)
    Path(output_path).write_text(json.dumps(report, indent=2) + "\n")
    print_summary(report)
    print(f"\nDetailed results saved to: {output_path}")


def build_report(results):
    categories = ["correct", "edge", "adversarial"]
    strategies = ["routed", "local_only", "api_only"]

    total = len(results)
    escalated = [r for r in results if r["routed"]["route"] == "ESCALATED"]
    local_handled = [r for r in results if r["routed"]["route"] == "LOCAL"]

    routing_summary = {
        "total": total,
        "local_handled": len(local_handled),
        "escalated": len(escalated),
        "local_pct": round(len(local_handled) / total * 100, 1),
        "escalated_pct": round(len(escalated) / total * 100, 1),
        "escalation_reasons": {
            "invalid_format": sum(1 for r in escalated if r["routed"]["escalation_reason"] == "invalid format"),
            "consistency_mismatch": sum(1 for r in escalated if r["routed"]["escalation_reason"] == "consistency mismatch"),
        },
    }

    accuracy = {}
    for strategy in strategies:
        if strategy == "routed":
            with_expected = [r for r in results if r["routed"]["correct"] is not None]
            correct_count = sum(1 for r in with_expected if r["routed"]["correct"])
        else:
            with_expected = [r for r in results if r[strategy]["correct"] is not None]
            correct_count = sum(1 for r in with_expected if r[strategy]["correct"])
        accuracy[strategy] = {
            "correct": correct_count,
            "total_with_expected": len(with_expected),
            "accuracy": round(correct_count / len(with_expected), 3) if with_expected else None,
        }

    per_tier = {}
    for cat in categories:
        tier_results = [r for r in results if r["category"] == cat]
        if not tier_results:
            continue
        tier = {
            "count": len(tier_results),
            "local_handled": sum(1 for r in tier_results if r["routed"]["route"] == "LOCAL"),
            "escalated": sum(1 for r in tier_results if r["routed"]["route"] == "ESCALATED"),
        }
        for strategy in strategies:
            if strategy == "routed":
                with_expected = [r for r in tier_results if r["routed"]["correct"] is not None]
                correct_count = sum(1 for r in with_expected if r["routed"]["correct"])
            else:
                with_expected = [r for r in tier_results if r[strategy]["correct"] is not None]
                correct_count = sum(1 for r in with_expected if r[strategy]["correct"])
            tier[strategy] = {
                "correct": correct_count,
                "total_with_expected": len(with_expected),
                "accuracy": round(correct_count / len(with_expected), 3) if with_expected else None,
            }
        per_tier[cat] = tier

    total_local_calls = sum(r["routed"]["api_calls_local"] for r in results)
    total_api_calls = sum(r["routed"]["api_calls_api"] for r in results)
    api_only_calls = total
    api_calls_saved = api_only_calls - total_api_calls

    latency = {
        "routed_avg": round(sum(r["routed"]["latency"] for r in results) / total, 3),
        "local_only_avg": round(sum(r["local_only"]["latency"] for r in results) / total, 3),
        "api_only_avg": round(sum(r["api_only"]["latency"] for r in results) / total, 3),
        "routed_local_avg": round(sum(r["routed"]["latency"] for r in local_handled) / len(local_handled), 3) if local_handled else None,
        "routed_escalated_avg": round(sum(r["routed"]["latency"] for r in escalated) / len(escalated), 3) if escalated else None,
    }

    cost = {
        "routed_api_calls": total_api_calls,
        "api_only_calls": api_only_calls,
        "api_calls_saved": api_calls_saved,
        "routed_cost": round(total_api_calls * EST_COST_PER_API_CALL, 4),
        "api_only_cost": round(api_only_calls * EST_COST_PER_API_CALL, 4),
        "savings_pct": round(api_calls_saved / api_only_calls * 100, 1) if api_only_calls else 0,
    }

    return {
        "local_model": LOCAL_MODEL,
        "api_model": API_MODEL,
        "num_examples": total,
        "routing_summary": routing_summary,
        "accuracy": accuracy,
        "per_tier": per_tier,
        "latency": latency,
        "cost": cost,
        "total_local_calls": total_local_calls,
        "results": results,
    }


def print_summary(report):
    print("\n" + "=" * 80)
    print("MODEL ROUTING REPORT")
    print("=" * 80)

    rs = report["routing_summary"]
    print(f"\nLocal: {report['local_model']}  |  API: {report['api_model']}  |  Examples: {report['num_examples']}")
    print(f"Handled locally: {rs['local_handled']} ({rs['local_pct']}%)  |  Escalated: {rs['escalated']} ({rs['escalated_pct']}%)")
    er = rs["escalation_reasons"]
    print(f"  Escalation reasons: invalid format={er['invalid_format']}, consistency mismatch={er['consistency_mismatch']}")

    print("\n--- Three-Way Accuracy Comparison ---")
    print(f"{'Strategy':<15} {'Correct':>8} {'Total':>6} {'Accuracy':>9}")
    print("-" * 42)
    for strategy in ["local_only", "routed", "api_only"]:
        a = report["accuracy"][strategy]
        acc = f"{a['accuracy']:.1%}" if a["accuracy"] is not None else "N/A"
        print(f"{strategy:<15} {a['correct']:>8} {a['total_with_expected']:>6} {acc:>9}")

    print("\n--- Per Tier ---")
    for tier_name in ["correct", "edge", "adversarial"]:
        if tier_name not in report["per_tier"]:
            continue
        tier = report["per_tier"][tier_name]
        print(f"\n  {tier_name.upper()} ({tier['count']} examples) — {tier['local_handled']} local, {tier['escalated']} escalated")
        print(f"  {'Strategy':<15} {'Correct':>8} {'Total':>6} {'Accuracy':>9}")
        print(f"  {'-'*42}")
        for strategy in ["local_only", "routed", "api_only"]:
            a = tier[strategy]
            acc = f"{a['accuracy']:.1%}" if a["accuracy"] is not None else "N/A"
            print(f"  {strategy:<15} {a['correct']:>8} {a['total_with_expected']:>6} {acc:>9}")

    print("\n--- Latency ---")
    lat = report["latency"]
    print(f"  Routed avg:           {lat['routed_avg']:.2f}s")
    if lat["routed_local_avg"]:
        print(f"    Local-handled avg:  {lat['routed_local_avg']:.2f}s")
    if lat["routed_escalated_avg"]:
        print(f"    Escalated avg:      {lat['routed_escalated_avg']:.2f}s")
    print(f"  Local-only avg:       {lat['local_only_avg']:.2f}s")
    print(f"  API-only avg:         {lat['api_only_avg']:.2f}s")

    print("\n--- Cost Savings (vs. API-only) ---")
    c = report["cost"]
    print(f"  API calls (routed):   {c['routed_api_calls']}")
    print(f"  API calls (API-only): {c['api_only_calls']}")
    print(f"  API calls saved:      {c['api_calls_saved']} ({c['savings_pct']}%)")
    print(f"  Estimated cost:       ${c['routed_cost']:.4f} vs ${c['api_only_cost']:.4f}")


if __name__ == "__main__":
    eval_file = sys.argv[1] if len(sys.argv) > 1 else "data/confidence_eval.jsonl"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "results/routing_report.json"
    try:
        run_evaluation(eval_file, output_file)
    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting.")
        sys.exit(0)
