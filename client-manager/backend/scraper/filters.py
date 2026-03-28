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


def passes_filters(business: dict, real_website: bool) -> tuple[bool, str]:
    name    = business.get("name") or ""
    rating  = business.get("rating")
    reviews = business.get("num_reviews")
    phone   = business.get("phone")

    if real_website:
        return False, "tiene_sitio_web_real"
    if not phone:
        return False, "sin_telefono"
    if rating is None:
        return False, "sin_rating"
    if rating < MIN_RATING:
        return False, f"rating_bajo:{rating}"
    if reviews is None:
        return False, "sin_reseñas"
    if reviews < MIN_REVIEWS:
        return False, f"pocas_reseñas:{reviews}"
    if is_franchise(name):
        return False, f"franquicia:{name[:30]}"

    return True, "ok"
