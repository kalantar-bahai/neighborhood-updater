# Workers Named List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the accompaniers named-list pattern to a shared `Workers` tab with a `type` column, then apply the same pattern to the Protagonists count field with an import-from-accompaniers feature.

**Architecture:** The `Accompaniers` tab has already been renamed to `Workers` and a `type` column inserted between `neighborhood` and `name` by the user. Config constants, data functions, and the API route are renamed/generalized to accept a `type` parameter. `AccompaniersModal` is replaced by a generic `NamedListModal` that accepts `title`, `type`, and optional `importNames` props.

**Tech Stack:** Next.js 16 App Router, TypeScript, React 19, Google Sheets API v4 (`googleapis`), Vitest

## Global Constraints

- **Git commands:** Run from the repository root (`neighborhood/`), not from `web/`. Use `web/src/...` paths when staging files (e.g. `git add web/src/lib/config.ts`). Test/TypeScript commands run from `web/` (e.g. `cd web && npx vitest run`).
- Tab name is exactly `'Workers'` (already renamed in the spreadsheet)
- Column order in the Workers tab: cluster(0), cluster_code(1), locality(2), parent_neighborhood(3), neighborhood(4), type(5), name(6) — 7 columns, range `A2:G`
- Type values are the exact strings `'accompanier'` and `'protagonist'`
- `saveWorkerNames` must filter by **both** neighborhood AND type — never remove rows of a different type for the same neighborhood
- Import button in the protagonists modal is icon-only (no text label), title attribute = `"Import accompaniers"`
- Import behavior: case-insensitive dedup by name, existing order preserved, new names appended
- Auto-sync behavior: if `count === list.length` before modal opens, update count to `names.length` after save
- `/api/accompaniers` route is deleted — no backward-compat shim
- `AccompaniersModal.tsx` is deleted — no re-export
- All tests run with: `cd web && npx vitest run` — expected: 26+ tests pass (existing 26 plus new ones)
- TypeScript check: `cd web && npx tsc --noEmit` — expected: 0 errors

---

### Task 1: Data Layer — Config, Functions, Tests

**Files:**
- Modify: `web/src/lib/config.ts`
- Modify: `web/src/lib/data.ts`
- Modify: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: Nothing from earlier tasks
- Produces:
  - `WORKERS_TAB: string` (value `'Workers'`)
  - `WORKERS_DATA_ROW: number` (value `2`)
  - `ACC_COL.TYPE: 5`, `ACC_COL.NAME: 6`
  - `getWorkerNames(neighborhoodName: string, type: string): Promise<string[]>`
  - `saveWorkerNames(neighborhoodName: string, type: string, names: string[], context: { cluster: string; clusterCode: string; locality: string; parentNeighborhood: string }): Promise<void>`
  - `getRowData` returns `{ row, srp, accompanierNames: string[], protagonistNames: string[] }`

---

- [ ] **Step 1: Update `config.ts`**

Replace the three accompanier constants at the bottom of `web/src/lib/config.ts`:

```ts
// BEFORE:
export const ACCOMPANIERS_TAB = 'Accompaniers';
export const ACCOMPANIERS_DATA_ROW = 2;

export const ACC_COL = {
  CLUSTER:             0,
  CLUSTER_CODE:        1,
  LOCALITY:            2,
  PARENT_NEIGHBORHOOD: 3,
  NEIGHBORHOOD:        4,
  NAME:                5,
} as const;

// AFTER:
export const WORKERS_TAB = 'Workers';
export const WORKERS_DATA_ROW = 2;

export const ACC_COL = {
  CLUSTER:             0,
  CLUSTER_CODE:        1,
  LOCALITY:            2,
  PARENT_NEIGHBORHOOD: 3,
  NEIGHBORHOOD:        4,
  TYPE:                5,
  NAME:                6,
} as const;
```

- [ ] **Step 2: Write the failing tests in `data.test.ts`**

Replace the entire import block and the two describe blocks (`getAccompanierNames` and `saveAccompanierNames`) with the following. Leave all other describe blocks (`parseRow`, `findSrpRow`, `parseSrpData`) untouched.

```ts
// Change line 11:
// BEFORE: import { getAccompanierNames, saveAccompanierNames } from './data';
// AFTER:
import { getWorkerNames, saveWorkerNames } from './data';
```

