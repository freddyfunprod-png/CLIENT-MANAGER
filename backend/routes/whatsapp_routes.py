"""
WhatsApp Bulk Send via Playwright (WhatsApp Web).
Max 20 messages/day, random delay 30-90s between messages.
"""
import asyncio
import json
import logging
import random
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import quote
from typing import Optional

import aiosqlite
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import GEMINI_API_KEY
from database import DB_PATH

WA_SESSION_PATH = Path(DB_PATH).parent / "wa_session.json"
WA_CONFIG_PATH  = Path(DB_PATH).parent / "wa_config.json"

MODELS_TO_TRY = [
    ("v1beta", "gemini-2.5-flash"),
    ("v1beta", "gemini-2.0-flash"),
    ("v1beta", "gemini-2.0-flash-lite"),
]

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

DEFAULT_MAX_DAILY = 30
MIN_DAILY = 5
MAX_DAILY_CAP = 40


def _get_max_daily() -> int:
    try:
        if WA_CONFIG_PATH.exists():
            cfg = json.loads(WA_CONFIG_PATH.read_text(encoding="utf-8"))
            return max(MIN_DAILY, min(MAX_DAILY_CAP, int(cfg.get("max_daily", DEFAULT_MAX_DAILY))))
    except Exception:
        pass
    return DEFAULT_MAX_DAILY


def _set_max_daily(value: int) -> int:
    clamped = max(MIN_DAILY, min(MAX_DAILY_CAP, value))
    WA_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    WA_CONFIG_PATH.write_text(json.dumps({"max_daily": clamped}), encoding="utf-8")
    return clamped

# Persistent browser instance — stays open until user closes it manually
_browser_instance = None
_browser_ctx = None
_browser_page = None
_playwright_instance = None

_wa_state: dict = {
    "running": False,
    "stop_flag": False,
    "progress": 0,
    "total": 0,
    "done": True,
    "error": None,
    "logs": [],
    "current_name": "",
}


def _wa_log(msg: str) -> None:
    _wa_state["logs"].append({"t": datetime.now().strftime("%H:%M:%S"), "msg": msg})
    logger.info("WA: %s", msg)


async def _daily_sent_count() -> int:
    today = date.today().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT COUNT(*) FROM whatsapp_log WHERE date(sent_at)=?", (today,)
        )
        row = await cur.fetchone()
    return row[0] if row else 0


async def _gemini_personalize(template_body: str, contact: dict) -> str:
    """Generate a personalized WhatsApp message for a specific business using Gemini."""
    if not GEMINI_API_KEY:
        return template_body  # fallback to raw template

    name     = contact.get("name") or "el negocio"
    city     = contact.get("city") or ""
    category = contact.get("category") or ""
    maps     = contact.get("link_googlemaps") or ""
    website  = contact.get("website") or ""
    instagram = contact.get("instagram") or ""
    rating   = contact.get("rating") or ""
    notes    = contact.get("notes") or ""

    context_lines = [f"- Nombre del negocio: {name}"]
    if category:  context_lines.append(f"- Rubro: {category}")
    if city:      context_lines.append(f"- Ciudad: {city}")
    if rating:    context_lines.append(f"- Rating Google Maps: {rating}★")
    if maps:      context_lines.append(f"- Google Maps: {maps}")
    if website:   context_lines.append(f"- Sitio web actual: {website}")
    if instagram: context_lines.append(f"- Instagram: {instagram}")
    if notes:     context_lines.append(f"- Notas internas: {notes}")

    prompt = (
        f"Eres un experto en ventas B2B para servicios de marketing digital.\n"
        f"Escribe UN mensaje de WhatsApp personalizado para este negocio específico.\n\n"
        f"DATOS DEL NEGOCIO:\n" + "\n".join(context_lines) + "\n\n"
        f"TEMPLATE BASE (usa este como guía de tono y estructura):\n{template_body}\n\n"
        f"INSTRUCCIONES:\n"
        f"- Menciona detalles específicos del negocio (nombre, rubro, ciudad)\n"
        f"- Si tiene Google Maps o web, podés hacer referencia a lo que viste\n"
        f"- Máximo 5 líneas, natural, listo para enviar por WhatsApp\n"
        f"- NO incluyas saludo genérico ni explicaciones\n"
        f"- Responde SOLO con el mensaje, sin comillas ni prefijos\n"
        f"- ESTILO: escribe como persona real, no como IA. Cero muletillas ('es fundamental', 'cabe destacar'). "
        f"Voz activa, sin adverbios vacíos, sin jargon corporativo. Tono natural de vendedor experimentado."
    )

    async with httpx.AsyncClient(timeout=20) as http:
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
                    raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    # Strip markdown fences if any
                    raw = re.sub(r"^```[^\n]*\n?", "", raw)
                    raw = re.sub(r"\n?```$", "", raw).strip()
                    return raw
            except Exception:
                continue

    return template_body  # fallback


