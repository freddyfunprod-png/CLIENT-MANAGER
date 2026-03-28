"""
Scraper routes: start/stop scraping and stream real-time progress via SSE.
"""
import asyncio
import json
import logging
import random
from collections import deque
from datetime import datetime

import aiosqlite
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import DB_PATH
from config import CATEGORY_SEARCH_TERMS, COOLDOWN_EVERY, COOLDOWN_MIN, COOLDOWN_MAX

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/scrape", tags=["scraper"])

# ── Global scrape state ───────────────────────────────────────────────────────
_state: dict = {
    "running": False,
    "stop_flag": False,
    "found_urls": 0,
    "visited": 0,
    "leads_count": 0,
    "total_urls": 0,
    "logs": deque(maxlen=300),
    "done": True,
    "error": None,
    "task": None,
}


def _log(msg: str, level: str = "info") -> None:
    _state["logs"].append({
        "t": datetime.now().strftime("%H:%M:%S"),
        "level": level,
        "msg": msg,
    })


def _reset() -> None:
    _state.update({
        "running": True,
        "stop_flag": False,
        "found_urls": 0,
        "visited": 0,
        "leads_count": 0,
        "total_urls": 0,
        "done": False,
        "error": None,
    })
    _state["logs"].clear()


# ── Pydantic models ───────────────────────────────────────────────────────────
class ScrapeRequest(BaseModel):
    category_key: str
    city: str
    country: str
    timezone: str = "America/Sao_Paulo"
    limit: int | None = None  # if None, use max_results from settings


class ScraperSettingsBody(BaseModel):
    website_filter: str | None = None
    min_reviews: int | None = None
    max_reviews: int | None = None
    min_rating: float | None = None
    max_results: int | None = None
    active_categories: list[str] | None = None


# ── Background scrape task ────────────────────────────────────────────────────
async def _load_settings() -> dict:
    """Load scraper settings from DB, returning a plain dict."""
    import json as _json
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute(
            "SELECT website_filter, min_reviews, max_reviews, min_rating, max_results, active_categories "
            "FROM scraper_settings WHERE id = 1"
        )
        row = await cur.fetchone()
    if row is None:
        return {
            "website_filter": "no_website",
            "min_reviews": 20,
            "max_reviews": 0,
            "min_rating": 4.0,
            "max_results": 50,
            "active_categories": [],
        }
    active_cats = _json.loads(row[5]) if row[5] else []
    return {
        "website_filter": row[0],
        "min_reviews": row[1],
        "max_reviews": row[2],
        "min_rating": row[3],
        "max_results": row[4],
        "active_categories": active_cats,
    }


