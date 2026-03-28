"""
Message Templates CRUD + AI Style Generator.
Generates 3 message variants using Google Gemini.
"""
import json
import logging
import re
from typing import Optional

import aiosqlite
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import GEMINI_API_KEY
from database import DB_PATH

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/templates", tags=["templates"])

VALID_STAGES = {"prospect", "contacted", "proposal", "negotiating", "closed", "lost", "any"}

STAGE_LABELS = {
    "prospect":    "prospecto (primer contacto)",
    "contacted":   "contactado (ya hubo primer mensaje)",
    "proposal":    "propuesta enviada",
    "negotiating": "en negociación",
    "closed":      "cliente cerrado",
    "lost":        "lead perdido / reactivación",
    "any":         "cualquier etapa",
}

# Try different model names + API versions until one works
MODELS_TO_TRY = [
    ("v1beta", "gemini-2.5-flash"),
    ("v1beta", "gemini-2.0-flash"),
    ("v1beta", "gemini-2.0-flash-lite"),
    ("v1beta", "gemini-2.0-flash-001"),
]


# ── Pydantic models ────────────────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    pipeline_stage: str = "any"
    body: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    pipeline_stage: Optional[str] = None
    body: Optional[str] = None


class GenerateAIRequest(BaseModel):
    client_id: int
    style_directive: str
    pipeline_stage: str = "any"
    template_id: Optional[int] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _validate_stage(stage: str) -> None:
    if stage not in VALID_STAGES:
        raise HTTPException(400, f"pipeline_stage inválido. Opciones: {sorted(VALID_STAGES)}")


# ── CRUD routes ────────────────────────────────────────────────────────────────

@router.get("")
async def list_templates():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM message_templates ORDER BY pipeline_stage, name"
        )
        rows = await cursor.fetchall()
    return {"templates": [dict(r) for r in rows]}


@router.post("")
async def create_template(body: TemplateCreate):
    name = body.name.strip()
    tmpl_body = body.body.strip()
    if not name or not tmpl_body:
        raise HTTPException(400, "name y body son requeridos")
    _validate_stage(body.pipeline_stage)

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT INTO message_templates (name, pipeline_stage, body) VALUES (?, ?, ?)",
            (name, body.pipeline_stage, tmpl_body),
        )
        await db.commit()
        new_id = cursor.lastrowid
        db.row_factory = aiosqlite.Row
        cur2 = await db.execute("SELECT * FROM message_templates WHERE id = ?", (new_id,))
        row = await cur2.fetchone()
    return dict(row)


@router.put("/{template_id}")
async def update_template(template_id: int, body: TemplateUpdate):
    if body.pipeline_stage is not None:
        _validate_stage(body.pipeline_stage)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cur = await db.execute(
            "SELECT id FROM message_templates WHERE id = ?", (template_id,)
        )
        if not await cur.fetchone():
            raise HTTPException(404, "Template no encontrado")

        fields, values = [], []
        if body.name is not None:
            fields.append("name = ?")
            values.append(body.name.strip())
        if body.pipeline_stage is not None:
            fields.append("pipeline_stage = ?")
            values.append(body.pipeline_stage)
        if body.body is not None:
            fields.append("body = ?")
            values.append(body.body.strip())

        if not fields:
            raise HTTPException(400, "Nada que actualizar")

        fields.append("updated_at = CURRENT_TIMESTAMP")
        values.append(template_id)
        await db.execute(
            f"UPDATE message_templates SET {', '.join(fields)} WHERE id = ?", values
        )
        await db.commit()
        cur2 = await db.execute(
            "SELECT * FROM message_templates WHERE id = ?", (template_id,)
        )
        row = await cur2.fetchone()
    return dict(row)


@router.delete("/{template_id}")
async def delete_template(template_id: int):
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT id FROM message_templates WHERE id = ?", (template_id,)
        )
        if not await cur.fetchone():
            raise HTTPException(404, "Template no encontrado")
        await db.execute("DELETE FROM message_templates WHERE id = ?", (template_id,))
        await db.commit()
    return {"ok": True}


# ── AI generation route ────────────────────────────────────────────────────────

@router.post("/generate-ai")
async def generate_ai_messages(body: GenerateAIRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY no configurada en .env")

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row

        # Load client
        cur = await db.execute("SELECT * FROM clients WHERE id = ?", (body.client_id,))
        client_row = await cur.fetchone()
        if not client_row:
            raise HTTPException(404, "Cliente no encontrado")
        client = dict(client_row)

        # Optionally load base template
        template_body: Optional[str] = None
        if body.template_id is not None:
            cur2 = await db.execute(
                "SELECT body FROM message_templates WHERE id = ?", (body.template_id,)
            )
            tpl_row = await cur2.fetchone()
            if tpl_row:
                template_body = tpl_row["body"]

    stage_label = STAGE_LABELS.get(body.pipeline_stage, body.pipeline_stage)

    base_section = ""
    if template_body:
        base_section = (
            f"\nUSA ESTE TEMPLATE COMO BASE (personalízalo para el cliente):\n"
            f"{template_body}\n"
        )

    prompt = (
        f"Genera 3 opciones de mensaje de WhatsApp para este cliente:\n"
        f"- Nombre: {client.get('name', 'el negocio')}\n"
        f"- Rubro: {client.get('category', 'negocio local')}\n"
        f"- Ciudad: {client.get('city', '') or ''}\n"
        f"- Rating Google: {client.get('rating', '') or 'sin dato'}\n"
        f"- Etapa del pipeline: {stage_label}\n"
        f"- Estilo solicitado: {body.style_directive}\n"
        f"{base_section}\n"
        f"Cada mensaje debe ser personalizado, máximo 5 líneas, directo y listo para WhatsApp.\n"
        f"NO incluyas explicaciones ni numeración fuera del JSON.\n"
        f'Devuelve SOLO un JSON válido: {{"options": ["mensaje1", "mensaje2", "mensaje3"]}}'
    )

    last_err = "No se intentó ningún modelo"
    async with httpx.AsyncClient(timeout=30) as http:
        for api_ver, model_name in MODELS_TO_TRY:
            url = (
                f"https://generativelanguage.googleapis.com"
                f"/{api_ver}/models/{model_name}:generateContent"
            )
            try:
                resp = await http.post(
                    url,
                    params={"key": GEMINI_API_KEY},
                    json={"contents": [{"parts": [{"text": prompt}]}]},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    raw_text = (
                        data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    )

                    # Strip markdown code fences if present
                    clean = re.sub(r"^```(?:json)?\s*", "", raw_text)
                    clean = re.sub(r"\s*```$", "", clean).strip()

                    try:
                        parsed = json.loads(clean)
                        options = parsed.get("options", [])
                        if isinstance(options, list) and len(options) > 0:
                            return {
                                "options": options[:3],
                                "client": client,
                                "model_used": f"{model_name} ({api_ver})",
                            }
                    except (json.JSONDecodeError, ValueError):
                        pass

                    # Fallback: return raw text as single option
                    return {
                        "options": [raw_text],
                        "client": client,
                        "model_used": f"{model_name} ({api_ver}) [raw]",
                    }
                else:
                    err_msg = (
                        resp.json().get("error", {}).get("message", resp.text[:150])
                    )
                    last_err = f"{model_name}/{api_ver} → {resp.status_code}: {err_msg}"
            except Exception as e:
                last_err = f"{model_name}/{api_ver} → {e}"

    raise HTTPException(
        500, f"Error Gemini (todos los modelos fallaron): {last_err}"
    )
