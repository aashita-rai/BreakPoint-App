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
5. Deterministic rules compare measured fatigue with reported effort. Gemini writes every sentence of the report (explanation, mismatch summary, athlete/coach/trainer messages, pain escalation). If Gemini is unavailable, the app keeps the deterministic flag and a pain referral and says why the explanation is missing.
6. Coaches and athletic trainers see recent workouts, fatigue status, pain/mismatch flags, reports, trends, and can leave feedback.

### Scope

In scope: one person, side-view bodyweight squat variations (standard, pause, tempo, narrow, and sumo), tempo, depth, ascent speed, RFI, check-in mismatch, pain escalation, annotated video, and staff review. Variations are currently labeled and persisted through the pipeline; their shared squat metrics are not separately calibrated until variation-specific validation data is collected.

Out of scope: other movements, knee-valgus assessment from a side view, on-device inference, medical diagnosis, physiological measurement, and real multi-day team analytics without a real data store.

## Analysis Specification

The model-independent pipeline is:

```
video -> pose keypoints -> side selection and cleaning -> hip-height signal
    -> rep segmentation -> per-rep metrics -> baseline -> RFI/breakdown
    -> annotated H.264 video and JSON
```

Metrics are normalized by standing leg length `L`:

- Tempo (moving time): seconds the hip is actually moving down and up (|hip speed| > 0.10 leg lengths/s). Longer generally indicates fatigue.
- Pauses: every stretch of ≥ 0.3 s with the hip still is recorded with its **duration and location** (`pauses`), because a pause can be planned or a sign of struggling:

| Where the hip stops (≥ 0.3 s) | Counts toward fatigue? | Why |
|---|---|---|
| Stalled **on the way up** | Yes, by how much it's longer than in the first 3 reps. Added to tempo **and** to rise time | Struggling to stand is a classic fatigue sign |
| **At / near the bottom** or on the way down | Yes, by how much it's longer than in the first 3 reps; **never** for the `pause` variation | A planned pause appears in every rep (including the baseline), so only *extra* pausing counts |
| **Standing** between reps | No. Reported as a rest, not scored | A breather is ambiguous; flagging it would punish sensible pacing |

- Squat depth: hip displacement at the bottom divided by `L`. Shallower generally indicates fatigue.
- Ascent speed: mean upward hip velocity during ascent in `L/s`. Slower generally indicates fatigue.
- Secondary form context: peak ascent speed, minimum hip-knee-ankle angle (only when trusted, see below), and hip height relative to the knee at the bottom.
- Knee angle (context only): shown only when the camera is side-on (shoulder width / torso length ≤ 0.45; front views measure ~0.9) **and** the angle is geometrically consistent with the measured depth. Only those trusted angles go to Gemini, which may mention them as approximate context. Untrusted angles are hidden in the app and video and never sent. Validation measured keypoint accuracy, not angle accuracy.
- Rep-level form cues: when measured depth, ascent timing, knee angle (if reliable), or hip height crosses a conservative threshold, the annotated video shows a short cue during that rep. These are coaching prompts from the pose measurements, not injury detection or medical advice.

The baseline is the median of the first three clean reps. Each metric's tired-direction deviation is clipped and weighted into an RFI from 0-100, then smoothed over three reps. The breakdown rep is the first rep where RFI remains above the configured threshold for two consecutive reps.

For each rep, let `cap = 0.30` and let `clip(x) = min(cap, max(0, x)) / cap`:

```text
counted_pause = extra stall + extra bottom pause vs first reps   (see table above)
tempo_score = clip((moving_tempo + counted_pause - baseline_tempo) / baseline_tempo)
depth_score = clip((baseline_depth - depth) / baseline_depth)
speed_score = clip((baseline_speed - rise / (ascent_time + extra_stall)) / baseline_speed)

RFI_raw = 100 * (0.35 * tempo_score + 0.30 * depth_score + 0.35 * speed_score)
RFI = rolling_median(RFI_raw, 3 reps)
```

