# Authorization Model v2 Design

**Date:** 2026-07-01  
**Status:** Approved

## Problem

The current auth model has two roles — `global` (all nuclei, read-write) and `contact` (own nucleus rows only, read-write) — with no read-only access, no identity-field editing, and no in-app access management. Access for contacts is implicitly derived from the contact email column on each nucleus row, conflating display and access concerns.

## Goals

- Support read-only access (view without edit)
- Support per-nucleus or all-nuclei grants for any role
- Allow privileged users to edit identity fields currently locked for everyone
- Allow admins to grant/revoke access to others through the app UI
- Decouple the contact email column from access control

## Data Model

### `Access` tab (replaces `GlobalAccess`)

Columns A–D:

| name | email | role | nucleus |
|------|-------|------|---------|
| Michael Kalantar | michael@... | admin | * |
| Alice Smith | alice@... | read-write | Alpha |
| Bob Jones | bob@... | read | Beta |

- `role`: one of `read`, `read-write`, `admin`
- `nucleus`: a specific nucleus name, or `*` meaning all nuclei
- A person can have multiple rows (different nuclei, different roles)
- Row order does not matter

### Role semantics (per nucleus)

For a given nucleus, a user's effective role = the highest role across:
1. Any entry exactly matching that nucleus name
2. Any entry with `nucleus = *`

Role hierarchy: `admin` > `read-write` > `read`

An admin with `nucleus = Alpha` can only manage access entries for Alpha. An admin with `nucleus = *` can manage all entries.

### Contact email column (Nuclei tab, col 10)

Becomes display-only. No code reads it for access decisions. The contact name/email fields remain in the form as editable fields for `read-write` and `admin` users, but have no effect on who can log in.

### Migration

Existing GlobalAccess emails are seeded into the new Access tab as `read-write` / `*` entries (one-time manual edit before deploying).

## Backend

### `src/lib/access.ts`

New types:

```ts
export type Role = 'read' | 'read-write' | 'admin';

export interface AccessEntry {
  name: string;
  email: string;
  role: Role;
  nucleus: string; // specific nucleus name or '*'
}

// Returned by getAccess()
export interface UserAccess {
  entries: AccessEntry[];           // all entries for this user
  roleMap: Record<string, Role>;    // nucleus (or '*') → effective role
}
```

Replace `getAuthorizedRows(email)` with `getAccess(email)`:
- Reads all rows from the Access tab
- Filters to the calling user's email (case-insensitive)
- Builds `roleMap`: for each nucleus key, highest role across matching entries
- Returns `entries` (for admin UI display) and `roleMap`
- Returns `{ entries: [], roleMap: {} }` for unknown users (access denied downstream)

### `src/lib/data.ts`

Add:
- `getAccessEntries(): Promise<AccessEntry[]>` — reads full Access tab
- `saveAccessEntries(entries: AccessEntry[]): Promise<void>` — overwrites Access tab (same clear-then-write pattern as workers)

### `src/lib/config.ts`

Add:
- `ACCESS_TAB = 'Access'` (replacing `'GlobalAccess'`)
- `ACCESS_COL = { NAME: 0, EMAIL: 1, ROLE: 2, NUCLEUS: 3 }` constant (distinct from existing `ACC_COL` which is for workers)

### API routes

**`/api/initial-data`** (GET)
- Returns `access: { roleMap: Record<string, Role> }` instead of `role: 'global' | 'contact'`
- Returns 403 if `roleMap` is empty (no entries for this user)

**`/api/nucleus`** (GET + POST)
- GET: allowed if user has any role (`read`, `read-write`, or `admin`) for the requested nucleus
- POST: allowed only if user has `read-write` or `admin` for the requested nucleus; blocked for `read`
- POST identity fields: server strips identity fields from the save payload unless the caller has `admin` for that nucleus (defense-in-depth — the client also hides them)

**`/api/access`** (new route)
- GET: returns access entries the calling admin can see (filtered to nuclei they admin, plus `*` entries)
- POST: adds a new entry; validates caller has admin on the specified nucleus (or `*`)
- DELETE: removes an entry by matching email+nucleus; same validation

## Frontend

### `src/types.ts`

```ts
// Replace:
export interface InitialData {
  role: 'global' | 'contact';
  ...
}

// With:
export interface InitialData {
  access: { roleMap: Record<string, Role> };
  rows: NucleusSummary[];
  email: string;
  srpNames: string[];
  spreadsheetUrl: string;
}
```

### Field editability per role

| Field group | read | read-write | admin |
|-------------|------|------------|-------|
| Identity fields (nucleus, parentNucleus, grouping, cluster, pg, clusterCode, type) | display only | display only | editable |
| Standard fields (locality, stage, contact, email, makeup, activities, etc.) | display only | editable | editable |
| Worker lists (accompaniers, protagonists, abm-assistants) | display only | editable | editable |

The client derives the effective role for the current nucleus from `roleMap[nucleusName] ?? roleMap['*']`.

### Manage Access panel

- Visible only when effective role for current nucleus is `admin`
- Rendered as a collapsible section in the detail view
- Shows current access entries for that nucleus (and `*` entries)
- **Add**: name + email + role fields → POST `/api/access`
- **Remove**: button per entry → DELETE `/api/access`
- An admin with `nucleus=*` sees all entries across all nuclei

### Save button

- Hidden (or disabled) when effective role is `read`
- Standard fields save payload: unchanged from today
- Identity fields save payload: only included when effective role is `admin`

## Out of Scope

- Bulk access import
- Access audit log
- Email notifications when access is granted/revoked
- Expiring access grants