Then replace the `describe('getAccompanierNames', ...)` block (lines 151–191) with:

```ts
describe('getWorkerNames', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(7).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('returns names in row order for matching neighborhood and type', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Charlie' }),
    ]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual(['Alice', 'Charlie']);
  });

  test('is case-insensitive for both neighborhood and type', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'ALPHA', [ACC_COL.TYPE]: 'Accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    const result = await getWorkerNames('alpha', 'accompanier');
    expect(result).toEqual(['Alice']);
  });

  test('returns empty when neighborhood matches but type does not', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    const result = await getWorkerNames('Alpha', 'protagonist');
    expect(result).toEqual([]);
  });

  test('returns empty array when no rows match neighborhood', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
    ]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual([]);
  });

  test('returns empty array when tab is empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    const result = await getWorkerNames('Alpha', 'accompanier');
    expect(result).toEqual([]);
  });
});
```

Then replace the `describe('saveAccompanierNames', ...)` block (lines 193–245) with:

```ts
describe('saveWorkerNames', () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = { cluster: 'Charlotte', clusterCode: 'C1', locality: 'Charlotte', parentNeighborhood: '' };

  function makeAccRow(overrides: Record<number, string> = {}): string[] {
    const row = new Array(7).fill('');
    Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
    return row;
  }

  test('replaces rows for neighborhood+type and preserves other neighborhoods', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Old Name' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Bob' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['Alice', 'Charlie'], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(3);
    expect(rows[0][ACC_COL.NEIGHBORHOOD]).toBe('Beta');
    expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Alice']);
    expect(rows[2]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Charlie']);
  });

  test('preserves rows of a different type for the same neighborhood', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'protagonist', [ACC_COL.NAME]: 'ProtagA' }),
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'OldAcc' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['NewAcc'], ctx);

    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toHaveLength(2);
    expect(rows[0][ACC_COL.TYPE]).toBe('protagonist');
    expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'NewAcc']);
  });

  test('clears without writing when names list is empty', async () => {
    mockSheetsGet.mockResolvedValue([
      makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.TYPE]: 'accompanier', [ACC_COL.NAME]: 'Alice' }),
    ]);
    mockSheetsClear.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', [], ctx);

    expect(mockSheetsClear).toHaveBeenCalledOnce();
    expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
  });

  test('writes only new rows when tab was empty', async () => {
    mockSheetsGet.mockResolvedValue([]);
    mockSheetsClear.mockResolvedValue(undefined);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);

    await saveWorkerNames('Alpha', 'accompanier', ['Alice'], ctx);

    const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
    expect(rows).toEqual([['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'accompanier', 'Alice']]);
  });
});
```

- [ ] **Step 3: Run tests to see them fail**

```bash
cd web && npx vitest run
```

Expected: failures in `getWorkerNames` and `saveWorkerNames` because data.ts still has old function names.

- [ ] **Step 4: Update `data.ts` — imports**

In `web/src/lib/data.ts`, change the config import (line 7):

```ts
// BEFORE:
  ACCOMPANIERS_TAB, ACCOMPANIERS_DATA_ROW, ACC_COL,

// AFTER:
  WORKERS_TAB, WORKERS_DATA_ROW, ACC_COL,
```

- [ ] **Step 5: Update `data.ts` — rename `getAllAccompanierRows` → `getAllWorkerRows`**

Replace the private helper function (lines 122–125):

```ts
// BEFORE:
async function getAllAccompanierRows() {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${ACCOMPANIERS_TAB}!A${ACCOMPANIERS_DATA_ROW}:F`);
  return rows.map(r => normalize(r, 6));
}

// AFTER:
async function getAllWorkerRows() {
  const rows = await sheetsGet(MASTER_SHEET_ID, `${WORKERS_TAB}!A${WORKERS_DATA_ROW}:G`);
  return rows.map(r => normalize(r, 7));
}
```

- [ ] **Step 6: Update `data.ts` — replace `getAccompanierNames` with `getWorkerNames`**

Replace the function (lines 127–133):

```ts
// BEFORE:
export async function getAccompanierNames(neighborhoodName: string): Promise<string[]> {
  const rows = await getAllAccompanierRows();
  const needle = norm(neighborhoodName);
  return rows
    .filter(r => norm(r[ACC_COL.NEIGHBORHOOD]) === needle)
    .map(r => r[ACC_COL.NAME]);
}

