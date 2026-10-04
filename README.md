# BreakPoint

BreakPoint turns a side-view bodyweight-squat video into an objective fatigue signal, compares that signal with the athlete's self-report, and gives the athlete, coach, and athletic trainer plain-language context.

It is a screening aid for human review. It does not diagnose, clear an athlete to play, or replace an athletic trainer or clinician.

## Product Spec

### Problem and pain points

- Athletes may under-report fatigue or pain because they fear losing playing time.
- Coaches and athletic trainers often lack continuous, objective movement data.
- A single fatigue score is difficult to interpret without the athlete's own baseline.
- Important context is split between video, self-report, and staff follow-up.
- Pain reports need a human escalation path, not an automated diagnosis.
- Phone video, lighting, clothing, camera angle, privacy, and network reliability can all affect results.

### MVP workflow

1. An athlete signs in and records or selects one side-view squat video.
2. The FastAPI server runs pose estimation and rep analysis.
3. The app displays the annotated video, per-rep metrics, charts, RFI, and breakdown rep.
4. After processing, the athlete completes a check-in: effort from 1-10, pain and location, and optional typed or dictated notes.
5. Deterministic rules compare measured fatigue with reported effort. The server may use an LLM to write messages, with a safe template fallback.
6. Coaches and athletic trainers see recent workouts, fatigue status, pain/mismatch flags, reports, trends, and can leave feedback.

### Scope

In scope: one person, bodyweight squats, side view, tempo, depth, ascent speed, RFI, check-in mismatch, pain escalation, annotated video, and staff review.

Out of scope: other movements, knee-valgus assessment from a side view, on-device inference, medical diagnosis, physiological measurement, and real multi-day team analytics without a real data store.

## Analysis Specification

The model-independent pipeline is:

```
video -> pose keypoints -> side selection and cleaning -> hip-height signal
    -> rep segmentation -> per-rep metrics -> baseline -> RFI/breakdown
    -> annotated H.264 video and JSON
```

Metrics are normalized by standing leg length `L`:

- Rep duration: time between standing peaks. Longer generally indicates fatigue.
- Squat depth: hip displacement at the bottom divided by `L`. Shallower generally indicates fatigue.
- Ascent speed: mean upward hip velocity during ascent in `L/s`. Slower generally indicates fatigue.
- Secondary form context: peak ascent speed, minimum hip-knee-ankle angle, and hip height relative to the knee at the bottom.
- Rep-level form cues: when measured depth, ascent timing, knee angle, or hip height crosses a conservative threshold, the annotated video shows a short cue during that rep. These are coaching prompts from the pose measurements, not injury detection or medical advice.

The baseline is the median of the first three clean reps. Each metric's tired-direction deviation is clipped and weighted into an RFI from 0-100, then smoothed over three reps. The breakdown rep is the first rep where RFI remains above the configured threshold for two consecutive reps.

For each rep, let `cap = 0.30` and let `clip(x) = min(cap, max(0, x)) / cap`:

```text
tempo_score = clip((tempo - baseline_tempo) / baseline_tempo)
depth_score = clip((baseline_depth - depth) / baseline_depth)
speed_score = clip((baseline_speed - ascent_speed) / baseline_speed)

RFI_raw = 100 * (0.35 * tempo_score + 0.30 * depth_score + 0.35 * speed_score)
RFI = rolling_median(RFI_raw, 3 reps)
```

The overall server RFI is the median of the final three smoothed reps. Higher RFI means the movement has drifted farther from the athlete's fresh baseline; it is not a percentage probability of injury.

The API also returns a quality score, a usable/not-usable decision, and tracking warnings. Low-quality footage should be retaken rather than treated as a reliable fatigue result.

Thresholds and weights are illustrative, tuned on one video, and not clinically validated.

### Model choice and hosting

The validated accuracy reference is `rtmpose-x`, but it failed the CPU deployment gate. `mediapipe-heavy` was the validated deployable winner; on the demo Mac it crashes in the MediaPipe GPU helper. The current server therefore uses `yolo11n-pose`, which passed the CPU gate and is the model that produced the bundled demo. It is a practical deployment choice, not the highest-scoring accuracy model.

Inference is hosted by the local FastAPI process on the laptop running `PYTHONPATH=code uvicorn api.main:app`. The model weights are loaded into that server process and video is processed there; the Expo app is a client. The phone reaches the server over the laptop's LAN address. There is no cloud model hosting in this repository.

## API Contract

The app expects:

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Server availability and serving model |
| `/analyze` | POST multipart `file` | Pose inference, metrics, RFI, annotated video URL |
| `/report` | POST JSON | Self-report mismatch and messages |
| `/transcribe` | POST multipart `file` | Optional voice-to-text check-in input |
| `/insights` | POST JSON | Optional AI/rule-based fatigue explanation |

Each rep contains `start_t`, `bottom_t`, `end_t`, `tempo_s`, `descent_s`, `ascent_s`, `depth`, `ascent_speed`, `peak_ascent_speed`, `min_knee_angle`, `hip_below_knee`, and `rfi`. All numeric fields must be finite. The server's relative annotated-video URL is resolved against `EXPO_PUBLIC_API_URL`.

