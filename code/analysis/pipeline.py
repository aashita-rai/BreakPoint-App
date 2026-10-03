import numpy as np
from common.keypoint_schema import load_keypoints
from . import signals, reps as reps_mod, metrics, fatigue


def analyze_arrays(kps, times, fps, cfg, model_name="unknown", with_debug=False):
    a = cfg["analysis"]
    side, side_scores = signals.pick_side(kps)
    joints, missing = signals.clean_joints(kps, fps, side, a)
    sig = signals.hip_signal(joints, fps, a)
    h, L = sig["h"], sig["L"]
    segs = reps_mod.segment_reps(h, fps, a["rep"])
    if not segs:
        raise ValueError("no squat reps detected (try lowering analysis.rep.prominence)")
    rm = [metrics.rep_metrics(s, h, joints, L, fps) for s in segs]
    fat = fatigue.compute_fatigue(rm, a["fatigue"])
    out_reps = []
    for i, r in enumerate(rm, 1):
        d = {"i": i}
        d.update({k: (None if v is None else (round(v, 4) if isinstance(v, float) else v)) for k, v in r.items()})
        out_reps.append(d)
    step = max(1, len(h) // 600)
    result = {
        "movement": "squat", "model": model_name, "fps": round(float(fps), 3),
        "side": side, "leg_length_px": round(float(L), 2),
        "rep_count": len(rm), "clean_rep_count": int(sum(r["clean"] for r in rm)),
        "reps": out_reps,
        "baseline": {k: (round(v, 4) if isinstance(v, float) else v) for k, v in fat["baseline"].items()},
        "breakdown_rep": fat["breakdown_rep"],
        "overall_rfi": round(fat["overall_rfi"], 1),
        "missing_frame_rate": round(float(missing.mean()), 4),
        "hip_signal": {"t": [round(float(x), 3) for x in times[::step]], "h": [round(float(x), 4) for x in h[::step]]},
        "annotated_video_url": None,
    }
    if with_debug:
        return result, {"h": h, "joints": joints, "segs": segs, "sig": sig, "side": side, "times": times}
    return result


def analyze_npz(path, cfg, with_debug=False):
    d = load_keypoints(path)
    return analyze_arrays(d["keypoints"], d["times"], d["meta"]["fps"], cfg, d["meta"]["model"], with_debug)
