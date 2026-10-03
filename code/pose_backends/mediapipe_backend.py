import urllib.request
import numpy as np
import cv2
from common.paths import MODEL_CACHE, ensure
from .base import PoseBackend
from common.keypoint_schema import empty_person

# BlazePose landmark index for each COCO joint
_BLAZE_FOR_COCO = [0, 2, 5, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]


class MediaPipeBackend(PoseBackend):
    def __init__(self, mcfg, cfg, device="cpu"):
        import mediapipe as mp
        from mediapipe.tasks.python import vision, BaseOptions
        self.mp = mp
        self.name = mcfg["name"]
        self.device = "cpu"   # MediaPipe pose runs on CPU here
        url = cfg["mediapipe_urls"][mcfg["variant"]]
        path = ensure(MODEL_CACHE) / url.rsplit("/", 1)[-1]
        if not path.exists():
            urllib.request.urlretrieve(url, path)
        self.path = path
        opts = vision.PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(path), delegate=BaseOptions.Delegate.CPU),
            running_mode=vision.RunningMode.VIDEO, num_poses=1)
        self.landmarker = vision.PoseLandmarker.create_from_options(opts)
        self._ts = 0

    def infer(self, frame_bgr):
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        self._ts += 33   # monotonically increasing ms timestamp is all VIDEO mode needs
        res = self.landmarker.detect_for_video(img, self._ts)
        if not res.pose_landmarks:
            return empty_person()
        h, w = frame_bgr.shape[:2]
        lm = res.pose_landmarks[0]
        out = np.zeros((17, 3), dtype=np.float32)
        for c, b in enumerate(_BLAZE_FOR_COCO):
            out[c] = (lm[b].x * w, lm[b].y * h, lm[b].visibility)
        return out

    def size_mb(self):
        return self.path.stat().st_size / 1e6

    def close(self):
        self.landmarker.close()