## Safety and AI Behavior

Check-in does not depend on an LLM. Dictation is optional and uses the `/transcribe` route when configured. Insights use Gemini only when `GEMINI_API_KEY` is configured; deterministic templates and rules remain available offline or when the service fails. The LLM explains measured evidence and never controls the safety flag.

The mismatch flag is deterministic: expected effort is `RFI / 10`, clipped to 1-10. A large gap or low reported effort alongside high RFI raises a possible hidden-overwork flag. Any reported pain creates an escalation message directing the athlete to a trainer or clinician; severe symptoms should be handled urgently. The app never claims that an athlete is medically safe or “fine.”

## Data and Privacy

The app store is session-only and contains no generated team roster or generated workouts. Athletes appear in the coach view after they sign in; workouts appear after real analysis. The bundled offline demo is a precomputed analysis asset, not a generated team record. The server processes uploaded video for the request and serves the annotated result; production deployments need explicit retention, access control, consent, and deletion policies, especially for minors.

## Run

Requirements: Node 18+, Expo SDK 57, Python 3.10+, and Expo Go or a development build.

```bash
npm install
npx expo start
```

For live analysis, install the complete CPU serving stack from the repository root. The API requirements include FastAPI, OpenCV, SciPy, PyYAML, PyTorch's Ultralytics dependency, and `ultralytics`; you should not need to install `ultralytics` manually.

macOS/Linux:

```bash
python3 -m venv ~/bp_venv
source ~/bp_venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-api.txt
export SERVE_MODEL=yolo11n-pose
export GEMINI_API_KEY=your-key
PYTHONPATH=code uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-api.txt
$env:SERVE_MODEL = "yolo11n-pose"
$env:PYTHONPATH = "code"
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

For Gemini insights and voice transcription, install the optional extras in the same activated environment, then restart FastAPI. The routes are mounted into the main API automatically when these packages are available:

```bash
python -m pip install -r server/requirements-extras.txt
```

Set `GEMINI_API_KEY` only in your local environment. Never commit it.

In another terminal, use the laptop's LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
```

The phone and laptop must be on the same reachable network. The bundled real analysis can be opened with Capture -> Use demo video when no server is available.

### Restart rules

- Changed React Native screen code: Expo Fast Refresh usually updates automatically.
- Changed `EXPO_PUBLIC_API_URL` or other Expo environment variables: stop and restart Expo with `-c`.
- Changed Python code, `SERVE_MODEL`, `SERVE_DEVICE`, model dependencies, or Gemini environment variables: stop and restart FastAPI.
- If both the app and API were already running and only backend code changed, restart FastAPI only. Restart both after changing the API URL or installing packages.

## Why FastAPI and GPU requirements

FastAPI is the small HTTP layer between the phone and the Python analysis pipeline. Expo Go cannot directly run this custom Python/Ultralytics pose pipeline, so the phone uploads a video and FastAPI returns JSON plus the annotated video URL. It also gives the system a clean place to add quality checks, additional movements, persistent storage, or a hosted deployment later.

`yolo11n-pose` does not require a GPU. The server automatically selects CUDA only when PyTorch reports an available NVIDIA CUDA device; otherwise it runs on CPU. The current Mac setup and ordinary Windows laptops therefore use CPU inference. A CUDA-capable Windows machine may be faster, but it requires a compatible NVIDIA driver and PyTorch CUDA installation; it is optional, not required for this project.

## Layout

| Path | Purpose |
|---|---|
| `src/app/` | Expo Router screens for athlete, coach, trainer, results, reports, and resources |
| `src/services/api.ts` | Upload, report, transcription, and insight requests plus response validation |
| `src/services/squat-analysis.ts` | Processing flow and offline bundled result |
| `src/lib/squat-types.ts` | Shared API and app data contract |
| `src/lib/fatigue.ts`, `src/lib/insights.ts` | Mismatch, RFI status, and offline safety fallback rules |
| `src/data/store.ts` | Session-only athlete/workout/feedback state |
| `code/analysis/` | Shared pose-independent signal, rep, metric, and fatigue analysis |
| `code/render_overlay.py` | Skeleton and metric overlay video generation |
| `code/api/main.py` | FastAPI `/health` and `/analyze` server |
| `server/` | Optional `/transcribe` and `/insights` routes |
| `assets/demo/` | Precomputed offline demo result and media |

## Validation and Known Limitations

Pose families were compared using hand-labelled keypoints and rep timing. The shipped model is selected for deployability, not medical accuracy. One subject and one video cannot establish generalization. Bottom-of-squat keypoints are the likely stress point because the thighs can obscure the hips.

Before a public demo or real deployment, verify `/report` and extras-route mounting end to end, benchmark the serving model on the target laptop, test portrait and `.mov` videos, confirm annotated-video playback, add a backup demo recording, and review the resources wording against current CDC/NATA guidance. Real use with minors requires consent and a data-handling policy.

Audio fatigue analysis is intentionally not part of this MVP. Speech rate, pauses, breathlessness, and vocal strain may add context, but microphone quality and environmental noise make them a weak secondary signal. Audio should improve self-report accessibility before it is treated as a fatigue measurement.
