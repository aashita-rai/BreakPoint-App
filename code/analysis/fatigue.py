import numpy as np


def _score(dev, cap):
    return float(np.clip(dev, 0.0, cap) / cap)


def compute_fatigue(rm, fcfg):
    """rm: list of per-rep metric dicts (in order). Adds rfi / rfi_smooth / status to clean reps.
    Returns baseline, breakdown rep (1-based index into rm) and overall RFI."""
    clean = [i for i, r in enumerate(rm) if r["clean"]]
    n_base = fcfg["baseline_reps"]
    if len(clean) < n_base + 2:
        raise ValueError(f"only {len(clean)} clean reps found; need at least {n_base + 2} "
                         f"(baseline of {n_base} + 2 more). Check rep.prominence / the video.")
    base_ids = clean[:n_base]
    base = {k: float(np.median([rm[i][k] for i in base_ids])) for k in ("tempo_s", "depth", "ascent_speed")}
    if min(base.values()) <= 0:
        raise ValueError(f"degenerate baseline {base}")
    w = fcfg["weights"]
    raw = []
    for i in clean:
        r = rm[i]
        s_t = _score((r["tempo_s"] - base["tempo_s"]) / base["tempo_s"], fcfg["cap"])           # longer = tired
        s_d = _score((base["depth"] - r["depth"]) / base["depth"], fcfg["cap"])                 # shallower = tired
        s_s = _score((base["ascent_speed"] - r["ascent_speed"]) / base["ascent_speed"], fcfg["cap"])  # slower = tired
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
    return {"baseline": {"n_reps": n_base, **base}, "breakdown_rep": breakdown, "overall_rfi": overall}
