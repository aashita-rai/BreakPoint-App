import numpy as np


def _score(dev, cap):
    return float(np.clip(dev, 0.0, cap) / cap)


def compute_fatigue(rm, fcfg, squat_variation="standard"):
    """rm: list of per-rep metric dicts (in order). Adds rfi / rfi_smooth / status to clean reps.
    Returns baseline, breakdown rep (1-based index into rm) and overall RFI.

    Pauses: tempo is moving time, plus the part of a rep's pauses that may mean fatigue, measured against
    the athlete's own first reps (so a habit or a planned pause in every rep is not fatigue):
      - stalls on the way up count when longer than in the first reps,
      - pauses at/near the bottom count when longer than in the first reps, except for the 'pause'
        variation, where the bottom pause is the exercise,
      - resting while standing between reps never counts (it is reported, not scored)."""
    clean = [i for i, r in enumerate(rm) if r["clean"]]
    if not clean:
        raise ValueError("no clean reps found; keep the whole body visible and record a longer set")
    requested_base = fcfg["baseline_reps"]
    n_base = min(requested_base, len(clean))
    base_ids = clean[:n_base]
    base = {k: float(np.median([rm[i][k] for i in base_ids])) for k in ("tempo_s", "depth", "ascent_speed")}
    if min(base.values()) <= 0:
        raise ValueError(f"degenerate baseline {base}")
    base_bottom = float(np.median([rm[i].get("bottom_pause_s", 0.0) for i in base_ids]))
    base_stall = float(np.median([rm[i].get("stall_s", 0.0) for i in base_ids]))
    for r in rm:
        stall = max(0.0, r.get("stall_s", 0.0) - base_stall)
        bottom = 0.0 if squat_variation == "pause" else max(0.0, r.get("bottom_pause_s", 0.0) - base_bottom)
        r["fatigue_pause_s"] = round(stall + bottom, 2)
        # A stall is also a slower rise: spread the extra stall time over the ascent.
        asc = r.get("ascent_s") or 0.0
        r["scored_ascent_speed"] = r["ascent_speed"] * asc / (asc + stall) if asc > 0 else r["ascent_speed"]
    w = fcfg["weights"]
    raw = []
    for i in clean:
        r = rm[i]
        s_t = _score((r["tempo_s"] + r["fatigue_pause_s"] - base["tempo_s"]) / base["tempo_s"], fcfg["cap"])  # longer = tired
        s_d = _score((base["depth"] - r["depth"]) / base["depth"], fcfg["cap"])                 # shallower = tired
        s_s = _score((base["ascent_speed"] - r["scored_ascent_speed"]) / base["ascent_speed"], fcfg["cap"])  # slower = tired
        wt = w["tempo"] + w["depth"] + w["speed"]
        raw.append(100.0 * (w["tempo"] * s_t + w["depth"] * s_d + w["speed"] * s_s) / wt)
    raw = np.array(raw)
    k = fcfg["smooth_reps"]
    sm = np.array([np.median(raw[max(0, j - k + 1): j + 1]) for j in range(len(raw))])
    for r in rm:
        r["rfi"] = None; r["rfi_raw"] = None; r["status"] = None
    for j, i in enumerate(clean):
        rm[i]["rfi_raw"] = float(raw[j])
        rm[i]["rfi"] = float(sm[j])
        v = sm[j]
        rm[i]["status"] = "green" if v < fcfg["green_below"] else ("amber" if v < fcfg["amber_below"] else "red")
    breakdown = None
    c = fcfg["breakdown_consecutive"]
    for j in range(len(sm) - c + 1):
        if all(sm[j + q] > fcfg["breakdown_threshold"] for q in range(c)):
            breakdown = clean[j] + 1
            break
    overall = float(np.median(sm[-k:]))
    return {
        "baseline": {"n_reps": n_base, **base},
        "breakdown_rep": breakdown,
        "overall_rfi": overall,
        "insufficient_reps": len(clean) < requested_base + 2,
    }
