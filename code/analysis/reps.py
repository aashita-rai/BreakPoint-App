import numpy as np
from scipy.signal import find_peaks


def segment_reps(h, fps, rcfg):
    """Bottoms = prominent minima of h. Rep i runs between standing peaks on either side of its bottom."""
    dist = max(1, int(round(rcfg["min_distance_s"] * fps)))
    b, _ = find_peaks(-h, prominence=rcfg["prominence"], distance=dist)
    if len(b) == 0:
        return []
    peaks = [int(np.argmax(h[: b[0] + 1]))]
    for k in range(1, len(b)):
        peaks.append(int(b[k - 1] + np.argmax(h[b[k - 1]: b[k] + 1])))
    peaks.append(int(b[-1] + np.argmax(h[b[-1]:])))
    reps = []
    for k, bk in enumerate(b):
        s, e = peaks[k], peaks[k + 1]
        dur = (e - s) / fps
        depth = -h[bk]
        clean = (rcfg["min_rep_s"] <= dur <= rcfg["max_rep_s"] and depth >= rcfg["min_depth"]
                 and h[s] > -rcfg["stand_tol"] and h[e] > -rcfg["stand_tol"])
        reps.append({"start": int(s), "bottom": int(bk), "end": int(e), "clean": bool(clean)})
    return reps
