# Authorization Model v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-role GlobalAccess model with a per-nucleus, three-role (read / read-write / admin) access system backed by a new `Access` sheet tab with an in-app management UI.

**Architecture:** A new `Access` tab (columns: name, email, role, nucleus) replaces the `GlobalAccess` tab. `getAccess(email)` replaces `getAuthorizedRows(email)`, returning a per-nucleus `roleMap`. API routes enforce roles server-side; the `DetailView` component renders fields conditionally based on the effective role for the current nucleus.

**Tech Stack:** Next.js App Router, TypeScript, Google Sheets API (via existing `sheets.ts` helpers), Vitest for unit tests, NextAuth for session.

## Global Constraints

- All work lives under `web/` — run all commands from that directory
- Test command: `npm test` (runs vitest)
- Deployment: `npm run build` must pass before any commit touching API routes
- Access tab name: `'Access'` (column order: name=0, email=1, role=2, nucleus=3)
- Role values (exact strings, lowercase): `'read'`, `'read-write'`, `'admin'`
- Nucleus wildcard: `'*'` (asterisk) means all nuclei
- Per-nucleus role resolution: `roleMap[nucleusName] ?? roleMap['*'] ?? undefined`
- Case-insensitive email comparison throughout (use existing `norm()` helpers)
- Contact email column (col 10 on Nuclei tab): becomes display-only — no code reads it for access decisions after this change
- `nucleusType` and `nucleus` name fields: editable by admin; nucleus name changing requires no special handling (save uses the pre-change name to locate the row, then overwrites)

---

## Task 1: Config constants

**Files:**
- Modify: `web/src/lib/config.ts`

**Interfaces:**
- Produces: `ACCESS_TAB`, `ACCESS_COL` exported from `config.ts`

- [ ] **Step 1: Add `ACCESS_COL` and rename `ACCESS_TAB` in config**

Open `web/src/lib/config.ts`. Replace:
```ts
export const ACCESS_TAB  = 'GlobalAccess';
```
with:
```ts
export const ACCESS_TAB  = 'Access';
```
Then add at the bottom, after the `ACC_COL` block:
```ts
export const ACCESS_COL = {
  NAME:    0,
  EMAIL:   1,
  ROLE:    2,
  NUCLEUS: 3,
} as const;
```

- [ ] **Step 2: Verify build still compiles**

```bash
npm run build
```
Expected: build succeeds (the only change is a tab name string and a new export).

- [ ] **Step 3: Commit**

```bash
git add src/lib/config.ts
git commit -m "feat: add ACCESS_COL constant; rename ACCESS_TAB to 'Access'"
```

---

## Task 2: Role types and updated InitialData

**Files:**
- Modify: `web/src/types.ts`

**Interfaces:**
- Produces: `Role`, `AccessEntry` exported types; updated `InitialData`

- [ ] **Step 1: Add `Role` and `AccessEntry`; update `InitialData`**

Open `web/src/types.ts`. Add after the existing imports (there are none — add at the top):
```ts
export type Role = 'read' | 'read-write' | 'admin';

export interface AccessEntry {
  name: string;
  email: string;
  role: Role;
  nucleus: string; // specific nucleus name or '*' for all
}
```

Replace the existing `InitialData` interface:
```ts
// REMOVE:
export interface InitialData {
  role: 'global' | 'contact';
  rows: NucleusSummary[];
  email: string;
  srpNames: string[];
  spreadsheetUrl: string;
}

// ADD:
export interface InitialData {
  access: { roleMap: Record<string, Role> };
  rows: NucleusSummary[];
  email: string;
  srpNames: string[];
  spreadsheetUrl: string;
}
```

- [ ] **Step 2: Verify build compiles (it will fail — that's expected)**

```bash
npm run build 2>&1 | head -40
```
Expected: TypeScript errors about `role` no longer existing on `InitialData`. These will be fixed in later tasks. Note the error count — you'll verify it goes to zero by the end.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Role and AccessEntry types; update InitialData shape"
```

---

## Task 3: Access data layer

**Files:**
- Modify: `web/src/lib/data.ts`
- Modify: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: `sheetsGet`, `sheetsClear`, `sheetsBatchUpdate` from `./sheets`; `MASTER_SHEET_ID`, `ACCESS_TAB`, `ACCESS_COL`, `WORKERS_DATA_ROW` from `./config`; `Role`, `AccessEntry` from `@/types`
- Produces: `getAccessEntries(): Promise<AccessEntry[]>`, `saveAccessEntries(entries: AccessEntry[]): Promise<void>`

- [ ] **Step 1: Write failing tests for getAccessEntries and saveAccessEntries**

Open `web/src/lib/data.test.ts`. Add at the bottom (after existing `saveWorkerNames` describe block):

```ts
import { getAccessEntries, saveAccessEntries } from './data';
import { ACCESS_COL } from './config';
import type { AccessEntry } from '@/types';

describe('getAccessEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  test('returns parsed access entries from sheet', async () => {
    mockSheetsGet.mockResolvedValue([
      ['Alice Smith', 'alice@x.com', 'admin', '*'],
      ['Bob Jones',   'bob@x.com',   'read',  'Alpha'],
    ]);
    const result = await getAccessEntries();
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice Smith', email: 'alice@x.com', role: 'admin', nucleus: '*' });
    expect(result[1]).toEqual({ name: 'Bob Jones',   email: 'bob@x.com',   role: 'read',  nucleus: 'Alpha' });
  });

  test('skips rows with missing email', async () => {
    mockSheetsGet.mockResolvedValue([
      ['Alice', 'alice@x.com', 'read-write', 'Beta'],
      ['',      '',            'read',       'Gamma'],
    ]);
    const result = await getAccessEntries();
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('alice@x.com');
  });

  test('returns empty array when tab is empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    const result = await getAccessEntries();
    expect(result).toEqual([]);
  });
});

