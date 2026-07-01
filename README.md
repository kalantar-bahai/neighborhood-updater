# Neighborhood Web App

Google Apps Script web app for viewing and editing neighborhood data. Neighborhood contacts log in and see only their row(s). Global admins see all rows.

## Architecture

| Component | Details |
|-----------|---------|
| Runtime | Google Apps Script (personal Gmail: michael.kalantar@gmail.com) |
| Script ID | `1HFGvAL9Y_AyW84JhhfdJah2vS8x5yt4sc_d17uh1sA4SiaPsD4LjRsxE` |
| Master sheet | `1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44` — tab: Neighborhoods (data row 4) |
| SRP cache sheet | `1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo` — tabs: Devotionals, Education (data row 2) |
| Auth | `executeAs: USER_ACCESSING` — user identity from `Session.getActiveUser()`; sheet ops via service account |
| Access | `ANYONE` — any Google account may attempt access; auth layer enforces row-level access |

## Deploying code changes

```bash
clasp push --force
```

Then in the Apps Script editor (script.google.com, logged in as michael.kalantar@gmail.com):

- **New version of existing deployment**: Deploy → Manage Deployments → edit (pencil) → Version: New version → Deploy
- **Brand new deployment** (only needed if changing `executeAs` or `access`): Deploy → New Deployment → Web app

The web app URL changes with each new deployment. Update the URL shared with neighborhood contacts whenever a new deployment is created.

## Access control

Access is configured in the `Access` tab of the master sheet (columns A–D: name, email, role, nucleus). Row 1 is a header row and is skipped. Each subsequent row grants one person a role for one nucleus (or `*` for all nuclei). A person can have multiple rows.

### Roles

| Role | Read data | Edit standard fields | Manage access grants | Edit identity fields |
|------|:---------:|:--------------------:|:--------------------:|:--------------------:|
| `read` | ✅ | | | |
| `read-write` | ✅ | ✅ | | |
| `collaborator` | ✅ | ✅ | ✅ | |
| `admin` | ✅ | ✅ | ✅ | ✅ |

**Standard fields:** locality, stage, contact, email, aux board, makeup, activities, worker lists.  
**Identity fields:** nucleus name, parent nucleus, grouping, cluster, PG, cluster code, type.

### Nucleus column

- A specific nucleus name (e.g. `Alpha`) — grants access only to that nucleus.
- `*` — grants access to all nuclei.

Role resolution per nucleus: highest role across any matching specific-nucleus entry and any `*` entry.

### Managing access in-app

Users with `collaborator` or `admin` role can open the Manage Access panel:
- **On a nucleus detail page** — manage grants for that nucleus only.
- **On the main list page** (global `*` grant required) — manage all grants across all nuclei.

## Auth

The app uses `executeAs: USER_ACCESSING`. When a user opens the app, Google authenticates them first (they must be signed into a Google account). `Session.getActiveUser().getEmail()` then returns their Google-verified email — no passwords or tokens involved.

The spreadsheets remain private. The app never shares them with the user; all sheet reads and writes go through a service account whose key is stored in Script Properties. The accessing user needs no sheet permissions.

**First-visit quirk:** On a user's very first visit, after they grant the OAuth permissions screen, the page may appear to load but fail silently. The app automatically retries after 2 seconds. If it still fails, the user should reload the page — this only ever happens once per user.

**Multiple Google accounts:** If a user has more than one Google account in their browser, the OAuth flow may authenticate them under the wrong account (not the one with access). The app will show an "Access denied" error with a note. The fix is to open the link in a **private / incognito window**, which forces Google to ask which account to use without a pre-existing session.

**Re-running setup (if you reset the service account key):**
1. Open the script in Apps Script editor → Project Settings → Script Properties
2. Add property `SERVICE_ACCOUNT` with the full contents of the service account key JSON
3. The service account must have Editor access to both the master sheet and the SRP cache sheet

## Refreshing the SRP cache

See `srp-cache/README.md` for full details. Short version:

```bash
cd srp-cache
source .venv/bin/activate
python scrape.py          # opens browser, downloads reports, writes to sheet
```

Re-authenticate if the session has expired:

```bash
python auth.py            # opens browser for manual login + 2FA
```

---

## Next steps

### 1. Neighborhood name uniqueness

The SRP join and row lookup both use neighborhood name as the key. Once the same name appears in multiple clusters, this breaks. When that happens:
- The master sheet lookup (`saveRowData`, `getRowData`) must filter by cluster + name
- The SRP join (`findSrpRow`) must also match on cluster — the `Devotionals` tab has cluster data, the `Education` tab does not (future scraper improvement needed)
- The picker URL/deeplink should include cluster as a parameter

### 2. Automate 2FA for SRP scraper

See `srp-cache/README.md`. When re-registering 2FA on a dedicated SRP account, capture the TOTP secret and add it to `srp-cache/.env` as `TOTP_SECRET`. The scraper will generate codes automatically.

### 3. Schedule SRP cache refresh

Add a cron entry on your Mac to run the scraper periodically (weekly is typical during an active plan cycle). Requires being logged into macOS with a display session since the SRP site requires a visible browser.

```cron
0 7 * * 1   cd /Users/kalantar/projects/github.com/kalantar/neighborhood/srp-cache && source .venv/bin/activate && python scrape.py >> scrape.log 2>&1
```
