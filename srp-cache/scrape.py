"""
SRP cache scraper — loads a saved session, downloads two Excel reports from
onlinesrp.org, parses neighbourhood-level data, and writes it to two tabs
in the SRP cache Google Sheet.

    Devotionals tab  ← Locations → Clusters → Focus Neighbourhoods
    Education tab    ← Reports → General Reports → Institute Reports →
                        All Educational Core → By Region → By Focus Neighbourhood

Usage:
    python scrape.py

If the session has expired, run auth.py first.
"""

import asyncio
import io
import os
from pathlib import Path

import gspread
import openpyxl
from dotenv import load_dotenv
from google.oauth2.service_account import Credentials
from playwright.async_api import async_playwright

load_dotenv()

SRP_URL  = os.environ.get('SRP_URL', 'https://usa.onlinesrp.org/')
REGION   = 'Atlantic'
TIMEOUT  = 60_000  # ms

SHEET_ID         = '1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo'
TAB_DEVOTIONALS  = 'Devotionals'
TAB_EDUCATION    = 'Education'
DATA_START_ROW   = 2  # row 1 will be a header written by this script

SERVICE_ACCOUNT  = Path.home() / '.google-service-account.json'
SESSION_FILE     = Path(__file__).parent / 'session.json'
EXPORTS_DIR      = Path(__file__).parent / 'exports'


# ── Navigation ────────────────────────────────────────────────────────────────

async def set_scope(page):
    btn = page.locator('#dropdownLocationSelector')
    await btn.wait_for(state='visible')
    await btn.click()
    await page.wait_for_timeout(DELAY)
    await page.get_by_text(REGION, exact=True).first.click()
    await page.wait_for_timeout(DELAY)


async def download_excel(page):
    """Click Export Data → Excel, return file bytes."""
    await page.get_by_role('button', name='Export Data |').click()
    await page.wait_for_timeout(300)
    async with page.expect_download(timeout=TIMEOUT) as dl:
        await page.get_by_role('link', name='Excel').click()
    download = await dl.value
    path = EXPORTS_DIR / download.suggested_filename
    await download.save_as(path)
    print(f'  Downloaded: {path.name}')
    return path.read_bytes()


DELAY = 500  # ms between clicks to avoid rate limiting


async def click(page, locator):
    await locator.click()
    await page.wait_for_timeout(DELAY)


async def scrape_devotionals(page):
    print('Scraping devotionals report...')
    await click(page, page.get_by_role('link', name='Locations'))
    await click(page, page.get_by_role('button', name='Clusters'))
    await click(page, page.get_by_role('link', name='Focus Neighbourhoods'))
    return await download_excel(page)


async def scrape_education(page):
    print('Scraping education report...')
    await click(page, page.get_by_role('link', name='Reports'))
    await click(page, page.get_by_role('button', name='General Reports'))
    await click(page, page.get_by_role('link', name='Institute Reports'))
    await click(page, page.get_by_role('button', name='All Educational Core'))
    await click(page, page.get_by_role('button', name='By Region'))
    await click(page, page.get_by_role('link', name='By Focus Neighbourhood'))
    return await download_excel(page)


# ── Excel parsing ─────────────────────────────────────────────────────────────

