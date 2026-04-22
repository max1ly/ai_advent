import time
import random
import requests

BASE_URL = "https://arctic-shift.photon-reddit.com/api"
SUBREDDITS = ["movies", "videogames", "books", "tvshows", "tech"]

_last_request_time = 0.0


def _rate_limit():
    global _last_request_time
    elapsed = time.time() - _last_request_time
    if elapsed < 1.0:
        time.sleep(1.0 - elapsed)
    _last_request_time = time.time()


def fetch_posts(subreddit, limit=25):
    _rate_limit()
    before = int(time.time()) - 3 * 86400
    resp = requests.get(f"{BASE_URL}/posts/search", params={
        "subreddit": subreddit,
        "limit": limit * 4,
        "sort": "desc",
        "before": before,
    })
    resp.raise_for_status()
    body = resp.json()
    posts = body.get("data") or []
    posts = [p for p in posts if p.get("num_comments", 0) >= 5]
    return posts[:limit]


def fetch_comments(post_id, limit=10):
    _rate_limit()
    link_id = post_id if post_id.startswith("t3_") else f"t3_{post_id}"
    resp = requests.get(f"{BASE_URL}/comments/tree", params={
        "link_id": link_id,
        "limit": limit,
    })
    resp.raise_for_status()
    body = resp.json()
    raw = body.get("data") or []
    comments = []
    for item in raw:
        d = item.get("data", item) if isinstance(item, dict) else item
        text = d.get("body", "")
        if not text or text in ("[deleted]", "[removed]"):
            continue
        comments.append({
            "id": d.get("id", ""),
            "author": d.get("author", "[unknown]"),
            "score": d.get("score", 0),
            "body": text,
        })
    return comments


def load_all_posts():
    all_posts = []
    for sub in SUBREDDITS:
        try:
            posts = fetch_posts(sub, limit=25)
            for p in posts:
                all_posts.append({
                    "id": p.get("id", ""),
                    "title": p.get("title", "(no title)"),
                    "subreddit": p.get("subreddit", sub),
                    "author": p.get("author", "[unknown]"),
                    "score": p.get("score", 0),
                    "num_comments": p.get("num_comments", 0),
                    "permalink": p.get("permalink", ""),
                })
        except Exception as e:
            print(f"Error fetching posts from r/{sub}: {e}")
    random.shuffle(all_posts)
    return all_posts
