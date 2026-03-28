"""
Instagram profile discovery via Google search + direct profile extraction.
"""
import asyncio
import logging
import re
import urllib.parse

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

logger = logging.getLogger(__name__)

IG_SKIP_PATHS = {'p', 'explore', 'accounts', 'tv', 'reel', 'stories', 'share', 'hashtag', 'help', 'about', 'legal', 'privacy'}


async def _dismiss_cookies_google(page: Page) -> None:
    for text in ["Aceptar todo", "Accept all", "Aceitar tudo", "Tout accepter", "Reject all", "Rechazar todo"]:
        try:
            btn = page.locator(f'button:has-text("{text}")')
            if await btn.count() > 0:
                await btn.first.click(timeout=3000)
                await asyncio.sleep(0.5)
                return
        except Exception:
            pass


async def _dismiss_ig_login(page: Page) -> None:
    """Close Instagram login modal if it appears."""
    for sel in [
        'div[role="dialog"] svg[aria-label="Close"]',
        'button:has-text("Not Now")',
        'button:has-text("Ahora no")',
        'button:has-text("Agora não")',
    ]:
        try:
            el = page.locator(sel)
            if await el.count() > 0:
                await el.first.click(timeout=2000)
                return
        except Exception:
            pass


async def collect_instagram_urls(
    page: Page,
    category_query: str,
    city: str,
    country: str,
    limit: int = 30,
) -> list[str]:
    """Search Google for Instagram profiles matching query+city."""
    search = f'site:instagram.com "{category_query}" "{city}"'
    encoded = urllib.parse.quote(search)
    url = f"https://www.google.com/search?q={encoded}&num=20"

    logger.info(f"Google search: {search}")
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
    except PlaywrightTimeoutError:
        logger.warning("Timeout on Google search, continuing")

    await asyncio.sleep(2)
    await _dismiss_cookies_google(page)

    collected: set[str] = set()
    pages_tried = 0

    while len(collected) < limit and pages_tried < 5:
        pages_tried += 1
        # Extract all instagram.com links from results
        links = await page.locator('a[href*="instagram.com/"]').all()
        for link in links:
            href = await link.get_attribute("href")
            if not href:
                continue
            # Clean Google redirect URLs
            if "google.com/url" in href:
                m = re.search(r'[?&]url=([^&]+)', href)
                if m:
                    href = urllib.parse.unquote(m.group(1))
            if "instagram.com/" not in href:
                continue
            # Extract username
            m = re.search(r'instagram\.com/([a-zA-Z0-9_.]+)/?', href)
            if not m:
                continue
            username = m.group(1)
            if username.lower() in IG_SKIP_PATHS:
                continue
            profile_url = f"https://www.instagram.com/{username}/"
            collected.add(profile_url)

        if len(collected) >= limit:
            break

        # Try next Google page
        next_btn = page.locator('a#pnnext, a[aria-label="Next"]')
        if await next_btn.count() > 0:
            try:
                await next_btn.first.click(timeout=5000)
                await asyncio.sleep(2)
            except Exception:
                break
        else:
            break

    result = list(collected)[:limit]
    logger.info(f"Found {len(result)} Instagram profiles")
    return result


def _parse_followers(text: str) -> int | None:
    """Parse '12.5K Followers' or '1,200 seguidores' into int."""
    if not text:
        return None
    text = text.replace(',', '').replace('.', '')
    m = re.search(r'(\d+)\s*[Kk]', text)
    if m:
        return int(m.group(1)) * 1000
    m = re.search(r'(\d+)\s*[Mm]', text)
    if m:
        return int(m.group(1)) * 1000000
    m = re.search(r'(\d[\d\s]*\d|\d)', text)
    if m:
        return int(m.group(0).replace(' ', ''))
    return None


def _extract_phone_from_text(text: str) -> str | None:
    """Extract phone number from bio text."""
    if not text:
        return None
    # wa.me links
    m = re.search(r'wa\.me/(\d{7,15})', text)
    if m:
        return m.group(1)
    # tel: links or plain numbers
    m = re.search(r'(?:tel:|phone:|📞|☎|📱)?\s*([+\d][\d\s\-\(\)]{8,})', text)
    if m:
        phone = re.sub(r'[^\d+]', '', m.group(1))
        if len(phone) >= 7:
            return phone.lstrip('0') or phone
    return None


def _extract_email_from_text(text: str) -> str | None:
    m = re.search(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}', text)
    return m.group(0) if m else None


async def extract_instagram_profile(
    page: Page,
    profile_url: str,
    city: str,
    country: str,
    category_query: str,
) -> dict | None:
    """Visit an Instagram profile and extract business data."""
    try:
        await page.goto(profile_url, wait_until="networkidle", timeout=30_000)
    except PlaywrightTimeoutError:
        logger.warning(f"Timeout loading {profile_url}")
        return None

    await asyncio.sleep(1.5)
    await _dismiss_ig_login(page)

    # Extract from meta tags — works even without login for public profiles
    async def meta(prop: str, attr: str = "content") -> str | None:
        for sel in [
            f'meta[property="{prop}"]',
            f'meta[name="{prop}"]',
        ]:
            try:
                el = page.locator(sel).first
                if await el.count() > 0:
                    val = await el.get_attribute(attr, timeout=2000)
                    if val:
                        return val.strip()
            except Exception:
                pass
        return None

    og_title = await meta("og:title")  # "Name (@handle) • Instagram photos..."
    og_desc = await meta("og:description")  # "X Followers, Y Following..."
    description = await meta("description")

    if not og_title:
        logger.debug(f"No og:title for {profile_url} — possibly blocked")
        return None

    # Parse name and username from og:title
    name = og_title.split("(")[0].strip() if "(" in og_title else og_title.split("•")[0].strip()
    m = re.search(r'\((@[a-zA-Z0-9_.]+)\)', og_title)
    username = m.group(1) if m else profile_url.rstrip('/').split('/')[-1]

    # Parse followers from og:description
    followers = None
    if og_desc:
        followers = _parse_followers(og_desc)

    # Extract phone and email from bio (description meta)
    bio_text = description or og_desc or ''
    phone = _extract_phone_from_text(bio_text)
    email = _extract_email_from_text(bio_text)

    if not phone and not email:
        # Try scanning page text for contact info
        try:
            body_text = await page.locator('body').text_content(timeout=3000) or ''
            phone = _extract_phone_from_text(body_text[:2000])
            if not email:
                email = _extract_email_from_text(body_text[:2000])
        except Exception:
            pass

    return {
        "name": name or username,
        "category": category_query,
        "city": city,
        "country": country,
        "phone": phone,
        "email": email,
        "instagram": username if username.startswith('@') else f"@{username}",
        "followers": followers,
        "website_raw": profile_url,
        "website_detected": False,
        "link_googlemaps": None,
        "rating": None,
        "num_reviews": None,
    }
