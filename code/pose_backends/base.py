import numpy as np
from common.keypoint_schema import empty_person


class PoseBackend:
    name = "base"
    device = "cpu"

    def infer(self, frame_bgr):
        """Return (17, 3) array: x_px, y_px, conf for the single main person (NaN/0 if none)."""
        raise NotImplementedError

    def size_mb(self):
        return None

    def close(self):
        pass


def pick_main(kps_list):
    """kps_list: list of (17,3). Pick the person with largest (bbox area x mean conf)."""
    if not len(kps_list):
        return empty_person()
    best, best_s = None, -1
    for k in kps_list:
        ok = np.isfinite(k[:, 0]) & (k[:, 2] > 0.1)
        if ok.sum() < 3:
            continue
        w = np.ptp(k[ok, 0])
        h = np.ptp(k[ok, 1])
        s = (w * h + 1e-6) * float(k[ok, 2].mean())
        if s > best_s:
            best, best_s = k, s
    return best if best is not None else empty_person()


def resolve_device(requested):
    if requested != "auto":
        return requested
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"
