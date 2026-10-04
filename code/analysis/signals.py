import numpy as np
from common.keypoint_schema import SIDES, JOINTS
from common.filters import interpolate_gaps, fill_nearest, smooth_series


def pick_side(kps):
    """Near side = side whose shoulder/hip/knee/ankle have the higher mean confidence."""
    scores = {s: float(np.mean([kps[:, idx[j], 2].mean() for j in JOINTS])) for s, idx in SIDES.items()}
    return max(scores, key=scores.get), scores


def clean_joints(kps, fps, side, acfg):
    """-> dict joint -> (T,2) cleaned xy (masked, interpolated, smoothed), plus missing-frame mask."""
    max_gap = int(round(acfg["max_gap_s"] * fps))
    out, missing = {}, np.zeros(len(kps), dtype=bool)
    for j in JOINTS:
        raw = kps[:, SIDES[side][j], :]
        bad = ~(raw[:, 2] >= acfg["min_conf"]) | ~np.isfinite(raw[:, 0]) | ~np.isfinite(raw[:, 1])
        if j in ("hip", "knee", "ankle"):
            missing |= bad
        xy = np.empty((len(kps), 2))
        for c in range(2):
            y = raw[:, c].astype(float).copy()
            y[bad] = np.nan
            y = interpolate_gaps(y, max_gap)
            frac = np.isnan(y).mean()
            if frac > acfg["max_missing_frac"]:
                raise ValueError(f"joint '{j}' ({side}) has {frac:.0%} unrecoverable missing frames "
                                 f"(limit {acfg['max_missing_frac']:.0%}). Model lost the athlete; not guessing.")
            y = fill_nearest(y)
            xy[:, c] = smooth_series(y, fps, acfg)
        out[j] = xy
    return out, missing


def _leg_len(j):
    return (np.linalg.norm(j["hip"] - j["knee"], axis=1) + np.linalg.norm(j["knee"] - j["ankle"], axis=1))


def hip_signal(joints, fps, acfg):
    """h(t): hip height above standing, in leg-lengths (up = positive). Also leg length L (px)."""
    hip_y = joints["hip"][:, 1]
    leg = _leg_len(joints)

    def standing(mask):
        thr = np.percentile(hip_y[mask], acfg["standing_percentile"])
        s = mask & (hip_y <= thr)
        return float(np.median(hip_y[s])), float(np.median(leg[s]))

    allm = np.ones(len(hip_y), dtype=bool)
    ref, L = standing(allm)
    # active window: where hip moves a lot over a short window (drops rests / setup / teardown)
    w = max(3, int(round(acfg["active_window_s"] * fps)))
    h0 = (ref - hip_y) / L
    rng = np.array([np.ptp(h0[max(0, i - w // 2): i + w // 2 + 1]) for i in range(len(h0))])
    active = rng > 0.5 * acfg["rep"]["prominence"]
    if active.sum() > w:
        ref, L = standing(active | (h0 > -0.1))
    h = (ref - hip_y) / L
    return {"h": h, "L": L, "hip_ref": ref, "active": active, "leg": leg}


def camera_view(kps, vcfg, min_conf=0.3):
    """Side vs front from shoulder width / torso length (both shoulders and hips confident).
    From the side the shoulders overlap (~0.1-0.2); from the front they are ~0.8-1.0 of torso length."""
    ok = (kps[:, [5, 6, 11, 12], 2] > min_conf).all(1)
    if ok.sum() < vcfg["min_frames"]:
        return {"side_view": False, "shoulder_torso_ratio": None, "reason": "not enough frames to judge camera angle"}
    k = kps[ok]
    width = np.linalg.norm(k[:, 5, :2] - k[:, 6, :2], axis=1)
    torso = np.linalg.norm((k[:, 5, :2] + k[:, 6, :2]) / 2 - (k[:, 11, :2] + k[:, 12, :2]) / 2, axis=1)
    ratio = float(np.median(width / np.maximum(torso, 1e-6)))
    side = ratio <= vcfg["max_shoulder_torso_ratio"]
    return {"side_view": bool(side), "shoulder_torso_ratio": round(ratio, 3),
            "reason": None if side else "camera is not side-on; knee angle hidden"}
