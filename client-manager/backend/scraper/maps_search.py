"""
Search Google Maps and collect place URLs by scrolling the results feed.
"""
import asyncio
import logging
import random
import urllib.parse

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from config import PAGE_LOAD_WAIT, SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX

logger = logging.getLogger(__name__)

MAPS_SEARCH_BASE = "https://www.google.com/maps/search/"


async def _dismiss_cookies(page: Page) -> None:
    for text in ["Aceptar todo", "Accept all", "Aceitar tudo", "Tout accepter"]:
        try:
            btn = page.locator(f'button:has-text("{text}")')
            if await btn.count() > 0:
                await btn.first.click(timeout=3000)
                return
        except Exception:
            pass


async def _has_captcha(page: Page) -> bool:
    return await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"]').count() > 0


async def _end_of_results(page: Page) -> bool:
    for text in [
        "El final de los resultados",
        "You've reached the end of the list",
        "Chegou ao fim da lista",
    ]:
        if await page.locator(f'span:has-text("{text}")').count() > 0:
            return True
    return False


async def collect_place_urls(
    page: Page,
    category_query: str,
    city: str,
    country: str,
    limit: int | None = None,
) -> list[str]:
    query = f"{category_query} en {city} {country}"
    encoded = urllib.parse.quote(query)
    url = f"{MAPS_SEARCH_BASE}{encoded}/"

    logger.info(f"Searching: {query}")
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
    except PlaywrightTimeoutError:
        logger.warning("Timeout loading search page, continuing with partial load")

    await asyncio.sleep(PAGE_LOAD_WAIT)
    await _dismiss_cookies(page)

    if await _has_captcha(page):
        logger.error("CAPTCHA detected — aborting search")
        return []

    feed = page.locator('div[role="feed"]')
    collected: set[str] = set()
    no_new_streak = 0

    while no_new_streak < 4:
        links = await page.locator('a[href*="/maps/place/"]').all()
        before = len(collected)
        for link in links:
            href = await link.get_attribute("href")
            if href and "/maps/place/" in href:
                clean = href.split("?")[0] if "?" in href else href
                collected.add(clean)
        after = len(collected)
        if after == before:
            no_new_streak += 1
        else:
            no_new_streak = 0
        if limit and after >= limit:
            break
        if await _end_of_results(page):
            break
        try:
            await feed.evaluate("el => el.scrollBy(0, 1200)")
        except Exception:
            await page.keyboard.press("End")
        await asyncio.sleep(random.uniform(SCROLL_PAUSE_MIN, SCROLL_PAUSE_MAX))

    result = list(collected)
    if limit:
        result = result[:limit]
    logger.info(f"Collected {len(result)} place URLs")
    return result
