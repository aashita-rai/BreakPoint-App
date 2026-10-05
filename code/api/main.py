"""FastAPI server for the Expo client.   cd code && uvicorn api.main:app --host 0.0.0.0 --port 8000
Serving model: env SERVE_MODEL, else results/winner.json["serve_model"]. Loud error if neither."""
import json
import os
import shutil
import tempfile
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from analysis import messages
from analysis.pipeline import analyze_arrays
from api.database import init_db, save_analysis, save_report, weekly_summary
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
init_db()

try:
    from server.breakpoint_extras import router as extras_router
except ModuleNotFoundError:
    extras_router = None
if extras_router is not None:
    app.include_router(extras_router)

_state = {"backend": None, "name": None}
_lock = threading.Lock()
# Background analysis jobs: job_id -> {status, stage, progress, result, error, updated}.
# In memory only; a restart forgets running jobs (the app then shows the error and the user retries).
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
JOB_TTL_S = 3600


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
    reported_rpe: int = Field(ge=1, le=10)
    pain: bool = False
    pain_locations: list[str] = []
    pain_other: str = ""
    notes: str = ""


class ReportRequest(BaseModel):
    result: dict
    check_in: CheckIn
    athlete_name: str = "The athlete"


@app.get("/health")
def health():
    return {"ok": True, "serve_model": os.environ.get("SERVE_MODEL") or
            (json.load(open(RESULTS / "winner.json")).get("serve_model") if (RESULTS / "winner.json").exists() else None)}


def _read_upload(file: UploadFile, td: str) -> Path:
    data = file.file.read(MAX_MB * 1024 * 1024 + 1)
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"video larger than {MAX_MB} MB")
    suffix = Path(file.filename or "v.mp4").suffix.lower() or ".mp4"
    if suffix not in (".mp4", ".mov", ".m4v", ".webm"):
        raise HTTPException(400, f"unsupported file type {suffix}")
    vid = Path(td) / f"in{suffix}"
    vid.write_bytes(data)
    return vid


def _process(vid: Path, squat_variation: str, report=lambda stage, fraction: None) -> dict:
    """Pose model -> analysis -> annotated video. report(stage, fraction) is called as work advances.
    Overall fraction: pose 0-0.75, analysis 0.75-0.80, render 0.80-1.0."""
    cfg = load_config()
    report("queued", 0.0)
    with _lock:   # one inference at a time on the demo server
        try:
            backend, name = get_backend(cfg)
            report("pose", 0.0)
            kps, times, meta = run_pose(get_model(cfg, name), cfg, vid, backend.device, backend=backend,
                                        progress=lambda f: report("pose", 0.75 * f))
            report("analysis", 0.75)
            result = analyze_arrays(kps, times, meta["fps"], cfg, name, squat_variation=squat_variation)
        except ValueError as e:   # e.g. too few reps, athlete lost -> tell the user, don't fake it
            raise HTTPException(422, str(e))
    vid_id = uuid.uuid4().hex[:12]
    out = VIDEOS / f"{vid_id}.mp4"
    npz = vid.parent / "k.npz"
    from common.keypoint_schema import save_keypoints
    save_keypoints(npz, kps, times, meta)
    report("render", 0.80)
    render(vid, npz, result, out, cfg, progress=lambda f: report("render", 0.80 + 0.19 * f))
    result["annotated_video_url"] = f"/videos/{vid_id}.mp4"
    result["analysis_id"] = vid_id
    save_analysis(vid_id, result)
    return result


@app.post("/analyze")
def analyze(file: UploadFile = File(...), squat_variation: str = Form("standard")):
    """Blocking version: one request that returns the result. Fine on a LAN; behind a Cloudflare
    quick tunnel long videos can hit its ~100 s response limit, so the app uses /analyze/jobs."""
    with tempfile.TemporaryDirectory() as td:
        return _process(_read_upload(file, td), squat_variation)


def _set_job(job_id: str, **fields):
    with _jobs_lock:
        _jobs[job_id].update(fields, updated=time.time())


def _run_job(job_id: str, vid: Path, squat_variation: str):
    def report(stage, fraction):
        _set_job(job_id, status="running" if stage != "queued" else "queued", stage=stage, progress=round(fraction, 3))
    try:
        result = _process(vid, squat_variation, report)
        _set_job(job_id, status="done", stage="done", progress=1.0, result=result)
    except HTTPException as e:
        _set_job(job_id, status="error", error=str(e.detail), error_code=e.status_code)
    except Exception as e:   # surface the real reason to the app instead of hanging
        _set_job(job_id, status="error", error=f"{type(e).__name__}: {e}", error_code=500)
    finally:
        shutil.rmtree(vid.parent, ignore_errors=True)


