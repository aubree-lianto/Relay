"""Persistent storage for patient records using SQLite."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent / "triage.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS patients (
                id TEXT PRIMARY KEY,
                data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()


def get_patient(patient_id: str) -> dict[str, Any] | None:
    """Get a patient record by ID."""
    _init_db()
    with _get_conn() as conn:
        row = conn.execute("SELECT data FROM patients WHERE id = ?", (patient_id,)).fetchone()
        if row is None:
            return None
        return json.loads(row["data"])


def upsert_patient(patient_id: str, data: dict[str, Any]) -> None:
    """Insert or update a patient record."""
    _init_db()
    with _get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO patients (id, data) VALUES (?, ?)",
            (patient_id, json.dumps(data, default=str)),
        )
        conn.commit()


def list_patients() -> list[dict[str, Any]]:
    """List all patient records, newest first."""
    _init_db()
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT data FROM patients ORDER BY created_at DESC"
        ).fetchall()
        return [json.loads(r["data"]) for r in rows]


# Initialize on import
_init_db()
