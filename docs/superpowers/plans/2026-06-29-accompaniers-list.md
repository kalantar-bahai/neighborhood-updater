# Accompaniers in Nucleus — Named List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to click "Accompaniers in Nucleus" in the Detail View to open a modal where they can add, remove, and reorder a named list of accompaniers stored in a new Google Sheets tab; the count field shows a subtle amber highlight when the list length and entered count diverge.

**Architecture:** A new `Accompaniers` tab in the master spreadsheet stores one row per person (with neighborhood context columns). Two new data functions read and replace-whole-list write for a neighborhood. The names are loaded eagerly alongside existing row data so the mismatch hint works on page load. A new `AccompaniersModal` component manages local list state and flushes to the API on Save.

**Tech Stack:** Next.js 16, React 19, TypeScript, Google Sheets API v4 (`googleapis`), Vitest 3

## Global Constraints

- All source files live under `web/src/`
- Run tests from `web/`: `npm test` (runs `vitest run`)
- Run a specific test file: `npx vitest run src/lib/data.test.ts` (from `web/`)
- Google Sheets API auth comes from `process.env.SERVICE_ACCOUNT` (parsed as JSON)
- Master spreadsheet ID: `process.env.MASTER_SHEET_ID` (accessed via `MASTER_SHEET_ID` from `lib/config.ts`)
- Normalize strings for comparison: `(s || '').toLowerCase().trim()` (matches existing `norm()` pattern)
- No comments in code unless a constraint is non-obvious
- No new npm dependencies

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `web/src/lib/config.ts` | Modify | Add `ACCOMPANIERS_TAB`, `ACCOMPANIERS_DATA_ROW`, `ACC_COL` |
| `web/src/lib/sheets.ts` | Modify | Add `sheetsClear` helper |
| `web/src/lib/data.ts` | Modify | Add `getAccompanierNames`, `saveAccompanierNames`, update `getRowData` |
| `web/src/types.ts` | Modify | Add `accompanierNames: string[]` to `NeighborhoodDetail` |
| `web/src/lib/data.test.ts` | Modify | Add tests for `getAccompanierNames` and `saveAccompanierNames` |
| `web/src/app/api/accompaniers/route.ts` | Create | GET + POST API route, auth + access control |
| `web/src/components/AccompaniersModal.tsx` | Create | Modal UI: list, add, remove, reorder, save |
| `web/src/components/DetailView.tsx` | Modify | Clickable label, mismatch hint, modal open/close, `accompanierNames` state |

---

### Task 1: Config constants and `sheetsClear` helper

**Files:**
- Modify: `web/src/lib/config.ts`
- Modify: `web/src/lib/sheets.ts`

**Interfaces:**
- Produces:
  - `ACCOMPANIERS_TAB: string` — tab name `'Accompaniers'`
  - `ACCOMPANIERS_DATA_ROW: number` — first data row `2`
  - `ACC_COL: { CLUSTER, CLUSTER_CODE, LOCALITY, PARENT_NEIGHBORHOOD, NEIGHBORHOOD, NAME }` — column indices 0–5
  - `sheetsClear(spreadsheetId: string, range: string): Promise<void>` — clears a range

- [ ] **Step 1: Add constants to `config.ts`**

  At the bottom of `web/src/lib/config.ts`, add:

  ```ts
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
  ```

