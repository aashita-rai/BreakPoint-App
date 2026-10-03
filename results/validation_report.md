# Validation report

Ground truth: **labels** (hand labels)
Rankings are from the `test` split only; `dev` was used for tuning. One subject, one video: they may not generalise.

| rank | model | score | keypoints | reps | stability | robustness | speed | CPU fps | GPU fps | gate |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | rtmpose-x | 0.908 | 0.89 | 0.95 | 0.79 | 0.96 | 0.99 | - | 29.77 | FAIL: no CPU benchmark |
| 2 | mediapipe-heavy | 0.870 | 0.78 | 0.95 | 0.82 | 0.96 | 1.00 | 18.34 | - | pass |
| 3 | mediapipe-lite | 0.870 | 0.80 | 0.95 | 0.76 | 0.96 | 1.00 | 64.62 | - | pass |
| 4 | mediapipe-full | 0.868 | 0.79 | 0.95 | 0.80 | 0.96 | 1.00 | 66.33 | - | pass |
| 5 | vitpose-base | 0.863 | 0.89 | 0.95 | 0.76 | 0.96 | 0.59 | 2.27 | 28.69 | FAIL: CPU 2.3 fps < 10.0; no declared export path |
| 6 | vitpose-large | 0.841 | 0.88 | 0.95 | 0.79 | 0.97 | 0.37 | 1.48 | 17.85 | FAIL: CPU 1.5 fps < 10.0; no declared export path |
| 7 | rtmpose-m | 0.834 | 0.84 | 0.95 | 0.75 | 0.96 | 0.51 | 0.17 | 63.29 | FAIL: CPU 0.2 fps < 10.0 |
| 8 | yolo11n-pose | 0.831 | 0.73 | 0.95 | 0.70 | 0.97 | 1.00 | 36.91 | 190.55 | pass |
| 9 | rtmpose-s | 0.823 | 0.81 | 0.95 | 0.75 | 0.97 | 0.55 | 0.95 | 129.96 | FAIL: CPU 0.9 fps < 10.0 |
| 10 | yolo11s-pose | 0.821 | 0.70 | 0.95 | 0.72 | 0.96 | 1.00 | 19.41 | 213.28 | pass |
| 11 | yolo11m-pose | 0.818 | 0.70 | 0.94 | 0.70 | 0.97 | 1.00 | 10.66 | 155.30 | pass |
| 12 | yolo11x-pose | 0.806 | 0.74 | 0.95 | 0.69 | 0.96 | 0.71 | 4.26 | 76.21 | FAIL: CPU 4.3 fps < 10.0 |
| 13 | yolo11l-pose | 0.793 | 0.68 | 0.95 | 0.67 | 0.97 | 0.87 | 7.45 | 127.07 | FAIL: CPU 7.5 fps < 10.0 |

## Decision
- Best accuracy (reference): **rtmpose-x**
- Best deployable (shipped): **mediapipe-heavy** (the top-scoring model failed the gate: no CPU benchmark)

## How scores are built
- keypoints = mean(PCK@0.05, PCK@0.10, PCK@0.10 at bottom frames), normalised by leg length.
- reps = 0.6*F1 (+-0.3 s) + 0.2*(1 - bottom-time MAE/0.3 s) + 0.2*(1 - per-rep tempo MAE/0.5 s).
- stability = 0.5/(1+jitter/median jitter) + 0.5*(1 - missing-frame rate).
- robustness = mean of rep-F1 and PCK retained on degraded copies.
- speed = mean(min(1, CPU fps/gate), min(1, GPU fps/target)). Gate uses HiPerGator CPU unless you re-timed on a laptop.
- Export is **declared** in config.yaml per model family; the pipeline does not test an actual export.
- Ties within the margin go to the lower `deploy_rank` (simpler to deploy).
