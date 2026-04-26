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

VALID_SENTIMENTS = {"Positive", "Negative", "Neutral"}
VALID_INTENTS = {"complaint", "praise", "question", "suggestion"}
VALID_URGENCIES = {"urgent", "normal", "low"}

MONOLITHIC_SYSTEM = (
    "Classify this Reddit comment. Return ONLY a JSON object with these exact fields:\n"
    '{"sentiment": "Positive" or "Negative" or "Neutral", '
    '"intent": "complaint" or "praise" or "question" or "suggestion", '
    '"urgency": "urgent" or "normal" or "low"}\n'
    "Return ONLY the JSON object, no other text."
)

STAGE1_SYSTEM = (
    "Classify the sentiment of this Reddit comment. "
    "Return ONLY a JSON object: "
    '{"sentiment": "Positive" or "Negative" or "Neutral"}\n'
    "Return ONLY the JSON object, no other text."
)

STAGE2_SYSTEM = (
    "Classify the intent of this Reddit comment. "
    "The comment's sentiment has already been classified as: {sentiment}. "
    "Return ONLY a JSON object: "
    '{{"intent": "complaint" or "praise" or "question" or "suggestion"}}\n'
    "Return ONLY the JSON object, no other text."
)

STAGE3_SYSTEM = (
    "Assess the urgency of this Reddit comment. "
    "The comment has been classified as: sentiment={sentiment}, intent={intent}. "
    "Return ONLY a JSON object: "
    '{{"urgency": "urgent" or "normal" or "low"}}\n'
    "Return ONLY the JSON object, no other text."
)

MODEL_CONFIGS = {
    "local-only": {
        "mono_model": LOCAL_MODEL,
        "stage_models": [LOCAL_MODEL, LOCAL_MODEL, LOCAL_MODEL],
    },
    "api-only": {
        "mono_model": API_MODEL,
        "stage_models": [API_MODEL, API_MODEL, API_MODEL],
    },
    "mixed": {
        "mono_model": API_MODEL,
        "stage_models": [LOCAL_MODEL, API_MODEL, API_MODEL],
    },
}


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


def get_client(local_client, api_client, model):
    return local_client if model == LOCAL_MODEL else api_client


def call_llm(client, model, system_prompt, user_content):
    is_local = model == LOCAL_MODEL
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
        temperature=0.0,
        max_tokens=100 if is_local else 150,
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
    return result


def run_monolithic(local_client, api_client, model, text):
    t0 = time.time()
    client = get_client(local_client, api_client, model)
    raw, usage = call_llm(client, model, MONOLITHIC_SYSTEM, text)
    latency = time.time() - t0

    parsed = parse_json(raw)
    fields = validate_fields(parsed) if parsed else {}

    is_local = model == LOCAL_MODEL
    pt = usage.prompt_tokens if usage else 0
    ct = usage.completion_tokens if usage else 0
    return {
        "raw": raw,
        "fields": fields,
        "format_ok": parsed is not None,
        "sentiment": fields.get("sentiment"),
        "intent": fields.get("intent"),
        "urgency": fields.get("urgency"),
        "latency": round(latency, 3),
        "api_calls_local": 1 if is_local else 0,
        "api_calls_api": 0 if is_local else 1,
        "prompt_tokens": pt,
        "completion_tokens": ct,
        "api_prompt_tokens": 0 if is_local else pt,
        "api_completion_tokens": 0 if is_local else ct,
    }


def _track_tokens(usage, model):
    pt = usage.prompt_tokens if usage else 0
    ct = usage.completion_tokens if usage else 0
    is_api = model != LOCAL_MODEL
    return pt, ct, pt if is_api else 0, ct if is_api else 0


