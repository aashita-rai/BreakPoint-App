# BreakPoint

Athletes often under-report fatigue because they don't want to lose playing time, and most schools don't have a full-time athletic trainer. BreakPoint takes one side-view video of bodyweight squats and measures three things that change as people tire: rep tempo, squat depth and rep speed. It compares each rep with the athlete's own first reps to produce a **Rep Fatigue Index (RFI, 0–100)**. The athlete then says how the workout went and rates their exhaustion. When the data and the self-report disagree, the coach and athletic trainer get a flag.

BreakPoint is a screening aid that flags sets for human review. It does not diagnose.

This repo is the **Expo app** plus two small server routes. The pose-estimation pipeline and the main FastAPI server (`/analyze`, `/report`) live in the team's HiPerGator project.

## How it fits together

```
Expo app (this repo)  --video-->  FastAPI server  --JSON-->  Expo app
                                  - pose model -> reps -> tempo, depth, speed -> RFI
                                  - /transcribe: voice -> text (Whisper)      [server/ here]
                                  - /insights: AI analyzer (Claude)           [server/ here]
```

- **Athlete:** Capture a set (or use the demo video), say how it went and rate exhaustion 1–10, then see results: charts of tempo, depth and ascent speed per rep, the breakdown rep, and the overall RFI.
- **Coach / athletic trainer:** a team view with Healthy / Caution / Fatigued status, red flags for possible hidden overwork, each athlete's full results, and typed or spoken feedback.

## Run the app

Needs Node 18+ and the Expo Go app on your phone.

```bash
npm install
npx expo start
```

Scan the QR code with your phone. **Capture → Use demo video** works with no server.

To analyze your own videos, use voice input, and get AI insights, point the app at the server:

```bash
EXPO_PUBLIC_API_URL=http://<laptop-LAN-IP>:8000 npx expo start -c
```

## Run the extra server routes

`server/breakpoint_extras.py` adds `/transcribe` and `/insights`. Add it to the main FastAPI app, or run it alone for testing:

```bash
cd server
pip install -r requirements-extras.txt
export ANTHROPIC_API_KEY=...        # never commit this
uvicorn extras_app:app --host 0.0.0.0 --port 8000
```

## Project layout

| Path | What's there |
|---|---|
| `src/app/` | Screens (Expo Router). `(student)/` athlete tabs, `(coach)/` staff tabs |
| `src/services/api.ts` | Calls to the server (upload, report, transcribe, insights) |
| `src/lib/squat-types.ts` | The API contract (result JSON, check-in, report, insights) |
| `src/lib/fatigue.ts`, `src/lib/insights.ts` | RFI, mismatch and red-flag rules (offline fallback) |
| `src/lib/config.ts` | Thresholds, mirrored from the pipeline's `config.yaml` |
| `src/data/store.ts` | App state (zustand), in memory only |
| `assets/demo/result.json` | Offline demo result (synthetic placeholder until replaced by the real one) |
| `server/` | `/transcribe` and `/insights` routes |

## Data and limitations

- **Sample team data is simulated.** The football roster uses real names from the public 2026 Florida Gators roster; every number next to them is generated, not real measurement.
- Nothing is stored: the app keeps data in memory and the server doesn't save videos.
- RFI weights and thresholds are illustrative, tuned on one video, and not clinically validated.
