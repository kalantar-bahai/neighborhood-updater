# SRP Cache Scraper

Scrapes neighborhood-level data from [usa.onlinesrp.org](https://usa.onlinesrp.org/) and writes it to two tabs in the SRP cache Google Sheet (`1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo`).

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
cp .env.example .env        # no credentials needed — auth is manual
```

The Google service account at `~/.google-service-account.json` must have **Editor** access to the SRP cache sheet (already configured).

## Authenticate (run when session expires)

The scraper reuses a saved browser session. Sessions typically last days to weeks. When `scrape.py` prints "Session expired. Run auth.py to re-authenticate." — or on first use — run:

```bash
source .venv/bin/activate
python auth.py
```

A browser window opens. Log in with your SRP credentials and complete the Google Authenticator 2FA. Press **Enter** in the terminal when done. The session is saved to `session.json`.

**To automate 2FA in the future:** when re-registering 2FA on SRP, capture the TOTP secret key (the base32 text string shown alongside the QR code). Add it to `.env` as `TOTP_SECRET=...` — the scraper will generate codes automatically and `auth.py` will no longer be needed.

## Fetch fresh data

```bash
cd srp-cache
source .venv/bin/activate
python scrape.py
```

A browser window opens briefly, navigates to both reports, downloads them, and writes to the sheet. Takes roughly 20–30 seconds. The browser closes automatically when done.

**Note:** The SRP site does not support headless browsers (the Angular UI does not render without a real display). The visible browser window is expected.

## Files

| File | Purpose |
|------|---------|
| `auth.py` | One-time / on-expiry session setup |
| `scrape.py` | Fetch data and write to sheet |
| `debug_page.py` | Diagnostic — prints page elements after session restore |
| `session.json` | Saved browser session (gitignored) |
| `exports/` | Downloaded Excel files from each run (gitignored) |
| `.env` | Credentials (gitignored — copy from `.env.example`) |

---

## Next steps

### 1. Update the web app to read from the new cache tabs

`Data.gs` currently reads SRP data from `Sheet1`. It needs to read from `Devotionals` (for devotional counts + geographic data) and `Education` (for CC/JYG/SC/facilitator counts) and join them by neighborhood name.

`Config.gs` needs new constants for the two tab names and their column layouts.

The join key is neighborhood name for now. **Future:** once the same neighborhood name appears in multiple clusters, the join key will need to be cluster + name — the `Devotionals` tab has cluster, the `Education` tab does not, so either the education report is filtered to a specific cluster before scraping, or the join uses the master sheet's cluster as a secondary filter.

### 2. Automate 2FA

When ready to eliminate the manual auth step: re-register 2FA on a dedicated SRP account, capture the TOTP secret, and add it to `.env`. Update `auth.py` (or `scrape.py` directly) to call `pyotp.TOTP(secret).now()` instead of prompting.

### 3. Schedule periodic runs

On macOS, add a cron entry to run the scraper automatically (requires being logged in with a display session):

```cron
0 6 * * 1   cd /path/to/neighborhood/srp-cache && source .venv/bin/activate && python scrape.py >> scrape.log 2>&1
```

Runs every Monday at 6 AM. Adjust frequency to match how often SRP data changes (weekly is typical during an active plan cycle).

### 4. Surface geographic data in the web app

The `Devotionals` tab now includes Region, Subregion, Group of Clusters, Cluster, and Locality from SRP. These can fill gaps in the master sheet or serve as a cross-reference when the web app displays neighborhood details.
