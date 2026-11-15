# SRP Cache Scraper

> **Legacy.** These scrapers fed the original Google Apps Script version of the app. The current app gets SRP data through cluster-notebook and does not read this sheet. They are kept for reference only.

Scrapes neighborhood-level data from [usa.onlinesrp.org](https://usa.onlinesrp.org/) and writes it to two tabs in an SRP cache Google Sheet (its ID is set in `scrape.py`).

| Tab | Source report | Contents |
|-----|---------------|----------|
| `Devotionals` | Locations → Clusters → Focus Neighbourhoods | Name, full geographic scope, devotional meeting counts |
| `Education` | Reports → General Reports → Institute Reports → All Educational Core → By Region → By Focus Neighbourhood | Name, CC / JYG / SC counts, facilitators |

## Setup (one-time)

```bash
cd srp-cache
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
```

Fill in `.env`:

```
SRP_URL=https://usa.onlinesrp.org/
SRP_USERNAME=your@email.com
SRP_PASSWORD="your password"
TOTP_SECRET=YOUR_BASE32_SECRET
```

`TOTP_SECRET` is the base32 key shown when you enroll in Google Authenticator (the text string alongside the QR code). If you need to retrieve it, disable and re-enable 2FA on the SRP site and save the key this time.

The Google service account at `~/.google-service-account.json` must have **Editor** access to the SRP cache sheet (already configured).

## Fetch fresh data

```bash
cd srp-cache
source .venv/bin/activate
python scrape.py
```

`scrape.py` handles everything in one browser session:

1. Navigates to onlinesrp.org
2. If not logged in, fills username/password and TOTP automatically
3. Downloads both reports and writes to the sheet

A browser window opens and closes automatically. Takes roughly 30–45 seconds. If a mid-session TOTP prompt appears during a large data pull, it is also filled automatically.

**Fallback (no credentials in .env):** the browser opens for manual login; press Enter in the terminal when done.

## `auth.py` — standalone session saver

`auth.py` authenticates and saves the browser session to `session.json`. Run it when you want to pre-warm a session for use by multiple scripts without each one re-authenticating:

```bash
source .venv/bin/activate
python auth.py
```

With `SRP_USERNAME`, `SRP_PASSWORD`, and `TOTP_SECRET` set in `.env` this runs fully automatically. Without them, the browser opens for manual login.

The saved session can be loaded by other Playwright scripts via `storage_state=str(SESSION_FILE)`. Sessions typically last hours to days before expiring.

## Files

| File | Purpose |
|------|---------|
| `auth.py` | Pre-warm a shared session (optional) |
| `scrape.py` | Authenticate, fetch data, and write to sheet |
| `debug_page.py` | Diagnostic — prints page elements |
| `session.json` | Saved browser session (gitignored) |
| `exports/` | Downloaded Excel files from each run (gitignored) |
| `.env` | Credentials (gitignored — copy from `.env.example`) |

