"""Run this to inspect what's on the SRP page after session restore."""
import asyncio
from playwright.async_api import async_playwright

SESSION = 'session.json'
SRP_URL = 'https://usa.onlinesrp.org/'

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context(storage_state=SESSION)
        page = await context.new_page()

        await page.goto(SRP_URL)
        await page.wait_for_load_state('networkidle')

        print('\n=== URL after load ===')
        print(page.url)

        print('\n=== All buttons ===')
        for el in await page.get_by_role('button').all():
            print(' BUTTON:', await el.inner_text())

        print('\n=== All links ===')
        for el in await page.get_by_role('link').all():
            print(' LINK:', await el.inner_text())

        print('\n=== Elements containing "Atlantic" ===')
        for el in await page.locator('*:has-text("Atlantic")').all():
            tag = await el.evaluate('el => el.tagName')
            cls = await el.evaluate('el => el.className')
            text = (await el.inner_text())[:80].replace('\n', ' ')
            print(f'  <{tag} class="{cls}"> {text}')

        input('\nPress Enter to close browser.')
        await browser.close()

asyncio.run(main())
