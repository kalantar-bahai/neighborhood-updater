# Neighborhood Row Detail — Design Spec

## Overview

A web application that lets authorized users view and edit one neighborhood row at a time from a master Google Sheet. The app presents data in a clean, structured form — far more readable than the raw spreadsheet — and writes changes back to the sheet on save. Activity numbers are pre-populated from a periodic SRP data sync; users can override any value, and their overrides are preserved across future syncs.

---

## Data Sources

### Master spreadsheet
Google Sheets ID: `1FwM4TLET45DibGyAljN-jyj6CJsXK-4rZuokliCwA44`
Sheet: `Neighborhoods`
Header spans rows 1–3; data starts at row 4. The app reads and writes this sheet.

### SRP cache spreadsheet
Google Sheets ID: `1w8eRljld_O4vkSPNwRuKWO6YL7uJIJXZ3AtqWUPi5Eo`
Sheet: `Sheet1`
Contains activity counts (CCs, JYGs, SCs, Devotionals) synced periodically from the SRP portal by a scheduled script. The app reads this sheet but never writes to it. SRP data is used to pre-fill activity fields; it does not overwrite user-entered values.

The master sheet header spans 3 rows and contains duplicate column names (multiple `#`, `%`, `Act.`, `Part.`, `FOF`). Column mapping must be done by **position** (column index), not by name.

### Service account credentials
`~/.google-service-account.json` — same service account used by the `registrations` project. Both sheets must be shared with `michael-kalantar-sheets@my-project-1482849892581.iam.gserviceaccount.com`.

---

## Architecture

**Frontend + backend:** Google Apps Script web app, published at a `script.google.com` URL. Google hosts it for free — no separate server or deployment needed. Built with HTML/CSS/JavaScript (client) and Apps Script (server-side Sheets API calls).

**Data sync script:** A separate scheduled Python + Playwright script (similar to the `registrations` launchd job) that logs into the SRP portal, scrapes activity data for all neighborhoods, and writes to the SRP cache spreadsheet. Runs on a schedule (e.g., nightly). This script is out of scope for v1 implementation — the SRP cache sheet is populated manually or by a future script; the app only reads from it.

---

## Permissions

Two tiers, checked on every page load:

1. **Global access list** — a dedicated tab in the master spreadsheet (e.g., `GlobalAccess`) containing a single column of email addresses. Anyone on this list can view and edit any row. This covers admins and coordinators for v1.

2. **Row contact** — the email in the `Contact Email` column of a row. That person can view and edit only their own row(s) — any row where their email matches.

A user who appears in neither list sees an "Access denied" message.

If a user has access to multiple rows (global access, or their email appears in multiple Contact Email fields), they see a row picker listing their accessible neighborhoods. If they have exactly one row, they go directly to it.

---

## Form Layout

All sections display on a single scrolling page. Fields are editable unless marked read-only.

### Identity
Row 1 (read-only): Grouping · Cluster Code · Cluster · PG
Row 2 (editable): Locality · Neighborhood & Pocket · Neighborhood Stage
Row 3 (editable): Neighborhood Contact · Contact Email · Auxiliary Board Member(s)

### Population
Row 1: Total Population · Total Households
Row 2: Individuals Connected (# and %) · Households Connected (# and %)
Full width: Makeup of Population (textarea)

### Educational Activities & Devotionals
Table with columns: Activity | Active | Participants | Friends of the Faith | SRP
Rows: Children's Classes · Junior Youth Groups · Study Circles · **Total Educational** (read-only, sum) · Devotionals · **Total Activities** (read-only, sum)

SRP column shows the cached SRP value for that row (Act / Part / FoF). If the user's value differs from SRP, the user's cells are highlighted amber and the SRP column shows the SRP figure in orange with a "reset" link. Syncs only update SRP cache columns; user values are never overwritten by the sync.

### Workers & Prevalence
Row 1: Protagonists / Workers · Accompaniers in Nucleus
Reference (read-only): SRP Facilitators — displayed as a labeled reference, not an editable field, because it measures something different.
Prevalence Level (text input, free-form)
Notes (textarea)

### Additional Details
2×2 grid of Yes/No toggle + notes textarea:
- Assembly Support
- Social Action Presence
- Local Leaders Involved
- Specific Efforts for Spiritual Health

---

## SRP Sync Conflict Model

Each activity field (CCs, JYGs, SCs, Devotionals — Active / Participants / FoF) stores two values in the master sheet:
- **SRP cache value** — written only by the sync script
- **User override value** — written only by the user via this app

Display logic: show the user override if present, otherwise show the SRP cache value.
Conflict indicator: if user override ≠ SRP cache, highlight the field amber and show the SRP value in the SRP column with a reset link.
Reset: clicking "reset" clears the user override, reverting the field to the SRP cache value.
Sync behavior: the sync script writes only to SRP cache columns and never touches user override columns.

---

## Save Behavior

- "Save to spreadsheet" writes all editable fields (including user override values) to the master sheet via the Sheets API.
- "Discard changes" reloads the page, abandoning unsaved edits.
- Last-write-wins: if two users save simultaneously, the last save wins. A "last updated by / at" line is shown below the page header.
- The SRP cache columns in the master sheet are never written by this app.

---

## Row Picker (multi-row users)

Users with access to more than one row see a simple list before the form:
- Each item shows: Neighborhood name · Cluster · Stage badge
- Clicking a row loads the detail form for that row
- Global access users see all rows, grouped or sorted by Cluster

---

## Out of Scope (v1)

- SRP data fetch UI (login, 2FA, scraping) — the sync script is a separate project
- Cluster-scoped coordinator permissions — v1 uses global access list only
- Click-through from activity counts to lists of individuals
- Change history / audit log
- Mobile-optimized layout
