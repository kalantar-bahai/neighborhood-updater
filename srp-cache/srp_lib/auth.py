# srp-cache/srp_lib/auth.py
import asyncio
import os

import pyotp
from dotenv import load_dotenv

load_dotenv()


def load_credentials():
    return {
        'url':         os.environ.get('SRP_URL', 'https://usa.onlinesrp.org/'),
        'username':    os.environ.get('SRP_USERNAME', '').strip(),
        'password':    os.environ.get('SRP_PASSWORD', '').strip(),
        'totp_secret': os.environ.get('TOTP_SECRET', '').strip(),
    }


async def authenticate(page, username, password, totp_secret, timeout=60_000):
    print('Authenticating...')
    await page.locator('#txtUserName').wait_for(state='visible')
    await page.locator('#txtUserName').fill(username)
    await page.locator('#txtPassword').fill(password)
    await page.keyboard.press('Enter')
    await page.wait_for_url(lambda url: 'login' not in url.lower(), timeout=timeout)
    code = pyotp.TOTP(totp_secret).now()
    await page.locator('#txtVerificationCode').wait_for(state='visible')
    await page.locator('#txtVerificationCode').fill(code)
    await page.get_by_role('button', name='Continue').click()
    await page.wait_for_url(lambda url: 'verification' not in url.lower(), timeout=timeout)
    await page.wait_for_timeout(2_000)
    print('  Authenticated.')


async def totp_watchdog(page, stop_event, totp_secret):
    while not stop_event.is_set():
        try:
            await asyncio.wait_for(
                page.locator('#txtVerificationCode').wait_for(state='visible'),
                timeout=2.0,
            )
            print('  Mid-session TOTP prompt — filling automatically.')
            code = pyotp.TOTP(totp_secret).now()
            await page.locator('#txtVerificationCode').fill(code)
            await page.get_by_role('button', name='Continue').click()
            await page.wait_for_timeout(1_000)
        except Exception:
            pass