def run_multistage(local_client, api_client, stage_models, text):
    t0 = time.time()
    total_prompt_tokens = 0
    total_completion_tokens = 0
    total_api_prompt = 0
    total_api_completion = 0
    api_calls_local = 0
    api_calls_api = 0
    stage_results = []

    stages = [
        (STAGE1_SYSTEM, "sentiment", None),
    ]

    # Stage 1: Sentiment
    m1 = stage_models[0]
    c1 = get_client(local_client, api_client, m1)
    raw1, usage1 = call_llm(c1, m1, STAGE1_SYSTEM, text)
    parsed1 = parse_json(raw1)
    fields1 = validate_fields(parsed1) if parsed1 else {}
    sentiment = fields1.get("sentiment")
    pt, ct, apt, act = _track_tokens(usage1, m1)
    total_prompt_tokens += pt
    total_completion_tokens += ct
    total_api_prompt += apt
    total_api_completion += act
    if m1 == LOCAL_MODEL:
        api_calls_local += 1
    else:
        api_calls_api += 1
    stage_results.append({"stage": 1, "model": m1, "raw": raw1, "field": "sentiment", "value": sentiment})

    # Stage 2: Intent (receives sentiment context)
    m2 = stage_models[1]
    c2 = get_client(local_client, api_client, m2)
    system2 = STAGE2_SYSTEM.format(sentiment=sentiment or "unknown")
    raw2, usage2 = call_llm(c2, m2, system2, text)
    parsed2 = parse_json(raw2)
    fields2 = validate_fields(parsed2) if parsed2 else {}
    intent = fields2.get("intent")
    pt, ct, apt, act = _track_tokens(usage2, m2)
    total_prompt_tokens += pt
    total_completion_tokens += ct
    total_api_prompt += apt
    total_api_completion += act
    if m2 == LOCAL_MODEL:
        api_calls_local += 1
    else:
        api_calls_api += 1
    stage_results.append({"stage": 2, "model": m2, "raw": raw2, "field": "intent", "value": intent})

    # Stage 3: Urgency (receives sentiment + intent context)
    m3 = stage_models[2]
    c3 = get_client(local_client, api_client, m3)
    system3 = STAGE3_SYSTEM.format(sentiment=sentiment or "unknown", intent=intent or "unknown")
    raw3, usage3 = call_llm(c3, m3, system3, text)
    parsed3 = parse_json(raw3)
    fields3 = validate_fields(parsed3) if parsed3 else {}
    urgency = fields3.get("urgency")
    pt, ct, apt, act = _track_tokens(usage3, m3)
    total_prompt_tokens += pt
    total_completion_tokens += ct
    total_api_prompt += apt
    total_api_completion += act
    if m3 == LOCAL_MODEL:
        api_calls_local += 1
    else:
        api_calls_api += 1
    stage_results.append({"stage": 3, "model": m3, "raw": raw3, "field": "urgency", "value": urgency})

    latency = time.time() - t0

    return {
        "stages": stage_results,
        "sentiment": sentiment,
        "intent": intent,
        "urgency": urgency,
        "format_ok": all(parse_json(s["raw"]) is not None for s in stage_results),
        "latency": round(latency, 3),
        "api_calls_local": api_calls_local,
        "api_calls_api": api_calls_api,
        "prompt_tokens": total_prompt_tokens,
        "completion_tokens": total_completion_tokens,
        "api_prompt_tokens": total_api_prompt,
        "api_completion_tokens": total_api_completion,
    }


def run_evaluation(eval_path, output_path):
    local_client, api_client = make_clients()
    lines = Path(eval_path).read_text().strip().split("\n")
    examples = [json.loads(line) for line in lines]

    print(f"Inference Decomposition Evaluation: {len(examples)} examples", flush=True)
    print(f"  Local model:  {LOCAL_MODEL} (Ollama)")
    print(f"  API model:    {API_MODEL} (OpenAI)")
    print(f"  Configs:      {', '.join(MODEL_CONFIGS.keys())}")
    print(f"  Variants:     monolithic (A) + multi-stage (B)")
    print("=" * 80, flush=True)

    all_results = []

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

        config_results = {}

        for config_name, config in MODEL_CONFIGS.items():
            mono = run_monolithic(local_client, api_client, config["mono_model"], text)
            multi = run_multistage(local_client, api_client, config["stage_models"], text)

            mono_fields_correct = {
                "sentiment": mono["sentiment"] == expected["sentiment"] if expected["sentiment"] else None,
                "intent": mono["intent"] == expected["intent"] if expected["intent"] else None,
                "urgency": mono["urgency"] == expected["urgency"] if expected["urgency"] else None,
            }
            mono_all_correct = all(v for v in mono_fields_correct.values() if v is not None)

            multi_fields_correct = {
                "sentiment": multi["sentiment"] == expected["sentiment"] if expected["sentiment"] else None,
                "intent": multi["intent"] == expected["intent"] if expected["intent"] else None,
                "urgency": multi["urgency"] == expected["urgency"] if expected["urgency"] else None,
            }
            multi_all_correct = all(v for v in multi_fields_correct.values() if v is not None)

            config_results[config_name] = {
                "monolithic": {**mono, "fields_correct": mono_fields_correct, "all_correct": mono_all_correct},
                "multistage": {**multi, "fields_correct": multi_fields_correct, "all_correct": multi_all_correct},
            }

            marks = {True: "+", False: "x", None: "?"}
            mono_marks = "".join(marks[mono_fields_correct[f]] for f in ["sentiment", "intent", "urgency"])
            multi_marks = "".join(marks[multi_fields_correct[f]] for f in ["sentiment", "intent", "urgency"])
            print(f"  {config_name:12s}  mono=[{mono_marks}] S={mono['sentiment']} I={mono['intent']} U={mono['urgency']} ({mono['latency']:.1f}s)")
            print(f"  {' ':12s}  multi=[{multi_marks}] S={multi['sentiment']} I={multi['intent']} U={multi['urgency']} ({multi['latency']:.1f}s)", flush=True)

        result = {
            "index": i + 1,
            "input": snippet,
            "input_full": text,
            "expected": expected,
            "configs": config_results,
        }
        all_results.append(result)

    report = build_report(all_results)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(report, indent=2) + "\n")
    print_summary(report)
    print(f"\nDetailed results saved to: {output_path}")


