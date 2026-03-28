"""
Filtering logic for scraped businesses.
"""
import logging
from config import FRANCHISE_KEYWORDS, MIN_RATING, MIN_REVIEWS

logger = logging.getLogger(__name__)


def is_franchise(name: str | None) -> bool:
    if not name:
        return False
    name_lower = name.lower()
    return any(kw in name_lower for kw in FRANCHISE_KEYWORDS)


def passes_filters(business: dict, real_website: bool, settings: dict | None = None) -> tuple[bool, str]:
    name    = business.get("name") or ""
    rating  = business.get("rating")
    reviews = business.get("num_reviews")
    phone   = business.get("phone")

    website_filter = settings.get("website_filter", "no_website") if settings else "no_website"
    min_reviews    = settings.get("min_reviews", MIN_REVIEWS) if settings else MIN_REVIEWS
    max_reviews    = settings.get("max_reviews", 0) if settings else 0
    min_rating     = settings.get("min_rating", MIN_RATING) if settings else MIN_RATING

    # Website filter
    if website_filter == "no_website" and real_website:
        return False, "tiene_sitio_web_real"
    if website_filter == "has_website" and not real_website:
        return False, "sin_sitio_web"
    if website_filter == "instagram_only":
        if real_website or not business.get("instagram"):
            return False, "no_cumple_instagram_only"
    # "any" passes all website combinations

    if not phone:
        return False, "sin_telefono"
    if rating is None:
        return False, "sin_rating"
    if rating < min_rating:
        return False, f"rating_bajo:{rating}"
    if reviews is None:
        return False, "sin_reseñas"
    if reviews < min_reviews:
        return False, f"pocas_reseñas:{reviews}"
    if max_reviews > 0 and reviews > max_reviews:
        return False, f"demasiadas_reseñas:{reviews}"
    if is_franchise(name):
        return False, f"franquicia:{name[:30]}"

    return True, "ok"