describe('saveAccessEntries', () => {
  beforeEach(() => vi.clearAllMocks());

  const entries: AccessEntry[] = [
    { name: 'Alice', email: 'alice@x.com', role: 'admin',      nucleus: '*'     },
    { name: 'Bob',   email: 'bob@x.com',   role: 'read-write', nucleus: 'Alpha' },
  ];

  test('clears tab and writes all entries', async () => {
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveAccessEntries(entries);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(['Alice', 'alice@x.com', 'admin',      '*'    ]);
    expect(rows[1]).toEqual(['Bob',   'bob@x.com',   'read-write', 'Alpha']);
  });

  test('clears without writing when entries list is empty', async () => {
    mockSheetsClear.mockResolvedValue(undefined);

    await saveAccessEntries([]);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- data.test.ts
```
Expected: FAIL — `getAccessEntries` and `saveAccessEntries` not found.

- [ ] **Step 3: Add getAccessEntries and saveAccessEntries to data.ts**

Open `web/src/lib/data.ts`. In the existing `./config` import, add `ACCESS_COL` to the list. Then add the `@/types` import after it:
```ts
// In the existing import, add ACCESS_COL:
import {
  MASTER_SHEET_ID, SRP_SHEET_ID,
  MASTER_TAB, ACCESS_TAB, DEV_TAB, EDU_TAB,
  MASTER_DATA_ROW, SRP_DATA_ROW,
  COL, DEV_COL, EDU_COL,
  WORKERS_TAB, WORKERS_DATA_ROW, ACC_COL,
  ACCESS_COL,          // ← add this
} from './config';

// Add after the existing import block:
import type { AccessEntry } from '@/types';
```

Then add these two functions before `getAllMasterRows`:

```ts
export async function getAccessEntries(): Promise<AccessEntry[]> {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${ACCESS_TAB}!A:D`);
  return rows
    .filter(r => (r[ACCESS_COL.EMAIL] || '').trim() !== '')
    .map(r => ({
      name:    r[ACCESS_COL.NAME]    || '',
      email:   r[ACCESS_COL.EMAIL]   || '',
      role:    (r[ACCESS_COL.ROLE]   || 'read') as AccessEntry['role'],
      nucleus: r[ACCESS_COL.NUCLEUS] || '*',
    }));
}

export async function saveAccessEntries(entries: AccessEntry[]): Promise<void> {
  await sheetsClear(MASTER_SHEET_ID, `${ACCESS_TAB}!A:D`);
  if (entries.length === 0) return;
  await sheetsBatchUpdate(MASTER_SHEET_ID, [{
    range: `${ACCESS_TAB}!A1`,
    values: entries.map(e => [e.name, e.email, e.role, e.nucleus]),
  }]);
}
```

Also remove the existing `getGlobalList` function (it is no longer used).

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- data.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.ts src/lib/data.test.ts
git commit -m "feat: add getAccessEntries and saveAccessEntries; remove getGlobalList"
```

---

## Task 4: Replace getAuthorizedRows with getAccess

**Files:**
- Modify: `web/src/lib/access.ts`
- Modify: `web/src/lib/access.test.ts`

**Interfaces:**
- Consumes: `getAccessEntries()` from `./data`; `getAllMasterRows()` from `./data`; `Role`, `AccessEntry` from `@/types`
- Produces:
  ```ts
  interface UserAccess {
    entries: AccessEntry[];        // this user's own entries (for admin panel display)
    roleMap: Record<string, Role>; // nucleus-or-'*' → effective role
    rows: string[][];              // master rows this user is allowed to see
  }
  getAccess(email: string): Promise<UserAccess | { role: 'none'; rows: [] }>
  ```

- [ ] **Step 1: Write failing tests**

Replace the entire contents of `web/src/lib/access.test.ts` with:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { COL } from './config';
import type { AccessEntry, Role } from '@/types';

vi.mock('./data', () => ({
  getAllMasterRows: vi.fn(),
  getAccessEntries: vi.fn(),
}));

import { getAccess } from './access';
import { getAllMasterRows, getAccessEntries } from './data';

function makeRow(overrides: Record<number, string> = {}): string[] {
  const row = new Array(51).fill('');
  Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
  return row;
}

const mockGetAllMasterRows = vi.mocked(getAllMasterRows);
const mockGetAccessEntries = vi.mocked(getAccessEntries);

const rows = [
  makeRow({ [COL.NUCLEUS]: 'Alpha' }),
  makeRow({ [COL.NUCLEUS]: 'Beta'  }),
  makeRow({ [COL.NUCLEUS]: 'Gamma' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllMasterRows.mockResolvedValue(rows);
});

describe('getAccess', () => {
  test('returns none when user has no entries', async () => {
    mockGetAccessEntries.mockResolvedValue([]);
    const result = await getAccess('stranger@x.com');
    expect(result.role).toBe('none');
    expect(result.rows).toHaveLength(0);
  });

  test('wildcard entry grants access to all rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'read-write', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(3);
    expect(result.roleMap['*']).toBe('read-write');
  });

  test('specific nucleus entry grants access to only that nucleus row', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Bob', email: 'bob@x.com', role: 'read', nucleus: 'Alpha' },
    ]);
    const result = await getAccess('bob@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][COL.NUCLEUS]).toBe('Alpha');
    expect(result.roleMap['Alpha']).toBe('read');
  });

  test('multiple entries for same user union their rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Eve', email: 'eve@x.com', role: 'read',       nucleus: 'Alpha' },
      { name: 'Eve', email: 'eve@x.com', role: 'read-write', nucleus: 'Beta'  },
    ]);
    const result = await getAccess('eve@x.com');
    expect(result.role).not.toBe('none');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(2);
    expect(result.roleMap['Alpha']).toBe('read');
    expect(result.roleMap['Beta']).toBe('read-write');
  });

  test('higher role wins when same nucleus appears twice', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Eve', email: 'eve@x.com', role: 'read',  nucleus: 'Alpha' },
      { name: 'Eve', email: 'eve@x.com', role: 'admin', nucleus: 'Alpha' },
    ]);
    const result = await getAccess('eve@x.com');
    if (result.role === 'none') return;
    expect(result.roleMap['Alpha']).toBe('admin');
    expect(result.rows).toHaveLength(1);
  });

  test('email comparison is case-insensitive', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'Alice@X.COM', role: 'read', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    expect(result.role).not.toBe('none');
  });

  test('wildcard entry also adds all master rows to result.rows', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'admin', nucleus: '*' },
    ]);
    const result = await getAccess('alice@x.com');
    if (result.role === 'none') return;
    expect(result.rows).toHaveLength(3);
  });

  test('entries field contains only this user\'s entries', async () => {
    mockGetAccessEntries.mockResolvedValue([
      { name: 'Alice', email: 'alice@x.com', role: 'admin', nucleus: '*'    },
      { name: 'Bob',   email: 'bob@x.com',   role: 'read',  nucleus: 'Beta' },
    ]);
    const result = await getAccess('alice@x.com');
    if (result.role === 'none') return;
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].email).toBe('alice@x.com');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- access.test.ts
```
Expected: FAIL — `getAccess` not found.

- [ ] **Step 3: Rewrite access.ts**

Replace the entire contents of `web/src/lib/access.ts` with:

```ts
import { getAllMasterRows, getAccessEntries } from './data';
import { COL } from './config';
import type { Role, AccessEntry } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const ROLE_RANK: Record<Role, number> = { 'read': 1, 'read-write': 2, 'admin': 3 };

function higher(a: Role, b: Role): Role {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export interface UserAccess {
  role: Role;
  entries: AccessEntry[];
  roleMap: Record<string, Role>;
  rows: string[][];
}

export async function getAccess(email: string): Promise<UserAccess | { role: 'none'; rows: [] }> {
  const [allRows, allEntries] = await Promise.all([getAllMasterRows(), getAccessEntries()]);

  const userEntries = allEntries.filter(e => norm(e.email) === norm(email));
  if (userEntries.length === 0) return { role: 'none', rows: [] };

  const roleMap: Record<string, Role> = {};
  for (const entry of userEntries) {
    const key = entry.nucleus;
    roleMap[key] = key in roleMap ? higher(roleMap[key], entry.role) : entry.role;
  }

  const hasWildcard = '*' in roleMap;
  const nucleusSet = new Set(Object.keys(roleMap).map(norm));
  const rows = hasWildcard
    ? allRows
    : allRows.filter(r => nucleusSet.has(norm(r[COL.NUCLEUS])));

  // Determine top-level role (highest across all entries — used only for
  // quick 'access denied' vs 'has some access' checks at the route level)
  const topRole = Object.values(roleMap).reduce(higher);

  return { role: topRole, entries: userEntries, roleMap, rows };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- access.test.ts
```
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/access.ts src/lib/access.test.ts
git commit -m "feat: replace getAuthorizedRows with getAccess using per-nucleus roleMap"
```

---

## Task 5: Update /api/initial-data, /api/nucleus, /api/workers

**Files:**
- Modify: `web/src/app/api/initial-data/route.ts`
- Modify: `web/src/app/api/nucleus/route.ts`
- Modify: `web/src/app/api/workers/route.ts`

**Interfaces:**
- Consumes: `getAccess(email)` from `@/lib/access`; `UserAccess` from `@/lib/access`

The identity fields that admins can save (beyond the standard `FormData` fields):
`nucleus`, `parentNucleus`, `grouping`, `cluster`, `pg`, `clusterCode`, `nucleusType`

These are passed from the client in `formData.identity` and written to the sheet only when the caller has `admin` role for that nucleus.

- [ ] **Step 1: Update /api/initial-data/route.ts**

Replace the entire file:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAllDevRows } from '@/lib/data';
import { COL, DEV_COL } from '@/lib/config';

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = req.auth.user.email;
  const access = await getAccess(email);

  if (access.role === 'none') {
    return NextResponse.json(
      { error: `Access denied. Your account (${email}) is not authorized.` },
      { status: 403 }
    );
  }

  const authorizedRows = access.rows
    .filter(r => (r[COL.NUCLEUS] || '').trim() !== '')
    .map(r => ({
      nucleus:       r[COL.NUCLEUS],
      parentNucleus: r[COL.PARENT_NUCLEUS],
      grouping:      r[COL.GROUPING],
      cluster:       r[COL.CLUSTER],
      locality:      r[COL.LOCALITY],
      nucleusType:   r[COL.TYPE],
      stage:         r[COL.STAGE],
    }));

  const devRows = await getAllDevRows();
  const srpNames = devRows.map(r => (r[DEV_COL.NAME] || '').toLowerCase().trim());
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.MASTER_SHEET_ID}`;

  return NextResponse.json({
    access: { roleMap: access.roleMap },
    rows: authorizedRows,
    email,
    srpNames,
    spreadsheetUrl,
  });
});
```

- [ ] **Step 2: Update /api/nucleus/route.ts**

Replace the entire file:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getRowData, saveRowData } from '@/lib/data';
import { COL } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[nucleus] ?? roleMap['*'] ?? null;
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const data = await getRowData(name);
  if (!data) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });

  return NextResponse.json(data);
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, formData } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip identity block unless caller is admin (defense-in-depth)
  if (role !== 'admin' && formData.identity) {
    delete formData.identity;
  }

  const result = await saveRowData(name, formData, email);
  return NextResponse.json(result);
});
```

- [ ] **Step 3: Update /api/workers/route.ts**

Replace the `getAuthorizedRows` import and all access checks. Replace the entire file:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAllMasterRows, getWorkerNames, saveWorkerNames } from '@/lib/data';
import { COL, WORKER_TYPES } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[nucleus] ?? roleMap['*'] ?? null;
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if (!effectiveRole(access.roleMap, name)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const names = await getWorkerNames(name, type);
  return NextResponse.json({ names });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, names } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allRows = await getAllMasterRows();
  const masterRow = allRows.find(r => norm(r[COL.NUCLEUS]) === norm(nucleus));
  if (!masterRow) return NextResponse.json({ error: `Not found: ${nucleus}` }, { status: 404 });

  const context = {
    cluster:       masterRow[COL.CLUSTER],
    clusterCode:   masterRow[COL.CLUSTER_CODE],
    locality:      masterRow[COL.LOCALITY],
    parentNucleus: masterRow[COL.PARENT_NUCLEUS],
  };

  await saveWorkerNames(masterRow[COL.NUCLEUS], type, names, context);
  return NextResponse.json({ success: true });
});
```

- [ ] **Step 4: Update saveRowData in data.ts to handle identity fields**

Open `web/src/lib/data.ts`. In `saveRowData`, add identity field updates when `d.identity` is present. Find the `updates` array declaration and add the following block just before the `.map(...)` call:

```ts
  // Identity fields — only present when caller has admin role (enforced by /api/nucleus)
  const identityUpdates: [number, unknown][] = d.identity ? [
    [COL.NUCLEUS,        d.identity.nucleus],
    [COL.PARENT_NUCLEUS, d.identity.parentNucleus],
    [COL.GROUPING,       d.identity.grouping],
    [COL.CLUSTER,        d.identity.cluster],
    [COL.PG,             d.identity.pg],
    [COL.CLUSTER_CODE,   d.identity.clusterCode],
    [COL.TYPE,           d.identity.nucleusType],
  ] : [];

  const updates = [
    [COL.LOCALITY, d.locality], ...
```

The complete updated `saveRowData` function (replace the existing one):

```ts
export async function saveRowData(nucleusName: string, formData: Record<string, unknown>, userEmail: string) {
  const allRows = await getAllMasterRows();
  const rowIndex = allRows.findIndex(r => norm(r[COL.NUCLEUS]) === norm(nucleusName));
  if (rowIndex === -1) throw new Error(`Row not found: ${nucleusName}`);

  const sheetRow = MASTER_DATA_ROW + rowIndex;
  const d = formData as any;
  const colLetter = (i: number) => {
    let letter = '', idx = i + 1;
    while (idx > 0) { const rem = (idx - 1) % 26; letter = String.fromCharCode(65 + rem) + letter; idx = Math.floor((idx - 1) / 26); }
    return letter;
  };

  const identityPairs: [number, unknown][] = d.identity ? [
    [COL.NUCLEUS,        d.identity.nucleus],
    [COL.PARENT_NUCLEUS, d.identity.parentNucleus],
    [COL.GROUPING,       d.identity.grouping],
    [COL.CLUSTER,        d.identity.cluster],
    [COL.PG,             d.identity.pg],
    [COL.CLUSTER_CODE,   d.identity.clusterCode],
    [COL.TYPE,           d.identity.nucleusType],
  ] : [];

  const updates = [
    ...identityPairs,
    [COL.LOCALITY, d.locality], [COL.STAGE, d.stage], [COL.CONTACT, d.contact],
    [COL.EMAIL, d.email], [COL.AUX_BOARD, d.auxBoard], [COL.MAKEUP, d.makeup],
    [COL.TOTAL_POP, d.totalPop], [COL.TOTAL_HH, d.totalHH],
    [COL.IND_NUM, d.indNum],
    [COL.HH_NUM, d.hhNum],
    [COL.CC_ACT, d.activities.ccs.act], [COL.CC_PART, d.activities.ccs.part], [COL.CC_FOF, d.activities.ccs.fof],
    [COL.JYG_ACT, d.activities.jygs.act], [COL.JYG_PART, d.activities.jygs.part], [COL.JYG_FOF, d.activities.jygs.fof],
    [COL.SC_ACT, d.activities.scs.act], [COL.SC_PART, d.activities.scs.part], [COL.SC_FOF, d.activities.scs.fof],
    [COL.DEV_ACT, d.activities.devotionals.act], [COL.DEV_PART, d.activities.devotionals.part], [COL.DEV_FOF, d.activities.devotionals.fof],
    [COL.PROTAGONISTS, d.protagonists], [COL.ACCOMPANIERS, d.accompaniers],
    [COL.LEVEL, d.level], [COL.NOTES_PREVALENCE, d.notesPrevalence],
    [COL.SUPPORTED, d.supported], [COL.NOTES_SUPPORTED, d.notesSupported],
    [COL.PRESENCE, d.presence], [COL.NOTES_PRESENCE, d.notesPresence],
    [COL.INVOLVED, d.involved], [COL.NOTES_INVOLVED, d.notesInvolved],
    [COL.EFFORTS, d.efforts], [COL.NOTES_EFFORTS, d.notesEfforts],
    [COL.GATHERINGS, d.gatherings], [COL.NOTES_GATHERINGS, d.notesGatherings],
  ].map(([col, value]) => ({
    range: `${MASTER_TAB}!${colLetter(col as number)}${sheetRow}`,
    values: [[value ?? '']],
  }));

  await sheetsBatchUpdate(MASTER_SHEET_ID, updates);
  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
}
```

- [ ] **Step 5: Verify build compiles**

```bash
npm run build 2>&1 | grep -c "error"
```
Expected: same or fewer errors than after Task 2 (frontend types still need updating).

- [ ] **Step 6: Commit**

```bash
git add src/app/api/initial-data/route.ts src/app/api/nucleus/route.ts src/app/api/workers/route.ts src/lib/data.ts
git commit -m "feat: update API routes to use getAccess roleMap; add identity field save for admin"
```

---

## Task 6: New /api/access route

**Files:**
- Create: `web/src/app/api/access/route.ts`

**Interfaces:**
- Consumes: `getAccess()`, `UserAccess` from `@/lib/access`; `getAccessEntries()`, `saveAccessEntries()` from `@/lib/data`; `AccessEntry`, `Role` from `@/types`
- GET response: `{ entries: AccessEntry[] }` — filtered to nuclei the caller admins
- POST body: `AccessEntry` — adds one entry; returns `{ success: true }`
- DELETE body: `{ email: string; nucleus: string }` — removes matching entry; returns `{ success: true }`

- [ ] **Step 1: Create the route**

Create `web/src/app/api/access/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAccessEntries, saveAccessEntries } from '@/lib/data';
import type { AccessEntry, Role } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const ROLES: Role[] = ['read', 'read-write', 'admin'];

