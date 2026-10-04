import numpy as np


def knee_angle_deg(hip, knee, ankle):
    a, b = hip - knee, ankle - knee
    cos = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1) + 1e-9)
    return np.degrees(np.arccos(np.clip(cos, -1, 1)))


def knee_angle_plausible(angle, depth):
    """Is the 2D knee angle geometrically possible for this hip depth (both in leg lengths)?
    With thigh = shin = L/2 and knee angle t, the hip-ankle distance is L*sin(t/2). Its vertical part is
    1 - depth; its horizontal part (hip behind ankle) is at most ~0.6 L in a squat. That bounds t.
    Catches the front-view / leg-crossing errors where e.g. depth 0.72 came with a 147 deg angle."""
    if not np.isfinite(angle) or not np.isfinite(depth):
        return False
    rise = min(1.0, max(0.0, 1.0 - depth))
    lo = 2 * np.degrees(np.arcsin(rise)) - 12
    hi = 2 * np.degrees(np.arcsin(min(1.0, np.hypot(rise, 0.6)))) + 15
    return bool(lo <= angle <= hi)


def pause_segments(h, vel, s, b, e, fps, pause_speed, min_pause_s):
    """Stretches where the hip is still, labelled by where in the squat they happen:
    'top' (near standing, i.e. resting between reps), 'bottom', 'descent' (stopped on the way down)
    or 'ascent' (stalled on the way up, a classic sign of struggling to stand)."""
    depth = max(1e-6, -h[b])
    still = np.abs(vel[s:e]) <= pause_speed
    out, i = [], 0
    while i < len(still):
        if not still[i]:
            i += 1
            continue
        j = i
        while j < len(still) and still[j]:
            j += 1
        dur = (j - i) / fps
        if dur >= min_pause_s:
            a0, a1 = s + i, s + j
            rel = float(np.median(-h[a0:a1])) / depth   # 0 = standing, 1 = bottom
            where = "bottom" if rel >= 0.8 else "top" if rel <= 0.2 else ("descent" if a1 <= b else "ascent")
            out.append({"at": where, "s": round(dur, 2), "t": round(a0 / fps, 2)})
        i = j
    return out


def rep_metrics(rep, h, joints, L, fps, pause_speed=0.10, side_view=True, min_pause_s=0.30):
    """Tempo is MOVING time (descent + ascent with the hip actually moving). Pauses are measured
    separately by duration and location (pause_segments); fatigue.py decides which of them count."""
    s, b, e = rep["start"], rep["bottom"], rep["end"]
    vel = np.gradient(h, 1.0 / fps)
    moving = np.abs(vel) > pause_speed
    pauses = pause_segments(h, vel, s, b, e, fps, pause_speed, min_pause_s)
    by = lambda *where: round(sum(p["s"] for p in pauses if p["at"] in where), 2)  # noqa: E731
    descent = float(moving[s:b].sum()) / fps
    ascent = float(moving[b:e].sum()) / fps
    total = (e - s) / fps
    depth = float(max(0.0, -h[b]))
    ang = knee_angle_deg(joints["hip"][s:e + 1], joints["knee"][s:e + 1], joints["ankle"][s:e + 1])
    min_angle = float(ang.min())
    return {
        "start_t": s / fps, "bottom_t": b / fps, "end_t": e / fps,
        "tempo_s": descent + ascent, "descent_s": descent, "ascent_s": ascent,
        "total_s": total, "pause_s": max(0.0, total - descent - ascent),
        "pauses": pauses,
        "top_pause_s": by("top"),                  # resting while standing: reported, never scored
        "bottom_pause_s": by("bottom", "descent"),  # stopping low or on the way down
        "stall_s": by("ascent"),                    # stalling on the way up
        "depth": depth,
        "ascent_speed": float((h[e] - h[b]) / ascent) if ascent > 0 else float("nan"),
        "peak_ascent_speed": float(vel[b:e + 1].max()),
        "min_knee_angle": min_angle,
        "knee_angle_ok": bool(side_view and knee_angle_plausible(min_angle, depth)),
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
    if rep.get("knee_angle_ok") and rep["min_knee_angle"] < 45:
        warnings.append("Knee angle is very closed; use a comfortable depth and stay controlled.")
    if rep["hip_below_knee"] < -0.05:
        warnings.append("Hips stayed above knee level; aim for a consistent depth.")
    return warnings[:2]
