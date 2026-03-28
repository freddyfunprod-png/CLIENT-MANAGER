"""
Configuration for Unified CRM + Maps Scraper.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(Path(__file__).parent.parent / ".env")

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

# ── Search categories ────────────────────────────────────────────────────────
CATEGORY_SEARCH_TERMS: dict[str, str] = {
    "clinicas_dentales":  "clínica dental",
    "estetica_belleza":   "salón de belleza",
    "clinicas_estetica":  "clínica de estética",
    "cirugia_estetica":   "cirugía estética",
    "abogados":           "abogado",
    "arquitectos":        "arquitecto",
    "constructores":      "constructora",
    "inmobiliarias":      "inmobiliaria",
    "talleres_mecanicos": "taller mecánico",
    "restaurantes":       "restaurante",
    "hoteles_cabanas":    "hotel",
    "turismo":            "agencia de turismo",
    "medicos":            "médico clínica",
    "contadores":         "contador",
    "gimnasios":          "gimnasio",
    "fotografia":         "fotógrafo",
    "eventos":            "organizador de eventos",
    "veterinarias":       "veterinaria",
}

# ── Filtering ────────────────────────────────────────────────────────────────
MIN_REVIEWS: int   = 20
MIN_RATING:  float = 4.0

SOCIAL_DOMAINS: frozenset[str] = frozenset({
    "instagram.com", "www.instagram.com",
    "facebook.com", "www.facebook.com", "m.facebook.com", "fb.com",
    "tiktok.com", "www.tiktok.com",
    "twitter.com", "www.twitter.com", "x.com", "www.x.com",
    "wa.me", "api.whatsapp.com", "whatsapp.com",
    "linktr.ee", "www.linktr.ee", "linkinbio.com",
    "youtube.com", "www.youtube.com",
    "pinterest.com", "www.pinterest.com",
})

FRANCHISE_KEYWORDS: list[str] = [
    "mcdonald", "mc donald", "burger king", "subway", "starbucks",
    "kfc", "domino", "pizza hut", "papa john",
    "intercontinental", "marriott", "hilton", "ibis", "wyndham",
    "holiday inn", "radisson", "sheraton", "hyatt",
    "century 21", "re/max", "remax",
    "chevrolet", "renault", "toyota", "ford ", "honda ", "nissan",
    "éxito", "carulla", "jumbo ", "makro ", "metro ",
    "oxxo ", "seven eleven", "7-eleven",
]

# ── Playwright timing (seconds) ───────────────────────────────────────────────
SCROLL_PAUSE_MIN:   float = 1.8
SCROLL_PAUSE_MAX:   float = 3.5
PAGE_LOAD_WAIT:     float = 3.0
BETWEEN_LISTINGS:   float = 2.5
COOLDOWN_EVERY:     int   = 18
COOLDOWN_MIN:       float = 20.0
COOLDOWN_MAX:       float = 45.0

VIEWPORTS: list[dict] = [
    {"width": 1366, "height": 768},
    {"width": 1440, "height": 900},
    {"width": 1920, "height": 1080},
]

WEBSITE_CHECK_TIMEOUT: float = 8.0
