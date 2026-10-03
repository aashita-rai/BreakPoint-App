#!/usr/bin/env python
"""Download/cache every enabled model's weights (run once on the login node, with internet)."""
import numpy as np
from common.config import load_config, enabled_models
from pose_backends import make_backend

cfg = load_config()
dummy = np.zeros((480, 640, 3), dtype=np.uint8)
failed = []
for m in enabled_models(cfg):
    try:
        b = make_backend(m, cfg, "cpu")
        b.infer(dummy)
        b.close()
        print("OK  ", m["name"])
    except Exception as e:   # report loudly at the end, keep going
        failed.append((m["name"], repr(e)))
        print("FAIL", m["name"], repr(e))
if failed:
    raise SystemExit(f"{len(failed)} model(s) failed to load: {failed}")
