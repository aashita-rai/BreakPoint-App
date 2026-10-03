#!/usr/bin/env python
"""keypoints npz -> reps -> metrics -> RFI JSON.   python code/run_analysis.py --model yolo11m-pose"""
import argparse
import json
from common.config import load_config
from common.paths import KEYPOINTS, METRICS, ensure
from analysis.pipeline import analyze_npz

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--keypoints", default=None)
ap.add_argument("--out", default=None)
a = ap.parse_args()
cfg = load_config()
src = a.keypoints or KEYPOINTS / f"{a.model}.npz"
res = analyze_npz(src, cfg)
out = a.out or ensure(METRICS) / f"{a.model}.json"
with open(out, "w") as f:
    json.dump(res, f)
print(f"{a.model}: reps={res['rep_count']} (clean {res['clean_rep_count']}) breakdown_rep={res['breakdown_rep']} "
      f"overall_rfi={res['overall_rfi']} side={res['side']} -> {out}")
