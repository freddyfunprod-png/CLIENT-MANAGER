"""
Playwright browser context with anti-detection configuration.
"""
import logging
import random
from typing import AsyncGenerator
from contextlib import asynccontextmanager

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from config import VIEWPORTS

logger = logging.getLogger(__name__)

_USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

_STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] });
window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };
"""


async def create_context(
    playwright,
    headless: bool = True,
    timezone_id: str = "America/Bogota",
) -> tuple[Browser, BrowserContext]:
    browser: Browser = await playwright.chromium.launch(
        headless=headless,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--lang=es-ES,es;q=0.9",
            "--disable-extensions",
        ],
    )
    viewport = random.choice(VIEWPORTS)
    user_agent = random.choice(_USER_AGENTS)
    context: BrowserContext = await browser.new_context(
        viewport=viewport,
        user_agent=user_agent,
        locale="es-ES",
        timezone_id=timezone_id,
        extra_http_headers={"Accept-Language": "es-ES,es;q=0.9,en;q=0.8"},
    )
    await context.add_init_script(_STEALTH_SCRIPT)
    return browser, context


async def new_page(context: BrowserContext) -> Page:
    page = await context.new_page()
    await page.route(
        "**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,otf}",
        lambda route: route.abort(),
    )
    return page


@asynccontextmanager
async def browser_session(
    headless: bool = True,
    timezone_id: str = "America/Bogota",
) -> AsyncGenerator[tuple[BrowserContext, Page], None]:
    async with async_playwright() as playwright:
        browser, context = await create_context(playwright, headless, timezone_id)
        page = await new_page(context)
        try:
            yield context, page
        finally:
            await context.close()
            await browser.close()