def _start_job(vid: Path, squat_variation: str) -> str:
    job_id = uuid.uuid4().hex
    now = time.time()
    with _jobs_lock:
        for old in [k for k, j in _jobs.items() if now - j["updated"] > JOB_TTL_S]:
            del _jobs[old]
        _jobs[job_id] = {"status": "queued", "stage": "queued", "progress": 0.0, "result": None,
                         "error": None, "error_code": None, "updated": now}
    threading.Thread(target=_run_job, args=(job_id, vid, squat_variation), daemon=True).start()
    return job_id


@app.post("/analyze/jobs")
def start_analysis_job(file: UploadFile = File(...), squat_variation: str = Form("standard")):
    """Accepts the whole video in one request, returns a job_id immediately, and analyzes in a background
    thread. Fine on a LAN. Through a Cloudflare tunnel a slow phone upload can pass ~100 s and fail (524),
    so the app uses the chunked /analyze/uploads routes below."""
    td = tempfile.mkdtemp(prefix="bp_job_")
    try:
        vid = _read_upload(file, td)
    except Exception:
        shutil.rmtree(td, ignore_errors=True)
        raise
    return {"job_id": _start_job(vid, squat_variation)}


# ── Chunked upload ────────────────────────────────────────────────────────────
# The app sends the video in ~2 MB pieces, one short request each, so no request ever approaches
# Cloudflare's ~100 s limit however slow the phone's connection. Pieces are appended in order; a piece
# that was already received (its response got lost and the app retried) is acknowledged, not re-appended.
_uploads: dict[str, dict] = {}
_uploads_lock = threading.Lock()
VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v", ".webm")


class UploadStart(BaseModel):
    filename: str = "squats.mp4"
    size: int = Field(gt=0, le=MAX_MB * 1024 * 1024)


@app.post("/analyze/uploads")
def start_upload(req: UploadStart):
    suffix = Path(req.filename).suffix.lower() or ".mp4"
    if suffix not in VIDEO_SUFFIXES:
        raise HTTPException(400, f"unsupported file type {suffix}")
    now = time.time()
    with _uploads_lock:
        for old in [k for k, u in _uploads.items() if now - u["updated"] > JOB_TTL_S]:
            shutil.rmtree(_uploads.pop(old)["path"].parent, ignore_errors=True)
        upload_id = uuid.uuid4().hex
        path = Path(tempfile.mkdtemp(prefix="bp_up_")) / f"in{suffix}"
        path.touch()
        _uploads[upload_id] = {"path": path, "size": req.size, "received": 0, "updated": now}
    return {"upload_id": upload_id}


def _upload(upload_id: str) -> dict:
    u = _uploads.get(upload_id)
    if u is None:
        raise HTTPException(404, "Unknown upload. The server may have restarted; please upload again.")
    return u


@app.put("/analyze/uploads/{upload_id}")
async def upload_chunk(upload_id: str, offset: int, length: int, request: Request):
    data = await request.body()
    if len(data) != length:
        # Through cloudflared, a body sent with chunked transfer encoding can arrive with the chunk framing
        # still in it. Reject instead of corrupting the video; the app retries the piece.
        raise HTTPException(400, f"piece arrived as {len(data)} bytes, expected {length}")
    with _uploads_lock:
        u = _upload(upload_id)
        if offset + len(data) <= u["received"]:   # a retry of a piece we already have
            return {"received": u["received"]}
        if offset != u["received"]:
            raise HTTPException(409, f"expected offset {u['received']}, got {offset}")
        if u["received"] + len(data) > u["size"]:
            raise HTTPException(413, "more data than the declared video size")
        with open(u["path"], "ab") as f:
            f.write(data)
        u["received"] += len(data)
        u["updated"] = time.time()
        return {"received": u["received"]}


@app.post("/analyze/uploads/{upload_id}/finish")
def finish_upload(upload_id: str, squat_variation: str = Form("standard")):
    with _uploads_lock:
        u = _upload(upload_id)
        if u["received"] != u["size"]:
            raise HTTPException(409, f"upload incomplete: {u['received']} of {u['size']} bytes")
        _uploads.pop(upload_id)
    return {"job_id": _start_job(u["path"], squat_variation)}


@app.get("/analyze/jobs/{job_id}")
def analysis_job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Unknown analysis job. The server may have restarted; please upload again.")
        return {"job_id": job_id, **{k: v for k, v in job.items() if k != "updated"}}


@app.get("/dashboard/weekly")
def dashboard_weekly():
    return weekly_summary()


@app.post("/report")
def report(req: ReportRequest):
    cfg = load_config()
    checkin = {**req.check_in.model_dump(), "rpe": req.check_in.reported_rpe}
    output = messages.generate(req.result, checkin, cfg["analysis"]["mismatch_threshold"])
    mismatch = output.get("mismatch", {})
    status = str(mismatch.get("status", "consistent")).replace("_", "-")
    output["status"] = status
    output["expected_rpe"] = mismatch.get("expected_rpe", req.result.get("overall_rfi", 0) / 10)
    output["reported_rpe"] = req.check_in.reported_rpe
    save_report(req.result, status, req.check_in.pain)
    return output
