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

MICRO_MODEL = "llama3.2:3b"
API_MODEL = "gpt-4o-mini"

VALID_SENTIMENTS = {"Positive", "Negative", "Neutral"}
VALID_INTENTS = {"complaint", "praise", "question", "suggestion"}
VALID_URGENCIES = {"urgent", "normal", "low"}

SYSTEM_PROMPT = (
    "Classify this Reddit comment. Return ONLY a JSON object with these exact fields:\n"
    '{"sentiment": "Positive" or "Negative" or "Neutral", '
    '"intent": "complaint" or "praise" or "question" or "suggestion", '
    '"urgency": "urgent" or "normal" or "low"}\n'
    "Return ONLY the JSON object, no other text."
)


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


def call_llm(client, model, system_prompt, user_content, temperature=0.0):
    is_local = model == MICRO_MODEL
    kwargs = {}
    if is_local:
        kwargs["extra_body"] = {"format": "json"}
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=temperature,
        max_tokens=100 if is_local else 150,
        **kwargs,
    )
    raw = response.choices[0].message.content.strip()
    usage = response.usage
    return raw, usage


def parse_json(raw):
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
    return None


def validate_fields(parsed):
    if not isinstance(parsed, dict):
        return None
    result = {}
    s = parsed.get("sentiment", "")
    for valid in VALID_SENTIMENTS:
        if valid.lower() == str(s).lower():
            result["sentiment"] = valid
            break
    i = parsed.get("intent", "")
    for valid in VALID_INTENTS:
        if valid.lower() == str(i).lower():
            result["intent"] = valid
            break
    u = parsed.get("urgency", "")
    for valid in VALID_URGENCIES:
        if valid.lower() == str(u).lower():
            result["urgency"] = valid
            break
    if len(result) == 3:
        return result
    return None


def classify_micro(local_client, text, temperature=0.0):
    raw, usage = call_llm(local_client, MICRO_MODEL, SYSTEM_PROMPT, text, temperature)
    parsed = parse_json(raw)
    fields = validate_fields(parsed)
    pt = usage.prompt_tokens if usage else 0
    ct = usage.completion_tokens if usage else 0
    return raw, fields, pt, ct


def consistency_check(local_client, text, first_fields):
    raw2, fields2, pt, ct = classify_micro(local_client, text, temperature=0.8)
    if fields2 is None:
        return False, "second_run_invalid_format", raw2, pt, ct
    mismatched = []
    for field in ["sentiment", "intent", "urgency"]:
        if first_fields[field] != fields2[field]:
            mismatched.append(field)
    if mismatched:
        return False, f"mismatch:{','.join(mismatched)}", raw2, pt, ct
    return True, "match", raw2, pt, ct


def route(local_client, api_client, text):
    t0 = time.time()
    total_prompt_tokens = 0
    total_completion_tokens = 0
    api_prompt_tokens = 0
    api_completion_tokens = 0
    local_calls = 0
    api_calls = 0

    raw1, fields1, pt, ct = classify_micro(local_client, text, temperature=0.0)
    total_prompt_tokens += pt
    total_completion_tokens += ct
    local_calls += 1

    escalation_reason = None
    consistency_detail = None

    if fields1 is None:
        escalation_reason = "invalid_format"
    else:
        consistent, detail, raw2, pt2, ct2 = consistency_check(local_client, text, fields1)
        total_prompt_tokens += pt2
        total_completion_tokens += ct2
        local_calls += 1
        consistency_detail = detail
        if not consistent:
            escalation_reason = "consistency_mismatch"

    if escalation_reason:
        raw_api, usage_api = call_llm(api_client, API_MODEL, SYSTEM_PROMPT, text, temperature=0.0)
        parsed_api = parse_json(raw_api)
        fields_final = validate_fields(parsed_api)
        pt_api = usage_api.prompt_tokens if usage_api else 0
        ct_api = usage_api.completion_tokens if usage_api else 0
        total_prompt_tokens += pt_api
        total_completion_tokens += ct_api
        api_prompt_tokens += pt_api
        api_completion_tokens += ct_api
        api_calls += 1
        route_taken = "ESCALATED"
    else:
        fields_final = fields1
        route_taken = "LOCAL"

    latency = time.time() - t0

    return {
        "route": route_taken,
        "fields": fields_final,
        "sentiment": fields_final["sentiment"] if fields_final else None,
        "intent": fields_final["intent"] if fields_final else None,
        "urgency": fields_final["urgency"] if fields_final else None,
        "micro_raw": raw1,
        "micro_fields": fields1,
        "format_ok": fields1 is not None,
        "consistency_detail": consistency_detail,
        "escalation_reason": escalation_reason,
        "local_calls": local_calls,
        "api_calls": api_calls,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "api_prompt_tokens": api_prompt_tokens,
        "api_completion_tokens": api_completion_tokens,
        "latency": round(latency, 3),
    }


