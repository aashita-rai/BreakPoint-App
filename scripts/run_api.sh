#!/usr/bin/env bash
# Starts the BreakPoint FastAPI server (pose analysis + Gemini + Whisper routes).
#   bash scripts/run_api.sh            # port 8000
#   PORT=8010 bash scripts/run_api.sh
# Uses ~/bp_venv if it exists (override with VENV=/path/to/venv). Set GEMINI_API_KEY in your shell first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="${VENV:-$HOME/bp_venv}"
if [ -f "$VENV/bin/activate" ]; then
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
fi

export SERVE_MODEL="${SERVE_MODEL:-yolo11n-pose}"
export SERVE_DEVICE="${SERVE_DEVICE:-cpu}"
export MEDIAPIPE_DISABLE_GPU=1
# macOS Python sometimes lacks root certificates; certifi's bundle lets the Gemini client use HTTPS.
SSL_CERT_FILE="$(python -c 'import certifi; print(certifi.where())' 2>/dev/null || true)"
[ -n "$SSL_CERT_FILE" ] && export SSL_CERT_FILE
# code/ holds the analysis packages; the repo root makes server/breakpoint_extras.py importable.
export PYTHONPATH="$ROOT/code:$ROOT${PYTHONPATH:+:$PYTHONPATH}"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "warning: GEMINI_API_KEY is not set; /insights will return 503 and the app will show the safety-only report." >&2
fi

cd "$ROOT"
exec python -m uvicorn api.main:app --host 0.0.0.0 --port "${PORT:-8000}"
