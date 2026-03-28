"""
CRUD endpoints for vendors (team members).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import DB_PATH
import aiosqlite

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


class VendorCreate(BaseModel):
    name: str
    color: str = "#6B7280"
    initial: str = ""
    whatsapp: str = ""


class VendorUpdate(BaseModel):
    whatsapp: str | None = None
    color: str | None = None


@router.get("")
async def list_vendors():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT id, name, color, initial, whatsapp FROM vendors ORDER BY id")
        rows = await cur.fetchall()
        return {"vendors": [dict(r) for r in rows]}


@router.post("", status_code=201)
async def create_vendor(body: VendorCreate):
    name = body.name.strip()
    if not name:
        raise HTTPException(400, "Nombre requerido")
    initial = (body.initial.strip() or name[0]).upper()
    wa = body.whatsapp.strip() or None
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            cur = await db.execute(
                "INSERT INTO vendors (name, color, initial, whatsapp) VALUES (?, ?, ?, ?)",
                (name, body.color, initial, wa),
            )
            await db.commit()
            vendor_id = cur.lastrowid
        except Exception:
            raise HTTPException(409, f"Ya existe un vendedor llamado '{name}'")
    return {"id": vendor_id, "name": name, "color": body.color, "initial": initial, "whatsapp": wa}


@router.patch("/{vendor_id}")
async def update_vendor(vendor_id: int, body: VendorUpdate):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute("SELECT * FROM vendors WHERE id = ?", (vendor_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendedor no encontrado")
        wa = body.whatsapp.strip() if body.whatsapp is not None else row["whatsapp"]
        color = body.color or row["color"]
        await db.execute(
            "UPDATE vendors SET whatsapp = ?, color = ? WHERE id = ?",
            (wa or None, color, vendor_id),
        )
        await db.commit()
        cur2 = await db.execute("SELECT id, name, color, initial, whatsapp FROM vendors WHERE id = ?", (vendor_id,))
        updated = await cur2.fetchone()
    return dict(updated)


@router.delete("/{vendor_id}", status_code=204)
async def delete_vendor(vendor_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        # Fetch vendor name to clear assigned_to
        cur = await db.execute("SELECT name FROM vendors WHERE id = ?", (vendor_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(404, "Vendedor no encontrado")
        vendor_name = row[0]
        # Unassign clients
        await db.execute(
            "UPDATE clients SET assigned_to = NULL WHERE assigned_to = ?",
            (vendor_name,),
        )
        await db.execute("DELETE FROM vendors WHERE id = ?", (vendor_id,))
        await db.commit()
