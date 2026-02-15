import base64
import asyncio
from datetime import datetime, timezone

_browser = None
_context = None
_playwright = None


async def _get_browser():
    global _browser, _context, _playwright
    if _browser is None or not _browser.is_connected():
        from playwright.async_api import async_playwright
        _playwright = await async_playwright().start()
        _browser = await _playwright.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--single-process",
                "--disable-setuid-sandbox",
            ],
        )
        _context = await _browser.new_context(
            viewport={"width": 1280, "height": 720},
            device_scale_factor=1,
        )
    return _browser


async def capture_screenshot(url: str, wait_seconds: int = 2) -> str | None:
    try:
        await _get_browser()
        page = await _context.new_page()
        try:
            await page.goto(url, wait_until="networkidle", timeout=15000)
            if wait_seconds > 0:
                await asyncio.sleep(wait_seconds)
            screenshot_bytes = await page.screenshot(
                type="jpeg",
                quality=80,
                full_page=False,
            )
            return base64.b64encode(screenshot_bytes).decode("utf-8")
        finally:
            await page.close()
    except Exception as e:
        print(f"[Screenshot] Failed to capture {url}: {e}")
        return None


async def capture_before_after(url: str, step_count: int, phase: str = "after") -> dict | None:
    screenshot_b64 = await capture_screenshot(url)
    if not screenshot_b64:
        return None
    return {
        "step_number": 0 if phase == "before" else step_count,
        "label": "Initial page state" if phase == "before" else "Final page state",
        "url": url,
        "image_base64": screenshot_b64,
        "captured_at": datetime.now(timezone.utc).isoformat(),
    }


async def cleanup_browser():
    global _browser, _context, _playwright
    if _context:
        await _context.close()
        _context = None
    if _browser:
        await _browser.close()
        _browser = None
    if _playwright:
        await _playwright.stop()
        _playwright = None