function callerCanManage(roleMap: Record<string, Role>, nucleus: string): boolean {
  const role = roleMap[nucleus] ?? roleMap['*'] ?? null;
  return role === 'admin';
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const adminNuclei = new Set(
    Object.entries(access.roleMap)
      .filter(([, role]) => role === 'admin')
      .map(([nucleus]) => nucleus)
  );
  if (adminNuclei.size === 0) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allEntries = await getAccessEntries();

  const hasGlobalAdmin = adminNuclei.has('*');
  const visible = hasGlobalAdmin
    ? allEntries
    : allEntries.filter(e => adminNuclei.has(e.nucleus) || e.nucleus === '*');

  return NextResponse.json({ entries: visible });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json() as Partial<AccessEntry>;
  const { name, email, role, nucleus } = body;
  if (!name || !email || !role || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: name, email, role, nucleus' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  const callerAccess = await getAccess(req.auth.user.email);
  if (!callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  await saveAccessEntries([...existing, { name, email, role, nucleus }]);
  return NextResponse.json({ success: true });
});

export const DELETE = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { email, nucleus } = await req.json() as { email: string; nucleus: string };
  if (!email || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: email, nucleus' }, { status: 400 });
  }

  const callerAccess = await getAccess(req.auth.user.email);
  if (!callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  const updated = existing.filter(
    e => !(norm(e.email) === norm(email) && e.nucleus === nucleus)
  );
  await saveAccessEntries(updated);
  return NextResponse.json({ success: true });
});
```

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | grep "api/access"
```
Expected: no errors for the new route file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/access/route.ts
git commit -m "feat: add /api/access route for admin grant/revoke"
```

---

## Task 7: Frontend — role-aware AppClient and DetailView

**Files:**
- Modify: `web/src/components/AppClient.tsx`
- Modify: `web/src/components/DetailView.tsx`

**Interfaces:**
- `DetailView` gets a new required prop: `role: Role` (the effective role for the current nucleus)
- `AppClient` computes `role` from `initialData.access.roleMap` and the selected nucleus name
- Identity fields (nucleus, parentNucleus, grouping, cluster, pg, clusterCode, nucleusType) become editable inputs when `role === 'admin'`
- Standard fields currently shown as `readonly` from `row.*` in the Identity section (locality, stage, contact, email, auxBoard) switch to `form.*` editable inputs for `role !== 'read'`
- Save button hidden when `role === 'read'`
- Footer "Save to spreadsheet" button hidden when `role === 'read'`

- [ ] **Step 1: Update AppClient.tsx**

Replace the entire file:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { InitialData, NucleusDetail, Role } from '@/types';
import Picker from './Picker';
import DetailView from './DetailView';

export default function AppClient() {
  const [initialData, setInitialData] = useState<InitialData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<NucleusDetail | null>(null);
  const [selectedNucleus, setSelectedNucleus] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetch('/api/initial-data')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setInitialData(data);
        if (data.rows.length === 1) loadNucleus(data.rows[0].nucleus);
      })
      .catch(() => setError('Failed to load. Please refresh.'));
  }, []);

  function loadNucleus(name: string) {
    setLoadingDetail(true);
    setSelectedNucleus(name);
    setDetail(null);
    fetch(`/api/nucleus?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setDetail(data);
      })
      .catch(() => setError('Failed to load nucleus.'))
      .finally(() => setLoadingDetail(false));
  }

  function handleBack() {
    setDetail(null);
    setSelectedNucleus(null);
  }

  if (error) {
    return (
      <div className="error-state">
        <div>{error}</div>
        <button
          onClick={() => window.location.href = '/signout'}
          style={{ marginTop: 16, fontSize: 13, color: '#3182ce', background: 'none', border: '1px solid #bee3f8', borderRadius: 6, padding: '6px 16px', cursor: 'pointer' }}
        >
          Login with a different account
        </button>
      </div>
    );
  }

  if (!initialData || loadingDetail) {
    return <div className="loading-state">Loading...</div>;
  }

  if (detail && selectedNucleus) {
    const roleMap = initialData.access.roleMap;
    const role: Role = (roleMap[selectedNucleus] ?? roleMap['*'] ?? 'read') as Role;
    return (
      <DetailView
        detail={detail}
        role={role}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        spreadsheetUrl={initialData.spreadsheetUrl}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }

  return (
    <Picker
      rows={initialData.rows}
      email={initialData.email}
      srpNames={initialData.srpNames}
      onSelect={loadNucleus}
      onSignOut={() => window.location.href = '/signout'}
    />
  );
}
```

- [ ] **Step 2: Update DetailView.tsx — add role prop and identity field editability**

Open `web/src/components/DetailView.tsx`. Make the following changes:

**2a. Update the Props interface** — add `role: Role`:
```tsx
// Add import at top:
import type { Role } from '@/types';