def run_micro_only(local_client, text):
    t0 = time.time()
    raw, fields, pt, ct = classify_micro(local_client, text, temperature=0.0)
    latency = time.time() - t0
    return {
        "fields": fields,
        "sentiment": fields["sentiment"] if fields else None,
        "intent": fields["intent"] if fields else None,
        "urgency": fields["urgency"] if fields else None,
        "format_ok": fields is not None,
        "latency": round(latency, 3),
        "prompt_tokens": pt,
        "completion_tokens": ct,
    }


def run_llm_only(api_client, text):
    t0 = time.time()
    raw, usage = call_llm(api_client, API_MODEL, SYSTEM_PROMPT, text, temperature=0.0)
    latency = time.time() - t0
    parsed = parse_json(raw)
    fields = validate_fields(parsed)
    pt = usage.prompt_tokens if usage else 0
    ct = usage.completion_tokens if usage else 0
    return {
        "fields": fields,
        "sentiment": fields["sentiment"] if fields else None,
        "intent": fields["intent"] if fields else None,
        "urgency": fields["urgency"] if fields else None,
        "format_ok": fields is not None,
        "latency": round(latency, 3),
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "api_prompt_tokens": pt,
        "api_completion_tokens": ct,
    }


def run_evaluation(eval_path, output_path):
    local_client, api_client = make_clients()
    lines = Path(eval_path).read_text().strip().split("\n")
    examples = [json.loads(line) for line in lines]

    print(f"Micro-Model Routing Evaluation: {len(examples)} examples", flush=True)
    print(f"  Micro-model:  {MICRO_MODEL} (Ollama, local)")
    print(f"  LLM fallback: {API_MODEL} (OpenAI API)")
    print(f"  Confidence:   format check + consistency check (temp 0.0 vs 0.8)")
    print(f"  Strategies:   micro-only, routed, LLM-only")
    print("=" * 80, flush=True)

    results = []
    for i, example in enumerate(examples):
        text = example["text"]
        expected = {
            "sentiment": example.get("sentiment"),
            "intent": example.get("intent"),
            "urgency": example.get("urgency"),
        }
        snippet = text[:60] + ("..." if len(text) > 60 else "")
        print(f"\n[{i+1}/{len(examples)}] \"{snippet}\"", flush=True)
        print(f"  Expected: S={expected['sentiment']} I={expected['intent']} U={expected['urgency']}")

        routed = route(local_client, api_client, text)

        if routed["format_ok"]:
            mf = routed["micro_fields"]
            print(f"  MICRO {MICRO_MODEL} -> S={mf['sentiment']} I={mf['intent']} U={mf['urgency']} (valid format ✓)")
        else:
            print(f"  MICRO {MICRO_MODEL} -> \"{routed['micro_raw'][:60]}\" (invalid format ✗)")

        if routed["format_ok"] and routed["route"] == "LOCAL":
            print(f"  Consistency check: MATCH ✓")
        elif routed["format_ok"] and routed["escalation_reason"] == "consistency_mismatch":
            print(f"  Consistency check: MISMATCH ✗ ({routed['consistency_detail']})")
        elif routed["escalation_reason"] == "invalid_format":
            print(f"  Skipped consistency check (format invalid)")

        if routed["route"] == "LOCAL":
            print(f"  -> ROUTED: LOCAL | S={routed['sentiment']} I={routed['intent']} U={routed['urgency']} | {routed['latency']:.1f}s")
        else:
            print(f"  -> ESCALATED to {API_MODEL} | S={routed['sentiment']} I={routed['intent']} U={routed['urgency']} | {routed['latency']:.1f}s | Reason: {routed['escalation_reason']}")

        micro_only = run_micro_only(local_client, text)
        llm_only = run_llm_only(api_client, text)

        field_names = ["sentiment", "intent", "urgency"]

        def check_correct(result_fields, expected_fields):
            per_field = {}
            for f in field_names:
                if expected_fields[f] is not None and result_fields.get(f) is not None:
                    per_field[f] = result_fields[f] == expected_fields[f]
                else:
                    per_field[f] = None
            all_ok = all(v for v in per_field.values() if v is not None)
            return per_field, all_ok

        routed_fc, routed_all = check_correct(routed, expected)
        micro_fc, micro_all = check_correct(micro_only, expected)
        llm_fc, llm_all = check_correct(llm_only, expected)

        marks = {True: "+", False: "x", None: "?"}
        r_marks = "".join(marks[routed_fc[f]] for f in field_names)
        m_marks = "".join(marks[micro_fc[f]] for f in field_names)
        l_marks = "".join(marks[llm_fc[f]] for f in field_names)
        print(f"  Accuracy: routed=[{r_marks}] micro=[{m_marks}] llm=[{l_marks}]", flush=True)

        result = {
            "index": i + 1,
            "input": snippet,
            "input_full": text,
            "expected": expected,
            "routed": {**routed, "fields_correct": routed_fc, "all_correct": routed_all},
            "micro_only": {**micro_only, "fields_correct": micro_fc, "all_correct": micro_all},
            "llm_only": {**llm_only, "fields_correct": llm_fc, "all_correct": llm_all},
        }
        results.append(result)

    report = build_report(results)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(report, indent=2) + "\n")
    print_summary(report)
    print(f"\nDetailed results saved to: {output_path}")


