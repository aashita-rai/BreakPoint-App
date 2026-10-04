#!/usr/bin/env python
"""Run one pose model over the video -> results/keypoints/<model>.npz

  python code/run_pose.py --list                       # enabled model names, one per line
  python code/run_pose.py --model yolo11m-pose
  python code/run_pose.py --model yolo11m-pose --degrade blur   # -> results/keypoints_degraded/
"""
import argparse
import sys
import time
import numpy as np
from common.config import load_config, enabled_models, get_model, video_path
from common.keypoint_schema import save_keypoints
from common.paths import KEYPOINTS, KEYPOINTS_DEG, ensure
from common.video_io import probe, iter_frames
from common.degrade import degrade
from pose_backends import make_backend
from pose_backends.base import resolve_device


def expected_pose_frames(info, pose_fps):
    """How many frames iter_frames will yield; used only for progress reporting."""
    keep = min(1.0, pose_fps / info["fps"]) if pose_fps else 1.0
    return max(1, int(info["n_frames"] * keep))


def run(mcfg, cfg, video, device, kind=None, max_frames=None, log=print, backend=None, progress=None):
    """progress(fraction 0-1) is called after each frame when given (the API's job status uses it)."""
    info = probe(video)
    total = expected_pose_frames(info, cfg["pose_fps"])
    own = backend is None
    if own:
        backend = make_backend(mcfg, cfg, device)
    kps, times, idxs, dts = [], [], [], []
    try:
        for n, (i, t, frame) in enumerate(iter_frames(video, cfg["pose_fps"])):
            if max_frames and n >= max_frames:
                break
            if kind:
                frame = degrade(frame, kind)
            t0 = time.perf_counter()
            k = backend.infer(frame)
            dts.append(time.perf_counter() - t0)
            kps.append(k); times.append(t); idxs.append(i)
            if progress:
                progress(min(1.0, (n + 1) / total))
            if n % 200 == 0:
                log(f"[{mcfg['name']}] frame {n} t={t:.1f}s")
    finally:
        if own:
            backend.close()
    if not kps:
        raise RuntimeError("no frames processed")
    size = backend.size_mb() if own else None
    dts = np.array(dts[5:] if len(dts) > 10 else dts)   # drop warm-up
    meta = {"model": mcfg["name"], "family": mcfg["family"], "device": backend.device,
            "video": str(video), "native_fps": info["fps"], "width": info["width"], "height": info["height"],
            "fps": float(1.0 / np.median(np.diff(times))) if len(times) > 1 else info["fps"],
            "infer_fps": float(1.0 / dts.mean()), "size_mb": size, "degrade": kind,
            "native_indices": idxs}
    return np.stack(kps), np.array(times), meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--degrade", default=None)
    ap.add_argument("--video", default=None)
    ap.add_argument("--max-frames", type=int, default=None)
    a = ap.parse_args()
    cfg = load_config()
    if a.list:
        print("\n".join(m["name"] for m in enabled_models(cfg)))
        return
    if not a.model:
        sys.exit("--model is required (or use --list)")
    mcfg = get_model(cfg, a.model)
    device = resolve_device(a.device)
    video = a.video or video_path(cfg)
    kps, times, meta = run(mcfg, cfg, video, device, a.degrade, a.max_frames)
    if a.degrade:
        out = ensure(KEYPOINTS_DEG) / f"{a.model}__{a.degrade}.npz"
    else:
        out = ensure(KEYPOINTS) / f"{a.model}.npz"
    save_keypoints(out, kps, times, meta)
    print(f"saved {out}  frames={len(kps)}  infer_fps={meta['infer_fps']:.1f}  device={meta['device']}")


if __name__ == "__main__":
    main()
