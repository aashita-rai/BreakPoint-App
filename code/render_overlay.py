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


def draw_knee_angle(frame, k, side, color, scale):
    indices = (12, 14, 16) if side == "right" else (11, 13, 15)
    hip_i, knee_i, ankle_i = indices
    if min(k[i, 2] for i in indices) <= 0.3:
        return
    hip, knee, ankle = (k[i, :2].astype(float) for i in indices)
    first = np.arctan2(hip[1] - knee[1], hip[0] - knee[0])
    second = np.arctan2(ankle[1] - knee[1], ankle[0] - knee[0])
    delta = (second - first + np.pi) % (2 * np.pi) - np.pi
    angles = np.linspace(first, first + delta, 24)
    radius = int(34 * scale)
    points = np.column_stack((knee[0] + radius * np.cos(angles), knee[1] + radius * np.sin(angles))).astype(int)
    cv2.polylines(frame, [points], False, color, max(2, int(3 * scale)), cv2.LINE_AA)
    label = f"{np.degrees(abs(delta)):.0f} deg"
    cv2.putText(
        frame,
        label,
        (int(knee[0] + radius + 6), int(knee[1] - radius)),
        cv2.FONT_HERSHEY_SIMPLEX,
        max(0.5, 0.65 * scale),
        color,
        2,
        cv2.LINE_AA,
    )


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
        lines = [f"t={t:5.1f}s"]
        col = (255, 255, 255)
        s = max(0.6, frame.shape[1] / 1000)
        if cur is not None:
            lines.append(f"rep {cur['i']}/{result['rep_count']}  tempo {cur['tempo_s']:.1f}s")
            lines.append(
                f"depth {cur['depth']:.2f}L  knee {cur['min_knee_angle']:.0f} deg  "
                f"rise {cur['ascent_speed']:.2f}L/s"
            )
            if cur["rfi"] is not None:
                lines[1] += f"  RFI {cur['rfi']:.0f}"
                col = COL[cur["status"]]
            for warning in cur.get("form_warnings", []):
                lines.append(f"cue: {warning[:72]}")
        angle_color = COL["red"] if cur and any("angle" in w.lower() for w in cur.get("form_warnings", [])) else (255, 255, 255)
        draw_knee_angle(frame, k, result.get("side", "right"), angle_color, s)
        line_height = int(25 * s)
        cv2.rectangle(frame, (0, 0), (frame.shape[1], line_height * len(lines) + int(10 * s)), (0, 0, 0), -1)
        for line_no, line in enumerate(lines):
            cv2.putText(frame, line, (10, int((line_no + 1) * line_height)), cv2.FONT_HERSHEY_SIMPLEX, s, col, 2, cv2.LINE_AA)
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