def build_report(results):
    total = len(results)
    field_names = ["sentiment", "intent", "urgency"]
    strategies = ["micro_only", "routed", "llm_only"]

    escalated = [r for r in results if r["routed"]["route"] == "ESCALATED"]
    local_handled = [r for r in results if r["routed"]["route"] == "LOCAL"]

    routing = {
        "total": total,
        "local_handled": len(local_handled),
        "escalated": len(escalated),
        "local_pct": round(len(local_handled) / total * 100, 1),
        "escalated_pct": round(len(escalated) / total * 100, 1),
        "reasons": {
            "invalid_format": sum(1 for r in escalated if r["routed"]["escalation_reason"] == "invalid_format"),
            "consistency_mismatch": sum(1 for r in escalated if r["routed"]["escalation_reason"] == "consistency_mismatch"),
        },
    }

    accuracy = {}
    for strategy in strategies:
        per_field_correct = {f: 0 for f in field_names}
        per_field_total = {f: 0 for f in field_names}
        all_correct_count = 0

        for r in results:
            s = r[strategy]
            for f in field_names:
                fc = s["fields_correct"][f]
                if fc is not None:
                    per_field_total[f] += 1
                    if fc:
                        per_field_correct[f] += 1
            if s["all_correct"]:
                all_correct_count += 1

        per_field_accuracy = {}
        for f in field_names:
            if per_field_total[f] > 0:
                per_field_accuracy[f] = round(per_field_correct[f] / per_field_total[f], 3)
            else:
                per_field_accuracy[f] = None

        accuracy[strategy] = {
            "per_field_accuracy": per_field_accuracy,
            "per_field_correct": per_field_correct,
            "per_field_total": per_field_total,
            "all_correct": all_correct_count,
            "all_correct_rate": round(all_correct_count / total, 3),
        }

    latency = {}
    for strategy in strategies:
        avg = round(sum(r[strategy]["latency"] for r in results) / total, 3)
        latency[strategy] = avg
    if local_handled:
        latency["routed_local_avg"] = round(sum(r["routed"]["latency"] for r in local_handled) / len(local_handled), 3)
    if escalated:
        latency["routed_escalated_avg"] = round(sum(r["routed"]["latency"] for r in escalated) / len(escalated), 3)

    total_api_prompt = sum(r["routed"].get("api_prompt_tokens", 0) for r in results)
    total_api_completion = sum(r["routed"].get("api_completion_tokens", 0) for r in results)
    routed_cost = (total_api_prompt * 0.00000015) + (total_api_completion * 0.00000060)

    llm_api_prompt = sum(r["llm_only"].get("api_prompt_tokens", 0) for r in results)
    llm_api_completion = sum(r["llm_only"].get("api_completion_tokens", 0) for r in results)
    llm_only_cost = (llm_api_prompt * 0.00000015) + (llm_api_completion * 0.00000060)

    cost = {
        "routed_api_calls": sum(r["routed"]["api_calls"] for r in results),
        "routed_local_calls": sum(r["routed"]["local_calls"] for r in results),
        "llm_only_api_calls": total,
        "routed_cost": round(routed_cost, 6),
        "llm_only_cost": round(llm_only_cost, 6),
        "savings_pct": round((1 - routed_cost / llm_only_cost) * 100, 1) if llm_only_cost > 0 else 0,
    }

    return {
        "micro_model": MICRO_MODEL,
        "api_model": API_MODEL,
        "num_examples": total,
        "routing": routing,
        "accuracy": accuracy,
        "latency": latency,
        "cost": cost,
        "results": results,
    }