def build_report(results):
    total = len(results)
    fields = ["sentiment", "intent", "urgency"]
    config_names = list(MODEL_CONFIGS.keys())
    variants = ["monolithic", "multistage"]

    per_config = {}
    for config_name in config_names:
        config_data = {}
        for variant in variants:
            per_field_correct = {f: 0 for f in fields}
            per_field_total = {f: 0 for f in fields}
            all_correct_count = 0
            format_ok_count = 0
            total_latency = 0
            total_api_local = 0
            total_api_api = 0
            total_prompt_tokens = 0
            total_completion_tokens = 0
            total_api_prompt = 0
            total_api_completion = 0

            for r in results:
                v = r["configs"][config_name][variant]
                for f in fields:
                    fc = v["fields_correct"][f]
                    if fc is not None:
                        per_field_total[f] += 1
                        if fc:
                            per_field_correct[f] += 1
                if v["all_correct"]:
                    all_correct_count += 1
                if v["format_ok"]:
                    format_ok_count += 1
                total_latency += v["latency"]
                total_api_local += v["api_calls_local"]
                total_api_api += v["api_calls_api"]
                total_prompt_tokens += v["prompt_tokens"]
                total_completion_tokens += v["completion_tokens"]
                total_api_prompt += v.get("api_prompt_tokens", 0)
                total_api_completion += v.get("api_completion_tokens", 0)

            per_field_accuracy = {}
            for f in fields:
                if per_field_total[f] > 0:
                    per_field_accuracy[f] = round(per_field_correct[f] / per_field_total[f], 3)
                else:
                    per_field_accuracy[f] = None

            api_cost = (total_api_prompt * 0.00000015) + (total_api_completion * 0.00000060)

            config_data[variant] = {
                "per_field_accuracy": per_field_accuracy,
                "per_field_correct": per_field_correct,
                "per_field_total": per_field_total,
                "all_correct": all_correct_count,
                "all_correct_rate": round(all_correct_count / total, 3),
                "format_ok": format_ok_count,
                "format_compliance": round(format_ok_count / total, 3),
                "avg_latency": round(total_latency / total, 3),
                "api_calls_local": total_api_local,
                "api_calls_api": total_api_api,
                "prompt_tokens": total_prompt_tokens,
                "completion_tokens": total_completion_tokens,
                "estimated_cost": round(api_cost, 6),
            }
        per_config[config_name] = config_data

    return {
        "local_model": LOCAL_MODEL,
        "api_model": API_MODEL,
        "num_examples": total,
        "configs": per_config,
        "results": results,
    }


