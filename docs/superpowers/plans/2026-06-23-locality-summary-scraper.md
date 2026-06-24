# Locality Summary Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract shared SRP automation plumbing into `srp_lib/`, refactor `scrape.py` to use it, then add `locality_summary.py` to scrape the Locality Summary report for 19 localities and write results into a per-locality-tab Google Sheet with upsert-or-append logic keyed on SRP's "Date as of" field.

**Architecture:** A new `srp_lib/` Python package inside `srp-cache/` holds auth, browser, and sheets utilities shared across all SRP automation scripts. `locality_summary.py` uses `srp_lib` to authenticate, navigate to Reports → Locality Summary, export each locality's Excel, validate the column schema (abort on mismatch), and write to the target sheet — overwriting the last row if "Date as of" matches, or appending a new row if it's a new reporting period.

**Tech Stack:** Python 3.13, Playwright (async), gspread, openpyxl, pyotp, python-dotenv, pytest

## Global Constraints

- All scripts run from `srp-cache/` with `.venv` activated: `source .venv/bin/activate`
- Credentials in `.env` (gitignored); service account at `~/.google-service-account.json`
- SRP site requires non-headless Chromium — the Angular UI does not render headless
- Target sheet ID: `1wV1kZZd-vkxfIEqU-PlEl5aMPr6Bk2c7VOvKiyxxv5k`
- SRP cache sheet ID (used by `scrape.py`): `1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo`
- Target sheet: data rows start at row 4 (rows 1–3 are headers); "Date as of" is column E (0-indexed: 4)
- Column validation failure → abort entire run, write nothing to the sheet

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `srp-cache/srp_lib/__init__.py` | Package marker |
| Create | `srp-cache/srp_lib/auth.py` | `load_credentials`, `authenticate`, `totp_watchdog` |
| Create | `srp-cache/srp_lib/browser.py` | `launch_browser`, `click`, `download_excel` |
| Create | `srp-cache/srp_lib/sheets.py` | `open_sheet` |
| Modify | `srp-cache/scrape.py` | Import from `srp_lib`; remove inline duplicates |
| Create | `srp-cache/locality_summary.py` | Navigation, validation, parsing, upsert/append, `main` |
| Create | `srp-cache/tests/__init__.py` | Package marker |
| Create | `srp-cache/tests/test_locality_summary.py` | Unit tests for pure functions |
| Modify | `srp-cache/requirements.txt` | Add `pytest` |

---

### Task 1: `srp_lib` package

**Files:**
- Create: `srp-cache/srp_lib/__init__.py`
- Create: `srp-cache/srp_lib/auth.py`
- Create: `srp-cache/srp_lib/browser.py`
- Create: `srp-cache/srp_lib/sheets.py`

**Interfaces:**
- Produces:
  - `load_credentials() -> dict` — keys: `url`, `username`, `password`, `totp_secret`
  - `authenticate(page, username, password, totp_secret, timeout=60_000) -> None`
  - `totp_watchdog(page, stop_event, totp_secret) -> None` (async loop, exits when `stop_event` is set)
  - `launch_browser(pw) -> tuple[Browser, BrowserContext]`
  - `click(page, locator, delay_ms=500) -> None`
  - `download_excel(page, exports_dir, timeout=60_000) -> bytes`
  - `open_sheet(sheet_id, tab_name) -> gspread.Worksheet`

- [ ] **Step 1: Create `srp_lib/__init__.py`**

Empty file — marks the directory as a Python package.

```bash
touch srp-cache/srp_lib/__init__.py
```

- [ ] **Step 2: Create `srp_lib/auth.py`**

```python
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
```

- [ ] **Step 3: Create `srp_lib/browser.py`**

```python
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
```

- [ ] **Step 4: Create `srp_lib/sheets.py`**

