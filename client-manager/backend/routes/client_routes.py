"""
Client CRUD and leads conversion routes.
"""
from datetime import datetime
from typing import Optional

import aiosqlite
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import DB_PATH, rows_to_list, row_to_dict, CHECKLIST_STEPS

router = APIRouter(prefix="/api/clients", tags=["clients"])

CLIENT_STATUSES = ["prospect", "contacted", "proposal", "negotiating", "closed", "lost"]


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    category: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    link_googlemaps: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    landing_url: Optional[str] = None
    status: str = "prospect"
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    lead_id: Optional[int] = None


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    category: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None
    rating: Optional[float] = None
    link_googlemaps: Optional[str] = None
    website: Optional[str] = None
    instagram: Optional[str] = None
    landing_url: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    assigned_to: Optional[str] = None


class LeadsConvert(BaseModel):
    lead_ids: list[int]


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _ensure_checklists(db, client_id: int) -> None:
    """Create default checklist entries for a new client."""
    for step in CHECKLIST_STEPS:
        await db.execute(
            "INSERT OR IGNORE INTO checklists (client_id, step) VALUES (?, ?)",
            (client_id, step),
        )


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("")
async def list_clients():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT c.*,
                   COUNT(ch.id)       AS checklist_total,
                   SUM(ch.completed)  AS checklist_done
            FROM clients c
            LEFT JOIN checklists ch ON ch.client_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            """
        )
        rows = await cursor.fetchall()
        clients = [dict(r) for r in rows]
    return {"clients": clients}


@router.post("", status_code=201)
async def create_client(body: ClientCreate):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO clients
               (name, phone, category, city, country, rating, link_googlemaps,
                website, instagram, landing_url, status, notes, lead_id)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                body.name, body.phone, body.category, body.city, body.country,
                body.rating, body.link_googlemaps, body.website, body.instagram,
                body.landing_url, body.status, body.notes, body.lead_id,
            ),
        )
        client_id = cursor.lastrowid
        await _ensure_checklists(db, client_id)
        await db.commit()
        db.row_factory = aiosqlite.Row
        cur2 = await db.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
        row = await cur2.fetchone()
    return dict(row)


@router.put("/{client_id}")
async def update_client(client_id: int, body: ClientUpdate):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")

    set_clause = ", ".join(f"{k} = ?" for k in fields)
    values = list(fields.values()) + [datetime.now().isoformat(), client_id]

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE clients SET {set_clause}, updated_at = ? WHERE id = ?",
            values,
        )
        await db.commit()
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM clients WHERE id = ?", (client_id,))
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(404, "Cliente no encontrado")
    return dict(row)


@router.delete("/{client_id}", status_code=204)
async def delete_client(client_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA foreign_keys = ON")
        await db.execute("DELETE FROM clients WHERE id = ?", (client_id,))
        await db.commit()


# ── Leads → CRM conversion ────────────────────────────────────────────────────
@router.post("/convert-leads", status_code=201)
async def convert_leads(body: LeadsConvert):
    created = []
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        for lead_id in body.lead_ids:
            cursor = await db.execute("SELECT * FROM leads WHERE id = ?", (lead_id,))
            lead = await cursor.fetchone()
            if not lead:
                continue
            lead = dict(lead)

            # Check if already converted
            dup = await db.execute(
                "SELECT id FROM clients WHERE lead_id = ?", (lead_id,)
            )
            if await dup.fetchone():
                continue

            cur2 = await db.execute(
                """INSERT INTO clients
                   (name, phone, category, city, country, rating,
                    link_googlemaps, website, status, lead_id)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    lead["name"], lead["phone"], lead["category"],
                    lead["city"], lead["country"], lead["rating"],
                    lead["link_googlemaps"], lead["website_raw"],
                    "prospect", lead_id,
                ),
            )
            client_id = cur2.lastrowid
            await _ensure_checklists(db, client_id)
            await db.execute(
                "UPDATE leads SET converted = 1 WHERE id = ?", (lead_id,)
            )
            created.append(client_id)

        await db.commit()

    return {"created": len(created), "client_ids": created}


# ── Checklist ─────────────────────────────────────────────────────────────────
@router.get("/{client_id}/checklist")
async def get_checklist(client_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM checklists WHERE client_id = ? ORDER BY id", (client_id,)
        )
        rows = await cursor.fetchall()
    return {"checklist": [dict(r) for r in rows]}


@router.patch("/{client_id}/checklist/{step_id}")
async def toggle_checklist(
    client_id: int,
    step_id: int,
    completed: bool,
    completed_by: Optional[str] = None,
):
    # When unchecking, always clear completed_by
    by = completed_by if completed else None
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE checklists SET completed = ?, completed_by = ?, updated_at = ? WHERE id = ? AND client_id = ?",
            (int(completed), by, datetime.now().isoformat(), step_id, client_id),
        )
        await db.commit()
    return {"ok": True}
