"""
Standalone server with just the BreakPoint extras, for testing voice input and the AI
analyzer before they're merged into code/api/main.py.

    cd server
    pip install -r requirements-extras.txt
    set GEMINI_API_KEY=...               (PowerShell: $env:GEMINI_API_KEY="...")
    uvicorn extras_app:app --host 0.0.0.0 --port 8000

Then start the app with EXPO_PUBLIC_API_URL=http://<this-computer's-LAN-IP>:8000
"""

from fastapi import FastAPI

from breakpoint_extras import router

app = FastAPI(title="BreakPoint extras")
app.include_router(router)


@app.get("/health")
def health() -> dict:
    return {"ok": True}
