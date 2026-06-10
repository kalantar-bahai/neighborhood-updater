"""
Run once to authenticate with SRP.  Opens a real browser window — log in
and complete 2FA yourself, then press Enter here.  Saves the session to
session.json so scrape.py can run headlessly until the session expires.

Usage:
    python auth.py

To automate 2FA in the future: set TOTP_SECRET in .env — scrape.py will
generate codes via pyotp and skip this manual step entirely.
"""

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

SESSION_FILE = Path(__file__).parent / 'session.json'
SRP_URL      = os.environ.get('SRP_URL', 'https://usa.onlinesrp.org/')


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        await page.goto(SRP_URL)
        print('Log in and complete 2FA in the browser, then press Enter here.')
        input()

        await context.storage_state(path=str(SESSION_FILE))
        print(f'Session saved to {SESSION_FILE}')

        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
