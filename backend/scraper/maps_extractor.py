"""
Extract business fields from a Google Maps place detail page.
"""
import asyncio
import logging
import re
import random

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from config import BETWEEN_LISTINGS, COOLDOWN_EVERY, COOLDOWN_MIN, COOLDOWN_MAX

logger = logging.getLogger(__name__)


async def _has_captcha(page: Page) -> bool:
    return await page.locator('iframe[src*="recaptcha"], iframe[src*="captcha"]').count() > 0


async def _get_text(page: Page, *selectors: str) -> str | None:
    for sel in selectors:
        try:
            el = page.locator(sel).first
            if await el.count() > 0:
                text = await el.text_content(timeout=3000)
                if text and text.strip():
                    return text.strip()
        except Exception:
            continue
    return None


async def _get_attr(page: Page, selector: str, attr: str) -> str | None:
    try:
        el = page.locator(selector).first
        if await el.count() > 0:
            return await el.get_attribute(attr, timeout=3000)
    except Exception:
        pass
    return None


def _parse_rating(text: str | None) -> float | None:
    if not text:
        return None
    cleaned = text.strip().replace(",", ".")
    match = re.search(r"\d+\.\d+|\d+", cleaned)
    if match:
        try:
            return float(match.group())
        except ValueError:
            pass
    return None


def _parse_reviews(text: str | None) -> int | None:
    if not text:
        return None
    cleaned = re.sub(r"[.,](?=\d{3})", "", text)
    numbers = re.findall(r"\d+", cleaned)
    if numbers:
        try:
            return int(numbers[0])
        except ValueError:
            pass
    return None


async def extract_place(
    page: Page,
    maps_url: str,
    city: str = "",
    country: str = "",
    search_query: str = "",
) -> dict | None:
    try:
        await page.goto(maps_url, wait_until="networkidle", timeout=35_000)
    except PlaywrightTimeoutError:
        logger.warning(f"Timeout loading {maps_url}")
        return None

    await asyncio.sleep(BETWEEN_LISTINGS)

    if await _has_captcha(page):
        logger.error("CAPTCHA detected — stopping extraction")
        return None

    data: dict = {
        "link_googlemaps": maps_url,
        "search_query":    search_query,
        "city":            city,
        "country":         country,
        "name":            None,
        "category":        None,
        "rating":          None,
        "num_reviews":     None,
        "phone":           None,
        "website_raw":     None,
        "website_detected": False,
    }

    data["name"] = await _get_text(
        page, "h1.DUwDvf", 'h1[class*="fontHeadlineLarge"]', 'h1[class*="fontHeadline"]', "h1",
    )
    rating_text = await _get_text(
        page, 'span[class*="fontDisplayLarge"]', 'div[class*="fontDisplayLarge"]',
        "span.ceNzKf", 'span[aria-label*="stars"]', 'span[aria-label*="estrellas"]',
    )
    data["rating"] = _parse_rating(rating_text)

    review_text = await _get_text(
        page, 'button[jsaction*="pane.rating"]', 'span[aria-label*="opiniones"]',
        'span[aria-label*="reviews"]', 'span[aria-label*="reseñas"]',
    )
    if not review_text:
        label = await _get_attr(page, 'button[jsaction*="pane.rating"]', "aria-label")
        review_text = label
    data["num_reviews"] = _parse_reviews(review_text)

    phone_item = await _get_attr(page, '[data-item-id^="phone:tel:"]', "data-item-id")
    if phone_item:
        data["phone"] = phone_item.replace("phone:tel:", "").strip()
    else:
        phone_label = await _get_attr(
            page,
            'button[data-tooltip*="número"], button[aria-label*="Teléfono"], button[aria-label*="Phone"]',
            "aria-label",
        )
        if phone_label:
            match = re.search(r"[\+\d][\d\s\-\(\)]{6,}", phone_label)
            if match:
                data["phone"] = match.group().strip()

    # Normalize phone: keep + prefix; strip leading trunk zero for local numbers
    raw_phone = data.get("phone")
    if raw_phone:
        stripped = raw_phone.strip()
        if stripped.startswith('+'):
            data["phone"] = stripped  # international — leave as-is
        else:
            digits_only = re.sub(r'\D', '', stripped)
            data["phone"] = digits_only.lstrip('0') or digits_only

    website_href = await _get_attr(page, 'a[data-item-id="authority"]', "href")
    if website_href:
        data["website_raw"] = website_href.strip()
        data["website_detected"] = True

    data["category"] = await _get_text(
        page,
        'button[jsaction*="pane.rating.category"]',
        'button[jsaction*="pane.category"]',
        'span[jsaction*="pane.rating.category"]',
    )
    if not data["category"]:
        cat = await _get_text(page, 'div[class*="fontBodyMedium"] > span > span', 'div.skqShb button')
        data["category"] = cat

    return data
