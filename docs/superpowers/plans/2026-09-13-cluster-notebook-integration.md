# Cluster-notebook Integration (Devotionals Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the per-nucleus devotional-gathering rollup (`NucleusRow.activities.devotionals`) through cluster-notebook's GraphQL API instead of the `Nuclei` Google Sheet, as the first field in an incremental Sheets → cluster-notebook migration.

**Architecture:** A new thin fetch-based GraphQL client (`lib/clusterNotebook.ts`) mirrors the existing `lib/sheets.ts` wrapper style. `lib/data.ts`'s `getRowData`/`saveRowData` call it for the devotionals sub-object only; every other field keeps reading/writing the Sheet exactly as today. No frontend changes — the merged shape returned to the UI is unchanged.

**Tech Stack:** TypeScript, Next.js API routes, Vitest, native `fetch` (no new GraphQL client dependency).

**Spec:** `docs/superpowers/specs/2026-09-13-cluster-notebook-integration-design.md`

## Global Constraints

- No new GraphQL client library (Apollo/urql/graphql-request) — plain `fetch`, per spec.
- `CLUSTER_NOTEBOOK_URL` env var, defaulting to `http://localhost:8000`; never set in Vercel — `main`'s deployment is unaffected.
- No frontend changes — `DetailView.tsx` and `types.ts` are untouched; the `NucleusDetail`/`NucleusRow` shape returned by the API stays identical.
- No fallback/degradation logic on cluster-notebook failure — let the error propagate exactly like a `sheetsGet`/`sheetsBatchUpdate` failure does today.
- Out of scope entirely (unchanged in this plan): access control (`lib/access.ts`), the SRP-cache comparison reads (`getAllDevRows`/`getAllEduRows`/`parseSrpData`), worker lists, every `NucleusRow` field other than `activities.devotionals`.

---

### Task 1: `lib/clusterNotebook.ts` — GraphQL client

**Files:**
- Create: `web/src/lib/clusterNotebook.ts`
- Test: `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces: `export interface DevotionalGathering { number: number | null; participants: number | null; participantsFof: number | null }`, `export async function getDevotionalGathering(nucleusName: string): Promise<DevotionalGathering | null>`, `export async function updateDevotionalGathering(nucleusName: string, fields: { number?: number | null; participants?: number | null; participantsFof?: number | null }): Promise<DevotionalGathering | null>` — both used by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Create `web/src/lib/clusterNotebook.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { getDevotionalGathering, updateDevotionalGathering } from './clusterNotebook';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mockFetch);
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  };
}

describe('getDevotionalGathering', () => {
  test('sends a query for the nucleus and returns its devotionalGathering', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { nucleus: { devotionalGathering: { number: 4, participants: 30, participantsFof: 10 } } },
    }));

    const result = await getDevotionalGathering('Alpha');

    expect(result).toEqual({ number: 4, participants: 30, participantsFof: 10 });
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000');
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ name: 'Alpha' });
    expect(body.query).toContain('devotionalGathering');
  });

  test('returns null when the nucleus is not found', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: null } }));

    const result = await getDevotionalGathering('Nonexistent');

    expect(result).toBeNull();
  });

  test('returns null when devotionalGathering itself is null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { nucleus: { devotionalGathering: null } } }));

    const result = await getDevotionalGathering('Alpha');

    expect(result).toBeNull();
  });

  test('throws when the HTTP response is not ok', async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, false, 500));

    await expect(getDevotionalGathering('Alpha')).rejects.toThrow('cluster-notebook request failed: 500');
  });

  test('throws when the response contains GraphQL errors', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ errors: [{ message: 'nucleus name is required' }] }));

    await expect(getDevotionalGathering('Alpha')).rejects.toThrow('nucleus name is required');
  });
});

