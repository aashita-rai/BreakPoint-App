import numpy as np
from .base import PoseBackend, pick_main
from common.keypoint_schema import empty_person


class ViTPoseBackend(PoseBackend):
    """ViTPose (Hugging Face transformers) with an RT-DETR person detector."""

    def __init__(self, mcfg, cfg, device="cpu"):
        import torch
        from PIL import Image  # noqa: F401
        from transformers import AutoProcessor, RTDetrForObjectDetection, VitPoseForPoseEstimation
        self.torch = torch
        self.name = mcfg["name"]
        self.device = device
        self.plus = "plus" in mcfg["ckpt"]
        self.det_proc = AutoProcessor.from_pretrained(cfg["person_detector"])
        self.det = RTDetrForObjectDetection.from_pretrained(cfg["person_detector"]).to(device).eval()
        self.pose_proc = AutoProcessor.from_pretrained(mcfg["ckpt"])
        self.pose = VitPoseForPoseEstimation.from_pretrained(mcfg["ckpt"]).to(device).eval()

    def infer(self, frame_bgr):
        from PIL import Image
        torch = self.torch
        h, w = frame_bgr.shape[:2]
        image = Image.fromarray(frame_bgr[:, :, ::-1])
        with torch.no_grad():
            di = self.det_proc(images=image, return_tensors="pt").to(self.device)
            do = self.det(**di)
            res = self.det_proc.post_process_object_detection(
                do, target_sizes=torch.tensor([(h, w)]), threshold=0.3)[0]
        boxes = res["boxes"][res["labels"] == 0].cpu().numpy()
        if len(boxes) == 0:
            return empty_person()
        boxes[:, 2] -= boxes[:, 0]   # xyxy -> xywh (COCO) as the pose processor expects
        boxes[:, 3] -= boxes[:, 1]
        pi = self.pose_proc(image, boxes=[boxes], return_tensors="pt").to(self.device)
        kw = {"dataset_index": torch.tensor([0], device=self.device)} if self.plus else {}
        with torch.no_grad():
            po = self.pose(**pi, **kw)
        results = self.pose_proc.post_process_pose_estimation(po, boxes=[boxes])[0]
        people = []
        for r in results:
            k = r["keypoints"].cpu().numpy()
            s = r["scores"].cpu().numpy()
            people.append(np.concatenate([k, s[:, None]], axis=1).astype(np.float32))
        return pick_main(people)