Traffic lights: **Healthy < 35, Caution 35–59, Fatigued ≥ 60**, shared by the app (`src/lib/config.ts`) and the video overlay (`code/config.yaml`). These are **provisional demo values**, not calibrated on athlete data; they should be re-derived from real data before anyone relies on them.

The overall server RFI is the median of the final three smoothed reps. Higher RFI means the movement has drifted farther from the athlete's fresh baseline; it is not a percentage probability of injury.

The API also returns a quality score, a usable/not-usable decision, and tracking warnings. Low-quality footage should be retaken rather than treated as a reliable fatigue result.

Short clips with one or more detected reps now return a result with a quality warning instead of failing outright. A reliable fatigue trend still needs at least five clean reps; shorter clips can show movement measurements but should not be treated as dependable fatigue comparisons.

Thresholds and weights are illustrative, tuned on one video, and not clinically validated.

### Model choice and hosting

The validated accuracy reference is `rtmpose-x`, but it failed the CPU deployment gate. `mediapipe-heavy` was the validated deployable winner; on the demo Mac it crashes in the MediaPipe GPU helper. The current server therefore uses `yolo11n-pose`, which passed the CPU gate and is the model that produced the bundled demo. It is a practical deployment choice, not the highest-scoring accuracy model.

Inference is hosted by the local FastAPI process on the laptop (`bash scripts/run_api.sh`). The model weights are loaded into that server process and video is processed there; the Expo app is a client. The phone reaches the server either over the laptop's LAN address or, when the network blocks that, through a Cloudflare quick tunnel (see [Run](#run)). Cloudflare only forwards traffic; it does not host the model. There is no cloud model hosting in this repository.

## API Contract

The app expects:

