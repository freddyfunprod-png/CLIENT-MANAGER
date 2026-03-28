"""
Verify whether a business URL is a real website (vs. social media / dead domain).
"""
import logging
from urllib.parse import urlparse

import httpx

from config import SOCIAL_DOMAINS, WEBSITE_CHECK_TIMEOUT

logger = logging.getLogger(__name__)

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
}


def is_social_media_only(url: str | None) -> bool:
    if not url:
        return True
    try:
        parsed = urlparse(url.lower().strip())
        domain = parsed.netloc.lstrip("www.")
        return domain in SOCIAL_DOMAINS
    except Exception:
        return False


async def website_is_alive(url: str) -> bool:
    if not url:
        return False
    try:
        async with httpx.AsyncClient(
            follow_redirects=True,
            timeout=WEBSITE_CHECK_TIMEOUT,
            headers=_HTTP_HEADERS,
        ) as client:
            response = await client.head(url)
            return response.status_code < 500
    except Exception:
        return False


async def has_real_website(website_url: str | None) -> bool:
    if not website_url:
        return False
    if is_social_media_only(website_url):
        return False
    alive = await website_is_alive(website_url)
    return alive