- [ ] **Step 2: Add `sheetsClear` to `sheets.ts`**

  At the bottom of `web/src/lib/sheets.ts`, add:

  ```ts
  export async function sheetsClear(spreadsheetId: string, range: string): Promise<void> {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.clear({ spreadsheetId, range });
  }
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run from `web/`:
  ```
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add web/src/lib/config.ts web/src/lib/sheets.ts
  git commit -m "feat: add Accompaniers config constants and sheetsClear helper"
  ```

---

### Task 2: Data functions and type update

**Files:**
- Modify: `web/src/lib/data.ts`
- Modify: `web/src/types.ts`
- Modify: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes from Task 1:
  - `MASTER_SHEET_ID`, `ACCOMPANIERS_TAB`, `ACCOMPANIERS_DATA_ROW`, `ACC_COL` from `lib/config.ts`
  - `sheetsGet`, `sheetsClear`, `sheetsBatchUpdate` from `lib/sheets.ts`
- Produces:
  - `getAccompanierNames(neighborhoodName: string): Promise<string[]>`
  - `saveAccompanierNames(neighborhoodName: string, names: string[], context: { cluster: string; clusterCode: string; locality: string; parentNeighborhood: string }): Promise<void>`
  - `NeighborhoodDetail.accompanierNames: string[]` (added to existing type)

- [ ] **Step 1: Write the failing tests**

  In `web/src/lib/data.test.ts`, make the following changes:

  **1a. Update the import line at the top** — change:
  ```ts
  import { describe, test, expect } from 'vitest';
  ```
  to:
  ```ts
  import { describe, test, expect, vi, beforeEach } from 'vitest';
  ```

  **1b. Add the sheets mock** — after the vitest import line, before any other imports, add:
  ```ts
  vi.mock('./sheets', () => ({
    sheetsGet: vi.fn(),
    sheetsClear: vi.fn(),
    sheetsBatchUpdate: vi.fn(),
  }));
  ```

  **1c. Add sheets imports and mocked references** — after the `vi.mock` block, add:
  ```ts
  import { sheetsGet, sheetsClear, sheetsBatchUpdate } from './sheets';
  ```

  And at module scope after the existing `import { parseRow, findSrpRow, parseSrpData } from './data';` line, add:
  ```ts
  import { getAccompanierNames, saveAccompanierNames } from './data';
  import { ACC_COL } from './config';

  const mockSheetsGet = vi.mocked(sheetsGet);
  const mockSheetsClear = vi.mocked(sheetsClear);
  const mockSheetsBatchUpdate = vi.mocked(sheetsBatchUpdate);
  ```

  **1d. Add test suites at the bottom of the file:**
  ```ts
  describe('getAccompanierNames', () => {
    beforeEach(() => vi.clearAllMocks());

    function makeAccRow(overrides: Record<number, string> = {}): string[] {
      const row = new Array(6).fill('');
      Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
      return row;
    }

    test('returns names in row order for matching neighborhood', async () => {
      mockSheetsGet.mockResolvedValue([
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Alice' }),
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.NAME]: 'Bob' }),
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Charlie' }),
      ]);
      const result = await getAccompanierNames('Alpha');
      expect(result).toEqual(['Alice', 'Charlie']);
    });

    test('is case-insensitive', async () => {
      mockSheetsGet.mockResolvedValue([
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'ALPHA', [ACC_COL.NAME]: 'Alice' }),
      ]);
      const result = await getAccompanierNames('alpha');
      expect(result).toEqual(['Alice']);
    });

    test('returns empty array when no rows match', async () => {
      mockSheetsGet.mockResolvedValue([
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta', [ACC_COL.NAME]: 'Bob' }),
      ]);
      const result = await getAccompanierNames('Alpha');
      expect(result).toEqual([]);
    });

    test('returns empty array when tab is empty', async () => {
      mockSheetsGet.mockResolvedValue([]);
      const result = await getAccompanierNames('Alpha');
      expect(result).toEqual([]);
    });
  });

  describe('saveAccompanierNames', () => {
    beforeEach(() => vi.clearAllMocks());

    const ctx = { cluster: 'Charlotte', clusterCode: 'C1', locality: 'Charlotte', parentNeighborhood: '' };

    function makeAccRow(overrides: Record<number, string> = {}): string[] {
      const row = new Array(6).fill('');
      Object.entries(overrides).forEach(([k, v]) => { row[Number(k)] = v; });
      return row;
    }

    test('replaces neighborhood rows and preserves other rows', async () => {
      mockSheetsGet.mockResolvedValue([
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Old Name' }),
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Beta',  [ACC_COL.NAME]: 'Bob' }),
      ]);
      mockSheetsClear.mockResolvedValue(undefined);
      mockSheetsBatchUpdate.mockResolvedValue(undefined);

      await saveAccompanierNames('Alpha', ['Alice', 'Charlie'], ctx);

      expect(mockSheetsClear).toHaveBeenCalledOnce();
      expect(mockSheetsBatchUpdate).toHaveBeenCalledOnce();
      const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
      expect(rows).toHaveLength(3);
      expect(rows[0][ACC_COL.NEIGHBORHOOD]).toBe('Beta');
      expect(rows[1]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Alice']);
      expect(rows[2]).toEqual(['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Charlie']);
    });

    test('clears without writing when names list is empty', async () => {
      mockSheetsGet.mockResolvedValue([
        makeAccRow({ [ACC_COL.NEIGHBORHOOD]: 'Alpha', [ACC_COL.NAME]: 'Alice' }),
      ]);
      mockSheetsClear.mockResolvedValue(undefined);

      await saveAccompanierNames('Alpha', [], ctx);

      expect(mockSheetsClear).toHaveBeenCalledOnce();
      expect(mockSheetsBatchUpdate).not.toHaveBeenCalled();
    });

    test('writes only new rows when tab was empty', async () => {
      mockSheetsGet.mockResolvedValue([]);
      mockSheetsClear.mockResolvedValue(undefined);
      mockSheetsBatchUpdate.mockResolvedValue(undefined);

      await saveAccompanierNames('Alpha', ['Alice'], ctx);

      const rows = mockSheetsBatchUpdate.mock.calls[0][1][0].values as string[][];
      expect(rows).toEqual([['Charlotte', 'C1', 'Charlotte', '', 'Alpha', 'Alice']]);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```
  npx vitest run src/lib/data.test.ts
  ```
  Expected: the new `getAccompanierNames` and `saveAccompanierNames` tests FAIL with "not a function" or import errors. Existing `parseRow`/`findSrpRow`/`parseSrpData` tests still PASS.

- [ ] **Step 3: Add private helper and exported functions to `data.ts`**

  First, update the imports at the top of `web/src/lib/data.ts`. Change:
  ```ts
  import { sheetsGet, sheetsBatchUpdate } from './sheets';
  import {
    MASTER_SHEET_ID, SRP_SHEET_ID,
    MASTER_TAB, ACCESS_TAB, DEV_TAB, EDU_TAB,
    MASTER_DATA_ROW, SRP_DATA_ROW,
    COL, DEV_COL, EDU_COL,
  } from './config';
  ```
  to:
  ```ts
  import { sheetsGet, sheetsBatchUpdate, sheetsClear } from './sheets';
  import {
    MASTER_SHEET_ID, SRP_SHEET_ID,
    MASTER_TAB, ACCESS_TAB, DEV_TAB, EDU_TAB,
    MASTER_DATA_ROW, SRP_DATA_ROW,
    COL, DEV_COL, EDU_COL,
    ACCOMPANIERS_TAB, ACCOMPANIERS_DATA_ROW, ACC_COL,
  } from './config';
  ```

  Then add these three functions at the bottom of `web/src/lib/data.ts` (before `saveRowData`):

  ```ts
  async function getAllAccompanierRows() {
    const rows = await sheetsGet(MASTER_SHEET_ID, `${ACCOMPANIERS_TAB}!A${ACCOMPANIERS_DATA_ROW}:F`);
    return rows.map(r => normalize(r, 6));
  }

  export async function getAccompanierNames(neighborhoodName: string): Promise<string[]> {
    const rows = await getAllAccompanierRows();
    const needle = norm(neighborhoodName);
    return rows
      .filter(r => norm(r[ACC_COL.NEIGHBORHOOD]) === needle)
      .map(r => r[ACC_COL.NAME]);
  }

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
  ```

- [ ] **Step 4: Update `getRowData` to include `accompanierNames`**

  In `web/src/lib/data.ts`, find the `getRowData` function. Change the `Promise.all` call and return value:

  Replace:
  ```ts
  export async function getRowData(neighborhoodName: string) {
    const [masterRows, devRows, eduRows] = await Promise.all([
      getAllMasterRows(), getAllDevRows(), getAllEduRows(),
    ]);
  ```
  with:
  ```ts
  export async function getRowData(neighborhoodName: string) {
    const [masterRows, devRows, eduRows, accompanierNames] = await Promise.all([
      getAllMasterRows(), getAllDevRows(), getAllEduRows(), getAccompanierNames(neighborhoodName),
    ]);
  ```

  And replace:
  ```ts
    return {
      row: parseRow(masterRow),
      srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
    };
  ```
  with:
  ```ts
    return {
      row: parseRow(masterRow),
      srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
      accompanierNames,
    };
  ```

- [ ] **Step 5: Update `NeighborhoodDetail` in `types.ts`**

  In `web/src/types.ts`, find:
  ```ts
  export interface NeighborhoodDetail {
    row: NeighborhoodRow;
    srp: SrpData | null;
  }
  ```
  Replace with:
  ```ts
  export interface NeighborhoodDetail {
    row: NeighborhoodRow;
    srp: SrpData | null;
    accompanierNames: string[];
  }
  ```

- [ ] **Step 6: Run tests to confirm they pass**

  ```
  npx vitest run src/lib/data.test.ts
  ```
  Expected: all tests PASS, including the new `getAccompanierNames` and `saveAccompanierNames` suites.

- [ ] **Step 7: Confirm TypeScript compiles**

  ```
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add web/src/lib/data.ts web/src/types.ts web/src/lib/data.test.ts
  git commit -m "feat: add getAccompanierNames, saveAccompanierNames, and NeighborhoodDetail.accompanierNames"
  ```

---

### Task 3: API route

**Files:**
- Create: `web/src/app/api/accompaniers/route.ts`

**Interfaces:**
- Consumes from Task 2:
  - `getAccompanierNames(name: string): Promise<string[]>` from `lib/data.ts`
  - `saveAccompanierNames(name: string, names: string[], context): Promise<void>` from `lib/data.ts`
  - `getAllMasterRows()` from `lib/data.ts`
  - `NeighborhoodDetail.accompanierNames` (type already correct from Task 2)
- Consumes existing:
  - `getAuthorizedRows(email)` from `lib/access.ts`
  - `COL` from `lib/config.ts`
  - `auth` from `@/auth`
- Produces:
  - `GET /api/accompaniers?neighborhood=X` → `{ names: string[] }`
  - `POST /api/accompaniers` body `{ neighborhood: string, names: string[] }` → `{ success: true }`

- [ ] **Step 1: Create the route file**

  Create `web/src/app/api/accompaniers/route.ts`:

  ```ts
  import { NextResponse } from 'next/server';
  import { auth } from '@/auth';
  import { getAuthorizedRows } from '@/lib/access';
  import { getAllMasterRows, getAccompanierNames, saveAccompanierNames } from '@/lib/data';
  import { COL } from '@/lib/config';

  function norm(s: string) { return (s || '').toLowerCase().trim(); }

  export const GET = auth(async (req) => {
    if (!req.auth?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const name = req.nextUrl.searchParams.get('neighborhood');
    if (!name) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });

    const { role, rows } = await getAuthorizedRows(req.auth.user.email);
    const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(name));
    if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const names = await getAccompanierNames(name);
    return NextResponse.json({ names });
  });

  export const POST = auth(async (req) => {
    if (!req.auth?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { neighborhood, names } = await req.json();
    if (!neighborhood) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });
    if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

    const email = req.auth.user.email;
    const { role, rows } = await getAuthorizedRows(email);
    const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
    if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const allRows = await getAllMasterRows();
    const masterRow = allRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
    if (!masterRow) return NextResponse.json({ error: `Not found: ${neighborhood}` }, { status: 404 });

    const context = {
      cluster:             masterRow[COL.CLUSTER],
      clusterCode:         masterRow[COL.CLUSTER_CODE],
      locality:            masterRow[COL.LOCALITY],
      parentNeighborhood:  masterRow[COL.PARENT_NEIGHBORHOOD],
    };

    await saveAccompanierNames(neighborhood, names, context);
    return NextResponse.json({ success: true });
  });
  ```

- [ ] **Step 2: Confirm TypeScript compiles**

  ```
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/app/api/accompaniers/route.ts
  git commit -m "feat: add /api/accompaniers GET and POST route"
  ```

---

### Task 4: AccompaniersModal component

**Files:**
- Create: `web/src/components/AccompaniersModal.tsx`

**Interfaces:**
- Consumes: nothing from prior tasks at import time (calls `/api/accompaniers` at runtime)
- Produces:
  ```ts
  interface Props {
    neighborhood: string;
    initialNames: string[];
    onSave: (names: string[]) => void;
    onClose: () => void;
  }
  export default function AccompaniersModal(props: Props): JSX.Element
  ```

- [ ] **Step 1: Create the component**

  Create `web/src/components/AccompaniersModal.tsx`:

  ```tsx
  'use client';

  import { useState } from 'react';

  interface Props {
    neighborhood: string;
    initialNames: string[];
    onSave: (names: string[]) => void;
    onClose: () => void;
  }

  export default function AccompaniersModal({ neighborhood, initialNames, onSave, onClose }: Props) {
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

    async function handleSave() {
      setSaving(true);
      setError('');
      try {
        const res = await fetch('/api/accompaniers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ neighborhood, names }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Save failed');
        onSave(names);
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
            <div style={{ fontWeight: 700, fontSize: 15, color: '#2d3748' }}>Accompaniers in Nucleus</div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#718096', lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>{neighborhood}</div>

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

- [ ] **Step 2: Confirm TypeScript compiles**

  ```
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add web/src/components/AccompaniersModal.tsx
  git commit -m "feat: add AccompaniersModal component"
  ```

---

### Task 5: DetailView integration

**Files:**
- Modify: `web/src/components/DetailView.tsx`

**Interfaces:**
- Consumes from Task 4: `AccompaniersModal` with props `{ neighborhood, initialNames, onSave, onClose }`
- Consumes from Task 2: `detail.accompanierNames: string[]` (already on `NeighborhoodDetail`)

- [ ] **Step 1: Add import for `AccompaniersModal`**

  In `web/src/components/DetailView.tsx`, add to the imports at the top:
  ```ts
  import AccompaniersModal from './AccompaniersModal';
  ```

- [ ] **Step 2: Add list icon SVG**

  After the existing SVG icon components (`IcoDiagram`, `IcoExternalLink`, `IcoLogOut`, `IcoSave`), add:
  ```tsx
  const IcoList = () => (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  );
  ```

- [ ] **Step 3: Add `onLabelClick` and `highlighted` props to the `Field` component**

  Find the `Field` function definition:
  ```tsx
  function Field({ label, value, onChange, readonly, type, integer }: {
    label: string; value: string; onChange?: (v: string) => void; readonly?: boolean; type?: string; integer?: boolean;
  }) {
    const hasError = integer && !readonly && !isValidInt(value);
    const cls = [readonly ? 'ro' : '', hasError ? 'error' : ''].filter(Boolean).join(' ');
    return (
      <div className="field">
        <label>{label}</label>
        <input
          type={type || 'text'}
          value={value || ''}
          readOnly={readonly}
          className={cls || undefined}
          onChange={e => onChange?.(e.target.value)}
        />
      </div>
    );
  }
  ```

  Replace it with:
  ```tsx
  function Field({ label, value, onChange, readonly, type, integer, onLabelClick, highlighted }: {
    label: string; value: string; onChange?: (v: string) => void; readonly?: boolean; type?: string; integer?: boolean;
    onLabelClick?: () => void; highlighted?: boolean;
  }) {
    const hasError = integer && !readonly && !isValidInt(value);
    const cls = [readonly ? 'ro' : '', hasError ? 'error' : '', highlighted ? 'overridden' : ''].filter(Boolean).join(' ');
    return (
      <div className="field">
        {onLabelClick
          ? <label onClick={onLabelClick} style={{ cursor: 'pointer', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 }}>{label} <IcoList /></label>
          : <label>{label}</label>
        }
        <input
          type={type || 'text'}
          value={value || ''}
          readOnly={readonly}
          className={cls || undefined}
          onChange={e => onChange?.(e.target.value)}
        />
      </div>
    );
  }
  ```

- [ ] **Step 4: Add accompanierNames state and modal visibility to `DetailView`**

  Inside the `DetailView` function, find the existing `useState` declarations:
  ```tsx
  const [showDiagram, setShowDiagram] = useState(false);
  ```

  After that line, add:
  ```tsx
  const [accompanierNames, setAccompanierNames] = useState<string[]>(() => detail.accompanierNames);
  const [showAccompaniersModal, setShowAccompaniersModal] = useState(false);
  ```

- [ ] **Step 5: Compute the mismatch flag**

  Find the block that starts:
  ```tsx
  const edTotal  = actTotal([...
  ```

  Before that block, add:
  ```tsx
  const accompaniersMismatch = accompanierNames.length > 0 &&
    accompanierNames.length !== parseInt(form.accompaniers || '0', 10);
  ```

- [ ] **Step 6: Update the Accompaniers field to use clickable label and mismatch hint**

  Find:
  ```tsx
  <Field label="Accompaniers in Nucleus" value={form.accompaniers} onChange={v => set('accompaniers', v)} integer />
  ```

  Replace with:
  ```tsx
  <Field
    label="Accompaniers in Nucleus"
    value={form.accompaniers}
    onChange={v => set('accompaniers', v)}
    integer
    highlighted={accompaniersMismatch}
    onLabelClick={() => setShowAccompaniersModal(true)}
  />
  ```

- [ ] **Step 7: Add the modal to the render output**

  Find the closing of the diagram modal block:
  ```tsx
      )}
  ```
  (the one that closes the `{showDiagram && (...)}`  block, just before `<div className="footer">`)

  After that closing `)}`, add:
  ```tsx
      {showAccompaniersModal && (
        <AccompaniersModal
          neighborhood={row.neighborhood}
          initialNames={accompanierNames}
          onSave={names => { setAccompanierNames(names); setShowAccompaniersModal(false); }}
          onClose={() => setShowAccompaniersModal(false)}
        />
      )}
  ```

- [ ] **Step 8: Run all tests**

  ```
  npm test
  ```
  Expected: all tests PASS.

- [ ] **Step 9: Confirm TypeScript compiles**

  ```
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add web/src/components/DetailView.tsx
  git commit -m "feat: wire AccompaniersModal into DetailView with clickable label and mismatch hint"
  ```

---

## Manual Verification Checklist

Before calling the feature complete:

- [ ] Create the `Accompaniers` tab manually in the master Google Sheet with headers in row 1: `cluster | cluster_code | locality | parent_neighborhood | neighborhood | name`
- [ ] Open the app and navigate to a neighborhood's Detail View
- [ ] Click "Accompaniers in Nucleus" label — modal opens
- [ ] Add a name, click Add — name appears in list
- [ ] Add a second name, use ↑/↓ to reorder — order changes correctly
- [ ] Click × on a name — it is removed
- [ ] Click Save — modal closes, no error shown
- [ ] Open the `Accompaniers` tab in Sheets — rows are present with correct context columns
- [ ] Enter a count in the Accompaniers count field that differs from the list length — field shows amber outline
- [ ] Make the count match the list length — amber outline disappears
- [ ] Click Cancel after adding names — modal closes, no changes saved, list unchanged