async def _send_bulk(lead_ids: list[int], message: str, use_ai: bool = False, template_body: str = "", source: str = "leads") -> None:
    from scraper.browser import browser_session

    # Fetch data from the correct table based on source
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        placeholders = ",".join("?" * len(lead_ids))
        table = "clients" if source == "clients" else "leads"
        cur = await db.execute(
            f"SELECT id, name, phone, city, category FROM {table} WHERE id IN ({placeholders})",
            lead_ids,
        )
        leads = [dict(r) for r in await cur.fetchall()]

    max_daily = _get_max_daily()
    today_sent = await _daily_sent_count()
    if today_sent >= max_daily:
        _wa_state["error"] = f"Límite diario alcanzado ({max_daily}/día)"
        _wa_state["running"] = False
        _wa_state["done"] = True
        return

    available = max_daily - today_sent
    leads = leads[:available]
    _wa_state["total"] = len(leads)
    _wa_log(f"Iniciando envío a {len(leads)} leads ({today_sent}/{max_daily} enviados hoy)")

    try:
        global _browser_instance, _browser_ctx, _browser_page, _playwright_instance
        from playwright.async_api import async_playwright

        # Reuse existing browser if still open, otherwise launch new one
        need_new_browser = True
        if _browser_page:
            try:
                await _browser_page.title()  # check if page is still alive
                need_new_browser = False
                _wa_log("Usando sesión de WhatsApp Web ya abierta")
            except Exception:
                need_new_browser = True

        if need_new_browser:
            if _playwright_instance is None:
                _playwright_instance = await async_playwright().start()
            storage = str(WA_SESSION_PATH) if WA_SESSION_PATH.exists() else None
            _browser_instance = await _playwright_instance.chromium.launch(
                headless=False,
                args=[
                    "--disable-blink-features=AutomationControlled",
                    "--no-sandbox",
                    "--start-maximized",
                ],
            )
            _browser_ctx = await _browser_instance.new_context(
                storage_state=storage,
                no_viewport=True,  # use full window size instead of fixed viewport
            )
            _browser_page = await _browser_ctx.new_page()

            _wa_log("Abriendo WhatsApp Web...")
            await _browser_page.goto("https://web.whatsapp.com", wait_until="domcontentloaded")

            try:
                await _browser_page.wait_for_selector(
                    'div[data-testid="chat-list"], canvas[aria-label="Scan me!"]',
                    timeout=30000,
                )
                qr = await _browser_page.query_selector('canvas[aria-label="Scan me!"]')
                if qr:
                    _wa_log("Escanea el QR en la ventana del browser (60s)...")
                    await _browser_page.wait_for_selector('div[data-testid="chat-list"]', timeout=60000)
            except Exception:
                pass

            await _browser_ctx.storage_state(path=str(WA_SESSION_PATH))
            _wa_log("WhatsApp Web listo — la ventana quedará abierta al terminar")

        page = _browser_page

        for i, lead in enumerate(leads, 1):
            if _wa_state.get("stop_flag"):
                _wa_log("Envío detenido por el usuario")
                break

            name = lead.get("name") or "?"
            raw_phone = lead.get("phone") or ""
            phone = "".join(c for c in raw_phone if c.isdigit() or c == "+").lstrip("+")

            if not phone:
                _wa_log(f"[{i}/{len(leads)}] {name} — sin teléfono, saltando")
                _wa_state["progress"] = i
                continue

            _wa_state["current_name"] = name
            _wa_log(f"[{i}/{len(leads)}] Enviando a {name}...")

            if use_ai and template_body:
                _wa_log(f"[{i}/{len(leads)}] Generando mensaje con IA para {name}...")
                msg = await _gemini_personalize(template_body, lead)
            else:
                city = lead.get("city") or ""
                category = lead.get("category") or ""
                msg = (
                    message
                    .replace("{nome}", name)
                    .replace("{negocio}", name)
                    .replace("{cidade}", city)
                    .replace("{categoria}", category)
                    .replace("{client_name}", name)
                    .replace("{business_name}", name)
                    .replace("{city}", city)
                    .replace("{category}", category)
                    .replace("{etapa}", "")
                )

            try:
                url = f"https://web.whatsapp.com/send?phone={phone}&text={quote(msg)}"
                await page.goto(url, wait_until="domcontentloaded")

                compose = None
                for sel in [
                    'div[contenteditable="true"][data-tab="10"]',
                    'div[contenteditable="true"][data-tab="6"]',
                    'div[contenteditable="true"][data-tab]',
                    'div[role="textbox"]',
                ]:
                    try:
                        compose = await page.wait_for_selector(sel, timeout=20000)
                        if compose:
                            break
                    except Exception:
                        continue

                sent = False
                if compose:
                    await compose.click()
                    await asyncio.sleep(1)
                    await page.keyboard.press("Enter")
                    sent = True
                    await asyncio.sleep(3)
                else:
                    _wa_log(f"[{i}/{len(leads)}] No se cargó el chat para {name} (¿número inválido?)")

                if sent:
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            "INSERT INTO whatsapp_log (lead_id, phone, message, sent_at) "
                            "VALUES (?,?,?,CURRENT_TIMESTAMP)",
                            (lead["id"], phone, msg[:500]),
                        )
                        # Mark "Primer contacto realizado" in client checklist
                        if source == "clients":
                            await db.execute(
                                "UPDATE checklists SET completed=1, updated_at=CURRENT_TIMESTAMP "
                                "WHERE client_id=? AND step='Primer contacto realizado' AND completed=0",
                                (lead["id"],),
                            )
                        await db.commit()
                    _wa_log(f"[{i}/{len(leads)}] ✓ Enviado a {name} — checklist actualizado")
            except Exception as e:
                _wa_log(f"[{i}/{len(leads)}] Error: {e}")

            _wa_state["progress"] = i

            if i < len(leads) and not _wa_state.get("stop_flag"):
                delay = random.randint(30, 90)
                _wa_log(f"Esperando {delay}s antes del próximo envío...")
                await asyncio.sleep(delay)

        _wa_log(f"Completado: {_wa_state['progress']}/{len(leads)} procesados")
        _wa_log("✅ WhatsApp Web sigue abierto — cerralo manualmente cuando quieras")
        if _browser_ctx:
            await _browser_ctx.storage_state(path=str(WA_SESSION_PATH))

    except Exception as e:
        _wa_state["error"] = str(e)
        _wa_log(f"Error: {e}")
        logger.exception("WhatsApp bulk send error")
    finally:
        _wa_state["running"] = False
        _wa_state["done"] = True
        _wa_state["current_name"] = ""


