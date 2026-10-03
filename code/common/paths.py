import os
from pathlib import Path

ROOT = Path(os.environ.get("HACKATHON_ROOT", Path(__file__).resolve().parents[2]))
CODE = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = DATA / "raw"
FRAMES = DATA / "frames"
ANNOT = DATA / "annotations"
RESULTS = ROOT / "results"
KEYPOINTS = RESULTS / "keypoints"
KEYPOINTS_DEG = RESULTS / "keypoints_degraded"
METRICS = RESULTS / "metrics"
PLOTS = RESULTS / "plots"
SPEED = RESULTS / "speed"
MODEL_CACHE = ROOT / "model_cache"


def ensure(p: Path) -> Path:
    p.mkdir(parents=True, exist_ok=True)
    return p
