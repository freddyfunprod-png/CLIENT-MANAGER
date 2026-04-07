"""
Backup routes: export/import DB data as JSON.
Use these to sync your local SQLite to the Render instance.
"""
import json
import logging
from datetime import datetime
from typing import Any

import aiosqlite
from fastapi import APIRouter, Body, HTTPException
from fastapi.responses import JSONResponse

from database import DB_PATH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/backup", tags=["backup"])

TABLES = ["leads", "clients", "scraper_categories", "scraper_settings",
          "vendors", "message_templates", "goals", "daily_plan", "checklists"]


@router.get("/export")
async def export_db():
    """Export all DB data as JSON. Run this on local, import on Render."""
    dump = {"exported_at": datetime.now().isoformat(), "tables": {}}

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        for table in TABLES:
            try:
                cur = await db.execute(f"SELECT * FROM {table}")
                rows = await cur.fetchall()
                dump["tables"][table] = [dict(r) for r in rows]
            except Exception as e:
                logger.warning(f"Export skip {table}: {e}")
                dump["tables"][table] = []

    return JSONResponse(content=dump, headers={
        "Content-Disposition": f'attachment; filename="crm_backup_{datetime.now().strftime("%Y%m%d_%H%M")}.json"'
    })


@router.post("/import")
async def import_db(payload: Any = Body(...)):
    """
    Import DB data from a backup JSON.
    Only inserts rows that don't exist (OR IGNORE).
    Safe to run multiple times.
    """
    tables = payload.get("tables", {})
    if not tables:
        raise HTTPException(400, "Payload vacío o sin clave 'tables'")

    results = {}
    async with aiosqlite.connect(DB_PATH) as db:
        for table, rows in tables.items():
            if table not in TABLES:
                continue
            if not rows:
                results[table] = 0
                continue
            try:
                cols = list(rows[0].keys())
                placeholders = ", ".join("?" * len(cols))
                col_names = ", ".join(cols)
                inserted = 0
                for row in rows:
                    values = [row.get(c) for c in cols]
                    try:
                        await db.execute(
                            f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({placeholders})",
                            values,
                        )
                        inserted += 1
                    except Exception as e:
                        logger.warning(f"Row skip {table}: {e}")
                await db.commit()
                results[table] = inserted
            except Exception as e:
                logger.error(f"Import error {table}: {e}")
                results[table] = f"ERROR: {e}"

    return {"status": "ok", "inserted": results}
