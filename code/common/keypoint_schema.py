"""All models are mapped to COCO-17. Arrays are (T, 17, 3) = x_px, y_px, confidence."""
import json
import numpy as np

COCO = ["nose", "l_eye", "r_eye", "l_ear", "r_ear", "l_shoulder", "r_shoulder", "l_elbow", "r_elbow",
        "l_wrist", "r_wrist", "l_hip", "r_hip", "l_knee", "r_knee", "l_ankle", "r_ankle"]
SIDES = {
    "left": {"shoulder": 5, "hip": 11, "knee": 13, "ankle": 15},
    "right": {"shoulder": 6, "hip": 12, "knee": 14, "ankle": 16},
}
JOINTS = ["shoulder", "hip", "knee", "ankle"]
SKELETON = [(5, 7), (7, 9), (6, 8), (8, 10), (5, 6), (5, 11), (6, 12), (11, 12),
            (11, 13), (13, 15), (12, 14), (14, 16)]


def empty_person():
    a = np.full((17, 3), np.nan, dtype=np.float32)
    a[:, 2] = 0.0
    return a


def save_keypoints(path, kps, times, meta):
    np.savez_compressed(path, keypoints=kps.astype(np.float32), times=np.asarray(times, dtype=np.float64),
                        meta=json.dumps(meta))


def load_keypoints(path):
    z = np.load(path, allow_pickle=False)
    return {"keypoints": z["keypoints"], "times": z["times"], "meta": json.loads(str(z["meta"]))}