// Update Props:
interface Props {
  detail: NucleusDetail;
  role: Role;
  email: string;
  showBack: boolean;
  spreadsheetUrl: string;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
}
```

**2b. Update FormState** to include identity fields for admin editing:
```tsx
// Replace:
type FormState = Omit<NucleusRow, 'nucleus' | 'parentNucleus' | 'grouping' | 'cluster' | 'pg' | 'clusterCode'>;

// With:
type FormState = NucleusRow;
```

**2c. Update rowToForm** to include all fields:
```tsx
// Replace:
function rowToForm(row: NucleusRow): FormState {
  const { nucleus: _n, parentNucleus: _p, grouping: _g, cluster: _c, pg: _pg, clusterCode: _cc, ...rest } = row;
  return rest;
}

// With:
function rowToForm(row: NucleusRow): FormState {
  return { ...row };
}
```

**2d. Update the component signature** to destructure `role`:
```tsx
export default function DetailView({ detail, role, email, showBack, spreadsheetUrl, onBack, onSaved }: Props) {
```

**2e. Derive convenience booleans** right after the state declarations:
```tsx
  const canWrite  = role === 'read-write' || role === 'admin';
  const isAdmin   = role === 'admin';
  const isReadOnly = role === 'read';
```

**2f. Update handleSave** to include identity fields when admin:
```tsx
  async function handleSave() {
    setSaving(true);
    setSaveStatus({ msg: 'Saving...', type: 'idle' });
    try {
      const payload: Record<string, unknown> = { ...form };
      if (isAdmin) {
        payload.identity = {
          nucleus:        form.nucleus,
          parentNucleus:  form.parentNucleus,
          grouping:       form.grouping,
          cluster:        form.cluster,
          pg:             form.pg,
          clusterCode:    form.clusterCode,
          nucleusType:    form.nucleusType,
        };
      }
      const res = await fetch('/api/nucleus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: row.nucleus, formData: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSaveStatus({ msg: 'Saved successfully', type: 'success' });
      setIsDirty(false);
      setLastUpdatedBy(data.savedBy || email);
      setLastUpdatedAt(data.savedAt || new Date().toISOString());
      onSaved(data.savedBy || email, data.savedAt || new Date().toISOString());
    } catch (e: unknown) {
      setSaveStatus({ msg: `Save failed: ${e instanceof Error ? e.message : String(e)}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  }
```

**2g. Update the Identity card** to use conditional editability. Replace the entire Identity card JSX block:

```tsx
        {/* Identity */}
        <div className="card">
          <div className="card-header">Identity</div>
          <div className="card-body">
            <div className="field-grid-4">
              <Field label="Grouping"     value={form.grouping}    onChange={isAdmin ? v => set('grouping', v)    : undefined} readonly={!isAdmin} />
              <Field label="Cluster Code" value={form.clusterCode} onChange={isAdmin ? v => set('clusterCode', v) : undefined} readonly={!isAdmin} />
              <Field label="Cluster"      value={form.cluster}     onChange={isAdmin ? v => set('cluster', v)     : undefined} readonly={!isAdmin} />
              <Field label="PG"           value={form.pg}          onChange={isAdmin ? v => set('pg', v)          : undefined} readonly={!isAdmin} />
            </div>
            <div className="field-grid-4">
              <Field label="Locality"         value={form.locality}     onChange={canWrite ? v => set('locality', v)     : undefined} readonly={!canWrite} />
              <Field label="Nucleus / Pocket" value={form.nucleus}      onChange={isAdmin  ? v => set('nucleus', v)      : undefined} readonly={!isAdmin} />
              <Field label="Type"             value={form.nucleusType}  onChange={isAdmin  ? v => set('nucleusType', v)  : undefined} readonly={!isAdmin} />
              <Field label="Stage"            value={form.stage}        onChange={canWrite ? v => set('stage', v)        : undefined} readonly={!canWrite} />
            </div>
            <div className="field-grid-4">
              <Field label="Contact"                   value={form.contact}  onChange={canWrite ? v => set('contact', v)  : undefined} readonly={!canWrite} />
              <Field label="Contact Email"             value={form.email}    onChange={canWrite ? v => set('email', v)    : undefined} readonly={!canWrite} />
              <Field label="Auxiliary Board Member(s)" value={form.auxBoard} onChange={canWrite ? v => set('auxBoard', v) : undefined} readonly={!canWrite} />
              <Field
                label="ABm Assistant"
                value={abmAssistantNames.join(', ')}
                readonly
                onLabelClick={() => setShowAbmAssistantModal(true)}
              />
            </div>
          </div>
        </div>
```

**2h. Hide save buttons when read-only.** Find the save button in the page header:
```tsx
// Replace:
          <button className="save-btn" disabled={saving || hasIntErrors} onClick={handleSave} ...>

// With:
          {!isReadOnly && (
            <button className="save-btn" disabled={saving || hasIntErrors} onClick={handleSave} title="Save to spreadsheet" aria-label="Save to spreadsheet" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px' }}>
              <IcoSave /><span className="save-btn-label">Save</span>
            </button>
          )}
```

And the footer buttons:
```tsx
// Replace the footer:
      <div className="footer">
        <span className={`save-status${saveStatus.type !== 'idle' ? ` ${saveStatus.type}` : ''}`}>
          {saveStatus.msg}
        </span>
        {!isReadOnly && (
          <>
            <button className="btn-cancel" onClick={handleDiscard}>Discard changes</button>
            <button className="btn-save" disabled={saving || hasIntErrors} onClick={handleSave}>Save to spreadsheet</button>
          </>
        )}
      </div>
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | grep -c "error"
```
Expected: 0 TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppClient.tsx src/components/DetailView.tsx
git commit -m "feat: role-aware DetailView — identity fields editable for admin, save hidden for read"
```

---

## Task 8: Manage Access panel

**Files:**
- Create: `web/src/components/AccessPanel.tsx`
- Modify: `web/src/components/DetailView.tsx`

**Interfaces:**
- `AccessPanel` props:
  ```ts
  interface AccessPanelProps {
    nucleusName: string;   // current nucleus name (used to filter entries and POST)
    roleMap: Record<string, Role>; // caller's roleMap (to determine scope shown)
  }
  ```
- Panel fetches entries from `GET /api/access` on mount
- Add entry: POST `/api/access` with `{ name, email, role, nucleus }`
- Remove entry: DELETE `/api/access` with `{ email, nucleus }`

- [ ] **Step 1: Create AccessPanel.tsx**

Create `web/src/components/AccessPanel.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import type { AccessEntry, Role } from '@/types';

interface Props {
  nucleusName: string;
  roleMap: Record<string, Role>;
}

const ROLES: Role[] = ['read', 'read-write', 'admin'];

export default function AccessPanel({ nucleusName, roleMap }: Props) {
  const [entries, setEntries] = useState<AccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<Role>('read');
  const [newNucleus, setNewNucleus] = useState(nucleusName);
  const [saving, setSaving] = useState(false);

  const hasGlobalAdmin = roleMap['*'] === 'admin';

  useEffect(() => {
    fetch('/api/access')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setEntries(data.entries);
      })
      .catch(() => setError('Failed to load access entries.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd() {
    if (!newName.trim() || !newEmail.trim()) return;
    setSaving(true);
    const entry: AccessEntry = {
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      nucleus: newNucleus,
    };
    const res = await fetch('/api/access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error || 'Failed to add'); return; }
    setEntries(prev => [...prev, entry]);
    setNewName('');
    setNewEmail('');
    setNewRole('read');
    setNewNucleus(nucleusName);
  }

  async function handleRemove(entry: AccessEntry) {
    const res = await fetch('/api/access', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: entry.email, nucleus: entry.nucleus }),
    });
    if (!res.ok) return;
    setEntries(prev => prev.filter(e => !(e.email === entry.email && e.nucleus === entry.nucleus)));
  }

  if (loading) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>Loading access...</div>;
  if (error) return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{error}</div>;

  return (
    <div style={{ marginTop: 12 }}>
      {entries.length === 0 ? (
        <div style={{ fontSize: 13, color: '#718096', marginBottom: 12 }}>No access entries yet.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Name</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Email</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Role</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 600, color: '#4a5568' }}>Nucleus</th>
              <th style={{ width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f7fafc' }}>
                <td style={{ padding: '4px 8px' }}>{e.name}</td>
                <td style={{ padding: '4px 8px', color: '#718096' }}>{e.email}</td>
                <td style={{ padding: '4px 8px' }}>{e.role}</td>
                <td style={{ padding: '4px 8px', color: '#718096' }}>{e.nucleus}</td>
                <td style={{ padding: '4px 8px' }}>
                  <button
                    onClick={() => handleRemove(e)}
                    style={{ fontSize: 12, color: '#e53e3e', background: 'none', border: '1px solid #fed7d7', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 140px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Name</label>
          <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full name" style={{ fontSize: 13 }} />
        </div>
        <div className="field" style={{ flex: '1 1 180px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Email</label>
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" style={{ fontSize: 13 }} />
        </div>
        <div className="field" style={{ flex: '0 1 120px', margin: 0 }}>
          <label style={{ fontSize: 12 }}>Role</label>
          <select value={newRole} onChange={e => setNewRole(e.target.value as Role)} style={{ fontSize: 13 }}>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {hasGlobalAdmin && (
          <div className="field" style={{ flex: '0 1 160px', margin: 0 }}>
            <label style={{ fontSize: 12 }}>Nucleus</label>
            <input type="text" value={newNucleus} onChange={e => setNewNucleus(e.target.value)} placeholder="name or *" style={{ fontSize: 13 }} />
          </div>
        )}
        <button
          onClick={handleAdd}
          disabled={saving || !newName.trim() || !newEmail.trim()}
          style={{ fontSize: 13, color: 'white', background: '#3182ce', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', alignSelf: 'flex-end', marginBottom: 1 }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Manage Access card to DetailView**

Open `web/src/components/DetailView.tsx`. Add the import at the top:
```tsx
import AccessPanel from './AccessPanel';
```

And add a prop to pass `roleMap` down. Update the Props interface:
```tsx
interface Props {
  detail: NucleusDetail;
  role: Role;
  roleMap: Record<string, Role>;
  email: string;
  showBack: boolean;
  spreadsheetUrl: string;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
}
```

Update the destructuring:
```tsx
export default function DetailView({ detail, role, roleMap, email, showBack, spreadsheetUrl, onBack, onSaved }: Props) {
```

Add the Manage Access card at the end of the `.container` div, after the Additional Details card and before the closing `</div>`:
```tsx
        {/* Manage Access — admin only */}
        {isAdmin && (
          <div className="card">
            <div className="card-header">Manage Access</div>
            <div className="card-body">
              <AccessPanel nucleusName={row.nucleus} roleMap={roleMap} />
            </div>
          </div>
        )}
```

- [ ] **Step 3: Update AppClient to pass roleMap**

Open `web/src/components/AppClient.tsx`. Pass `roleMap` to `DetailView`:
```tsx
      <DetailView
        detail={detail}
        role={role}
        roleMap={initialData.access.roleMap}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        spreadsheetUrl={initialData.spreadsheetUrl}
        onBack={handleBack}
        onSaved={() => {}}
      />
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```
Expected: build succeeds with 0 errors.

- [ ] **Step 5: Run all tests**

```bash
npm test
```
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/AccessPanel.tsx src/components/DetailView.tsx src/components/AppClient.tsx
git commit -m "feat: add Manage Access panel visible to admin users"
```

---

## Post-Implementation: Sheet Migration

Before deploying, manually update the master Google Sheet:
1. Rename the `GlobalAccess` tab to `Access`
2. Add column headers in row 1: `name`, `email`, `role`, `nucleus`
3. For each email currently in the old GlobalAccess column A (rows 1+), add a row: `[display name, email, read-write, *]`
4. Verify the first data row starts at row 2 (the code reads `A:D` without a data-row offset — it skips rows with empty email, so headers are fine)

> Note: `getAccessEntries()` reads `ACCESS_TAB!A:D` (not offset by a data row number) and filters out rows where email is empty, so having a header row is safe.

---

## Spec Coverage Checklist

| Requirement | Task |
|-------------|------|
| Replace GlobalAccess with Access tab (name, email, role, nucleus) | Tasks 1, 3 |
| Three roles: read / read-write / admin | Tasks 2, 4 |
| Per-nucleus role resolution with `*` wildcard | Task 4 |
| Contact email column decoupled from access | Tasks 5 (getAccess doesn't read COL.EMAIL) |
| `getAccess()` returns roleMap | Task 4 |
| `/api/initial-data` returns access.roleMap | Task 5 |
| `/api/nucleus` blocks write for read role | Task 5 |
| `/api/nucleus` strips identity fields unless admin | Task 5 |
| `/api/workers` updated to use new auth | Task 5 |
| `/api/access` GET/POST/DELETE | Task 6 |
| Admin can edit identity fields in UI | Task 7 |
| Standard fields editable for read-write | Task 7 |
| Save buttons hidden for read role | Task 7 |
| Manage Access panel for admin users | Task 8 |
| Global admin (`*`) can set nucleus scope when adding entries | Task 8 |