def print_summary(report):
    print("\n" + "=" * 80)
    print("MICRO-MODEL ROUTING REPORT")
    print("=" * 80)

    r = report["routing"]
    print(f"\nMicro: {report['micro_model']}  |  Fallback: {report['api_model']}  |  Examples: {report['num_examples']}")
    print(f"Handled locally: {r['local_handled']} ({r['local_pct']}%)  |  Escalated: {r['escalated']} ({r['escalated_pct']}%)")
    reasons = r["reasons"]
    print(f"  Escalation reasons: invalid_format={reasons['invalid_format']}, consistency_mismatch={reasons['consistency_mismatch']}")

    fields = ["sentiment", "intent", "urgency"]
    print("\n--- Three-Way Accuracy Comparison ---")
    header = f"{'Strategy':<14}"
    for f in fields:
        header += f" {f:>10}"
    header += f" {'All 3':>8}"
    print(header)
    print("-" * len(header))

    for strategy in ["micro_only", "routed", "llm_only"]:
        a = report["accuracy"][strategy]
        row = f"{strategy:<14}"
        for f in fields:
            acc = a["per_field_accuracy"][f]
            acc_str = f"{acc:.1%}" if acc is not None else "N/A"
            row += f" {acc_str:>10}"
        all3_str = f"{a['all_correct_rate']:.1%}"
        row += f" {all3_str:>8}"
        print(row)

    print("\n--- Latency ---")
    lat = report["latency"]
    print(f"  Micro-only avg:       {lat['micro_only']:.2f}s")
    print(f"  Routed avg:           {lat['routed']:.2f}s")
    if "routed_local_avg" in lat:
        print(f"    Local-handled avg:  {lat['routed_local_avg']:.2f}s")
    if "routed_escalated_avg" in lat:
        print(f"    Escalated avg:      {lat['routed_escalated_avg']:.2f}s")
    print(f"  LLM-only avg:         {lat['llm_only']:.2f}s")

    print("\n--- Cost Savings (routed vs. LLM-only) ---")
    c = report["cost"]
    print(f"  Routed API calls:     {c['routed_api_calls']} (+ {c['routed_local_calls']} local)")
    print(f"  LLM-only API calls:   {c['llm_only_api_calls']}")
    print(f"  Routed cost:          ${c['routed_cost']:.6f}")
    print(f"  LLM-only cost:        ${c['llm_only_cost']:.6f}")
    print(f"  Savings:              {c['savings_pct']}%")


if __name__ == "__main__":
    eval_file = sys.argv[1] if len(sys.argv) > 1 else "data/triage_eval.jsonl"
    output_file = sys.argv[2] if len(sys.argv) > 2 else "results/micro_routing_report.json"
    try:
        run_evaluation(eval_file, output_file)
    except KeyboardInterrupt:
        print("\n\nInterrupted. Exiting.")
        sys.exit(0)
