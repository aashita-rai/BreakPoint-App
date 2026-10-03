import cv2


def probe(path):
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise IOError(f"cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    ok, frame = cap.read()   # first decoded frame: shape already reflects rotation metadata
    cap.release()
    if not ok:
        raise IOError(f"cannot decode first frame: {path}")
    h, w = frame.shape[:2]
    if not fps or fps <= 0:
        raise ValueError(f"video reports fps={fps}; cannot continue")
    return {"fps": float(fps), "n_frames": n, "width": w, "height": h,
            "duration_s": n / fps, "portrait": h > w}


def iter_frames(path, target_fps=None):
    """Yield (native_index, t_seconds, frame_bgr). t = native_index / native_fps.
    If target_fps < native fps, frames are dropped evenly."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise IOError(f"cannot open video: {path}")
    fps = cap.get(cv2.CAP_PROP_FPS)
    step = 1.0 / target_fps if target_fps and target_fps < fps - 1e-6 else 0.0
    next_t = 0.0
    i = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t = i / fps
            if step == 0.0 or t >= next_t - 1e-9:
                yield i, t, frame
                next_t += step
            i += 1
    finally:
        cap.release()


def read_frame_at(path, index):
    cap = cv2.VideoCapture(str(path))
    cap.set(cv2.CAP_PROP_POS_FRAMES, index)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise IOError(f"cannot read frame {index} from {path}")
    return frame
