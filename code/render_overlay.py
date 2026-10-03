#!/usr/bin/env python
"""Annotated H.264 mp4 (phones can play it).  python code/render_overlay.py --model yolo11m-pose"""
import argparse
import json
import shutil
import subprocess
import sys
import cv2
import numpy as np
from common.config import load_config, video_path
from common.keypoint_schema import load_keypoints, SKELETON
from common.paths import KEYPOINTS, METRICS, RESULTS, ensure
from common.video_io import iter_frames

COL = {"green": (80, 200, 80), "amber": (0, 180, 255), "red": (60, 60, 230)}


def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        sys.exit("ffmpeg not found. Install ffmpeg or `pip install imageio-ffmpeg`.")


def render(video, kp_npz, result, out_mp4, cfg, min_conf=0.3):
    d = load_keypoints(kp_npz)
    kps, times = d["keypoints"], d["times"]
    reps = result["reps"]
    tmp = str(out_mp4) + ".tmp.mp4"
    writer = None
    for n, (i, t, frame) in enumerate(iter_frames(video, cfg["pose_fps"])):
        if n >= len(kps):
            break
        k = kps[n]
        for a, b in SKELETON:
            if k[a, 2] > min_conf and k[b, 2] > min_conf:
                cv2.line(frame, tuple(int(v) for v in k[a, :2]), tuple(int(v) for v in k[b, :2]), (255, 200, 0), 3)
        for j in range(17):
            if k[j, 2] > min_conf:
                cv2.circle(frame, tuple(int(v) for v in k[j, :2]), 4, (0, 255, 255), -1)
        cur = None
        for r in reps:
            if r["start_t"] <= t <= r["end_t"]:
                cur = r
        txt = f"t={t:5.1f}s"
        col = (255, 255, 255)
        if cur is not None:
            txt += f"  rep {cur['i']}/{result['rep_count']}"
            if cur["rfi"] is not None:
                txt += f"  RFI {cur['rfi']:.0f}"
                col = COL[cur["status"]]
        s = max(0.6, frame.shape[1] / 1000)
        cv2.rectangle(frame, (0, 0), (frame.shape[1], int(48 * s)), (0, 0, 0), -1)
        cv2.putText(frame, txt, (10, int(34 * s)), cv2.FONT_HERSHEY_SIMPLEX, s, col, 2, cv2.LINE_AA)
        if writer is None:
            fps = d["meta"]["fps"]
            writer = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), fps, (frame.shape[1], frame.shape[0]))
        writer.write(frame)
    writer.release()
    subprocess.run([ffmpeg_exe(), "-y", "-loglevel", "error", "-i", tmp, "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-movflags", "+faststart", str(out_mp4)], check=True)
    import os
    os.remove(tmp)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    cfg = load_config()
    res = json.load(open(METRICS / f"{a.model}.json"))
    out = a.out or ensure(RESULTS / "annotated") / f"{a.model}.mp4"
    render(video_path(cfg), KEYPOINTS / f"{a.model}.npz", res, out, cfg)
    print("wrote", out)
