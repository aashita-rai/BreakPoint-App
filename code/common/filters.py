import math
import numpy as np
from scipy.signal import savgol_filter


def interpolate_gaps(y, max_gap):
    """Linear-interpolate NaN runs of length <= max_gap frames. Longer runs stay NaN."""
    y = y.astype(float).copy()
    n = len(y)
    bad = np.isnan(y)
    if not bad.any() or bad.all():
        return y
    idx = np.arange(n)
    good = ~bad
    interp = np.interp(idx, idx[good], y[good])
    i = 0
    while i < n:
        if bad[i]:
            j = i
            while j < n and bad[j]:
                j += 1
            interior = i > 0 and j < n
            if interior and (j - i) <= max_gap:
                y[i:j] = interp[i:j]
            i = j
        else:
            i += 1
    return y


def fill_nearest(y):
    idx = np.arange(len(y))
    good = ~np.isnan(y)
    if not good.any():
        raise ValueError("series is entirely NaN")
    return np.interp(idx, idx[good], y[good])


def savgol(y, fps, window_s, poly):
    w = max(5, int(round(window_s * fps)) | 1)
    if w % 2 == 0:
        w += 1
    if w > len(y):
        w = len(y) - (1 - len(y) % 2)
    return savgol_filter(y, w, min(poly, w - 1))


def _alpha(cutoff, dt):
    tau = 1.0 / (2 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


def one_euro(y, fps, min_cutoff=1.0, beta=0.05, dcutoff=1.0):
    dt = 1.0 / fps
    out = np.empty_like(y, dtype=float)
    out[0] = y[0]
    dx_prev = 0.0
    for i in range(1, len(y)):
        dx = (y[i] - out[i - 1]) / dt
        a_d = _alpha(dcutoff, dt)
        dx_hat = a_d * dx + (1 - a_d) * dx_prev
        cutoff = min_cutoff + beta * abs(dx_hat)
        a = _alpha(cutoff, dt)
        out[i] = a * y[i] + (1 - a) * out[i - 1]
        dx_prev = dx_hat
    return out


def smooth_series(y, fps, acfg):
    if acfg["smooth"] == "one_euro":
        return one_euro(y, fps, **acfg["one_euro"])
    if acfg["smooth"] == "savgol":
        return savgol(y, fps, acfg["smooth_window_s"], acfg["smooth_poly"])
    raise ValueError(f"unknown smoother: {acfg['smooth']}")