def xlsx_to_rows(xlsx_bytes):
    """Return (headers, data_rows) from the first sheet of an xlsx file."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return [], []
    return list(rows[0]), [list(r) for r in rows[1:]]


def parse_devotionals(xlsx_bytes):
    # Headers: Name, Latin Name, Locality, Electoral Unit, Cluster,
    #          Group of Clusters, Subregion, Region, Group of Regions,
    #          National Community, Devotional Meetings: No./Att./FoF., Comments
    headers, rows = xlsx_to_rows(xlsx_bytes)
    col = {h: i for i, h in enumerate(headers)}
    result = []
    for r in rows:
        name = r[col['Name']]
        if not name:
            continue
        result.append({
            'name':             name,
            'latin_name':       r[col['Latin Name']]       or '',
            'locality':         r[col['Locality']]         or '',
            'electoral_unit':   r[col['Electoral Unit']]   or '',
            'cluster':          r[col['Cluster']]          or '',
            'group_of_clusters':r[col['Group of Clusters']]or '',
            'subregion':        r[col['Subregion']]        or '',
            'region':           r[col['Region']]           or '',
            'group_of_regions': r[col['Group of Regions']] or '',
            'national_community':r[col['National Community']] or '',
            'dev_act':          r[col['Devotional Meetings: No.']]  or '',
            'dev_part':         r[col['Devotional Meetings: Att.']] or '',
            'dev_fof':          r[col['Devotional Meetings: FoF.']] or '',
            'comments':         r[col['Comments']]         or '',
        })
    return result


def parse_education(xlsx_bytes):
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    all_rows = list(ws.iter_rows(values_only=True))

    # Row 1: merged group headers (Children's Classes | JYG | SC | All Ed)
    # Row 2: sub-column labels (No. / Participation / unlabeled-FoF per group)
    # Row 3+: data
    # Col layout:
    #  0: Focus Neighbourhood
    #  1: CC No.   2: CC Participation   3: CC FoF (unlabeled in row 2)
    #  4: JYG No.  5: JYG Participation  6: JYG FoF (unlabeled)
    #  7: SC No.   8: SC Participation   9: SC FoF (unlabeled)
    # 10: Total No. of Facilitators
    # 11-13: All Ed totals (skip — computed by web app)
    result = []
    for r in all_rows[2:]:
        name = r[0]
        if not name:
            continue
        result.append({
            'name':         name,
            'cc_act':       r[1]  or '',
            'cc_part':      r[2]  or '',
            'cc_fof':       r[3]  or '',
            'jyg_act':      r[4]  or '',
            'jyg_part':     r[5]  or '',
            'jyg_fof':      r[6]  or '',
            'sc_act':       r[7]  or '',
            'sc_part':      r[8]  or '',
            'sc_fof':       r[9]  or '',
            'facilitators': r[10] or '',
        })
    return result


# ── Google Sheet writer ───────────────────────────────────────────────────────

def open_sheet(tab_name):
    creds = Credentials.from_service_account_file(
        SERVICE_ACCOUNT,
        scopes=['https://www.googleapis.com/auth/spreadsheets'],
    )
    gc = gspread.authorize(creds)
    spreadsheet = gc.open_by_key(SHEET_ID)
    try:
        return spreadsheet.worksheet(tab_name)
    except gspread.exceptions.WorksheetNotFound:
        return spreadsheet.add_worksheet(title=tab_name, rows=500, cols=30)


def write_tab(tab_name, headers, records):
    sheet = open_sheet(tab_name)
    sheet.clear()
    sheet.update(values=[headers] + records, range_name='A1')
    print(f'  Wrote {len(records)} rows to "{tab_name}" tab.')


def write_devotionals(records):
    headers = [
        'Name', 'Latin Name', 'Locality', 'Electoral Unit', 'Cluster',
        'Group of Clusters', 'Subregion', 'Region', 'Group of Regions',
        'National Community', 'Dev Active', 'Dev Participants', 'Dev FoF', 'Comments',
    ]
    rows = [[
        r.get('name',''),             r.get('latin_name',''),
        r.get('locality',''),         r.get('electoral_unit',''),
        r.get('cluster',''),          r.get('group_of_clusters',''),
        r.get('subregion',''),        r.get('region',''),
        r.get('group_of_regions',''), r.get('national_community',''),
        r.get('dev_act',''),          r.get('dev_part',''),
        r.get('dev_fof',''),          r.get('comments',''),
    ] for r in records]
    write_tab(TAB_DEVOTIONALS, headers, rows)


def write_education(records):
    headers = [
        'Name',
        'CC Active', 'CC Participants', 'CC FoF',
        'JYG Active', 'JYG Participants', 'JYG FoF',
        'SC Active', 'SC Participants', 'SC FoF',
        'Facilitators',
    ]
    rows = [[
        r.get('name',''),
        r.get('cc_act',''),  r.get('cc_part',''),  r.get('cc_fof',''),
        r.get('jyg_act',''), r.get('jyg_part',''), r.get('jyg_fof',''),
        r.get('sc_act',''),  r.get('sc_part',''),  r.get('sc_fof',''),
        r.get('facilitators',''),
    ] for r in records]
    write_tab(TAB_EDUCATION, headers, rows)


# ── Main ──────────────────────────────────────────────────────────────────────

async def main():
    if not SESSION_FILE.exists():
        print('No session found. Run auth.py first.')
        return

    EXPORTS_DIR.mkdir(exist_ok=True)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context(
            storage_state=str(SESSION_FILE),
            accept_downloads=True,
        )
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT)
        page.set_default_navigation_timeout(TIMEOUT)

        await page.goto(SRP_URL)
        await page.wait_for_load_state('networkidle')
        if 'login' in page.url.lower():
            print('Session expired. Run auth.py to re-authenticate.')
            await browser.close()
            return

        await set_scope(page)

        dev_bytes = await scrape_devotionals(page)
        edu_bytes = await scrape_education(page)

        await browser.close()

    dev_records = parse_devotionals(dev_bytes)
    edu_records = parse_education(edu_bytes)

    print('Writing to Google Sheet...')
    write_devotionals(dev_records)
    write_education(edu_records)
    print('Done.')


if __name__ == '__main__':
    asyncio.run(main())
