# Locality Summary Scraper — Design

**Date:** 2026-06-23  
**Status:** Approved

## Goal

Automate pulling the SRP Locality Summary report for each of the 19 NC-215 Triangle localities and writing the results into a per-locality-tab Google Sheet. Runs are expected roughly every 3 months; multiple runs within the same SRP reporting period overwrite the latest row, while a run in a new reporting period appends a new row.

**Target sheet:** `1wV1kZZd-vkxfIEqU-PlEl5aMPr6Bk2c7VOvKiyxxv5k`

---

## Architecture

Two deliverables:

1. **`srp_lib/`** — a new Python package inside `srp-cache/` containing SRP automation plumbing shared across all future scripts. Designed to be extracted into a standalone pip-installable package when the automations outgrow a single repo.

2. **`locality_summary.py`** — a new standalone script that uses `srp_lib` to scrape and write the Locality Summary report. Existing `scrape.py` is refactored to also use `srp_lib` (behavior unchanged).

---

## `srp_lib` Package

```
srp-cache/
├── srp_lib/
│   ├── __init__.py
│   ├── auth.py      # credentials, authenticate(), totp_watchdog()
│   ├── browser.py   # launch_browser(), click(), download_excel()
│   └── sheets.py    # open_sheet()
├── scrape.py        # refactored — imports from srp_lib
├── locality_summary.py
└── ...
```

### `srp_lib/auth.py`

- `load_credentials()` — reads `SRP_URL`, `SRP_USERNAME`, `SRP_PASSWORD`, `TOTP_SECRET` from `.env`
- `authenticate(page, username, password, totp_secret)` — fills login form and TOTP verification page
- `totp_watchdog(page, stop_event, totp_secret)` — background asyncio task that fills TOTP whenever a mid-session verification prompt appears

### `srp_lib/browser.py`

- `launch_browser(pw)` — launches non-headless Chromium with `accept_downloads=True` (SRP's Angular UI does not render headless)
- `click(page, locator, delay_ms=500)` — click with configurable delay to avoid rate limiting
- `download_excel(page, exports_dir)` — clicks Export Data → Excel, waits for download, saves file, returns raw bytes

### `srp_lib/sheets.py`

- `open_sheet(sheet_id, tab_name)` — opens a gspread worksheet using the service account at `~/.google-service-account.json`; creates the tab if it does not exist

### What stays in each script

Navigation sequences, Excel parsing, sheet write logic, script-specific constants (`SHEET_ID`, column lists, locality names). Only logic that is truly identical across every SRP automation belongs in `srp_lib`.

---

## `locality_summary.py`

### Localities

```python
LOCALITIES = [
    'Apex', 'Carrboro', 'Cary', 'Chapel Hill',
    'Durham', 'Durham County', 'Fuquay-Varina', 'Garner',
    'Hillsborough', 'Holly Springs', 'Knightdale',
    'Morrisville', 'Orange County', 'Raleigh', 'Rolesville',
    'Wake County', 'Wake Forest', 'Wendell', 'Zebulon',
]
```

### Navigation

```
Reports → Locality Summary → locality dropdown → Export Data → Excel
```

Dropdown label is the currently-selected scope (e.g., `"United States / Atlantic / NC-215 Triangle"`). One browser session handles all 19 localities sequentially.

### Column Validation

Before writing any data, the script compares the header row of the downloaded Excel against `EXPECTED_COLUMNS` (a constant defined in `locality_summary.py`). The expected columns are the exact column names as they appear in the SRP export — confirmed to match the target sheet's column layout directly, with no transformation required.

If there is any mismatch the script **aborts immediately** and prints a diff:

```
Column mismatch — aborting.
  Missing from export : ['Old Column Name']
  New in export       : ['New Column Name']
```

No data is written to the sheet when validation fails. This protects against silent data misalignment if SRP changes the report schema (which has happened in other SRP reports).

Validation runs once against the first locality's export. If it passes, the same schema is assumed for all remaining localities.

### Update Logic (Upsert vs. Append)

Each locality tab has 3 fixed header rows (rows 1–3). Data rows start at row 4. Column E ("Date as of") is the reporting-period key.

After parsing each locality's Excel:

1. Read the last data row from the tab (if any).
2. Parse "Date as of" from both the Excel and the last sheet row into `datetime.date` objects.
3. **Same date** → overwrite the last data row in place (the script was re-run within the same SRP reporting period).
4. **Different (newer) date** → append a new row at the end (SRP has published a new reporting period).
5. **No existing data rows** → append as the first data row.

### Error Handling

If a single locality's download fails (timeout, dropdown item not found, parse error), the script logs a warning and continues to the next locality. Sheet writes only happen after a successful parse — a failed scrape never touches the sheet.

---

## Data Flow

```
.env credentials
       │
       ▼
authenticate (srp_lib)
       │
       ▼
for each locality:
  navigate → Export → Excel bytes (srp_lib.download_excel)
       │
       ▼
  validate columns (abort all if mismatch)
       │
       ▼
  parse Excel → dict of values
       │
       ▼
  read last row from sheet tab
       │
       ▼
  compare "Date as of"
       │
  ┌────┴────┐
same      newer
  │          │
overwrite  append
```

---

## Refactor: `scrape.py`

`scrape.py` is refactored to import `authenticate`, `totp_watchdog`, `download_excel`, `launch_browser`, `click`, and `open_sheet` from `srp_lib`. Its behavior and output are unchanged. The refactor is included in this work because creating `srp_lib` with unused shared code while `scrape.py` still contains its own copies would defeat the purpose of the library.

---

## Out of Scope

- Scheduling / cron setup (existing README covers this pattern)
- Creating or modifying the 3-row header structure in each tab (already in place)
- Backfilling historical data
- Support for localities outside NC-215 Triangle
