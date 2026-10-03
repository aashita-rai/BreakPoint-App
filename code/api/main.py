"""FastAPI server for the Expo client.   cd code && uvicorn api.main:app --host 0.0.0.0 --port 8000
Serving model: env SERVE_MODEL, else results/winner.json["serve_model"]. Loud error if neither."""
import json
import os
import tempfile
import threading
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


@app.post("/analyze")
def analyze(file: UploadFile = File(...)):
    cfg = load_config()
    data = file.file.read(MAX_MB * 1024 * 1024 + 1)
    if len(data) > MAX_MB * 1024 * 1024:
        raise HTTPException(413, f"video larger than {MAX_MB} MB")
    suffix = Path(file.filename or "v.mp4").suffix.lower() or ".mp4"
    if suffix not in (".mp4", ".mov", ".m4v", ".webm"):
        raise HTTPException(400, f"unsupported file type {suffix}")
    with tempfile.TemporaryDirectory() as td:
        vid = Path(td) / f"in{suffix}"
        vid.write_bytes(data)
        with _lock:   # one inference at a time on the demo server
            try:
                backend, name = get_backend(cfg)
                kps, times, meta = run_pose(get_model(cfg, name), cfg, vid, backend.device, backend=backend)
                result = analyze_arrays(kps, times, meta["fps"], cfg, name)
            except ValueError as e:   # e.g. too few reps, athlete lost -> tell the user, don't fake it
                raise HTTPException(422, str(e))
        vid_id = uuid.uuid4().hex[:12]
        out = VIDEOS / f"{vid_id}.mp4"
        npz = Path(td) / "k.npz"
        from common.keypoint_schema import save_keypoints
        save_keypoints(npz, kps, times, meta)
        render(vid, npz, result, out, cfg)
    result["annotated_video_url"] = f"/videos/{vid_id}.mp4"
    Path("/tmp/last_analyze.json").write_text(json.dumps(result, default=str))
    return result


@app.post("/report")
def report(req: ReportRequest):
    cfg = load_config()
    return messages.generate(req.result, req.checkin.model_dump(), cfg["analysis"]["mismatch_threshold"])