// AFTER:
export async function getWorkerNames(neighborhoodName: string, type: string): Promise<string[]> {
  const rows = await getAllWorkerRows();
  const needle = norm(neighborhoodName);
  return rows
    .filter(r => norm(r[ACC_COL.NEIGHBORHOOD]) === needle && norm(r[ACC_COL.TYPE]) === norm(type))
    .map(r => r[ACC_COL.NAME]);
}
```

- [ ] **Step 7: Update `data.ts` — replace `saveAccompanierNames` with `saveWorkerNames`**

Replace the function (lines 135–159):

```ts
// BEFORE:
export async function saveAccompanierNames(
  neighborhoodName: string,
  names: string[],
  context: { cluster: string; clusterCode: string; locality: string; parentNeighborhood: string }
): Promise<void> {
  const allRows = await getAllAccompanierRows();
  const needle = norm(neighborhoodName);
  const otherRows = allRows.filter(r => norm(r[ACC_COL.NEIGHBORHOOD]) !== needle);
  const newRows = names.map(name => [
    context.cluster,
    context.clusterCode,
    context.locality,
    context.parentNeighborhood,
    neighborhoodName,
    name,
  ]);
  const combined = [...otherRows, ...newRows];
  await sheetsClear(MASTER_SHEET_ID, `${ACCOMPANIERS_TAB}!A${ACCOMPANIERS_DATA_ROW}:F`);
  if (combined.length > 0) {
    await sheetsBatchUpdate(MASTER_SHEET_ID, [{
      range: `${ACCOMPANIERS_TAB}!A${ACCOMPANIERS_DATA_ROW}`,
      values: combined,
    }]);
  }
}

// AFTER:
export async function saveWorkerNames(
  neighborhoodName: string,
  type: string,
  names: string[],
  context: { cluster: string; clusterCode: string; locality: string; parentNeighborhood: string }
): Promise<void> {
  const allRows = await getAllWorkerRows();
  const needle = norm(neighborhoodName);
  const otherRows = allRows.filter(r =>
    !(norm(r[ACC_COL.NEIGHBORHOOD]) === needle && norm(r[ACC_COL.TYPE]) === norm(type))
  );
  const newRows = names.map(name => [
    context.cluster,
    context.clusterCode,
    context.locality,
    context.parentNeighborhood,
    neighborhoodName,
    type,
    name,
  ]);
  const combined = [...otherRows, ...newRows];
  await sheetsClear(MASTER_SHEET_ID, `${WORKERS_TAB}!A${WORKERS_DATA_ROW}:G`);
  if (combined.length > 0) {
    await sheetsBatchUpdate(MASTER_SHEET_ID, [{
      range: `${WORKERS_TAB}!A${WORKERS_DATA_ROW}`,
      values: combined,
    }]);
  }
}
```

- [ ] **Step 8: Update `data.ts` — update `getRowData` to fetch both types**

Replace `getRowData` (lines 99–120):

```ts
// BEFORE:
export async function getRowData(neighborhoodName: string) {
  const [masterRows, devRows, eduRows, accompanierNames] = await Promise.all([
    getAllMasterRows(), getAllDevRows(), getAllEduRows(), getAccompanierNames(neighborhoodName),
  ]);

  const masterRow = masterRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhoodName));
  if (!masterRow) return null;

  const lookup = (rows: string[][], nameCol: number) => {
    let match = findSrpRow(neighborhoodName, rows, nameCol);
    if (!match && masterRow[COL.PARENT_NEIGHBORHOOD]) {
      match = findSrpRow(`${masterRow[COL.PARENT_NEIGHBORHOOD]} - ${neighborhoodName}`, rows, nameCol);
    }
    return match;
  };

  return {
    row: parseRow(masterRow),
    srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
    accompanierNames,
  };
}

