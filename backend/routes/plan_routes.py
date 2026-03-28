"""
Daily plan and goals routes.
"""
from datetime import date as date_type
from typing import Optional

import aiosqlite
from fastapi import APIRouter
from pydantic import BaseModel

from database import DB_PATH

router = APIRouter(prefix="/api", tags=["plan"])


# ── Daily Plan ─────────────────────────────────────────────────────────────────
class PlanEntry(BaseModel):
    client_id: int
    date: str


@router.get("/plan/{date}")
async def get_plan(date: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT dp.*, c.name, c.phone, c.category, c.city, c.status, c.instagram
               FROM daily_plan dp
               JOIN clients c ON c.id = dp.client_id
               WHERE dp.date = ?
               ORDER BY dp.id""",
            (date,),
        )
        rows = await cursor.fetchall()
    return {"plan": [dict(r) for r in rows]}


@router.post("/plan", status_code=201)
async def add_to_plan(body: PlanEntry):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR IGNORE INTO daily_plan (client_id, date) VALUES (?, ?)",
            (body.client_id, body.date),
        )
        await db.commit()
    return {"ok": True}


@router.delete("/plan/{plan_id}", status_code=204)
async def remove_from_plan(plan_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM daily_plan WHERE id = ?", (plan_id,))
        await db.commit()


@router.patch("/plan/{plan_id}/complete")
async def toggle_plan_complete(plan_id: int, completed: bool):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE daily_plan SET completed = ? WHERE id = ?",
            (int(completed), plan_id),
        )
        await db.commit()
    return {"ok": True}


# ── Goals ──────────────────────────────────────────────────────────────────────
class GoalsUpdate(BaseModel):
    prospects: Optional[int] = None
    contacted: Optional[int] = None
    proposals: Optional[int] = None
    closures: Optional[int] = None


@router.get("/goals/{date}")
async def get_goals(date: str):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM goals WHERE date = ?", (date,))
        row = await cursor.fetchone()
    if row:
        return dict(row)
    return {"date": date, "prospects": 0, "contacted": 0, "proposals": 0, "closures": 0}


@router.post("/goals/{date}")
async def upsert_goals(date: str, body: GoalsUpdate):
    data = body.model_dump(exclude_none=True)
    if not data:
        return {"ok": True}

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT INTO goals (date) VALUES (?) ON CONFLICT(date) DO NOTHING",
            (date,),
        )
        set_clause = ", ".join(f"{k} = ?" for k in data)
        await db.execute(
            f"UPDATE goals SET {set_clause} WHERE date = ?",
            list(data.values()) + [date],
        )
        await db.commit()
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM goals WHERE date = ?", (date,))
        row = await cursor.fetchone()
    return dict(row)


# ── Leads list ─────────────────────────────────────────────────────────────────
@router.get("/leads")
async def list_leads(converted: Optional[bool] = None):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if converted is None:
            cursor = await db.execute("SELECT * FROM leads ORDER BY scraped_at DESC")
        else:
            cursor = await db.execute(
                "SELECT * FROM leads WHERE converted = ? ORDER BY scraped_at DESC",
                (int(converted),),
            )
        rows = await cursor.fetchall()
    return {"leads": [dict(r) for r in rows]}


# ── Dashboard stats ────────────────────────────────────────────────────────────
@router.get("/stats")
async def get_stats():
    today = date_type.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def one(q, *args):
            c = await db.execute(q, args)
            r = await c.fetchone()
            return r[0] if r else 0

        total_leads     = await one("SELECT COUNT(*) FROM leads")
        new_leads_today = await one("SELECT COUNT(*) FROM leads WHERE date(scraped_at) = ?", today)
        total_clients   = await one("SELECT COUNT(*) FROM clients")
        closed          = await one("SELECT COUNT(*) FROM clients WHERE status = 'closed'")
        contacted       = await one("SELECT COUNT(*) FROM clients WHERE status IN ('contacted','proposal','negotiating','closed')")
        plan_today      = await one("SELECT COUNT(*) FROM daily_plan WHERE date = ?", today)
        plan_done       = await one("SELECT COUNT(*) FROM daily_plan WHERE date = ? AND completed = 1", today)

        # Status breakdown
        status_cur = await db.execute(
            "SELECT status, COUNT(*) as cnt FROM clients GROUP BY status"
        )
        status_rows = await status_cur.fetchall()

    return {
        "total_leads":     total_leads,
        "new_leads_today": new_leads_today,
        "total_clients":   total_clients,
        "closed":          closed,
        "contacted":       contacted,
        "plan_today":      plan_today,
        "plan_done":       plan_done,
        "status_breakdown": [dict(r) for r in status_rows],
    }


# ── Today's actual progress (for Goals page) ──────────────────────────────────
@router.get("/stats/today")
async def get_today_stats():
    today = date_type.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        async def one(q, *args):
            c = await db.execute(q, args)
            r = await c.fetchone()
            return r[0] if r else 0

        # New clients added today = new prospects worked
        new_clients_today = await one(
            "SELECT COUNT(*) FROM clients WHERE date(created_at) = ?", today
        )
        # Checklist "Primer contacto realizado" completed today = contacts made
        plan_done_today = await one(
            "SELECT COUNT(*) FROM checklists WHERE step = 'Primer contacto realizado' AND completed = 1 AND date(updated_at) = ?",
            today,
        )
        # Clients moved to proposal/negotiating today
        proposals_today = await one(
            "SELECT COUNT(*) FROM clients WHERE status IN ('proposal','negotiating') AND date(updated_at) = ?",
            today,
        )
        # Clients closed today
        closures_today = await one(
            "SELECT COUNT(*) FROM clients WHERE status = 'closed' AND date(updated_at) = ?",
            today,
        )

    return {
        "new_clients_today": new_clients_today,
        "plan_done_today":   plan_done_today,
        "proposals_today":   proposals_today,
        "closures_today":    closures_today,
    }
