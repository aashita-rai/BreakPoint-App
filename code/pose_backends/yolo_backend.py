import numpy as np
from .base import PoseBackend, pick_main
from common.keypoint_schema import empty_person


class YoloBackend(PoseBackend):
    def __init__(self, mcfg, cfg, device="cpu"):
        from ultralytics import YOLO
        self.name = mcfg["name"]
        self.device = device
        self.model = YOLO(mcfg["ckpt"])
        self._ckpt = mcfg["ckpt"]

    def infer(self, frame_bgr):
        r = self.model(frame_bgr, verbose=False, device=0 if self.device == "cuda" else "cpu")[0]
        if r.keypoints is None or r.keypoints.xy is None or len(r.keypoints.xy) == 0:
            return empty_person()
        xy = r.keypoints.xy.cpu().numpy()
        conf = r.keypoints.conf
        if conf is None:
            raise RuntimeError("ultralytics returned keypoints without confidences")
        conf = conf.cpu().numpy()
        people = [np.concatenate([xy[i], conf[i][:, None]], axis=1) for i in range(len(xy))]
        return pick_main(people)

    def size_mb(self):
        import os
        p = getattr(self.model, "ckpt_path", None)
        return os.path.getsize(p) / 1e6 if p and os.path.exists(p) else None
