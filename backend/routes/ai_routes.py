"""
AI message generation using Google Gemini (via REST API).
"""
from typing import Optional

import aiosqlite
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import GEMINI_API_KEY
from database import DB_PATH

router = APIRouter(prefix="/api/ai", tags=["ai"])

MESSAGE_TYPES = {
    "primer_contacto": "primer contacto por WhatsApp para ofrecer una landing page profesional",
    "seguimiento":     "seguimiento amigable a un prospecto que no ha respondido",
    "propuesta":       "presentación de propuesta de landing page con precio",
    "cierre":          "mensaje de cierre para convencer al cliente de avanzar",
    "reactivacion":    "reactivación de un lead frío que no ha respondido en días",
}

# Try different model names + API versions until one works
MODELS_TO_TRY = [
    ("v1beta", "gemini-2.5-flash"),
    ("v1beta", "gemini-2.0-flash"),
    ("v1beta", "gemini-2.0-flash-lite"),
    ("v1beta", "gemini-2.0-flash-001"),
]


class AIMessageRequest(BaseModel):
    client_id: int
    message_type: str
    extra_context: Optional[str] = None
    language: Optional[str] = "es"
    base_message: Optional[str] = None


@router.get("/message-types")
async def get_message_types():
    return {"types": [{"key": k, "label": v} for k, v in MESSAGE_TYPES.items()]}


@router.post("/message")
async def generate_message(body: AIMessageRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(500, "GEMINI_API_KEY no configurada en .env")

    if body.message_type not in MESSAGE_TYPES:
        raise HTTPException(400, f"Tipo inválido. Opciones: {list(MESSAGE_TYPES.keys())}")

    # Get client data
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM clients WHERE id = ?", (body.client_id,))
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(404, "Cliente no encontrado")

    client = dict(row)
    msg_desc = MESSAGE_TYPES[body.message_type]

    lang_map = {"es": "español", "pt": "portugués (Brasil)", "en": "inglés"}
    lang_name = lang_map.get(body.language or "es", "español")

    if body.base_message and body.base_message.strip():
        prompt = f"""Eres un vendedor profesional de landing pages para negocios locales.
Tengo este mensaje base que quiero que personalices para este cliente específico:

MENSAJE BASE:
{body.base_message.strip()}

Personalízalo con los datos de este negocio. Adapta el tono, el nombre del negocio, el rubro y la ciudad.
Escribe SOLO el mensaje final en {lang_name}, listo para enviar por WhatsApp. Sin explicaciones.

Datos del negocio:
- Nombre: {client.get('name', 'el negocio')}
- Rubro: {client.get('category', 'negocio local')}
- Ciudad: {client.get('city', '')} {client.get('country', '')}
- Rating Google: {client.get('rating', '')} estrellas
{"- Contexto adicional: " + body.extra_context if body.extra_context else ""}
"""
    else:
        prompt = f"""Eres un vendedor profesional de landing pages para negocios locales.
Escribe un mensaje de WhatsApp corto y natural (máximo 5 líneas) para hacer un {msg_desc}.
Escribe el mensaje ÚNICAMENTE en {lang_name}.

Datos del negocio:
- Nombre: {client.get('name', 'el negocio')}
- Rubro: {client.get('category', 'negocio local')}
- Ciudad: {client.get('city', '')} {client.get('country', '')}
- Rating Google: {client.get('rating', '')} estrellas
{"- Contexto adicional: " + body.extra_context if body.extra_context else ""}

El negocio NO tiene sitio web propio. Ofrécele una landing page profesional.
Tono: amigable, directo, sin spam. Escribe solo el mensaje, sin explicaciones."""

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
                    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                    return {"message": text, "client": client, "model_used": f"{model_name} ({api_ver})"}
                else:
                    err_msg = resp.json().get("error", {}).get("message", resp.text[:150])
                    last_err = f"{model_name}/{api_ver} → {resp.status_code}: {err_msg}"
            except Exception as e:
                last_err = f"{model_name}/{api_ver} → {e}"

    raise HTTPException(500, f"Error Gemini (todos los modelos fallaron): {last_err}")