| Route | Method | Purpose |
|---|---|---|
| `/health` | GET | Server availability and serving model |
| `/analyze/uploads` | POST JSON `{filename, size}` | Starts a chunked video upload, returns `{upload_id}` (used by the app) |
| `/analyze/uploads/{id}?offset=&length=` | PUT raw bytes | One ~2 MB piece of the video; a repeated piece is acknowledged, not re-appended |
| `/analyze/uploads/{id}/finish` | POST form `squat_variation` | Checks every byte arrived, starts the background analysis, returns `{job_id}` |
| `/analyze/jobs` | POST multipart `file`, `squat_variation` | Whole video in one request, then a background job (fine on a LAN; not used by the app) |
| `/analyze/jobs/{job_id}` | GET | Job `status`, `stage` (`queued`, `pose`, `analysis`, `render`, `done`), real `progress` 0-1, and the `result` or `error` |
| `/analyze` | POST multipart `file` | Same analysis in one blocking request (scripts and LAN testing; long videos can exceed Cloudflare's ~100 s response limit) |
| `/insights` | POST JSON | Gemini explanation, mismatch status, athlete/coach/trainer messages, and pain escalation (used by the app) |
| `/transcribe` | POST multipart `file` | Optional voice-to-text check-in input (Whisper) |
| `/report` | POST JSON | Legacy template-message route kept for scripts; the app does not call it |
| `/dashboard/weekly` | GET | Last-seven-day set, RFI, follow-up, and variation summary |

Each result contains `squat_variation`; each rep contains `start_t`, `bottom_t`, `end_t`, `tempo_s`, `descent_s`, `ascent_s`, `depth`, `ascent_speed`, `peak_ascent_speed`, `min_knee_angle`, `knee_angle_ok`, `pause_s`, `pauses`, `fatigue_pause_s`, `total_s`, `hip_below_knee`, and `rfi`; the result also has `view` (`side_view`, `shoulder_torso_ratio`). All numeric fields must be finite. The server's relative annotated-video URL is resolved against `EXPO_PUBLIC_API_URL`.

## Safety and AI Behavior

Check-in does not depend on an LLM to calculate the safety flag. The mismatch flag is deterministic: expected effort is `RFI / 10`, clipped to 1-10, and a gap of 3 or more raises under- or over-reporting. High RFI with very low reported effort raises a possible hidden-overwork (red) flag; Gemini can add a flag but can never remove the rule's flag.

Gemini never receives untrusted knee angles or internal tracking/quality scores. Every Gemini text field is checked against banned patterns (clearance/return-to-play words such as clear/cleared/clearing, "you're fine/safe", named diagnoses, tracking/quality scores, and angles/degrees unless trusted angles were provided). Gemini refers to the athlete by name or "they" and never guesses gender. On a hit the server asks Gemini for one rewrite; if it still fails, nothing is shown and the app falls back to the safety-only report.

All natural-language text is written by Gemini (`POST /insights`): the headline, the explanation bullets, the mismatch summary, the athlete/coach/trainer messages, and the pain escalation. The server checks that any pain escalation names an athletic trainer or doctor and appends a referral sentence if Gemini's wording does not.

If Gemini is unavailable (no `GEMINI_API_KEY`, quota, network), the app does **not** invent a canned explanation. It saves a safety-only report: the deterministic mismatch status, a pain referral if pain was reported, and the reason Gemini failed. The app never claims that an athlete is medically safe or "fine."

**Where the Gemini prompts live:** `server/breakpoint_extras.py`. `SYSTEM_PROMPT` holds the role, safety and tone rules; `OUTPUT_SCHEMA` fixes the JSON fields Gemini must return; `set_facts()` builds the movement evidence; the `insights()` route builds the per-athlete prompt (facts, exhaustion, pain, the athlete's comment, and the rule's flag). The server tries `gemini-3.8-flash` → `gemini-flash-latest` → `gemini-3.1-flash-lite` in order, moving on when a model is busy (503) or retired for your key (404); set `GEMINI_MODEL` to try a specific model first. (`gemini-2.5-flash` is no longer available to new API keys.) See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for details.

## Data and Privacy

The app store is session-only. The football roster is pre-filled with sample squat sets (`src/data/sample-workouts.ts`) so the coach and trainer dashboard shows a realistic spread of fatigue levels, flags and workout counts; these are generated, not real athlete data. Other athletes appear in the coach view after they sign in, and real workouts are added after analysis. The bundled offline demo is a precomputed analysis asset, not a generated team record. The server processes uploaded video for the request and serves the annotated result; production deployments need explicit retention, access control, consent, and deletion policies, especially for minors.

The local FastAPI server stores compact analysis summaries and report flags in `results/breakpoint.sqlite3` and exposes `/dashboard/weekly`. It does not store raw videos in the database. This local database is suitable for the hackathon demo only; production use still needs authentication, athlete ownership, encrypted storage, retention limits, and access controls.

## Run

Requirements: Node 18+, Expo SDK 57, Python 3.10+, Expo Go (or a development build) on the phone, and a Gemini API key for the AI report. You run two things: the **FastAPI server** on the laptop (does the video analysis and calls Gemini) and the **Expo app** (on the phone). Then you choose how the phone reaches the laptop: same Wi-Fi (Option A) or a Cloudflare tunnel (Option B).

### 1. Install once

```bash
npm install
```

macOS/Linux:

```bash
python3 -m venv ~/bp_venv
source ~/bp_venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements-api.txt
python -m pip install -r server/requirements-extras.txt   # Gemini + Whisper routes
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements-api.txt
python -m pip install -r server/requirements-extras.txt
```

`requirements-api.txt` includes FastAPI, OpenCV, SciPy, PyYAML and `ultralytics` (which brings PyTorch); you do not need to install `ultralytics` separately. The extras add `google-genai` (Gemini) and `faster-whisper` (voice notes). FastAPI mounts the extra routes automatically when these packages are installed.

### 2. Start the API server (Terminal 1)

Set your Gemini key in the shell only. Never commit it.

macOS/Linux:

```bash
export GEMINI_API_KEY=your-key
bash scripts/run_api.sh          # http://0.0.0.0:8000
```

`scripts/run_api.sh` activates `~/bp_venv` (override with `VENV=...`), sets `SERVE_MODEL=yolo11n-pose`, `SERVE_DEVICE=cpu`, `PYTHONPATH=code:.`, and the certificate bundle, then starts uvicorn. Use `PORT=8010 bash scripts/run_api.sh` for another port.

Windows PowerShell (no bash script):

```powershell
$env:GEMINI_API_KEY = "your-key"
$env:SERVE_MODEL = "yolo11n-pose"
$env:PYTHONPATH = "code;."
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000
```

Check it: open `http://127.0.0.1:8000/health` and expect `{"ok": true, "serve_model": "yolo11n-pose"}`.

### 3A. Option A: phone and laptop on the same Wi-Fi

Use this on home Wi-Fi or a phone hotspot. Start Expo (Terminal 2) with the laptop's LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
```

Windows PowerShell:

```powershell
$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {$_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown"} |
    Select-Object -First 1 -ExpandProperty IPAddress)
$env:EXPO_PUBLIC_API_URL = "http://${ip}:8000"
npx expo start -c
```

Scan the QR code with Expo Go. On the Capture tab the server status should show as connected. If the phone cannot open `http://<laptop-LAN-IP>:8000/health` in its browser, the network is blocking device-to-device traffic: use Option B.

### 3B. Option B: Cloudflare tunnel (campus, eduroam, guest, or managed Wi-Fi)

Many campus and guest networks isolate devices, so the phone cannot reach the laptop directly. A **Cloudflare quick tunnel** gives the laptop's API a public `https://...trycloudflare.com` address that the phone can reach over any internet connection, including mobile data. You also need an **Expo tunnel**, because the same isolation blocks the phone from loading the app's JavaScript from the laptop. So two tunnels:

| Tunnel | Carries | Command |
|---|---|---|
| Cloudflare quick tunnel | Video uploads, job progress, Gemini report → FastAPI on port 8000 | `cloudflared tunnel --url http://127.0.0.1:8000` |
| Expo tunnel (ngrok, built into Expo) | The app's JavaScript bundle from Metro | `npx expo start --tunnel` |

**Install `cloudflared` once** (no Cloudflare account needed for quick tunnels):

```bash
brew install cloudflared                      # macOS
```

```powershell
winget install --id Cloudflare.cloudflared    # Windows
```

**Terminal 1:** start the API as in step 2 (`bash scripts/run_api.sh`).

**Terminal 2:** expose the API:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

Wait for the line containing `https://<random-words>.trycloudflare.com` and copy that URL. Open `https://<random-words>.trycloudflare.com/health` on the phone's browser; you should see `{"ok": true, ...}`.

**Terminal 3:** start Expo with the tunnel URL as the API address:

```bash
EXPO_PUBLIC_API_URL=https://<random-words>.trycloudflare.com npx expo start --tunnel -c
```

Windows PowerShell:

```powershell
$env:EXPO_PUBLIC_API_URL = "https://<random-words>.trycloudflare.com"
npx expo start --tunnel -c
```

Scan the new QR code. Keep all three terminals open.

Things to know about quick tunnels:

- The URL changes every time `cloudflared` restarts. When it changes, restart Expo with the new `EXPO_PUBLIC_API_URL` and `-c`.
- Cloudflare closes any single request that takes longer than about 100 seconds (HTTP 524), **including a slow upload**. That is why the app sends the video in ~2 MB pieces (`/analyze/uploads`) and then polls the analysis job, instead of one long upload or one long `/analyze` request. Tested through a quick tunnel: a 104 MB video uploaded over 209 s in 50 pieces with no errors. On iOS the picker also exports 720p H.264, which makes uploads several times smaller.
- Quick tunnels are for development and demos: no uptime guarantee and **no access control**. Anyone with the URL can upload videos to your laptop and spend your Gemini quota. The app no longer displays the URL, but don't share it, and **stop `cloudflared` (Ctrl+C) as soon as the demo ends.** Production would use a named Cloudflare Tunnel with Cloudflare Access, or a hosted server.

### No server available

Capture → **Use demo video** opens the bundled real analysis without any server.

### Restart rules

- Changed React Native screen code: Expo Fast Refresh usually updates automatically.
- Changed `EXPO_PUBLIC_API_URL` or other Expo environment variables, or got a new Cloudflare URL: stop and restart Expo with `-c`.
- Changed Python code, `SERVE_MODEL`, `SERVE_DEVICE`, model dependencies, or Gemini environment variables: stop and restart FastAPI. The Cloudflare tunnel can keep running; it just forwards to port 8000.
- If the app says "This server has no /analyze/jobs route" or "The Gemini response is missing fields", FastAPI is running old code: restart it.

## Why FastAPI and GPU requirements

FastAPI is the small HTTP layer between the phone and the Python analysis pipeline. Expo Go cannot directly run this custom Python/Ultralytics pose pipeline, so the phone uploads a video and FastAPI returns JSON plus the annotated video URL. It also gives the system a clean place to add quality checks, additional movements, persistent storage, or a hosted deployment later.

`yolo11n-pose` does not require a GPU. The server automatically selects CUDA only when PyTorch reports an available NVIDIA CUDA device; otherwise it runs on CPU. The current Mac setup and ordinary Windows laptops therefore use CPU inference. A CUDA-capable Windows machine may be faster, but it requires a compatible NVIDIA driver and PyTorch CUDA installation; it is optional, not required for this project.

## Layout

See [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md) for the full architecture, data flow, model rationale, RFI equation, Gemini prompt locations, networking, persistence, and safety boundaries.

| Path | Purpose |
|---|---|
| `src/app/` | Expo Router screens for athlete, coach, trainer, results, reports, and resources |
| `src/services/api.ts` | Upload + job polling, transcription, and Gemini insight requests plus response validation |
| `src/services/squat-analysis.ts` | Processing flow (maps real server progress to the progress bar) and offline bundled result |
| `src/lib/squat-types.ts` | Shared API and app data contract |
| `src/lib/fatigue.ts` | RFI maths port, traffic-light status, mismatch rule, and Gemini report assembly |
| `src/data/store.ts` | Session-only athlete/workout/feedback state |
| `code/analysis/` | Shared pose-independent signal, rep, metric, and fatigue analysis |
| `code/render_overlay.py` | Skeleton and metric overlay video generation |
| `code/api/main.py` | FastAPI `/health`, `/analyze`, `/analyze/jobs`, `/report`, `/dashboard/weekly` |
| `code/api/database.py` | SQLite summaries (`results/breakpoint.sqlite3`) for the weekly dashboard |
| `server/breakpoint_extras.py` | Gemini `/insights` (all prompts) and Whisper `/transcribe` |
| `scripts/run_api.sh` | Starts FastAPI with the right `PYTHONPATH`, model, and certificates |
| `assets/demo/` | Precomputed offline demo result and media |

## Validation and Known Limitations

Pose families were compared using hand-labelled keypoints and rep timing. The shipped model is selected for deployability, not medical accuracy. One subject and one video cannot establish generalization. Bottom-of-squat keypoints are the likely stress point because the thighs can obscure the hips.

Before a public demo or real deployment, verify Gemini `/insights` and extras-route mounting end to end, benchmark the serving model on the target laptop, test portrait and `.mov` videos, confirm annotated-video playback, add a backup demo recording, and review the resources wording against current CDC/NATA guidance. Real use with minors requires consent and a data-handling policy.

Audio fatigue analysis is intentionally not part of this MVP. Speech rate, pauses, breathlessness, and vocal strain may add context, but microphone quality and environmental noise make them a weak secondary signal. Audio should improve self-report accessibility before it is treated as a fatigue measurement.
