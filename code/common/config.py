import copy
import yaml
from .paths import CODE, ROOT


def _merge(a, b):
    out = copy.deepcopy(a)
    for k, v in b.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config():
    with open(CODE / "config.yaml") as f:
        cfg = yaml.safe_load(f)
    tuned = CODE / "config_tuned.yaml"   # written by validation/eval_reps.py --tune (dev split only)
    if tuned.exists():
        with open(tuned) as f:
            cfg = _merge(cfg, yaml.safe_load(f) or {})
    return cfg


def enabled_models(cfg):
    return [m for m in cfg["models"] if m.get("enabled", True)]


def get_model(cfg, name):
    for m in cfg["models"]:
        if m["name"] == name:
            return m
    raise KeyError(f"model '{name}' not in config.yaml (known: {[m['name'] for m in cfg['models']]})")


def video_path(cfg):
    p = ROOT / cfg["video"]
    if not p.exists():
        raise FileNotFoundError(f"video not found: {p}. Put squats.mp4 there.")
    return p