```python
# srp-cache/srp_lib/sheets.py
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

SERVICE_ACCOUNT = Path.home() / '.google-service-account.json'


def open_sheet(sheet_id, tab_name):
    creds = Credentials.from_service_account_file(
        SERVICE_ACCOUNT,
        scopes=['https://www.googleapis.com/auth/spreadsheets'],
    )
    gc = gspread.authorize(creds)
    spreadsheet = gc.open_by_key(sheet_id)
    try:
        return spreadsheet.worksheet(tab_name)
    except gspread.exceptions.WorksheetNotFound:
        return spreadsheet.add_worksheet(title=tab_name, rows=500, cols=100)
```

- [ ] **Step 5: Smoke-test imports**

```bash
cd srp-cache && source .venv/bin/activate
python -c "
from srp_lib.auth import load_credentials, authenticate, totp_watchdog
from srp_lib.browser import launch_browser, click, download_excel
from srp_lib.sheets import open_sheet
print('OK')
"
```

Expected output: `OK`

- [ ] **Step 6: Commit**

```bash
git add srp-cache/srp_lib/
git commit -m "feat: add srp_lib package with auth, browser, and sheets modules"
```

---

### Task 2: Refactor `scrape.py` to use `srp_lib`

**Files:**
- Modify: `srp-cache/scrape.py`

**Interfaces:**
- Consumes: all three `srp_lib` modules from Task 1
- Produces: `scrape.py` with identical behavior, no duplicated auth/browser/sheets code

- [ ] **Step 1: Replace imports and remove duplicated functions**

At the top of `scrape.py`, add:

```python
from srp_lib.auth import load_credentials, authenticate, totp_watchdog
from srp_lib.browser import launch_browser, download_excel
from srp_lib.browser import click as srp_click
from srp_lib.sheets import open_sheet
```

Remove from `scrape.py` (these now live in `srp_lib`):
- The `authenticate(page)` function
- The `totp_watchdog(page, stop_event)` function
- The `open_sheet(tab_name)` function
- Module-level lines: `SRP_USERNAME = ...`, `SRP_PASSWORD = ...`, `TOTP_SECRET = ...`

- [ ] **Step 2: Update the local `click` helper**

`scrape.py` has its own `click(page, locator)` that uses a module-level `DELAY`. Replace all calls to the local `click` with `srp_click`:

```python
# Before (local):
async def click(page, locator):
    await locator.click()
    await page.wait_for_timeout(DELAY)

# After: delete the local function and update callers:
# await click(page, ...) → await srp_click(page, ...)
```

In `scrape_devotionals` and `scrape_education`, change `await click(page, ...)` to `await srp_click(page, ...)`.

- [ ] **Step 3: Update `write_tab` to call `open_sheet` with both args**

```python
def write_tab(tab_name, headers, records):
    sheet = open_sheet(SHEET_ID, tab_name)   # was: open_sheet(tab_name)
    sheet.clear()
    sheet.update(values=[headers] + records, range_name='A1')
    print(f'  Wrote {len(records)} rows to "{tab_name}" tab.')
```

- [ ] **Step 4: Update `main()` to use `load_credentials` and `launch_browser`**

```python
async def main():
    creds = load_credentials()
    EXPORTS_DIR.mkdir(exist_ok=True)

    async with async_playwright() as pw:
        browser, context = await launch_browser(pw)
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT)
        page.set_default_navigation_timeout(TIMEOUT)

        await page.goto(creds['url'])
        await page.wait_for_load_state('domcontentloaded')
        await page.wait_for_timeout(2_000)

        if 'login' in page.url.lower():
            if creds['username'] and creds['password'] and creds['totp_secret']:
                await authenticate(page, creds['username'], creds['password'], creds['totp_secret'])
            else:
                print('Not logged in. Set credentials in .env, or log in manually and press Enter.')
                input()

        stop_event = asyncio.Event()
        watchdog = asyncio.create_task(totp_watchdog(page, stop_event, creds['totp_secret']))

        try:
            await set_scope(page)
            dev_bytes = await scrape_devotionals(page)
            edu_bytes = await scrape_education(page)
        finally:
            stop_event.set()
            await watchdog

        await browser.close()

    dev_records = parse_devotionals(dev_bytes)
    edu_records = parse_education(edu_bytes)

    print('Writing to Google Sheet...')
    write_devotionals(dev_records)
    write_education(edu_records)
    print('Done.')
```

