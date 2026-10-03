import numpy as np
from .base import PoseBackend
from common.keypoint_schema import empty_person

URL = "https://tfhub.dev/google/movenet/singlepose/thunder/4"


class MoveNetBackend(PoseBackend):
    """Optional. Needs tensorflow + tensorflow_hub (use a separate env if they clash)."""

    def __init__(self, mcfg, cfg, device="cpu"):
        import tensorflow as tf
        import tensorflow_hub as hub
        self.tf = tf
        self.name = mcfg["name"]
        self.device = "cpu"
        self.fn = hub.load(URL).signatures["serving_default"]

    def infer(self, frame_bgr):
        tf = self.tf
        h, w = frame_bgr.shape[:2]
        rgb = frame_bgr[:, :, ::-1]
        img = tf.image.resize_with_pad(tf.expand_dims(rgb, 0), 256, 256)
        out = self.fn(input=tf.cast(img, tf.int32))["output_0"].numpy()[0, 0]   # (17,3) y,x,score normalised to padded square
        side = max(h, w)
        pad_x, pad_y = (side - w) / 2, (side - h) / 2
        res = np.zeros((17, 3), dtype=np.float32)
        res[:, 0] = out[:, 1] * side - pad_x
        res[:, 1] = out[:, 0] * side - pad_y
        res[:, 2] = out[:, 2]
        return res
