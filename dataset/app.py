import json
import os
from flask import Flask, render_template, request, jsonify
from reddit_fetcher import load_all_posts, fetch_comments

app = Flask(__name__)

DATA_FILE = os.path.join(os.path.dirname(__file__), "data", "real_comments.jsonl")
SYSTEM_PROMPT = "Classify the sentiment of the following Reddit comment as exactly one of: Positive, Negative, or Neutral."

post_queue = []
current_post_index = -1
current_comments = []
session_stats = {"labeled": 0, "skipped": 0}


def count_file_entries():
    if not os.path.exists(DATA_FILE):
        return 0
    with open(DATA_FILE, "r") as f:
        return sum(1 for line in f if line.strip())


def load_existing_texts():
    texts = set()
    if not os.path.exists(DATA_FILE):
        return texts
    with open(DATA_FILE, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
                for msg in entry.get("messages", []):
                    if msg.get("role") == "user":
                        texts.add(msg["content"])
            except json.JSONDecodeError:
                continue
    return texts


existing_texts = set()


def append_label(text, label):
    if text in existing_texts:
        return False
    entry = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
            {"role": "assistant", "content": label},
        ]
    }
    with open(DATA_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
    existing_texts.add(text)
    return True


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/post")
def get_post():
    if current_post_index < 0 or current_post_index >= len(post_queue):
        return jsonify({"post": None, "comments": [], "stats": _stats(), "queue_remaining": 0})
    post = post_queue[current_post_index]
    return jsonify({
        "post": post,
        "comments": current_comments,
        "stats": _stats(),
        "queue_remaining": len(post_queue) - current_post_index - 1,
    })


@app.route("/api/label", methods=["POST"])
def label_comment():
    data = request.json
    text = data.get("text", "").strip()
    label = data.get("label", "")
    if label not in ("Positive", "Negative", "Neutral"):
        return jsonify({"error": "Invalid label"}), 400
    if not text:
        return jsonify({"error": "Empty text"}), 400
    written = append_label(text, label)
    if written:
        session_stats["labeled"] += 1
    return jsonify({"written": written, "stats": _stats()})


@app.route("/api/skip", methods=["POST"])
def skip_comment():
    session_stats["skipped"] += 1
    return jsonify({"stats": _stats()})


@app.route("/api/next-post", methods=["POST"])
def next_post():
    global current_post_index, current_comments
    current_post_index += 1
    if current_post_index < len(post_queue):
        post = post_queue[current_post_index]
        try:
            current_comments = fetch_comments(post["id"], limit=10)
        except Exception as e:
            print(f"Error fetching comments: {e}")
            current_comments = []
    else:
        current_comments = []
    return get_post()


def _stats():
    return {
        "labeled": session_stats["labeled"],
        "skipped": session_stats["skipped"],
        "total_in_file": count_file_entries(),
    }


def initialize():
    global post_queue, current_post_index, current_comments, existing_texts
    print("Loading existing labeled texts for dedup...")
    existing_texts = load_existing_texts()
    print(f"Found {len(existing_texts)} existing entries.")
    print("Fetching posts from Arctic Shift API (this may take a moment)...")
    post_queue = load_all_posts()
    print(f"Loaded {len(post_queue)} posts. Starting server...")
    current_post_index = 0
    if post_queue:
        try:
            current_comments = fetch_comments(post_queue[0]["id"], limit=10)
        except Exception as e:
            print(f"Error fetching initial comments: {e}")
            current_comments = []


if __name__ == "__main__":
    initialize()
    app.run(debug=False, port=5001)