Also remove the now-unused `SRP_URL` module-level read — it comes from `creds['url']` now. Keep `REGION`, `TIMEOUT`, `SHEET_ID`, `TAB_DEVOTIONALS`, `TAB_EDUCATION`, `DATA_START_ROW`, `SERVICE_ACCOUNT`, `SESSION_FILE`, `EXPORTS_DIR` as-is (`SERVICE_ACCOUNT` and `SESSION_FILE` are only needed if session file logic is still referenced; remove if not).

- [ ] **Step 5: Verify `scrape.py` imports cleanly**

```bash
cd srp-cache && source .venv/bin/activate
python -c "import scrape; print('OK')"
```

Expected output: `OK`

- [ ] **Step 6: Commit**

```bash
git add srp-cache/scrape.py
git commit -m "refactor: scrape.py uses srp_lib for auth, browser, and sheets"
```

---

### Task 3: Schema discovery — determine `EXPECTED_COLUMNS`

**Files:** None permanently created — this is a one-time discovery run.

**Goal:** Download the Apex Locality Summary Excel and print its header row. The output determines the `EXPECTED_COLUMNS` constant used in Task 4.

- [ ] **Step 1: Run the discovery script**

```bash
cd srp-cache && source .venv/bin/activate && python3 - <<'EOF'
import asyncio, io, openpyxl
from pathlib import Path
from playwright.async_api import async_playwright
from srp_lib.auth import load_credentials, authenticate
from srp_lib.browser import launch_browser, download_excel

EXPORTS_DIR = Path('exports')
TIMEOUT = 60_000

async def main():
    creds = load_credentials()
    EXPORTS_DIR.mkdir(exist_ok=True)
    async with async_playwright() as pw:
        browser, context = await launch_browser(pw)
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT)
        await page.goto(creds['url'])
        await page.wait_for_load_state('domcontentloaded')
        await page.wait_for_timeout(2_000)
        if 'login' in page.url.lower():
            await authenticate(page, creds['username'], creds['password'], creds['totp_secret'])
        await page.get_by_role('link', name='Reports').click()
        await page.wait_for_timeout(500)
        await page.get_by_role('button', name='Locality Summary').click()
        await page.wait_for_timeout(500)
        await page.get_by_role('button', name='United States / Atlantic / NC').click()
        await page.wait_for_timeout(500)
        await page.get_by_text('Apex', exact=True).click()
        await page.wait_for_timeout(1_000)
        data = await download_excel(page, EXPORTS_DIR)
        await browser.close()
    wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    rows = list(wb.active.iter_rows(values_only=True))
    print(f'Total rows: {len(rows)}')
    for i, row in enumerate(rows):
        print(f'Row {i+1}: {list(row)}')

asyncio.run(main())
EOF
```

- [ ] **Step 2: Record the header row**

Copy Row 1 from the output — this is the exact list of column names used in `EXPECTED_COLUMNS` in Task 4. Example expected shape (actual values may differ):

```
Row 1: ['Locality', 'Cluster', 'Region', 'National Community', 'Date as of',
        'Book 1', 'Book 2', ..., 'Att. at Holy Days']
Row 2: ['Apex', 'NC-215 Triangle', 'Atlantic', 'United States', '5/3/26', ...]
```

---

### Task 4: `locality_summary.py` — pure functions + tests

**Files:**
- Create: `srp-cache/locality_summary.py` (pure functions only in this task; browser/main added in Task 5)
- Create: `srp-cache/tests/__init__.py`
- Create: `srp-cache/tests/test_locality_summary.py`
- Modify: `srp-cache/requirements.txt`

**Interfaces:**
- Consumes: `EXPECTED_COLUMNS` list from Task 3
- Produces:
  - `validate_columns(actual: list, expected: list) -> str | None`
  - `parse_row(xlsx_bytes: bytes) -> list`
  - `parse_date(s: str) -> datetime.date`
  - `should_append(last_date_str: str | None, new_date_str: str) -> bool`

- [ ] **Step 1: Add `pytest` to `requirements.txt`**