// AFTER:
export async function getRowData(neighborhoodName: string) {
  const [masterRows, devRows, eduRows, accompanierNames, protagonistNames] = await Promise.all([
    getAllMasterRows(), getAllDevRows(), getAllEduRows(),
    getWorkerNames(neighborhoodName, 'accompanier'),
    getWorkerNames(neighborhoodName, 'protagonist'),
  ]);

  const masterRow = masterRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhoodName));
  if (!masterRow) return null;

  const lookup = (rows: string[][], nameCol: number) => {
    let match = findSrpRow(neighborhoodName, rows, nameCol);
    if (!match && masterRow[COL.PARENT_NEIGHBORHOOD]) {
      match = findSrpRow(`${masterRow[COL.PARENT_NEIGHBORHOOD]} - ${neighborhoodName}`, rows, nameCol);
    }
    return match;
  };

  return {
    row: parseRow(masterRow),
    srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
    accompanierNames,
    protagonistNames,
  };
}
```

- [ ] **Step 9: Run tests to verify they all pass**

```bash
cd web && npx vitest run
```

Expected: all tests pass (26 existing + 2 new = 28 total). If any test fails, fix it before proceeding.

- [ ] **Step 10: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors. (Note: `types.ts` and `DetailView.tsx` will show errors until Tasks 2 and 4 are complete — that is acceptable for this task since those files still reference old names. The data layer itself must be clean.)

Actually, `DetailView.tsx` imports `NeighborhoodDetail` from `types.ts` and accesses `detail.accompanierNames` — this will still compile since `types.ts` still has `accompanierNames`. TypeScript will only error if something directly imports removed exports. The only TypeScript errors at this point will be in files that import `getAccompanierNames` or `saveAccompanierNames` — namely `api/accompaniers/route.ts`. That is expected and will be fixed in Task 2.

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/config.ts web/src/lib/data.ts web/src/lib/data.test.ts
git commit -m "feat: generalize worker data functions to accept type parameter"
```

---

### Task 2: API Layer — Types and Route

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/app/api/workers/route.ts`
- Delete: `web/src/app/api/accompaniers/route.ts`

**Interfaces:**
- Consumes: `getWorkerNames`, `saveWorkerNames` from Task 1
- Produces:
  - `NeighborhoodDetail.protagonistNames: string[]`
  - `GET /api/workers?neighborhood=X&type=Y` → `{ names: string[] }`
  - `POST /api/workers` body `{ neighborhood, type, names }` → `{ success: true }`

---

- [ ] **Step 1: Update `types.ts` — add `protagonistNames`**

In `web/src/types.ts`, replace the `NeighborhoodDetail` interface (lines 65–69):

```ts
// BEFORE:
export interface NeighborhoodDetail {
  row: NeighborhoodRow;
  srp: SrpData | null;
  accompanierNames: string[];
}

