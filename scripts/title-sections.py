#!/usr/bin/env python3
"""Fill missing section headings. The statute's own marginal note is usually embedded in the scanned text;
a model extracts it (or writes a short descriptive heading). Output is cached in scripts/derived-titles.json."""
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
corpus = json.load(open(f"{ROOT}/src/data/corpus.json"))
cache_path = f"{ROOT}/scripts/derived-titles.json"
cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
todo = [s for s in corpus if not s["title"] and s["id"] not in cache]
print("untitled:", len(todo))
SYSTEM = """You label sections of Nigerian statutes. For each section you get its id and text. The text is from a scan, so the statute's own marginal note (its official heading, e.g. "Arrest in lieu prohibited.") is often embedded somewhere in the text, sometimes split into fragments.
For each section return the heading:
- If the marginal note is present, reassemble and return it exactly, fixing only obvious scan errors.
- Otherwise write a plain descriptive heading of 3 to 9 words in the style of a statute heading.
No trailing full stop. Return ONLY a JSON object mapping each id to its heading."""
def run(batch):
    user = "\n\n".join(f"id: {s['id']}\n{s['text'][:520]}" + (f" ... {s['text'][-160:]}" if len(s['text']) > 700 else "") for s in batch)
    env = {k: v for k, v in os.environ.items() if k not in ("CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT")}
    for attempt in range(2):
        try:
            out = subprocess.run(["claude", "-p", user, "--system-prompt", SYSTEM, "--model", "haiku", "--output-format", "text"], capture_output=True, text=True, env=env, stdin=subprocess.DEVNULL, timeout=240).stdout
            m = re.search(r"\{[\s\S]*\}", out)
            d = json.loads(m.group(0))
            return {k: re.sub(r"\s+", " ", str(v)).strip().rstrip(".") for k, v in d.items() if isinstance(v, str) and 3 <= len(v) <= 140}
        except Exception as e:
            err = e
    print("batch failed:", err, file=sys.stderr); return {}
batches = [todo[i:i+14] for i in range(0, len(todo), 14)]
with ThreadPoolExecutor(max_workers=5) as ex:
    for res in ex.map(run, batches):
        cache.update(res)
valid = {s["id"] for s in corpus}
cache = {k: v for k, v in cache.items() if k in valid}
json.dump(cache, open(cache_path, "w"), indent=1, ensure_ascii=False, sort_keys=True)
print("derived titles cached:", len(cache))