```
playwright
gspread
google-auth
openpyxl
python-dotenv
pyotp
pytest
```

```bash
cd srp-cache && source .venv/bin/activate && pip install pytest
```

- [ ] **Step 2: Create `tests/__init__.py`**

```bash
touch srp-cache/tests/__init__.py
```

- [ ] **Step 3: Write the failing tests**

```python
# srp-cache/tests/test_locality_summary.py
import datetime
import io

import openpyxl
import pytest

from locality_summary import validate_columns, parse_row, parse_date, should_append

# Minimal synthetic columns — tests do not depend on real SRP schema.
COLS = ['A', 'B', 'C', 'D', 'Date as of', 'X', 'Y']
ROW  = ['v1', 'v2', 'v3', 'v4', '5/3/26', '10', '20']


def _make_xlsx(headers, data_row):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    ws.append(data_row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── validate_columns ──────────────────────────────────────────────────────────

def test_validate_columns_exact_match():
    assert validate_columns(COLS, COLS) is None


def test_validate_columns_missing_column():
    result = validate_columns(COLS[:-1], COLS)
    assert result is not None
    assert 'Missing' in result
    assert 'Y' in result


def test_validate_columns_extra_column():
    result = validate_columns(COLS + ['Z'], COLS)
    assert result is not None
    assert 'New in export' in result
    assert 'Z' in result


def test_validate_columns_reordered():
    reordered = list(reversed(COLS))
    result = validate_columns(reordered, COLS)
    assert result is not None
    assert 'order' in result.lower()


# ── parse_row ─────────────────────────────────────────────────────────────────

def test_parse_row_returns_data_values():
    xlsx = _make_xlsx(COLS, ROW)
    assert parse_row(xlsx) == ROW


def test_parse_row_converts_none_to_empty_string():
    row_with_none = ROW[:5] + [None] + ROW[6:]
    xlsx = _make_xlsx(COLS, row_with_none)
    result = parse_row(xlsx)
    assert result[5] == ''


# ── parse_date ────────────────────────────────────────────────────────────────

def test_parse_date_single_digit_day():
    assert parse_date('5/3/26') == datetime.date(2026, 5, 3)


def test_parse_date_double_digit_month_and_day():
    assert parse_date('11/9/25') == datetime.date(2025, 11, 9)


# ── should_append ─────────────────────────────────────────────────────────────

def test_should_append_same_date_returns_false():
    assert should_append('5/3/26', '5/3/26') is False


def test_should_append_newer_date_returns_true():
    assert should_append('5/3/26', '8/1/26') is True


def test_should_append_no_existing_data_returns_true():
    assert should_append(None, '5/3/26') is True
```

- [ ] **Step 4: Run tests — confirm they fail**

```bash
cd srp-cache && source .venv/bin/activate
pytest tests/test_locality_summary.py -v
```

Expected: all FAIL with `ModuleNotFoundError: No module named 'locality_summary'`

- [ ] **Step 5: Implement the pure functions in `locality_summary.py`**

Substitute the actual column list from Task 3 Step 2 into `EXPECTED_COLUMNS`.

