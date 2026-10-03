import numpy as np
from .base import PoseBackend, pick_main
from common.keypoint_schema import empty_person


class RTMPoseBackend(PoseBackend):
    """RTMPose (+YOLOX detector) or RTMO via rtmlib / ONNX Runtime."""

    def __init__(self, mcfg, cfg, device="cpu"):
        from rtmlib import Body
        import onnxruntime as ort
        self.name = mcfg["name"]
        if device == "cuda" and "CUDAExecutionProvider" not in ort.get_available_providers():
            raise RuntimeError("device=cuda requested but onnxruntime has no CUDAExecutionProvider. "
                               "Install onnxruntime-gpu (see slurm/env_setup.sh) or pass --device cpu.")
        self.device = device
        kw = dict(mode=mcfg["mode"], backend="onnxruntime", device=device)
        if mcfg.get("one_stage"):
            kw["pose"] = "rtmo"
        self.body = Body(**kw)

    def infer(self, frame_bgr):
        kpts, scores = self.body(frame_bgr)
        if kpts is None or len(kpts) == 0:
            return empty_person()
        people = [np.concatenate([kpts[i][:17], scores[i][:17, None]], axis=1).astype(np.float32)
                  for i in range(len(kpts))]
        return pick_main(people)