async def _run_scrape(body: ScrapeRequest) -> None:
    from scraper.browser import browser_session
    from scraper.maps_search import collect_place_urls
    from scraper.maps_extractor import extract_place
    from scraper.filters import passes_filters
    from scraper.website_checker import has_real_website

    # Load settings first
    settings = await _load_settings()
    # Resolve effective limit: payload overrides settings max_results
    effective_limit = body.limit if body.limit is not None else settings.get("max_results", 50)

    async with aiosqlite.connect(DB_PATH) as _db:
        _cur = await _db.execute("SELECT label, source_type FROM scraper_categories WHERE key = ?", (body.category_key,))
        _row = await _cur.fetchone()
    category_query = _row[0] if _row else body.category_key
    source_type = _row[1] if _row else 'maps'
    _log(f"🔍 Buscando '{category_query}' en {body.city}, {body.country} [fuente: {source_type}]")

    try:
        # Cargar URLs ya procesadas para no repetir
        async with aiosqlite.connect(DB_PATH) as db:
            cursor = await db.execute(
                "SELECT link_googlemaps FROM leads WHERE link_googlemaps IS NOT NULL"
            )
            rows = await cursor.fetchall()
            cursor2 = await db.execute(
                "SELECT website_raw FROM leads WHERE website_raw LIKE '%instagram.com%'"
            )
            rows2 = await cursor2.fetchall()
        already_seen: set[str] = set()
        for row in rows:
            u = row[0]
            already_seen.add(u.split("?")[0] if "?" in u else u)
        for row in rows2:
            u = row[0]
            already_seen.add(u.rstrip('/') + '/')
        if already_seen:
            _log(f"BD: {len(already_seen)} lugares ya procesados, se saltean automaticamente", "info")

        async with browser_session(timezone_id=body.timezone) as (ctx, page):
            if source_type == 'instagram':
                from scraper.instagram_search import collect_instagram_urls, extract_instagram_profile as extract_ig
                urls = await collect_instagram_urls(page, category_query, body.city, body.country, effective_limit)
                new_urls = [u for u in urls if u not in already_seen]
                skipped = len(urls) - len(new_urls)
                _state["found_urls"] = len(new_urls)
                _state["total_urls"] = len(new_urls)
                if skipped:
                    _log(f"Saltados {skipped} ya existentes. {len(new_urls)} nuevos.", "info")
                if not new_urls:
                    _log("Todos los perfiles de Instagram ya estan en BD.", "warning")
                    return
                urls = new_urls
                for i, url in enumerate(urls, start=1):
                    if _state["stop_flag"]:
                        _log("Busqueda detenida.", "warning")
                        break
                    result = await extract_ig(page, url, body.city, body.country, category_query)
                    _state["visited"] = i
                    if result is None:
                        _log(f"[{i}/{len(urls)}] No se pudo extraer perfil", "warning")
                        continue
                    name = result.get("name") or "?"
                    _state["leads_count"] += 1
                    async with aiosqlite.connect(DB_PATH) as db:
                        await db.execute(
                            """INSERT OR IGNORE INTO leads
                               (search_query, city, country, name, category,
                                phone, website_raw, website_detected,
                                link_googlemaps, instagram, followers)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                            (
                                category_query, body.city, body.country,
                                result["name"], result["category"],
                                result["phone"], result["website_raw"],
                                int(result["website_detected"]),
                                result["link_googlemaps"],
                                result.get("instagram"),
                                result.get("followers"),
                            ),
                        )
                        await db.commit()
                    followers_str = f" · {result.get('followers')} seguidores" if result.get('followers') else ""
                    _log(f"[{i}/{len(urls)}] LEAD IG: {name}{followers_str}", "success")

                    if i % random.randint(5, 10) == 0:
                        pause = random.uniform(8, 15)
                        _log(f"Pausa {pause:.0f}s...", "info")
                        await asyncio.sleep(pause)

            else:
                # Maps scraping
                urls = await collect_place_urls(
                    page, category_query, body.city, body.country, effective_limit
                )

                # Filtrar ya procesados
                new_urls = [u for u in urls if u not in already_seen]
                skipped = len(urls) - len(new_urls)
                _state["found_urls"] = len(new_urls)
                _state["total_urls"] = len(new_urls)

                if skipped:
                    _log(f"Saltados {skipped} ya existentes. {len(new_urls)} nuevos para procesar.", "info")
                if not new_urls:
                    _log("Todos los resultados ya estan en BD. Prueba otra ciudad o categoria.", "warning")
                    return

                urls = new_urls
                for i, url in enumerate(urls, start=1):
                    if _state["stop_flag"]:
                        _log("⏹ Búsqueda detenida por el usuario.", "warning")
                        break

                    result = await extract_place(page, url, body.city, body.country, category_query)
                    _state["visited"] = i

                    if result is None:
                        _log(f"[{i}/{len(urls)}] ⚠️ No se pudo extraer datos", "warning")
                        continue

                    name = result.get("name") or "?"
                    real_web = await has_real_website(result.get("website_raw"))
                    passes, reason = passes_filters(result, real_web, settings)

                    if passes:
                        _state["leads_count"] += 1
                        async with aiosqlite.connect(DB_PATH) as db:
                            await db.execute(
                                """INSERT OR IGNORE INTO leads
                                   (search_query, city, country, name, category,
                                    rating, num_reviews, phone, website_raw,
                                    website_detected, link_googlemaps)
                                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                                (
                                    category_query, body.city, body.country,
                                    result["name"], result["category"],
                                    result["rating"], result["num_reviews"],
                                    result["phone"], result["website_raw"],
                                    int(result["website_detected"]),
                                    result["link_googlemaps"],
                                ),
                            )
                            await db.commit()
                        _log(
                            f"[{i}/{len(urls)}] ✅ LEAD: {name} "
                            f"({result.get('rating')}⭐ {result.get('num_reviews')} reseñas)",
                            "success",
                        )
                    else:
                        _log(f"[{i}/{len(urls)}] ✗ {name} — {reason}", "debug")

                    # Periodic cooldown
                    if i % random.randint(COOLDOWN_EVERY - 3, COOLDOWN_EVERY + 3) == 0:
                        pause = random.uniform(COOLDOWN_MIN, COOLDOWN_MAX)
                        _log(f"⏸ Pausa anti-detección {pause:.0f}s...", "info")
                        await asyncio.sleep(pause)

        _log(f"🎉 Completado! {_state['leads_count']} leads encontrados de {len(urls)} analizados.", "success")

    except Exception as e:
        _state["error"] = str(e)
        _log(f"❌ Error: {e}", "error")
        logger.exception("Scrape error")
    finally:
        _state["running"] = False
        _state["done"] = True