```python
# srp-cache/locality_summary.py
"""
Scrapes the SRP Locality Summary report for each NC-215 Triangle locality
and writes results to a per-locality-tab Google Sheet.

Usage:
    python locality_summary.py

Set SRP_USERNAME, SRP_PASSWORD, and TOTP_SECRET in .env to authenticate
automatically. If any are missing the browser opens for manual login.
"""

import asyncio
import datetime
import io
from pathlib import Path

import openpyxl
from playwright.async_api import async_playwright

from srp_lib.auth import load_credentials, authenticate, totp_watchdog
from srp_lib.browser import launch_browser, download_excel
from srp_lib.sheets import open_sheet

SHEET_ID    = '1wV1kZZd-vkxfIEqU-PlEl5aMPr6Bk2c7VOvKiyxxv5k'
EXPORTS_DIR = Path(__file__).parent / 'exports'
TIMEOUT     = 60_000
HEADER_ROWS = 3    # rows 1–3 are headers; data starts at row 4
DATE_COL    = 4    # column E, 0-indexed

LOCALITIES = [
    'Apex', 'Carrboro', 'Cary', 'Chapel Hill',
    'Durham', 'Durham County', 'Fuquay-Varina', 'Garner',
    'Hillsborough', 'Holly Springs', 'Knightdale',
    'Morrisville', 'Orange County', 'Raleigh', 'Rolesville',
    'Wake County', 'Wake Forest', 'Wendell', 'Zebulon',
]

# Fill this in from Task 3 Step 2 output (Row 1 from the discovery run):
EXPECTED_COLUMNS = [
    # 'Locality', 'Cluster', ...
]


def validate_columns(actual: list, expected: list) -> str | None:
    """Return an error string describing any schema mismatch, or None if columns match."""
    if actual == expected:
        return None
    actual_set, expected_set = set(actual), set(expected)
    missing = sorted(expected_set - actual_set)
    extra   = sorted(actual_set - expected_set)
    lines = ['Column mismatch — aborting.']
    if missing:
        lines.append(f'  Missing from export : {missing}')
    if extra:
        lines.append(f'  New in export       : {extra}')
    if not missing and not extra:
        lines.append('  Same columns but different order — update EXPECTED_COLUMNS ordering.')
    return '\n'.join(lines)


def parse_row(xlsx_bytes: bytes) -> list:
    """Return the single data row from a Locality Summary Excel as a list (None → '')."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    return ['' if v is None else v for v in rows[1]]


def parse_date(s: str) -> datetime.date:
    """Parse '5/3/26' or '11/9/25' into a datetime.date."""
    return datetime.datetime.strptime(s, '%m/%d/%y').date()


def should_append(last_date_str: str | None, new_date_str: str) -> bool:
    """Return True when new_date_str represents a new SRP reporting period."""
    if last_date_str is None:
        return True
    return parse_date(new_date_str) != parse_date(last_date_str)
```

- [ ] **Step 6: Run tests — confirm they pass**

```bash
cd srp-cache && source .venv/bin/activate
pytest tests/test_locality_summary.py -v
```

Expected: all 11 tests PASS

- [ ] **Step 7: Commit**

```bash
git add srp-cache/locality_summary.py srp-cache/tests/ srp-cache/requirements.txt
git commit -m "feat: locality_summary pure functions with tests (validate, parse, date, upsert logic)"
```

---

### Task 5: `locality_summary.py` — sheet write, navigation, and `main()`

**Files:**
- Modify: `srp-cache/locality_summary.py`

**Interfaces:**
- Consumes: all functions from Task 4; all `srp_lib` modules
- Produces: `python locality_summary.py` runs end-to-end

- [ ] **Step 1: Add `get_last_date` and `write_locality_data`**

Append to `locality_summary.py`:

```python
def get_last_date(tab) -> str | None:
    """Return the 'Date as of' value from the last data row, or None if no data rows."""
    all_values = tab.get_all_values()
    data_rows = all_values[HEADER_ROWS:]
    if not data_rows:
        return None
    last_row = data_rows[-1]
    if len(last_row) <= DATE_COL or not last_row[DATE_COL]:
        return None
    return last_row[DATE_COL]


def write_locality_data(tab, row_values: list, new_date_str: str) -> None:
    """Overwrite the last data row if date matches, otherwise append a new row."""
    all_values = tab.get_all_values()
    data_rows = all_values[HEADER_ROWS:]

    last_date = None
    if data_rows:
        last_row = data_rows[-1]
        if len(last_row) > DATE_COL and last_row[DATE_COL]:
            last_date = last_row[DATE_COL]

    if should_append(last_date, new_date_str):
        next_row = HEADER_ROWS + len(data_rows) + 1  # 1-indexed sheet row
        tab.update(values=[row_values], range_name=f'A{next_row}')
        print(f'  Appended (Date as of: {new_date_str}).')
    else:
        last_row_num = HEADER_ROWS + len(data_rows)  # 1-indexed sheet row
        tab.update(values=[row_values], range_name=f'A{last_row_num}')
        print(f'  Overwrote last row (Date as of: {new_date_str}).')
```