describe('updateDevotionalGathering', () => {
  test('sends a mutation with the given fields and returns the updated value', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateDevotionalGathering: { devotionalGathering: { number: 5, participants: 40, participantsFof: 12 } } },
    }));

    const result = await updateDevotionalGathering('Alpha', { number: 5, participants: 40, participantsFof: 12 });

    expect(result).toEqual({ number: 5, participants: 40, participantsFof: 12 });
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: 5, participants: 40, participantsFof: 12 });
  });

  test('defaults omitted fields to null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({
      data: { updateDevotionalGathering: { devotionalGathering: { number: null, participants: null, participantsFof: null } } },
    }));

    await updateDevotionalGathering('Alpha', {});

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.variables).toEqual({ nucleusName: 'Alpha', number: null, participants: null, participantsFof: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/lib/clusterNotebook.test.ts`
Expected: FAIL — `Cannot find module './clusterNotebook'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/clusterNotebook.ts`:

```ts
const CLUSTER_NOTEBOOK_URL = process.env.CLUSTER_NOTEBOOK_URL || 'http://localhost:8000';

export interface DevotionalGathering {
  number: number | null;
  participants: number | null;
  participantsFof: number | null;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(CLUSTER_NOTEBOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`cluster-notebook request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`cluster-notebook GraphQL error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  return json.data as T;
}

export async function getDevotionalGathering(nucleusName: string): Promise<DevotionalGathering | null> {
  const query = `
    query GetNucleusDevotionalGathering($name: String!) {
      nucleus(name: $name) {
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ nucleus: { devotionalGathering: DevotionalGathering | null } | null }>(
    query,
    { name: nucleusName }
  );
  return data.nucleus?.devotionalGathering ?? null;
}

export async function updateDevotionalGathering(
  nucleusName: string,
  fields: { number?: number | null; participants?: number | null; participantsFof?: number | null }
): Promise<DevotionalGathering | null> {
  const mutation = `
    mutation UpdateDevotionalGathering($nucleusName: String!, $number: Int, $participants: Int, $participantsFof: Int) {
      updateDevotionalGathering(
        nucleusName: $nucleusName, number: $number, participants: $participants, participantsFof: $participantsFof
      ) {
        devotionalGathering { number participants participantsFof }
      }
    }
  `;
  const data = await request<{ updateDevotionalGathering: { devotionalGathering: DevotionalGathering | null } | null }>(
    mutation,
    {
      nucleusName,
      number: fields.number ?? null,
      participants: fields.participants ?? null,
      participantsFof: fields.participantsFof ?? null,
    }
  );
  return data.updateDevotionalGathering?.devotionalGathering ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/lib/clusterNotebook.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/clusterNotebook.ts web/src/lib/clusterNotebook.test.ts
git commit -m "feat: add cluster-notebook GraphQL client for devotional gathering"
```

---

### Task 2: Wire `getRowData` (read path) to cluster-notebook

**Files:**
- Modify: `web/src/lib/data.ts` (the `getRowData` function, currently at lines 119–145)
- Test: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: `getDevotionalGathering(nucleusName: string): Promise<DevotionalGathering | null>` and `DevotionalGathering` from Task 1's `./clusterNotebook`.
- Produces: `getRowData`'s return shape is unchanged (`{ row: NucleusRow, srp, accompanierNames, protagonistNames, abmAssistantNames } | null`) — only `row.activities.devotionals`'s data source changes. Later tasks/consumers see no interface change.

- [ ] **Step 1: Write the failing tests**

Add to `web/src/lib/data.test.ts`, near the top (after the existing imports), add the cluster-notebook mock and import:

```ts
vi.mock('./clusterNotebook', () => ({
  getDevotionalGathering: vi.fn(),
  updateDevotionalGathering: vi.fn(),
}));

import { getDevotionalGathering, updateDevotionalGathering } from './clusterNotebook';
import { getRowData, saveRowData } from './data';
import { MASTER_TAB } from './config';

const mockGetDevotionalGathering = vi.mocked(getDevotionalGathering);
const mockUpdateDevotionalGathering = vi.mocked(updateDevotionalGathering);
```

Then add this new `describe` block (anywhere after the `parseRow` block, e.g. right before `describe('findSrpRow', ...)`):

```ts
describe('getRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  test('overrides devotionals with cluster-notebook data, ignoring the sheet columns', async () => {
    const masterRow = makeRow({
      [COL.NUCLEUS]: 'Alpha',
      [COL.DEV_ACT]: '999', [COL.DEV_PART]: '999', [COL.DEV_FOF]: '999',
    });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue({ number: 4, participants: 30, participantsFof: 10 });

    const result = await getRowData('Alpha');

    expect(mockGetDevotionalGathering).toHaveBeenCalledWith('Alpha');
    expect(result?.row.activities.devotionals).toEqual({ act: '4', part: '30', fof: '10' });
  });

  test('renders a null cluster-notebook value as empty strings', async () => {
    const masterRow = makeRow({ [COL.NUCLEUS]: 'Alpha' });
    mockSheetsGet.mockImplementation(async (_id: string, range: string) => {
      if (range.startsWith(`${MASTER_TAB}!`)) return [masterRow];
      return [];
    });
    mockGetDevotionalGathering.mockResolvedValue(null);

    const result = await getRowData('Alpha');

    expect(result?.row.activities.devotionals).toEqual({ act: '', part: '', fof: '' });
  });

  test('returns null when the nucleus is not found in the sheet', async () => {
    mockSheetsGet.mockResolvedValue([]);
    mockGetDevotionalGathering.mockResolvedValue(null);

    const result = await getRowData('Nonexistent');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/lib/data.test.ts -t getRowData`
Expected: FAIL — `result?.row.activities.devotionals` is `{ act: '999', part: '999', fof: '999' }` (or similar), not the cluster-notebook value, since `getRowData` doesn't call `getDevotionalGathering` yet.

- [ ] **Step 3: Update the implementation**

In `web/src/lib/data.ts`, add the import near the top (with the other imports):

```ts
import { getDevotionalGathering, updateDevotionalGathering } from './clusterNotebook';
import type { DevotionalGathering } from './clusterNotebook';
```

Add this helper near `stripCommas`:

```ts
function devotionalsFromClusterNotebook(dg: DevotionalGathering | null) {
  return {
    act: dg?.number != null ? String(dg.number) : '',
    part: dg?.participants != null ? String(dg.participants) : '',
    fof: dg?.participantsFof != null ? String(dg.participantsFof) : '',
  };
}
```

Replace the body of `getRowData` (currently lines 119–145) with:

```ts
export async function getRowData(nucleusName: string) {
  const [masterRows, devRows, eduRows, accompanierNames, protagonistNames, abmAssistantNames, devotionalGathering] = await Promise.all([
    getAllMasterRows(), getAllDevRows(), getAllEduRows(),
    getWorkerNames(nucleusName, 'accompanier'),
    getWorkerNames(nucleusName, 'protagonist'),
    getWorkerNames(nucleusName, 'abm-assistant'),
    getDevotionalGathering(nucleusName),
  ]);

  const masterRow = masterRows.find(r => norm(r[COL.NUCLEUS]) === norm(nucleusName));
  if (!masterRow) return null;

  const lookup = (rows: string[][], nameCol: number) => {
    let match = findSrpRow(nucleusName, rows, nameCol);
    if (!match && masterRow[COL.PARENT_NUCLEUS]) {
      match = findSrpRow(`${masterRow[COL.PARENT_NUCLEUS]} - ${nucleusName}`, rows, nameCol);
    }
    return match;
  };

  const row = parseRow(masterRow);
  row.activities.devotionals = devotionalsFromClusterNotebook(devotionalGathering);

  return {
    row,
    srp: parseSrpData(lookup(devRows, DEV_COL.NAME), lookup(eduRows, EDU_COL.NAME)),
    accompanierNames,
    protagonistNames,
    abmAssistantNames,
  };
}
```

(`updateDevotionalGathering` is imported now but unused until Task 3 — this will produce a lint/TS "unused import" warning; that's expected and resolved by Task 3 in the same file. If running lint standalone after this task, ignore that one warning.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/lib/data.test.ts`
Expected: PASS — all prior tests in this file still pass, plus the 3 new `getRowData` tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/data.ts web/src/lib/data.test.ts
git commit -m "feat: read devotional gathering from cluster-notebook in getRowData"
```

---

### Task 3: Wire `saveRowData` (write path) to cluster-notebook

**Files:**
- Modify: `web/src/lib/data.ts` (the `saveRowData` function, currently at lines 267–317)
- Test: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: `updateDevotionalGathering(nucleusName: string, fields: { number?, participants?, participantsFof? }): Promise<DevotionalGathering | null>` from Task 1 (already imported in Task 2).
- Produces: `saveRowData`'s return shape is unchanged (`{ success: true, savedBy, savedAt }`).

- [ ] **Step 1: Write the failing tests**

Add this `describe` block to `web/src/lib/data.test.ts` (e.g. right after the new `getRowData` block):

```ts
describe('saveRowData', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseFormData = {
    locality: 'Durham',
    activities: {
      ccs:  { act: '1', part: '2', fof: '3' },
      jygs: { act: '', part: '', fof: '' },
      scs:  { act: '', part: '', fof: '' },
      devotionals: { act: '5', part: '40', fof: '12' },
    },
  };

  test('writes devotionals via cluster-notebook instead of the sheet', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue({ number: 5, participants: 40, participantsFof: 12 });

    await saveRowData('Alpha', baseFormData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: 5, participants: 40, participantsFof: 12,
    });

    const updates = mockSheetsBatchUpdate.mock.calls[0][1] as { values: string[][] }[];
    const writtenValues = updates.map(u => u.values[0][0]);
    expect(writtenValues).toContain('1'); // ccs.act still written to the sheet
    expect(writtenValues).not.toContain('5');  // devotionals.act must NOT reach the sheet
    expect(writtenValues).not.toContain('40'); // devotionals.part must NOT reach the sheet
    expect(writtenValues).not.toContain('12'); // devotionals.fof must NOT reach the sheet
  });

  test('sends null fields to cluster-notebook when devotionals values are blank', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '', part: '', fof: '' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: null, participants: null, participantsFof: null,
    });
  });

  test('strips commas before sending devotionals counts to cluster-notebook', async () => {
    mockSheetsGet.mockResolvedValue([makeRow({ [COL.NUCLEUS]: 'Alpha' })]);
    mockSheetsBatchUpdate.mockResolvedValue(undefined);
    mockUpdateDevotionalGathering.mockResolvedValue(null);

    const formData = { ...baseFormData, activities: { ...baseFormData.activities, devotionals: { act: '1,200', part: '900', fof: '0' } } };
    await saveRowData('Alpha', formData, 'me@x.com');

    expect(mockUpdateDevotionalGathering).toHaveBeenCalledWith('Alpha', {
      number: 1200, participants: 900, participantsFof: 0,
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd web && npx vitest run src/lib/data.test.ts -t saveRowData`
Expected: FAIL — `mockUpdateDevotionalGathering` was never called (0 calls), since `saveRowData` still writes devotionals to the sheet only.

- [ ] **Step 3: Update the implementation**

In `web/src/lib/data.ts`, add this helper near `devotionalsFromClusterNotebook` (added in Task 2):

```ts
function toIntOrNull(value: unknown): number | null {
  const cleaned = stripCommas(String(value ?? ''));
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? null : n;
}
```

In `saveRowData`, remove these three lines from the `updates` array:

```ts
    [COL.DEV_ACT, d.activities.devotionals.act], [COL.DEV_PART, d.activities.devotionals.part], [COL.DEV_FOF, d.activities.devotionals.fof],
```

Then replace the function's final two lines —

```ts
  await sheetsBatchUpdate(MASTER_SHEET_ID, updates);
  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
```

— with:

```ts
  const writes: Promise<unknown>[] = [sheetsBatchUpdate(MASTER_SHEET_ID, updates)];
  if (d.activities?.devotionals) {
    writes.push(updateDevotionalGathering(nucleusName, {
      number: toIntOrNull(d.activities.devotionals.act),
      participants: toIntOrNull(d.activities.devotionals.part),
      participantsFof: toIntOrNull(d.activities.devotionals.fof),
    }));
  }
  await Promise.all(writes);

  return { success: true, savedBy: userEmail, savedAt: new Date().toISOString() };
```

Note: `d.activities.ccs.act` etc. above this point are still accessed unconditionally (pre-existing behavior, not part of this migration) — `saveRowData` already assumes `formData.activities` is always present when called. The `d.activities?.devotionals` guard added here is only for the new cluster-notebook call, consistent with that existing assumption.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd web && npx vitest run src/lib/data.test.ts`
Expected: PASS — every test in the file, including all 3 new `saveRowData` tests.

- [ ] **Step 5: Run the full test suite and lint**

Run: `cd web && npm run test && npm run lint`
Expected: both PASS with no errors (the "unused import" warning from Task 2 is gone now that `updateDevotionalGathering` is used).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/data.ts web/src/lib/data.test.ts
git commit -m "feat: write devotional gathering to cluster-notebook in saveRowData"
```

---

### Task 4: Local dev configuration and manual end-to-end verification

**Files:**
- Modify: `web/.env.local` (add one line; this file is gitignored, so this step is not committed)
- Modify: `web/README.md` (add a short "Local dev with cluster-notebook" section)

**Interfaces:** None — this task adds configuration and manual verification, not code.

- [ ] **Step 1: Add the environment variable**

Append to `web/.env.local`:

```
CLUSTER_NOTEBOOK_URL=http://localhost:8000
```

- [ ] **Step 2: Document local dev startup**

Add this section to `web/README.md`:

```markdown
## Local dev with cluster-notebook

The devotional-gathering field is served by `cluster-notebook`, a separate service. Run it alongside this app:

\`\`\`bash
cd ../../cluster-notebook && .venv/bin/uvicorn cluster_notebook.app:app --reload
\`\`\`

It listens on `http://localhost:8000` by default (matches `CLUSTER_NOTEBOOK_URL` in `.env.local`). Requires a local Postgres instance per `cluster-notebook`'s own README/`.env`.
```

- [ ] **Step 3: Manual verification**

With `cluster-notebook` running (Step 1 above) and seeded with at least one nucleus (see `cluster-notebook/scripts/seed_chapel_hill.py`):

1. Run `cd web && npm run dev`.
2. Sign in and open a nucleus detail view for a nucleus name that exists in both the Sheet and cluster-notebook's seed data.
3. Confirm the Devotionals activity card shows the value from cluster-notebook (not the Sheet's `DEV_ACT`/`DEV_PART`/`DEV_FOF` columns — temporarily edit the sheet's raw columns to a distinct value to confirm it's ignored).
4. Edit the Devotionals fields and save. Confirm the save succeeds and the displayed value reflects the edit after a reload.
5. Query cluster-notebook directly (`curl -X POST http://localhost:8000 -H 'Content-Type: application/json' -d '{"query":"{ nucleus(name: \"<name>\") { devotionalGathering { number participants participantsFof } } }"}'`) to confirm the write landed there.
6. Stop `cluster-notebook` (Ctrl-C) and confirm loading that nucleus's detail view now surfaces a visible error (per the "no fallback" design decision) rather than failing silently.

- [ ] **Step 4: Commit the README change**

```bash
git add web/README.md
git commit -m "docs: document local dev setup with cluster-notebook"
```

---

## Self-review notes

- **Spec coverage:** Architecture (Task 1), read path (Task 2), write path (Task 3), local dev setup (Task 4) all map to the spec's corresponding sections. Error handling (no fallback) is verified manually in Task 4 Step 3.6 and structurally guaranteed by Task 1's `request()` throwing on any failure — no `try/catch` swallowing it anywhere in Tasks 2–3.
- **Type consistency:** `DevotionalGathering` (Task 1) is the single type used in Task 2's `devotionalsFromClusterNotebook` and Task 3's `updateDevotionalGathering` call — no renamed duplicates.
- **No placeholders:** every step has literal code or literal shell commands.
