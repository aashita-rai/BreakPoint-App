import sqlite3
from datetime import datetime, timedelta, timezone

from common.paths import RESULTS, ensure

DB_PATH = ensure(RESULTS) / "breakpoint.sqlite3"


def connect():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def init_db():
    with connect() as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS analyses (
                analysis_id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                squat_variation TEXT NOT NULL,
                reps INTEGER NOT NULL,
                overall_rfi REAL NOT NULL,
                quality_score REAL,
                report_status TEXT,
                pain INTEGER NOT NULL DEFAULT 0
            )"""
        )
        db.commit()


def save_analysis(analysis_id: str, result: dict):
    quality = result.get("quality") or {}
    with connect() as db:
        db.execute(
            """INSERT OR REPLACE INTO analyses
            (analysis_id, created_at, squat_variation, reps, overall_rfi, quality_score)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (
                analysis_id,
                datetime.now(timezone.utc).isoformat(),
                result.get("squat_variation", "standard"),
                result.get("rep_count", len(result.get("reps", []))),
                result["overall_rfi"],
                quality.get("score"),
            ),
        )
        db.commit()


def save_report(result: dict, status: str, pain: bool):
    analysis_id = result.get("analysis_id")
    if not analysis_id:
        return
    with connect() as db:
        db.execute(
            "UPDATE analyses SET report_status = ?, pain = ? WHERE analysis_id = ?",
            (status, int(pain), analysis_id),
        )
        db.commit()


def weekly_summary(days: int = 7) -> dict:
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM analyses WHERE created_at >= ? ORDER BY created_at DESC", (cutoff,)
        ).fetchall()
    rfi_values = [row["overall_rfi"] for row in rows]
    return {
        "days": days,
        "sets": len(rows),
        "average_rfi": round(sum(rfi_values) / len(rfi_values), 1) if rfi_values else None,
        "follow_ups": sum(1 for row in rows if row["pain"] or row["report_status"] not in (None, "consistent")),
        "variations": {variation: sum(1 for row in rows if row["squat_variation"] == variation) for variation in {row["squat_variation"] for row in rows}},
    }