// AFTER:
export interface NeighborhoodDetail {
  row: NeighborhoodRow;
  srp: SrpData | null;
  accompanierNames: string[];
  protagonistNames: string[];
}
```

- [ ] **Step 2: Create `web/src/app/api/workers/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthorizedRows } from '@/lib/access';
import { getAllMasterRows, getWorkerNames, saveWorkerNames } from '@/lib/data';
import { COL } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('neighborhood');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });

  const { role, rows } = await getAuthorizedRows(req.auth.user.email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(name));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const names = await getWorkerNames(name, type);
  return NextResponse.json({ names });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { neighborhood, type, names } = await req.json();
  if (!neighborhood) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const { role, rows } = await getAuthorizedRows(email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allRows = await getAllMasterRows();
  const masterRow = allRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
  if (!masterRow) return NextResponse.json({ error: `Not found: ${neighborhood}` }, { status: 404 });

  const context = {
    cluster:            masterRow[COL.CLUSTER],
    clusterCode:        masterRow[COL.CLUSTER_CODE],
    locality:           masterRow[COL.LOCALITY],
    parentNeighborhood: masterRow[COL.PARENT_NEIGHBORHOOD],
  };

  await saveWorkerNames(masterRow[COL.NEIGHBORHOOD], type, names, context);
  return NextResponse.json({ success: true });
});
```

- [ ] **Step 3: Delete the old accompaniers route**

```bash
rm web/src/app/api/accompaniers/route.ts
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors. The only remaining TypeScript issue will be `DetailView.tsx` accessing `detail.protagonistNames` (doesn't exist yet in the prop) — but since `NeighborhoodDetail` now declares `protagonistNames`, accessing `detail.protagonistNames` will actually compile fine once Task 4 adds the usage.

- [ ] **Step 5: Run tests**

```bash
cd web && npx vitest run
```

Expected: all 28 tests still pass (no test changes in this task).

- [ ] **Step 6: Commit**

```bash
git add web/src/types.ts web/src/app/api/workers/route.ts
git rm web/src/app/api/accompaniers/route.ts
git commit -m "feat: add /api/workers route and protagonistNames to NeighborhoodDetail"
```

---

### Task 3: NamedListModal Component

**Files:**
- Create: `web/src/components/NamedListModal.tsx`
- Delete: `web/src/components/AccompaniersModal.tsx`

**Interfaces:**
- Consumes: `POST /api/workers` from Task 2
- Produces: `NamedListModal` component (default export) with the props interface below

---

- [ ] **Step 1: Create `web/src/components/NamedListModal.tsx`**

```tsx
'use client';

import { useState } from 'react';

interface Props {
  title: string;
  type: string;
  neighborhood: string;
  initialNames: string[];
  importNames?: string[];
  onSave: (names: string[]) => void;
  onClose: () => void;
}

function IcoImport() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

export default function NamedListModal({ title, type, neighborhood, initialNames, importNames, onSave, onClose }: Props) {
  const [names, setNames] = useState<string[]>(initialNames);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function add() {
    const trimmed = input.trim();
    if (!trimmed) return;
    setNames(n => [...n, trimmed]);
    setInput('');
  }

  function remove(i: number) {
    setNames(n => n.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i === 0) return;
    setNames(n => { const a = [...n]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; });
  }

  function moveDown(i: number) {
    setNames(n => {
      if (i === n.length - 1) return n;
      const a = [...n]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; return a;
    });
  }

  function importFromList() {
    if (!importNames) return;
    const existing = new Set(names.map(n => n.toLowerCase().trim()));
    const toAdd = importNames.filter(n => !existing.has(n.toLowerCase().trim()));
    setNames(prev => [...prev, ...toAdd]);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/workers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ neighborhood, type, names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSave(names);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 12, padding: '20px 24px', maxWidth: 480, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>{title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>{neighborhood}</div>

        {importNames && importNames.length > 0 && (
          <button
            onClick={importFromList}
            title="Import accompaniers"
            style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', padding: '4px 8px', background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 6, cursor: 'pointer', color: '#2b6cb0', marginBottom: 8 }}
          >
            <IcoImport />
          </button>
        )}

        <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
          {names.length === 0 && (
            <div style={{ color: '#a0aec0', fontSize: 13, padding: '8px 0' }}>No names added yet.</div>
          )}
          {names.map((name, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}
              >↑</button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === names.length - 1}
                style={{ background: 'none', border: 'none', cursor: i === names.length - 1 ? 'default' : 'pointer', color: i === names.length - 1 ? '#cbd5e0' : '#718096', fontSize: 12, padding: '2px 4px' }}
              >↓</button>
              <span style={{ flex: 1, fontSize: 14 }}>{name}</span>
              <button
                onClick={() => remove(i)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e53e3e', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
              >×</button>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Add a name..."
            style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 14 }}
          />
          <button
            onClick={add}
            style={{ padding: '6px 14px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >Add</button>
        </div>

        {error && <div style={{ color: '#e53e3e', fontSize: 13, marginBottom: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ padding: '7px 16px', background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '7px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer', fontSize: 14, opacity: saving ? 0.7 : 1 }}
          >{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Delete `AccompaniersModal.tsx`**

```bash
rm web/src/components/AccompaniersModal.tsx
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: errors only in `DetailView.tsx` (still imports `AccompaniersModal` which no longer exists). Those are fixed in Task 4. No other errors.

- [ ] **Step 4: Run tests**

```bash
cd web && npx vitest run
```

Expected: all 28 tests still pass (no data-layer changes in this task).

- [ ] **Step 5: Commit**

```bash
git add web/src/components/NamedListModal.tsx
git rm web/src/components/AccompaniersModal.tsx
git commit -m "feat: add NamedListModal component with type prop and import feature"
```

---

### Task 4: Wire Up DetailView

**Files:**
- Modify: `web/src/components/DetailView.tsx`

**Interfaces:**
- Consumes: `NamedListModal` from Task 3; `NeighborhoodDetail.protagonistNames` from Task 2

---

- [ ] **Step 1: Update the import at the top of `DetailView.tsx`**

Replace line 5:

```ts
// BEFORE:
import AccompaniersModal from './AccompaniersModal';

// AFTER:
import NamedListModal from './NamedListModal';
```

- [ ] **Step 2: Add `protagonistNames` state and `protagonistsMismatch`**

After line 244 (after `const [showAccompaniersModal, setShowAccompaniersModal] = useState(false);`), add:

```tsx
  const [protagonistNames, setProtagonistNames] = useState<string[]>(() => detail.protagonistNames);
  const [showProtagonistsModal, setShowProtagonistsModal] = useState(false);
```

After line 308 (the `accompaniersMismatch` line), add:

```tsx
  const protagonistsMismatch = protagonistNames.length > 0 &&
    protagonistNames.length !== parseInt(form.protagonists || '0', 10);
```

- [ ] **Step 3: Update the "Protagonists / Workers" Field**

Replace line 455:

```tsx
// BEFORE:
              <Field label="Protagonists / Workers"  value={form.protagonists} onChange={v => set('protagonists', v)} integer />

// AFTER:
              <Field
                label="Protagonists / Workers"
                value={form.protagonists}
                onChange={v => set('protagonists', v)}
                integer
                highlighted={protagonistsMismatch}
                onLabelClick={() => setShowProtagonistsModal(true)}
                onSync={() => set('protagonists', String(protagonistNames.length))}
              />
```

- [ ] **Step 4: Update the accompaniers modal render to use `NamedListModal`**

Find the `{showAccompaniersModal && (` block (search the file for `showAccompaniersModal` to locate it). Replace the entire block:

```tsx
// BEFORE:
      {showAccompaniersModal && (
        <AccompaniersModal
          neighborhood={row.neighborhood}
          initialNames={accompanierNames}
          onSave={names => {
            const wasInSync = accompanierNames.length === parseInt(form.accompaniers || '0', 10);
            setAccompanierNames(names);
            if (wasInSync) set('accompaniers', String(names.length));
            setShowAccompaniersModal(false);
          }}
          onClose={() => setShowAccompaniersModal(false)}
        />
      )}

// AFTER:
      {showAccompaniersModal && (
        <NamedListModal
          title="Accompaniers in Nucleus"
          type="accompanier"
          neighborhood={row.neighborhood}
          initialNames={accompanierNames}
          onSave={names => {
            const wasInSync = accompanierNames.length === parseInt(form.accompaniers || '0', 10);
            setAccompanierNames(names);
            if (wasInSync) set('accompaniers', String(names.length));
            setShowAccompaniersModal(false);
          }}
          onClose={() => setShowAccompaniersModal(false)}
        />
      )}
```

- [ ] **Step 5: Add the protagonists modal render**

Immediately after the closing `)}` of the accompaniers modal block, add:

```tsx
      {showProtagonistsModal && (
        <NamedListModal
          title="Protagonists / Workers"
          type="protagonist"
          neighborhood={row.neighborhood}
          initialNames={protagonistNames}
          importNames={accompanierNames}
          onSave={names => {
            const wasInSync = protagonistNames.length === parseInt(form.protagonists || '0', 10);
            setProtagonistNames(names);
            if (wasInSync) set('protagonists', String(names.length));
            setShowProtagonistsModal(false);
          }}
          onClose={() => setShowProtagonistsModal(false)}
        />
      )}
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd web && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Run tests**

```bash
cd web && npx vitest run
```

Expected: all 28 tests pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/DetailView.tsx
git commit -m "feat: add protagonists named list with import-from-accompaniers feature"
```

---

## Manual Verification Checklist

After all tasks are complete, verify in the browser (`npm run dev` in `web/`):

1. **Accompaniers list still works**: click "Accompaniers in Nucleus" label → modal opens, names load, save/cancel work, count syncs
2. **Protagonists list works**: click "Protagonists / Workers" label → modal opens with no names initially, add/remove/reorder work, save persists to `Workers` tab with `type=protagonist`
3. **Import feature**: with accompaniers in the list, open protagonists modal → import button (download icon) is visible → clicking it adds accompanier names not already in the protagonists list
4. **No cross-contamination**: saving accompanier list does not affect protagonist rows in the sheet and vice versa
5. **Mismatch hint**: if protagonists count ≠ list length and list is non-empty, the count input has an amber border and sync button
6. **Auto-sync**: if count matched list length before opening, saving with a different count auto-updates the count field