# ── Endpoints ─────────────────────────────────────────────────────────────────
@router.get("/categories")
async def get_categories():
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT key, label, source_type FROM scraper_categories ORDER BY label")
        rows = await cur.fetchall()
    return {"categories": [{"key": r[0], "label": r[1].title(), "source_type": r[2] or 'maps'} for r in rows]}


class CategoryBody(BaseModel):
    key: str
    label: str
    source_type: str = 'maps'


@router.post("/categories", status_code=201)
async def add_category(body: CategoryBody):
    key = body.key.strip().lower().replace(" ", "_")
    label = body.label.strip()
    source_type = body.source_type if body.source_type in ('maps', 'instagram') else 'maps'
    if not key or not label:
        raise HTTPException(400, "key y label requeridos")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO scraper_categories (key, label, source_type) VALUES (?, ?, ?)",
            (key, label, source_type)
        )
        await db.commit()
    return {"key": key, "label": label, "source_type": source_type}


@router.patch("/categories/{key}/source-type")
async def set_category_source_type(key: str, body: dict):
    source_type = body.get("source_type", "maps")
    if source_type not in ('maps', 'instagram'):
        raise HTTPException(400, "source_type debe ser 'maps' o 'instagram'")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE scraper_categories SET source_type = ? WHERE key = ?",
            (source_type, key)
        )
        await db.commit()
    return {"key": key, "source_type": source_type}


@router.delete("/categories/{key}", status_code=204)
async def delete_category(key: str):
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM scraper_categories WHERE key = ?", (key,))
        await db.commit()


@router.get("/settings")
async def get_settings():
    settings = await _load_settings()
    return settings


@router.put("/settings")
async def update_settings(body: ScraperSettingsBody):
    import json as _json
    # Build partial update — only fields provided
    updates = {}
    if body.website_filter is not None:
        if body.website_filter not in ("no_website", "has_website", "instagram_only", "any"):
            raise HTTPException(400, "website_filter inválido")
        updates["website_filter"] = body.website_filter
    if body.min_reviews is not None:
        updates["min_reviews"] = max(0, body.min_reviews)
    if body.max_reviews is not None:
        updates["max_reviews"] = max(0, body.max_reviews)
    if body.min_rating is not None:
        updates["min_rating"] = max(0.0, min(5.0, body.min_rating))
    if body.max_results is not None:
        updates["max_results"] = max(1, body.max_results)
    if body.active_categories is not None:
        updates["active_categories"] = _json.dumps(body.active_categories)

    if not updates:
        return await _load_settings()

    set_clause = ", ".join(f"{k} = ?" for k in updates)
    set_clause += ", updated_at = CURRENT_TIMESTAMP"
    values = list(updates.values())

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE scraper_settings SET {set_clause} WHERE id = 1",
            values,
        )
        await db.commit()

    return await _load_settings()