def print_summary(report):
    print("\n" + "=" * 80)
    print("INFERENCE DECOMPOSITION REPORT")
    print("=" * 80)
    print(f"\nLocal: {report['local_model']}  |  API: {report['api_model']}  |  Examples: {report['num_examples']}")

    fields = ["sentiment", "intent", "urgency"]

    print("\n--- Per-Field Accuracy ---")
    header = f"{'Config':<14} {'Variant':<12}"
    for f in fields:
        header += f" {f:>10}"
    header += f" {'All 3':>8} {'Format':>8} {'Latency':>8} {'Cost':>10}"
    print(header)
    print("-" * len(header))

    for config_name in report["configs"]:
        for variant in ["monolithic", "multistage"]:
            v = report["configs"][config_name][variant]
            row = f"{config_name:<14} {variant:<12}"
            for f in fields:
                acc = v["per_field_accuracy"][f]
                acc_str = f"{acc:.1%}" if acc is not None else "N/A"
                row += f" {acc_str:>10}"
            all3_str = f"{v['all_correct_rate']:.1%}"
            fmt_str = f"{v['format_compliance']:.0%}"
            lat_str = f"{v['avg_latency']:.2f}s"
            cost_str = f"${v['estimated_cost']:.4f}"
            row += f" {all3_str:>8} {fmt_str:>8} {lat_str:>8} {cost_str:>10}"
            print(row)

    print("\n--- API Call Breakdown ---")
    print(f"{'Config':<14} {'Variant':<12} {'Local':>8} {'API':>8} {'Total':>8}")
    print("-" * 54)
    for config_name in report["configs"]:
        for variant in ["monolithic", "multistage"]:
            v = report["configs"][config_name][variant]
            total_calls = v["api_calls_local"] + v["api_calls_api"]
            print(f"{config_name:<14} {variant:<12} {v['api_calls_local']:>8} {v['api_calls_api']:>8} {total_calls:>8}")

    print("\n--- Key Comparisons ---")
    for config_name in report["configs"]:
        mono = report["configs"][config_name]["monolithic"]
        multi = report["configs"][config_name]["multistage"]
        print(f"\n  {config_name}:")
        for f in fields:
            ma = mono["per_field_accuracy"][f]
            sa = multi["per_field_accuracy"][f]
            if ma is not None and sa is not None:
                diff = sa - ma
                print(f"    {f:>10}: mono={ma:.1%} multi={sa:.1%} ({diff:+.1%})")
        mono_all = mono["all_correct_rate"]
        multi_all = multi["all_correct_rate"]
        diff = multi_all - mono_all
        print(f"    {'all 3':>10}: mono={mono_all:.1%} multi={multi_all:.1%} ({diff:+.1%})")


def run_demo(text, config_name):
    if config_name not in MODEL_CONFIGS:
        print(f"ERROR: Unknown config '{config_name}'. Choose from: {', '.join(MODEL_CONFIGS.keys())}")
        sys.exit(1)

    local_client, api_client = make_clients()
    config = MODEL_CONFIGS[config_name]

    print(f"Config: {config_name}")
    print(f"Input:  \"{text}\"")
    print("=" * 70)

    print(f"\n--- Variant A: Monolithic (single prompt) ---")
    print(f"  Model: {config['mono_model']}")
    mono = run_monolithic(local_client, api_client, config["mono_model"], text)
    print(f"  Raw response: {mono['raw']}")
    print(f"  Sentiment: {mono['sentiment']}")
    print(f"  Intent:    {mono['intent']}")
    print(f"  Urgency:   {mono['urgency']}")
    print(f"  Valid JSON: {mono['format_ok']}  |  Latency: {mono['latency']:.2f}s")

    print(f"\n--- Variant B: Multi-stage (3 stages) ---")
    print(f"  Models: {' -> '.join(config['stage_models'])}")
    multi = run_multistage(local_client, api_client, config["stage_models"], text)
    for s in multi["stages"]:
        print(f"  Stage {s['stage']} ({s['field']}): {s['value']}  [{s['model']}]  raw={s['raw']}")
    print(f"  ---")
    print(f"  Sentiment: {multi['sentiment']}")
    print(f"  Intent:    {multi['intent']}")
    print(f"  Urgency:   {multi['urgency']}")
    print(f"  All valid JSON: {multi['format_ok']}  |  Latency: {multi['latency']:.2f}s")


def print_usage():
    print("Usage:")
    print("  Evaluate:  python scripts/inference_decomposition.py [eval_file] [output_file]")
    print("  Demo:      python scripts/inference_decomposition.py --demo \"<comment>\" [config]")
    print(f"  Configs:   {', '.join(MODEL_CONFIGS.keys())}")


if __name__ == "__main__":
    if "--demo" in sys.argv:
        idx = sys.argv.index("--demo")
        if idx + 1 >= len(sys.argv):
            print("ERROR: --demo requires a comment text argument")
            print_usage()
            sys.exit(1)
        demo_text = sys.argv[idx + 1]
        demo_config = sys.argv[idx + 2] if idx + 2 < len(sys.argv) else "local-only"
        try:
            run_demo(demo_text, demo_config)
        except KeyboardInterrupt:
            print("\n\nInterrupted.")
            sys.exit(0)
    elif "--help" in sys.argv or "-h" in sys.argv:
        print_usage()
    else:
        eval_file = sys.argv[1] if len(sys.argv) > 1 else "data/triage_eval.jsonl"
        output_file = sys.argv[2] if len(sys.argv) > 2 else "results/decomposition_report.json"
        try:
            run_evaluation(eval_file, output_file)
        except KeyboardInterrupt:
            print("\n\nInterrupted. Exiting.")
            sys.exit(0)
