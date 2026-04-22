from __future__ import annotations

import argparse
import time
import sys

from openai import OpenAI

MODEL = "gpt-4o-mini-2024-07-18"
POLL_INTERVAL = 30


def upload_file(client: OpenAI, filepath: str) -> str:
    print(f"Uploading {filepath}...")
    file_obj = client.files.create(
        file=open(filepath, "rb"),
        purpose="fine-tune",
    )
    print(f"File uploaded: {file_obj.id}")
    return file_obj.id


def create_finetune_job(client: OpenAI, training_file_id: str, validation_file_id: str | None = None, suffix: str | None = None) -> str:
    kwargs = {
        "model": MODEL,
        "training_file": training_file_id,
    }
    if validation_file_id:
        kwargs["validation_file"] = validation_file_id
    if suffix:
        kwargs["suffix"] = suffix

    print(f"Creating fine-tuning job with model={MODEL}...")
    job = client.fine_tuning.jobs.create(**kwargs)
    print(f"Job created: {job.id}")
    print(f"Status: {job.status}")
    return job.id


def poll_status(client: OpenAI, job_id: str):
    print(f"\nPolling job {job_id} every {POLL_INTERVAL}s...")
    while True:
        job = client.fine_tuning.jobs.retrieve(job_id)
        print(f"  Status: {job.status}", end="")

        if job.status == "succeeded":
            print(f"\n\nFine-tuning complete!")
            print(f"Fine-tuned model: {job.fine_tuned_model}")
            print(f"Trained tokens: {job.trained_tokens}")
            return job
        elif job.status in ("failed", "cancelled"):
            print(f"\n\nJob {job.status}.")
            if hasattr(job, "error") and job.error:
                print(f"Error: {job.error}")
            return job
        else:
            print(f" — waiting {POLL_INTERVAL}s...")
            time.sleep(POLL_INTERVAL)


def main():
    parser = argparse.ArgumentParser(description="OpenAI Fine-Tuning Client")
    parser.add_argument("--train", default="data/train.jsonl", help="Training JSONL file path")
    parser.add_argument("--eval", default="data/eval.jsonl", help="Evaluation JSONL file path")
    parser.add_argument("--suffix", default=None, help="Model suffix (max 40 chars)")
    parser.add_argument("--run", action="store_true", help="Actually execute (without this flag, dry-run only)")
    args = parser.parse_args()

    if not args.run:
        print("=" * 60)
        print("DRY RUN — No API calls will be made")
        print("=" * 60)
        print(f"\nWould execute the following steps:")
        print(f"  1. Upload training file: {args.train}")
        print(f"  2. Upload evaluation file: {args.eval}")
        print(f"  3. Create fine-tuning job for model: {MODEL}")
        if args.suffix:
            print(f"     Model suffix: {args.suffix}")
        print(f"  4. Poll job status every {POLL_INTERVAL}s until completion")
        print(f"\nTo execute for real, add the --run flag.")
        sys.exit(0)

    client = OpenAI()

    train_file_id = upload_file(client, args.train)
    eval_file_id = upload_file(client, args.eval)
    job_id = create_finetune_job(client, train_file_id, eval_file_id, args.suffix)
    poll_status(client, job_id)


if __name__ == "__main__":
    main()
