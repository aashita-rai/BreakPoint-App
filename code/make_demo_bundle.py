#!/usr/bin/env python
"""Copy the real result JSON + annotated video into the app so the demo works offline.
   python code/render_overlay.py --model <m> && python code/make_demo_bundle.py --model <m>
Then rebuild the app (re-run app/setup.sh, or copy app/assets/demo/* into app/client/assets/demo/)."""
import argparse
import json
import shutil
import sys
from common.paths import ROOT, METRICS, RESULTS

ap = argparse.ArgumentParser()
ap.add_argument("--model", default=None)
a = ap.parse_args()
model = a.model
if not model:
    w = RESULTS / "winner.json"
    if not w.exists():
        sys.exit("no --model given and results/winner.json missing")
    model = json.load(open(w)).get("serve_model")
    if not model:
        sys.exit("winner.json has no serve_model; pass --model")
res = json.load(open(METRICS / f"{model}.json"))
vid = RESULTS / "annotated" / f"{model}.mp4"
if not vid.exists():
    sys.exit(f"{vid} missing. Run: python code/render_overlay.py --model {model}")
res["annotated_video_url"] = None
for dest in (ROOT / "app/assets/demo", ROOT / "app/client/assets/demo"):
    if dest.parent.exists():
        dest.mkdir(parents=True, exist_ok=True)
        json.dump(res, open(dest / "result.json", "w"))
        shutil.copy(vid, dest / "annotated.mp4")
        print("updated", dest)
