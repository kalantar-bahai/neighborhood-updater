"""
Run once to authenticate with SRP.  Saves the session to session.json so
scrape.py can run headlessly until the session expires.

Modes:
  Automated  — set SRP_USERNAME, SRP_PASSWORD, and TOTP_SECRET in .env;
               runs headlessly with no manual steps.
  Manual     — omit any of those vars; the browser opens for you to log in
               and complete 2FA yourself, then press Enter here.

Usage:
    python auth.py
"""

import asyncio
import os
from pathlib import Path

import pyotp
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

SESSION_FILE = Path(__file__).parent / 'session.json'
SRP_URL      = os.environ.get('SRP_URL', 'https://usa.onlinesrp.org/')
TOTP_SECRET  = os.environ.get('TOTP_SECRET', '').strip()
SRP_USERNAME = os.environ.get('SRP_USERNAME', '').strip()
SRP_PASSWORD = os.environ.get('SRP_PASSWORD', '').strip()
TIMEOUT      = 60_000  # ms


async def fill_credentials(page):
    """Fill username and password on the login form."""
    username_selectors = [
        '#txtUserName',
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[autocomplete="username"]',
    ]
    password_selectors = [
        '#txtPassword',
        'input[type="password"]',
        'input[name="password"]',
        'input[autocomplete="current-password"]',
    ]

    username_field = None
    for sel in username_selectors:
        loc = page.locator(sel)
        try:
            await loc.wait_for(state='visible', timeout=3_000)
            username_field = loc
            break
        except Exception:
            continue
    if username_field is None:
        raise RuntimeError(
            'Could not find the username/email field. Inspect the login page '
            'and add the right selector to fill_credentials().'
        )

    password_field = None
    for sel in password_selectors:
        loc = page.locator(sel)
        try:
            await loc.wait_for(state='visible', timeout=3_000)
            password_field = loc
            break
        except Exception:
            continue
    if password_field is None:
        raise RuntimeError(
            'Could not find the password field. Inspect the login page '
            'and add the right selector to fill_credentials().'
        )

    await username_field.fill(SRP_USERNAME)
    await password_field.fill(SRP_PASSWORD)
    await page.keyboard.press('Enter')
    await page.wait_for_load_state('networkidle')
    print('  Credentials submitted.')


async def fill_account_verification(page):
    """Fill the second TOTP prompt on the Account Verification page."""
    totp = pyotp.TOTP(TOTP_SECRET)
    code = totp.now()
    print(f'  Account verification code: {code}')
    field = page.locator('#txtVerificationCode')
    await field.wait_for(state='visible', timeout=TIMEOUT)
    await field.fill(code)
    await page.wait_for_timeout(500)
    await page.get_by_role('button', name='Continue').click()
    print('  Account verification submitted.')


async def main():
    headless = False  # site's Angular UI does not render headless

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=headless)
        context = await browser.new_context()
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT)

        await page.goto(SRP_URL)
        await page.wait_for_load_state('domcontentloaded')
        await page.wait_for_timeout(2_000)

        if SRP_USERNAME and SRP_PASSWORD and TOTP_SECRET:
            await fill_credentials(page)

            # After credentials, the site shows the Account Verification page.
            await page.wait_for_url(
                lambda url: 'login' not in url.lower(),
                timeout=TIMEOUT,
            )
            await fill_account_verification(page)

            # Wait until the dashboard is fully rendered — this element only
            # appears once authentication is complete and the app is ready.
            await page.locator('#dropdownLocationSelector').wait_for(
                state='visible', timeout=TIMEOUT,
            )
            print(f'  Dashboard loaded. (url: {page.url})')
            print('Authenticated.')
        else:
            print('Log in and complete 2FA in the browser, then press Enter here.')
            input()

        await context.storage_state(path=str(SESSION_FILE))
        print(f'Session saved to {SESSION_FILE}')

        await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