class BulkSendRequest(BaseModel):
    lead_ids: list[int]
    message: str
    use_ai: bool = False
    template_body: Optional[str] = None
    source: str = "leads"  # "leads" or "clients"


@router.post("/bulk-send")
async def bulk_send(body: BulkSendRequest):
    if _wa_state["running"]:
        raise HTTPException(400, "Ya hay un envío en progreso")
    if not body.lead_ids:
        raise HTTPException(400, "No hay leads seleccionados")
    if not body.message.strip():
        raise HTTPException(400, "El mensaje no puede estar vacío")
    max_daily = _get_max_daily()
    if len(body.lead_ids) > max_daily:
        raise HTTPException(400, f"Máximo {max_daily} por día")

    _wa_state.update({
        "running": True,
        "stop_flag": False,
        "progress": 0,
        "total": len(body.lead_ids),
        "done": False,
        "error": None,
        "logs": [],
        "current_name": "",
    })
    asyncio.create_task(_send_bulk(
        body.lead_ids, body.message,
        use_ai=body.use_ai,
        template_body=body.template_body or body.message,
        source=body.source,
    ))
    return {"status": "started", "total": len(body.lead_ids)}


@router.post("/stop")
async def stop_send():
    _wa_state["stop_flag"] = True
    return {"status": "stopping"}


@router.get("/status")
async def wa_status():
    async def gen():
        sent = 0
        while _wa_state["running"] or not _wa_state["done"]:
            new_logs = _wa_state["logs"][sent:]
            sent = len(_wa_state["logs"])
            payload = {
                "running":      _wa_state["running"],
                "progress":     _wa_state["progress"],
                "total":        _wa_state["total"],
                "done":         _wa_state["done"],
                "error":        _wa_state["error"],
                "current_name": _wa_state["current_name"],
                "new_logs":     new_logs,
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.5)
        yield f"data: {json.dumps({'done': True, 'running': False, 'new_logs': []}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/daily-count")
async def daily_count():
    max_daily = _get_max_daily()
    cnt = await _daily_sent_count()
    return {"sent_today": cnt, "max_daily": max_daily, "remaining": max(0, max_daily - cnt)}


class WaConfigRequest(BaseModel):
    max_daily: int


@router.get("/config")
async def get_config():
    return {"max_daily": _get_max_daily(), "min": MIN_DAILY, "max": MAX_DAILY_CAP}


@router.put("/config")
async def set_config(body: WaConfigRequest):
    new_val = _set_max_daily(body.max_daily)
    return {"max_daily": new_val, "min": MIN_DAILY, "max": MAX_DAILY_CAP}
