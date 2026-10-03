import cv2
import numpy as np


def degrade(frame, kind):
    """Degradations for the robustness test. Output keeps the input size."""
    h, w = frame.shape[:2]
    if kind == "half_res":
        small = cv2.resize(frame, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    if kind == "blur":
        return cv2.GaussianBlur(frame, (0, 0), 3.0)
    if kind == "low_light":
        dark = (frame.astype(np.float32) * 0.35)
        noise = np.random.default_rng(0).normal(0, 6, frame.shape)
        return np.clip(dark + noise, 0, 255).astype(np.uint8)
    if kind == "jpeg":
        ok, enc = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 15])
        return cv2.imdecode(enc, cv2.IMREAD_COLOR)
    if kind == "tilt":
        m = cv2.getRotationMatrix2D((w / 2, h / 2), 5, 1.0)
        return cv2.warpAffine(frame, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
    raise ValueError(f"unknown degradation: {kind}")
