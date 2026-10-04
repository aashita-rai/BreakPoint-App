import numpy as np


def knee_angle_deg(hip, knee, ankle):
    a, b = hip - knee, ankle - knee
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-9)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def rep_metrics(rep, h, joints, L, fps):
    s, b, e = rep["start"], rep["bottom"], rep["end"]
    descent = (b - s) / fps
    ascent = (e - b) / fps
    vel = np.gradient(h, 1.0 / fps)
    ang = knee_angle_deg(joints["hip"][s:e + 1], joints["knee"][s:e + 1], joints["ankle"][s:e + 1])
    return {
        "start_t": s / fps, "bottom_t": b / fps, "end_t": e / fps,
        "tempo_s": (e - s) / fps, "descent_s": descent, "ascent_s": ascent,
        "depth": float(max(0.0, -h[b])),
        "ascent_speed": float((h[e] - h[b]) / ascent) if ascent > 0 else float("nan"),
        "peak_ascent_speed": float(vel[b:e + 1].max()),
        "min_knee_angle": float(ang.min()),
        "hip_below_knee": float((joints["hip"][b, 1] - joints["knee"][b, 1]) / L),
        "clean": rep["clean"],
    }


def form_warnings(rep, baseline):
    """Return conservative, non-diagnostic cues tied to this rep's measurements."""
    warnings = []
    if rep["depth"] < baseline["depth"] * 0.80:
        warnings.append("Depth is getting shallower; slow down and keep a consistent range.")
    if rep["ascent_s"] > baseline["tempo_s"] * 0.70:
        warnings.append("The rise is slowing; stop the set if you cannot keep control.")
    if rep["min_knee_angle"] < 45:
        warnings.append("Knee angle is very closed; use a comfortable depth and stay controlled.")
    if rep["hip_below_knee"] < -0.05:
        warnings.append("Hips stayed above knee level; aim for a consistent depth.")
    return warnings[:2]
