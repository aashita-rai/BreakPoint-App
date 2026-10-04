"""FastAPI server for the Expo client.   cd code && uvicorn api.main:app --host 0.0.0.0 --port 8000
Serving model: env SERVE_MODEL, else results/winner.json["serve_model"]. Loud error if neither."""
import json
import os
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analysis import messages
from analysis.pipeline import analyze_arrays
from common.config import get_model, load_config
from common.paths import RESULTS, ensure
from pose_backends import make_backend
from pose_backends.base import resolve_device
from render_overlay import render
from run_pose import run as run_pose

MAX_MB = 300
VIDEOS = ensure(RESULTS / "served")
app = FastAPI(title="Squat Form-Fatigue API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/videos", StaticFiles(directory=str(VIDEOS)), name="videos")

try:
    from server.breakpoint_extras import router as extras_router
except ModuleNotFoundError:
    extras_router = None
if extras_router is not None:
    app.include_router(extras_router)

_state = {"backend": None, "name": None}
_lock = threading.Lock()


def serve_model_name():
    name = os.environ.get("SERVE_MODEL")
    if not name:
        w = RESULTS / "winner.json"
        if w.exists():
            name = json.load(open(w)).get("serve_model")
    if not name:
        raise HTTPException(500, "No serving model. Set SERVE_MODEL=<model name> or run validation/select_best_model.py")
    return name


def get_backend(cfg):
    name = serve_model_name()
    if _state["name"] != name:
        _state["backend"] = make_backend(get_model(cfg, name), cfg, resolve_device(os.environ.get("SERVE_DEVICE", "cpu")))
        _state["name"] = name
    return _state["backend"], name


class CheckIn(BaseModel):
    rpe: int = Field(ge=1, le=10)
    pain: bool = False
    pain_locations: list[str] = []
    notes: str = ""


class ReportRequest(BaseModel):
    result: dict
    checkin: CheckIn


@app.get("/health")
def health():
    return {"ok": True, "serve_model": os.environ.get("SERVE_MODEL") or
            (json.load(open(RESULTS / "winner.json")).get("serve_model") if (RESULTS / "winner.json").exists() else None)}


def read_upload(file: UploadFile):
    data = file.file.read(MAX_MB * 1024 * 1024 + 1)
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"video larger than {MAX_MB} MB")
    suffix = Path(file.filename or "v.mp4").suffix.lower() or ".mp4"
    if suffix not in (".mp4", ".mov", ".m4v", ".webm"):
        raise HTTPException(400, f"unsupported file type {suffix}")
    return data, suffix


# Share of the server's work per stage, for the progress the app shows.
STAGES = {"pose": (0.0, 0.8), "fatigue": (0.8, 0.82), "render": (0.82, 1.0)}


def run_analysis(data, suffix, progress=lambda stage, fraction: None):
    """Pose model -> fatigue analysis -> annotated video. progress(stage, overall 0-1) as it goes."""
    def report(stage):
        lo, hi = STAGES[stage]
        return lambda f: progress(stage, lo + (hi - lo) * f)

    cfg = load_config()
    with tempfile.TemporaryDirectory() as td:
        vid = Path(td) / f"in{suffix}"
        vid.write_bytes(data)
        with _lock:   # one inference at a time on the demo server
            try:
                backend, name = get_backend(cfg)
                kps, times, meta = run_pose(get_model(cfg, name), cfg, vid, backend.device, backend=backend,
                                            on_progress=report("pose"))
                report("fatigue")(0)
                result = analyze_arrays(kps, times, meta["fps"], cfg, name)
            except ValueError as e:   # e.g. too few reps, athlete lost -> tell the user, don't fake it
                raise HTTPException(422, str(e))
        report("render")(0)
        vid_id = uuid.uuid4().hex[:12]
        out = VIDEOS / f"{vid_id}.mp4"
        npz = Path(td) / "k.npz"
        from common.keypoint_schema import save_keypoints
        save_keypoints(npz, kps, times, meta)
        render(vid, npz, result, out, cfg, on_progress=report("render"))
    result["annotated_video_url"] = f"/videos/{vid_id}.mp4"
    return result


@app.post("/analyze")
def analyze(file: UploadFile = File(...)):
    return run_analysis(*read_upload(file))


# ── Background jobs, so the app can show real progress while the model runs ──
# POST /analyze/jobs starts one and returns {"job_id"}; GET /analyze/jobs/{id} returns
# {"status": queued|running|done|error, "stage", "progress" 0-1, "result" | "error"}.

_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
JOB_TTL_S = 15 * 60   # finished jobs are kept this long for the app to collect


def _run_job(job_id, data, suffix):
    def progress(stage, fraction):
        with _jobs_lock:
            _jobs[job_id].update(status="running", stage=stage, progress=round(fraction, 4))

    try:
        result = run_analysis(data, suffix, progress)
        update = {"status": "done", "progress": 1.0, "result": result}
    except HTTPException as e:
        update = {"status": "error", "error": e.detail, "code": e.status_code}
    except Exception as e:   # surface the failure to the app instead of polling forever
        update = {"status": "error", "error": f"analysis failed: {e}", "code": 500}
    with _jobs_lock:
        _jobs[job_id].update(update, finished_at=time.time())


@app.post("/analyze/jobs")
def start_job(file: UploadFile = File(...)):
    data, suffix = read_upload(file)
    job_id = uuid.uuid4().hex[:12]
    with _jobs_lock:
        for old in [k for k, j in _jobs.items() if time.time() - j.get("finished_at", time.time()) > JOB_TTL_S]:
            del _jobs[old]
        _jobs[job_id] = {"status": "queued", "stage": "pose", "progress": 0.0}
    threading.Thread(target=_run_job, args=(job_id, data, suffix), daemon=True).start()
    return {"job_id": job_id}


@app.get("/analyze/jobs/{job_id}")
def job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "unknown job")
        snapshot = {k: v for k, v in job.items() if k != "finished_at"}
    return snapshot


@app.post("/report")
def report(req: ReportRequest):
    cfg = load_config()
    return messages.generate(req.result, req.checkin.model_dump(), cfg["analysis"]["mismatch_threshold"])
