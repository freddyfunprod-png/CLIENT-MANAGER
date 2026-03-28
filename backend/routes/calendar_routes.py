"""
Google Calendar integration.
Tries to use the API if credentials exist; falls back to a calendar URL.
Credentials: set GOOGLE_CALENDAR_TOKEN_PATH in .env (path to token.json),
or place token.json at ~/.google_calendar_token.json
"""
import logging
import os
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import DB_PATH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/calendar", tags=["calendar"])

# Token locations to try (in order)
def _find_token() -> Optional[Path]:
    candidates = [
        os.getenv("GOOGLE_CALENDAR_TOKEN_PATH", ""),
        str(Path.home() / ".google_calendar_token.json"),
        str(Path.home() / ".claude" / "google_calendar_token.json"),
        str(Path(__file__).parent.parent.parent / "google_calendar_token.json"),
    ]
    for p in candidates:
        if p and Path(p).exists():
            return Path(p)
    return None


def _build_gcal_url(title: str, date_str: str, description: str) -> str:
    """Build a Google Calendar quick-add URL (no API needed)."""
    # date_str format: YYYY-MM-DD  →  all-day event format: YYYYMMDD
    try:
        date_compact = date_str.replace("-", "")
        # End date = next day
        from datetime import date, timedelta
        d = date.fromisoformat(date_str)
        end_compact = (d + timedelta(days=1)).strftime("%Y%m%d")
        dates = f"{date_compact}/{end_compact}"
    except Exception:
        dates = ""

    base = "https://calendar.google.com/calendar/render"
    params = f"?action=TEMPLATE&text={quote(title)}&details={quote(description)}"
    if dates:
        params += f"&dates={dates}"
    return base + params


class ScheduleRequest(BaseModel):
    client_id: int
    date: str          # YYYY-MM-DD
    note: Optional[str] = None


@router.post("/schedule-followup")
async def schedule_followup(body: ScheduleRequest):
    # Load client
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM clients WHERE id = ?", (body.client_id,))
        row = await cur.fetchone()

    if not row:
        raise HTTPException(404, "Cliente no encontrado")

    client = dict(row)
    name = client.get("name", "Cliente")
    city = client.get("city") or ""
    category = client.get("category") or ""

    title = f"Follow-up: {name}"
    note_text = body.note or ""
    description = (
        f"Follow-up con {name}\n"
        f"Rubro: {category}\n"
        f"Ciudad: {city}\n"
        f"Status: {client.get('status', '')}\n"
        + (f"\nNota: {note_text}" if note_text else "")
    ).strip()

    # Try Google Calendar API
    token_path = _find_token()
    if token_path:
        try:
            result = await _create_event_via_api(token_path, title, body.date, description)
            return {
                "method": "api",
                "event_url": result.get("htmlLink", ""),
                "message": f"Evento creado en Google Calendar para {body.date}",
            }
        except Exception as e:
            logger.warning("Google Calendar API failed, falling back to URL: %s", e)

    # Fallback: URL
    gcal_url = _build_gcal_url(title, body.date, description)
    return {
        "method": "url",
        "event_url": gcal_url,
        "message": f"Abre el link para crear el evento en Google Calendar ({body.date})",
    }


async def _create_event_via_api(token_path: Path, title: str, date_str: str, description: str) -> dict:
    """Create a Google Calendar event using a saved OAuth token."""
    import json

    with open(token_path) as f:
        token_data = json.load(f)

    access_token = token_data.get("token") or token_data.get("access_token")
    if not access_token:
        raise ValueError("No access_token in token file")

    # All-day event
    try:
        from datetime import date, timedelta
        d = date.fromisoformat(date_str)
        end_date = (d + timedelta(days=1)).isoformat()
    except Exception:
        end_date = date_str

    event_body = {
        "summary": title,
        "description": description,
        "start": {"date": date_str},
        "end": {"date": end_date},
        "reminders": {"useDefault": True},
    }

    import httpx
    async with httpx.AsyncClient(timeout=15) as http:
        resp = await http.post(
            "https://www.googleapis.com/calendar/v3/calendars/primary/events",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            json=event_body,
        )
        if resp.status_code not in (200, 201):
            raise ValueError(f"API error {resp.status_code}: {resp.text[:200]}")
        return resp.json()
