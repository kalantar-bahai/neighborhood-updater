# srp-cache/srp_lib/browser.py
from pathlib import Path


async def launch_browser(pw):
    browser = await pw.chromium.launch(headless=False)
    context = await browser.new_context(accept_downloads=True)
    return browser, context


async def click(page, locator, delay_ms=500):
    await locator.click()
    await page.wait_for_timeout(delay_ms)


async def download_excel(page, exports_dir, timeout=60_000):
    await page.get_by_role('button', name='Export Data |').click()
    await page.wait_for_timeout(300)
    async with page.expect_download(timeout=timeout) as dl:
        await page.get_by_role('link', name='Excel').click()
    download = await dl.value
    path = Path(exports_dir) / download.suggested_filename
    await download.save_as(path)
    print(f'  Downloaded: {path.name}')
    return path.read_bytes()