@router.post("/start")
async def start_scrape(body: ScrapeRequest):
    if _state["running"]:
        raise HTTPException(400, "Ya hay una búsqueda en progreso")
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT key FROM scraper_categories WHERE key = ?", (body.category_key,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(400, f"Categoría inválida: {body.category_key}")
    # Check active_categories restriction
    settings = await _load_settings()
    active_cats = settings.get("active_categories", [])
    if active_cats and body.category_key not in active_cats:
        raise HTTPException(400, f"Categoría '{body.category_key}' no está en las categorías activas configuradas")
    _reset()
    task = asyncio.create_task(_run_scrape(body))
    _state["task"] = task
    return {"status": "started"}


@router.post("/stop")
async def stop_scrape():
    _state["stop_flag"] = True
    return {"status": "stopping"}


@router.post("/reset")
async def reset_scraper():
    _state["running"] = False
    _state["stop_flag"] = True
    _state["done"] = True
    _state["error"] = None
    return {"status": "reset"}


class ExtractSingleRequest(BaseModel):
    maps_url: str


@router.post("/extract-single")
async def extract_single(body: ExtractSingleRequest):
    """Extract business data from a single Google Maps URL using Playwright."""
    if _state["running"]:
        raise HTTPException(400, "Hay un scraping en progreso. Espera que termine.")

    from scraper.browser import browser_session
    from scraper.maps_extractor import extract_place

    try:
        async with browser_session() as (ctx, page):
            result = await extract_place(page, body.maps_url)

        if result is None:
            raise HTTPException(422, "No se pudieron extraer datos. Verifica el link de Google Maps.")

        return {
            "name":            result.get("name"),
            "phone":           result.get("phone"),
            "rating":          result.get("rating"),
            "num_reviews":     result.get("num_reviews"),
            "category":        result.get("category"),
            "city":            result.get("city"),
            "country":         result.get("country"),
            "link_googlemaps": result.get("link_googlemaps"),
            "website_raw":     result.get("website_raw"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error al extraer datos: {str(e)}")


class ExtractFromUrlRequest(BaseModel):
    url: str


_MAPS_PATTERNS = ("maps.google", "goo.gl/maps", "maps.app.goo.gl", "google.com/maps")


async def _extract_from_landing(url: str) -> dict:
    """Extract business data from a landing page using httpx + regex."""
    import re
    import httpx

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
    }
    async with httpx.AsyncClient(timeout=15, follow_redirects=True, verify=False) as http:
        resp = await http.get(url, headers=headers)
    html = resp.text

    # Name: h1 first, then title
    name = None
    h1 = re.search(r'<h1[^>]*>\s*(?:<[^>]+>)*\s*([^<\n]{2,80})', html, re.IGNORECASE)
    if h1:
        name = re.sub(r'<[^>]+>', '', h1.group(1)).strip() or None
    if not name:
        t = re.search(r'<title[^>]*>([^<|–\-]{2,80})', html, re.IGNORECASE)
        if t:
            name = t.group(1).strip() or None

    # Phone: tel: links are most reliable
    phone = None
    tel = re.search(r'href=["\']tel:([+\d\s()\-]{7,20})["\']', html, re.IGNORECASE)
    if tel:
        phone = tel.group(1).strip()
    # Fallback: wa.me link
    if not phone:
        wa = re.search(r'wa\.me/([0-9]{7,15})', html)
        if wa:
            phone = wa.group(1)
    # Normalize: strip leading trunk-prefix zero (not for numbers with '+')
    if phone and not phone.strip().startswith('+'):
        digits = re.sub(r'\D', '', phone).lstrip('0')
        phone = digits if digits else phone

    # Instagram
    instagram = None
    ig = re.search(r'instagram\.com/([a-zA-Z0-9._]{2,40})[/"\'\s?]', html)
    if ig:
        uname = ig.group(1)
        if uname not in ('p', 'explore', 'accounts', 'tv', 'reel', 'stories', 'share'):
            instagram = f"@{uname}"

    # City / Country via JSON-LD structured data (most reliable)
    import json as _json
    city = None
    country = None
    for ld_match in re.finditer(
        r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',
        html, re.DOTALL | re.IGNORECASE
    ):
        try:
            ld = _json.loads(ld_match.group(1))
            # Handle both single object and array
            items = ld if isinstance(ld, list) else [ld]
            for item in items:
                addr = item.get('address', {})
                if isinstance(addr, dict):
                    city    = city    or addr.get('addressLocality')
                    country = country or addr.get('addressCountry')
        except Exception:
            pass

    # Fallback: geo meta tags
    if not city:
        gp = re.search(r'<meta[^>]+name=["\']geo\.placename["\'][^>]+content=["\']([^"\']+)', html, re.IGNORECASE)
        city = gp.group(1) if gp else None
    if not country:
        gr = re.search(r'<meta[^>]+name=["\']geo\.region["\'][^>]+content=["\']([^"\']+)', html, re.IGNORECASE)
        country = gr.group(1) if gr else None

    return {
        "name": name,
        "phone": phone,
        "instagram": instagram,
        "city": city,
        "country": country,
        "landing_url": url,
        "website_raw": url,
    }


@router.post("/extract-from-url")
async def extract_from_url(body: ExtractFromUrlRequest):
    """Extract business data from a Google Maps URL or a landing page URL."""
    url = body.url.strip()
    if not url:
        raise HTTPException(400, "URL vacía")

    if any(p in url for p in _MAPS_PATTERNS):
        # Google Maps URL — use Playwright
        if _state["running"]:
            raise HTTPException(400, "Hay un scraping en progreso. Espera que termine.")
        from scraper.browser import browser_session
        from scraper.maps_extractor import extract_place
        try:
            async with browser_session() as (ctx, page):
                result = await extract_place(page, url)
            if result is None:
                raise HTTPException(422, "No se pudieron extraer datos del link de Maps.")
            return {
                "name":            result.get("name"),
                "phone":           result.get("phone"),
                "rating":          result.get("rating"),
                "category":        result.get("category"),
                "city":            result.get("city"),
                "country":         result.get("country"),
                "link_googlemaps": result.get("link_googlemaps"),
                "website_raw":     result.get("website_raw"),
                "source": "maps",
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(500, f"Error al extraer de Maps: {e}")
    else:
        # Landing page URL — use httpx + regex
        try:
            data = await _extract_from_landing(url)
            return {**data, "source": "landing"}
        except Exception as e:
            raise HTTPException(500, f"Error al leer la landing page: {e}")


@router.get("/status")
async def scrape_status():
    async def event_gen():
        sent = 0
        while _state["running"] or not _state["done"]:
            logs_list = list(_state["logs"])
            new_logs = logs_list[sent:]
            sent = len(logs_list)
            payload = {
                "running":     _state["running"],
                "found_urls":  _state["found_urls"],
                "visited":     _state["visited"],
                "leads_count": _state["leads_count"],
                "total_urls":  _state["total_urls"],
                "done":        _state["done"],
                "error":       _state["error"],
                "new_logs":    new_logs,
            }
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.5)

        # Final flush
        yield f"data: {json.dumps({'done': True, 'running': False, 'new_logs': []}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