- [ ] **Step 2: Add `scrape_locality`**

```python
async def scrape_locality(page, locality: str) -> bytes | None:
    """Select locality from dropdown and export Excel. Returns None on failure."""
    try:
        await page.get_by_role('button', name='United States / Atlantic / NC').click()
        await page.wait_for_timeout(500)
        await page.get_by_text(locality, exact=True).click()
        await page.wait_for_timeout(1_000)
        return await download_excel(page, EXPORTS_DIR)
    except Exception as e:
        print(f'  WARNING: skipping {locality!r}: {e}')
        return None
```

- [ ] **Step 3: Add `main()`**

```python
async def main():
    creds = load_credentials()
    EXPORTS_DIR.mkdir(exist_ok=True)

    async with async_playwright() as pw:
        browser, context = await launch_browser(pw)
        page = await context.new_page()
        page.set_default_timeout(TIMEOUT)
        page.set_default_navigation_timeout(TIMEOUT)

        await page.goto(creds['url'])
        await page.wait_for_load_state('domcontentloaded')
        await page.wait_for_timeout(2_000)

        if 'login' in page.url.lower():
            if creds['username'] and creds['password'] and creds['totp_secret']:
                await authenticate(page, creds['username'], creds['password'], creds['totp_secret'])
            else:
                print('Not logged in. Set credentials in .env or log in manually and press Enter.')
                input()

        stop_event = asyncio.Event()
        watchdog = asyncio.create_task(totp_watchdog(page, stop_event, creds['totp_secret']))

        await page.get_by_role('link', name='Reports').click()
        await page.wait_for_timeout(500)
        await page.get_by_role('button', name='Locality Summary').click()
        await page.wait_for_timeout(500)

        locality_bytes: dict[str, bytes] = {}
        for locality in LOCALITIES:
            print(f'Scraping {locality}...')
            data = await scrape_locality(page, locality)
            if data is not None:
                locality_bytes[locality] = data

        stop_event.set()
        await watchdog
        await browser.close()

    if not locality_bytes:
        print('No localities downloaded — nothing to write.')
        return

    # Validate schema against the first successful download
    first_data = next(iter(locality_bytes.values()))
    wb = openpyxl.load_workbook(io.BytesIO(first_data), read_only=True, data_only=True)
    actual_headers = list(next(wb.active.iter_rows(min_row=1, max_row=1, values_only=True)))
    actual_headers = [h or '' for h in actual_headers]

    error = validate_columns(actual_headers, EXPECTED_COLUMNS)
    if error:
        print(error)
        return

    print('Writing to Google Sheet...')
    for locality, data in locality_bytes.items():
        row_values = parse_row(data)
        new_date_str = str(row_values[DATE_COL])
        tab = open_sheet(SHEET_ID, locality)
        print(f'  {locality}:', end=' ')
        write_locality_data(tab, row_values, new_date_str)

    print('Done.')


if __name__ == '__main__':
    asyncio.run(main())
```

- [ ] **Step 4: Confirm tests still pass**

```bash
cd srp-cache && source .venv/bin/activate
pytest tests/test_locality_summary.py -v
```

Expected: all 11 tests still PASS (new functions are not unit-tested; they're integration-tested in Step 5)

- [ ] **Step 5: Run end-to-end against real SRP and sheet**

```bash
cd srp-cache && source .venv/bin/activate
python locality_summary.py
```

Expected:
- Browser opens, authenticates, navigates to Locality Summary
- Downloads 19 Excel files (printed: `Downloaded: <locality>.xlsx`)
- Validates columns (no mismatch message)
- Writes to each tab (printed: `Overwrote last row` or `Appended`)
- Prints `Done.`

After running, spot-check the Apex tab in the target sheet: the "Date as of" value in the last data row should match SRP's current reporting date.

If you see a column mismatch error: update `EXPECTED_COLUMNS` with the printed actual headers and re-run.

- [ ] **Step 6: Commit**

```bash
git add srp-cache/locality_summary.py
git commit -m "feat: locality_summary.py complete — navigation, write logic, and main"
```
