# Real Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the everyone-admin authorization stopgap with cluster-notebook's real per-entity `PermissionSet`, fix two real UI gating bugs discovered along the way, and replace the Sheet-backed access-grant system with one built on cluster-notebook's own role assignment.

**Architecture:** New cluster-notebook client functions and `access.ts` helpers are added additively first (nothing removed yet, old stopgap keeps working), then each of the 5 API routes and 2 UI components is migrated off the stopgap one at a time, then a new `/api/roles` route and `ManageAccessCard` component are added, then the old stopgap/Sheet-backed system is deleted only once nothing references it anymore — same additive-then-migrate-then-remove shape as the Clerk auth swap plan.

**Tech Stack:** Next.js 16, TypeScript, Vitest, cluster-notebook's GraphQL API.

**Spec:** `docs/superpowers/specs/2026-09-24-real-authorization-design.md`

## Global Constraints

- Every cluster-notebook query/mutation shape below is confirmed live (cross-session consultation, 2026-09-24) — not assumed. Do not second-guess field names against training data.
- `PermissionSet` field names, exact: `canRead`, `canWrite`, `canChangeIdentity`, `canDelete`, `canAssignRoles`, `assignableRoles: [String!]!`, `createableEntityTypes: [String!]!`.
- Recognized worker-list roles (gated by `assignableRoles` membership, not just `canAssignRoles`): `accompanier`, `contact`, `abm-assistant`. Informal (gated by `canAssignRoles` alone): `protagonist`, `promoter`.
- `Query.myPermissions(entityName)` returns `null` for an unrecognized entity name — every caller in this plan normalizes that to an all-false `PermissionSet` via `getNucleusPermissions()` (Task 2), never to a thrown error.
- `updateNucleusWorkers`/`workers(role:)` accept any role string, recognized or informal, with no separate mechanism — confirmed live.
- Permission denials from cluster-notebook already surface as `ClusterNotebookForbiddenError` / a 403 via `clusterNotebookErrorResponse()` (`web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebookError.ts`) — nothing in this plan touches that.
- Follow the additive-then-migrate-then-remove task ordering below exactly. Do not delete `getAccess()`/`UserAccess`/the Access Sheet code/`Role`/`AccessEntry` before every consumer has stopped using them (Task 11 only).

---

### Task 1: Extend `clusterNotebook.ts` with permission queries

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`
- Test: `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces: `PermissionSet` interface; `NucleusSummary.myPermissions: PermissionSet` (existing type, extended); `RoleGrant` interface; `getMyPermissions(entityName: string): Promise<PermissionSet | null>`; `getAssignableRoleDetails(entityName: string): Promise<RoleGrant[]>`; `getIsAdministrator(): Promise<boolean>`. Consumed by Task 2 (`access.ts`) and Task 7 (`/api/roles`).
- Purely additive — `getAllNuclei()`'s return shape grows a field, nothing existing changes meaning.

- [ ] **Step 1: Write the failing tests**

Add this constant near `ACTIVITY_SUMMARY_SELECTION` in `web/src/lib/clusterNotebook.ts` (for reference while writing the test — the actual addition happens in Step 3):
```ts
const PERMISSION_SET_SELECTION = 'canRead canWrite canChangeIdentity canDelete canAssignRoles assignableRoles createableEntityTypes';
```

In `web/src/lib/clusterNotebook.test.ts`, update the existing `getAllNuclei` test's fixtures to include `myPermissions`, and add three new `describe` blocks. First, replace the two nucleus fixtures in the existing `'returns the full nucleus list...'` test (inside `describe('getAllNuclei', ...)`) so each includes a `myPermissions` object:

```ts
          {
            name: 'Alpha', stage: 'Initial/2', locality: 'Durham', populationMakeup: 'Mixed', nucleusType: 'Neighborhood',
            devotionalGathering: alphaActivities, childrensClasses: alphaActivities, juniorYouthGroups: alphaActivities, studyCircles: alphaActivities,
            cluster: { name: 'NC-215 Triangle', groupOfClusters: 'NC Eastern', growthMilestone: 'IPG Embracing Large Numbers', auxiliaryBoardMembers: null },
            parentNucleus: { name: 'Chapelboro' },
            myPermissions: { canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true, assignableRoles: ['accompanier'], createableEntityTypes: [] },
          },
          {
            name: 'Beta', stage: null, locality: null, populationMakeup: null, nucleusType: null,
            devotionalGathering: null, childrensClasses: null, juniorYouthGroups: null, studyCircles: null,
            cluster: { name: 'NC-330 Foothills', groupOfClusters: null, growthMilestone: null, auxiliaryBoardMembers: null },
            parentNucleus: null,
            myPermissions: { canRead: true, canWrite: false, canChangeIdentity: false, canDelete: false, canAssignRoles: false, assignableRoles: [], createableEntityTypes: [] },
          },
```

Then add these assertions right after the existing `expect(result[1].parentNucleus).toBeNull();` line, before the `body.query.toContain(...)` block:
```ts
    expect(result[0].myPermissions).toEqual({ canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true, assignableRoles: ['accompanier'], createableEntityTypes: [] });
    expect(result[1].myPermissions.canWrite).toBe(false);
```
And add one more `toContain` assertion alongside the existing ones:
```ts
    expect(body.query).toContain('myPermissions');
```

Then append these three new `describe` blocks at the end of the file (after the existing `describe('request (permission errors)', ...)` block):

```ts
describe('getMyPermissions', () => {
  test('returns the PermissionSet for a known entity', async () => {
    const permissions = { canRead: true, canWrite: true, canChangeIdentity: true, canDelete: false, canAssignRoles: true, assignableRoles: ['ATC-Collaborator'], createableEntityTypes: ['individual', 'nucleus', 'setting'] };
    mockFetch.mockResolvedValue(jsonResponse({ data: { myPermissions: permissions } }));

    const result = await getMyPermissions('NC-215 Triangle');

    expect(result).toEqual(permissions);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.variables).toEqual({ entityName: 'NC-215 Triangle' });
    expect(body.query).toContain('myPermissions');
  });

  test('returns null for an entity name cluster-notebook does not recognize', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { myPermissions: null } }));

    const result = await getMyPermissions('Nonexistent');

    expect(result).toBeNull();
  });
});

describe('getAssignableRoleDetails', () => {
  test('returns the list of role/permissions pairs', async () => {
    const roles = [
      { role: 'ATC-Collaborator', permissions: { canRead: true, canWrite: true, canChangeIdentity: true, canDelete: false, canAssignRoles: true, assignableRoles: [], createableEntityTypes: [] } },
      { role: 'accompanier', permissions: { canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true, assignableRoles: [], createableEntityTypes: [] } },
    ];
    mockFetch.mockResolvedValue(jsonResponse({ data: { assignableRoleDetails: roles } }));

    const result = await getAssignableRoleDetails('NC-215 Triangle');

    expect(result).toEqual(roles);
  });

  test('returns an empty array when cluster-notebook returns null', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { assignableRoleDetails: null } }));

    const result = await getAssignableRoleDetails('Nonexistent');

    expect(result).toEqual([]);
  });
});

describe('getIsAdministrator', () => {
  test('returns true for an administrator', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { isAdministrator: true } }));
    expect(await getIsAdministrator()).toBe(true);
  });

  test('returns false for a non-administrator', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { isAdministrator: false } }));
    expect(await getIsAdministrator()).toBe(false);
  });
});
```

Update the test file's import block to add the new functions:
```ts
import {
  getActivitySummaries, updateActivitySummary, getAllNuclei, getNucleusFields, updateNucleus,
  searchIndividuals, createIndividual, getNucleusWorkers, updateNucleusWorkers, individualDisplayName,
  getClusters, createNucleus, deleteNucleus, ClusterNotebookForbiddenError,
  getMyPermissions, getAssignableRoleDetails, getIsAdministrator,
} from './clusterNotebook';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- clusterNotebook.test`
Expected: FAIL — `getMyPermissions`/`getAssignableRoleDetails`/`getIsAdministrator` are not exported yet, and the extended `getAllNuclei` fixtures/assertions don't match the current (un-extended) query/return shape.

- [ ] **Step 3: Write the implementation**

In `web/src/lib/clusterNotebook.ts`, add the `PERMISSION_SET_SELECTION` constant near `ACTIVITY_SUMMARY_SELECTION`:
```ts
const PERMISSION_SET_SELECTION = 'canRead canWrite canChangeIdentity canDelete canAssignRoles assignableRoles createableEntityTypes';
```

Add the `PermissionSet` interface near `ActivitySummary`:
```ts
// Confirmed live with cluster-notebook 2026-09-24. canChangeIdentity gates a
// Nucleus's Type/Stage (and any future rename/relocate) specifically -- a
// stricter tier than plain canWrite. assignableRoles lists which RECOGNIZED
// roles this caller may grant here; informal roles (protagonist/promoter) are
// always assignable whenever canAssignRoles is true, regardless of this list.
export interface PermissionSet {
  canRead: boolean;
  canWrite: boolean;
  canChangeIdentity: boolean;
  canDelete: boolean;
  canAssignRoles: boolean;
  assignableRoles: string[];
  createableEntityTypes: string[];
}
```

Extend `NucleusSummary` (add the field, keep everything else unchanged):
```ts
export interface NucleusSummary {
  name: string;
  stage: string | null;
  locality: string | null;
  populationMakeup: string | null;
  nucleusType: string | null;
  devotionalGathering: ActivitySummary | null;
  childrensClasses: ActivitySummary | null;
  juniorYouthGroups: ActivitySummary | null;
  studyCircles: ActivitySummary | null;
  cluster: ClusterFields;
  parentNucleus: { name: string } | null;
  // Added 2026-09-24 for real per-nucleus authorization -- fetched in the same
  // request as the rest of the list (cluster-notebook designed this as a field
  // specifically so a list of nuclei costs one request, not one per nucleus).
  myPermissions: PermissionSet;
}
```

Extend `getAllNuclei()`'s query string:
```ts
export async function getAllNuclei(): Promise<NucleusSummary[]> {
  const query = `
    query GetAllNuclei {
      nuclei {
        name stage locality populationMakeup nucleusType
        devotionalGathering { ${ACTIVITY_SUMMARY_SELECTION} }
        childrensClasses { ${ACTIVITY_SUMMARY_SELECTION} }
        juniorYouthGroups { ${ACTIVITY_SUMMARY_SELECTION} }
        studyCircles { ${ACTIVITY_SUMMARY_SELECTION} }
        cluster { name groupOfClusters growthMilestone auxiliaryBoardMembers }
        parentNucleus { name }
        myPermissions { ${PERMISSION_SET_SELECTION} }
      }
    }
  `;
  const data = await request<{ nuclei: NucleusSummary[] }>(query, {});
  return data.nuclei;
}
```

Add these three new functions at the end of the file (after `updateNucleusWorkers`):
```ts
// Ad hoc, single-entity permission check -- works on Nucleus, Cluster, Locality,
// or Setting names (confirmed live). Null means cluster-notebook doesn't
// recognize entityName; callers normalize that themselves (see access.ts's
// getNucleusPermissions) rather than this function guessing at a default.
export async function getMyPermissions(entityName: string): Promise<PermissionSet | null> {
  const query = `
    query GetMyPermissions($entityName: String!) {
      myPermissions(entityName: $entityName) { ${PERMISSION_SET_SELECTION} }
    }
  `;
  const data = await request<{ myPermissions: PermissionSet | null }>(query, { entityName });
  return data.myPermissions;
}

// role + its real PermissionSet together, so a picker can describe what a role
// actually does ("can edit this nucleus's name/location") instead of showing a
// bare role name.
export interface RoleGrant {
  role: string;
  permissions: PermissionSet;
}

export async function getAssignableRoleDetails(entityName: string): Promise<RoleGrant[]> {
  const query = `
    query GetAssignableRoleDetails($entityName: String!) {
      assignableRoleDetails(entityName: $entityName) { role permissions { ${PERMISSION_SET_SELECTION} } }
    }
  `;
  const data = await request<{ assignableRoleDetails: RoleGrant[] | null }>(query, { entityName });
  return data.assignableRoleDetails ?? [];
}

// The one true global/org-wide concept (the Administrator role, no entity
// attached) -- confirmed live 2026-09-24. Not the same as having elevated
// PermissionSet values everywhere; this is a direct, explicit check.
export async function getIsAdministrator(): Promise<boolean> {
  const query = `
    query GetIsAdministrator {
      isAdministrator
    }
  `;
  const data = await request<{ isAdministrator: boolean }>(query, {});
  return data.isAdministrator;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- clusterNotebook.test`
Expected: PASS (all tests, including the extended `getAllNuclei` ones and the 6 new tests across the 3 new `describe` blocks).

- [ ] **Step 5: Run the full suite and typecheck**

```bash
npx tsc --noEmit
npm run test
```
Expected: both clean. (`data.test.ts`'s mock of `./clusterNotebook` is a full module mock, unaffected by this change — no update needed there, matching the same reasoning already recorded for the Clerk plan's token-forwarding task.)

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/clusterNotebook.ts web/src/lib/clusterNotebook.test.ts
git commit -m "feat: add permission queries to clusterNotebook.ts (myPermissions, assignableRoleDetails, isAdministrator)"
```

---

### Task 2: Add `getNucleusPermissions`/`isAdministrator` to `access.ts`

**Files:**
- Modify: `web/src/lib/access.ts` (additive — the old `getAccess()`/`UserAccess` stay, untouched)
- Modify: `web/src/lib/access.test.ts` (additive — old tests stay, untouched)

**Interfaces:**
- Consumes: `getMyPermissions`, `getIsAdministrator`, `PermissionSet` from `web/src/lib/clusterNotebook.ts` (Task 1).
- Produces: `getNucleusPermissions(entityName: string): Promise<PermissionSet>` (never null — normalizes an unrecognized entity to an all-false `PermissionSet`); `isAdministrator(): Promise<boolean>` (re-export). Consumed by Tasks 3-7.
- The old `getAccess(userId)` / `UserAccess` stay exactly as they are — do not touch, do not remove yet (Task 11 removes them, once nothing calls them).

- [ ] **Step 1: Write the failing test**

Append to `web/src/lib/access.test.ts` (keep the existing `describe('getAccess (everyone-admin stopgap)', ...)` block untouched, add this alongside it):

```ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('./clusterNotebook', () => ({
  getMyPermissions: vi.fn(),
  getIsAdministrator: vi.fn(),
}));

import { getAccess, getNucleusPermissions, isAdministrator } from './access';
import { getMyPermissions, getIsAdministrator } from './clusterNotebook';

const mockGetMyPermissions = vi.mocked(getMyPermissions);
const mockGetIsAdministrator = vi.mocked(getIsAdministrator);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getAccess (everyone-admin stopgap)', () => {
  // ... existing 2 tests stay exactly as they are ...
});

describe('getNucleusPermissions', () => {
  test('returns the real PermissionSet when cluster-notebook recognizes the entity', async () => {
    const permissions = { canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true, assignableRoles: ['accompanier'], createableEntityTypes: [] };
    mockGetMyPermissions.mockResolvedValue(permissions);

    const result = await getNucleusPermissions('South Estes');

    expect(result).toEqual(permissions);
    expect(mockGetMyPermissions).toHaveBeenCalledWith('South Estes');
  });

  test('returns an all-false PermissionSet when cluster-notebook returns null', async () => {
    mockGetMyPermissions.mockResolvedValue(null);

    const result = await getNucleusPermissions('Nonexistent');

    expect(result).toEqual({
      canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
      canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
    });
  });
});

describe('isAdministrator', () => {
  test('re-exports getIsAdministrator', async () => {
    mockGetIsAdministrator.mockResolvedValue(true);
    expect(await isAdministrator()).toBe(true);
  });
});
```

Note: this replaces the test file's plain `import { describe, test, expect } from 'vitest';` and `import { getAccess } from './access';` lines at the top with the block shown above (the `vi.mock` call must come before the `./access` import, matching the pattern already used in `clusterNotebook.test.ts`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- access.test`
Expected: FAIL — `getNucleusPermissions`/`isAdministrator` are not exported from `./access` yet.

- [ ] **Step 3: Write the implementation**

Add to the end of `web/src/lib/access.ts` (after the existing `getAccess` function — do not modify or remove anything above it):

```ts
import { getMyPermissions } from './clusterNotebook';
import type { PermissionSet } from './clusterNotebook';

export type { PermissionSet };
export { getIsAdministrator as isAdministrator } from './clusterNotebook';

const NO_ACCESS: PermissionSet = {
  canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
  canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
};

// Real per-entity permissions from cluster-notebook, replacing the everyone-admin
// stopgap above (getAccess/UserAccess -- kept temporarily, removed once every
// caller has migrated to this; see docs/superpowers/specs/2026-09-24-real-
// authorization-design.md). `entityName` is a Nucleus, Cluster, Locality, or
// Setting name on cluster-notebook's side. A name cluster-notebook doesn't
// recognize resolves to NO_ACCESS rather than throwing -- every route's own
// 401/403/404 logic downstream already handles "denied" correctly, so there's
// no need for callers to special-case "unknown entity" separately from "known
// entity, no permission".
export async function getNucleusPermissions(entityName: string): Promise<PermissionSet> {
  const permissions = await getMyPermissions(entityName);
  return permissions ?? NO_ACCESS;
}
```

Since these new imports (`import { getMyPermissions } from './clusterNotebook';` etc.) are added partway through the file rather than at the top, move them to the top of the file alongside the existing `import type { Role, AccessEntry } from '@/types';` line instead, for normal import-ordering style — the code above shows what to add; place the `import`/`export type`/`export {...}` lines at the top of the file, and the `NO_ACCESS` constant + `getNucleusPermissions` function after the existing `getAccess` function.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- access.test`
Expected: PASS (all tests, old and new — 2 old + 3 new = 5).

- [ ] **Step 5: Run the full suite and typecheck**

```bash
npx tsc --noEmit
npm run test
```
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/access.ts web/src/lib/access.test.ts
git commit -m "feat: add getNucleusPermissions/isAdministrator to access.ts (additive, stopgap untouched)"
```

---

### Task 3: Migrate `/api/nucleus` to real permissions

**Files:**
- Modify: `web/src/app/api/nucleus/route.ts` (entire file)

**Interfaces:**
- Consumes: `getNucleusPermissions` from `@/lib/access` (Task 2).
- No test file exists for this route (matches the pattern already established — no route-level tests in this repo).

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { getRowData, saveRowData, createRowData, deleteRowData, CodedError } from '@/lib/data';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const data = await getRowData(name);
    if (!data) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, formData } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip identity-changing fields unless caller has canChangeIdentity (defense-in-depth)
  if (!permissions.canChangeIdentity) {
    delete formData.identity;
    delete formData.locality;
    delete formData.stage;
    delete formData.auxBoard;
  }

  const email = await getCurrentUserEmail();
  try {
    const result = await saveRowData(name, formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canDelete) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const deleted = await deleteRowData(name);
    if (!deleted) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { formData } = await req.json();
  const d = formData as { identity?: { cluster?: string } } | undefined;
  const clusterName = (d?.identity?.cluster || '').trim();
  if (!clusterName) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });

  const permissions = await getNucleusPermissions(clusterName);
  if (!permissions.createableEntityTypes.includes('nucleus')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const email = await getCurrentUserEmail();

  try {
    const result = await createRowData(formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof CodedError && e.code === 'CONFLICT') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof CodedError && e.code === 'BAD_CLUSTER') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return clusterNotebookErrorResponse(e);
  }
}
```

(GET/POST/DELETE's business logic — field-stripping, 404 handling, delete-then-check-boolean — is unchanged from before; only the authorization source changed, plus DELETE now reads `name` before checking permissions since the check is per-nucleus now, not global. PUT's flow reorders to extract `clusterName` before checking permissions, since creation is gated by the target Cluster's `createableEntityTypes`, not a global flag.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/nucleus/route.ts
git commit -m "feat: migrate /api/nucleus to real per-entity permissions"
```

---

### Task 4: Migrate `/api/workers` to real permissions, relax type validation

**Files:**
- Modify: `web/src/lib/config.ts`
- Modify: `web/src/app/api/workers/route.ts` (entire file)

**Interfaces:**
- Consumes: `getNucleusPermissions` from `@/lib/access` (Task 2).
- Produces: `RECOGNIZED_WORKER_TYPES` constant in `config.ts`. Consumed by this task's own route; not by anything else in this plan.
- `WORKER_TYPES.includes(type)` validation is **removed** from both GET and POST — cluster-notebook's `role` argument is a fully open string with no fixed enum (confirmed), and the new manage-access card (Task 8) needs to fetch/assign roles outside the old fixed `WORKER_TYPES` list (e.g. `"ATC-Collaborator"`). The real gate is the permission check, not a hardcoded whitelist.

- [ ] **Step 1: Add the recognized/informal distinction to config.ts**

In `web/src/lib/config.ts`, add this after the existing `WORKER_TYPES`/`WorkerType` block:

```ts
// Confirmed with cluster-notebook 2026-09-24: accompanier/contact/abm-assistant
// are REAL recognized roles now (real permission grants, e.g. accompanier is
// read+write) -- assigning someone into one requires that role name to appear
// in the assigner's PermissionSet.assignableRoles, same as ATC/CIC/CSO/etc.
// protagonist/promoter stay informal (freely assignable whenever canAssignRoles
// is true) -- cluster-notebook's own open question (their issue #14), not
// something this app decides.
export const RECOGNIZED_WORKER_TYPES = ['accompanier', 'contact', 'abm-assistant'] as const;
```

- [ ] **Step 2: Replace `workers/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusWorkers, updateNucleusWorkers, individualDisplayName } from '@/lib/clusterNotebook';
import type { Individual } from '@/lib/clusterNotebook';
import { RECOGNIZED_WORKER_TYPES } from '@/lib/config';
import type { Worker } from '@/types';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const workers = await getNucleusWorkers(name, type);
    return NextResponse.json({ workers: toWorkers(workers) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, personIds } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!Array.isArray(personIds)) return NextResponse.json({ error: 'personIds must be an array' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canAssignRoles) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const isRecognized = (RECOGNIZED_WORKER_TYPES as readonly string[]).includes(type);
  if (isRecognized && !permissions.assignableRoles.includes(type)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const workers = await updateNucleusWorkers(nucleus, type, personIds);
    return NextResponse.json({ workers: toWorkers(workers) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/config.ts web/src/app/api/workers/route.ts
git commit -m "feat: migrate /api/workers to real permissions, relax type validation"
```

---

### Task 5: Migrate `/api/individuals` to real permissions

**Files:**
- Modify: `web/src/app/api/individuals/route.ts` (entire file)

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { searchIndividuals, createIndividual, individualDisplayName } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// Both routes require write access, matching /api/workers -- searching/creating
// individuals only ever happens as part of editing a worker list, never a pure
// read view.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  const search = req.nextUrl.searchParams.get('search') || undefined;
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const individuals = await searchIndividuals(nucleus, search);
    return NextResponse.json({
      individuals: individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind) })),
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, name } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const individual = await createIndividual(String(name).trim(), nucleus);
    return NextResponse.json({ id: individual.id, name: individualDisplayName(individual) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/individuals/route.ts
git commit -m "feat: migrate /api/individuals to real permissions"
```

---

### Task 6: Migrate `/api/initial-data` to real permissions

**Files:**
- Modify: `web/src/app/api/initial-data/route.ts` (entire file)
- Modify: `web/src/types.ts` (`InitialData`'s `access` field shape)

**Interfaces:**
- Produces: `InitialData.access` becomes `{ isAdministrator: boolean; permissions: Record<string, PermissionSet> }` (was `{ roleMap: Record<string, Role> }`). Consumed by Task 10 (`AppClient.tsx`).

- [ ] **Step 1: Update `types.ts`**

In `web/src/types.ts`, change:
```ts
export interface InitialData {
  access: { roleMap: Record<string, Role> };
```
to:
```ts
export interface InitialData {
  access: { isAdministrator: boolean; permissions: Record<string, PermissionSet> };
```
and add the import (alongside the existing imports at the top of the file — `types.ts` currently has no imports, so add one):
```ts
import type { PermissionSet } from './lib/access';
```
(`Role` stays imported/used elsewhere in this file for now — `AccessEntry`/`Role` themselves are only removed in Task 11, once nothing references them.)

- [ ] **Step 2: Replace `initial-data/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isAdministrator } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { activitiesFromClusterNotebook } from '@/lib/data';
import { getAllNuclei, getClusters } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

function n(v: string) { return parseInt(v || '0', 10) || 0; }
function norm(s: string) { return (s || '').toLowerCase().trim(); }

// No arguments -- this route never reads anything from the request itself.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = await getCurrentUserEmail();

  try {
    const [clusterNotebookNuclei, clusters, admin] = await Promise.all([getAllNuclei(), getClusters(), isAdministrator()]);

    const readableNuclei = clusterNotebookNuclei.filter(cn => cn.myPermissions.canRead);

    if (readableNuclei.length === 0 && !admin) {
      return NextResponse.json(
        { error: `Access denied. Your account (${email}) is not authorized.` },
        { status: 403 }
      );
    }

    const permissions: Record<string, import('@/lib/access').PermissionSet> = {};
    const authorizedRows = readableNuclei.map(cn => {
      permissions[norm(cn.name)] = cn.myPermissions;
      const acts = Object.values(activitiesFromClusterNotebook(cn));
      return {
        nucleus:       cn.name,
        parentNucleus: cn.parentNucleus?.name ?? '',
        grouping:      cn.cluster.groupOfClusters ?? '',
        cluster:       cn.cluster.name,
        locality:      cn.locality ?? '',
        nucleusType:   cn.nucleusType ?? '',
        stage:         cn.stage ?? '',
        totalAct:  acts.reduce((s, a) => s + n(a.act),  0),
        totalPart: acts.reduce((s, a) => s + n(a.part), 0),
        totalFof:  acts.reduce((s, a) => s + n(a.fof),  0),
      };
    });

    return NextResponse.json({
      access: { isAdministrator: admin, permissions },
      rows: authorizedRows,
      email,
      clusterNames: clusters.map(c => c.name),
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
```

(The `readableNuclei.length === 0 && !admin` check replaces the old `access.role === 'none'` check — an administrator with zero individually-readable nuclei should still get in, since they may need the "Add nucleus" flow even with nothing to see yet; anyone else with zero readable nuclei is denied, matching the old behavior's intent. The inline `import('@/lib/access').PermissionSet` type is used to avoid adding a second top-of-file import purely for an inline type annotation — acceptable here since it's a single local variable's type, not a repeated pattern.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (`AppClient.tsx` still reads `initialData.access.roleMap` at this point in the plan — Task 10 fixes that. `tsc` WILL show an error there until Task 10 lands. This is expected and matches Task 6/10's dependency order — do not attempt to fix `AppClient.tsx` here.)

Run instead, to verify just this task's own file is internally consistent:
```bash
npx tsc --noEmit 2>&1 | grep -v "AppClient.tsx"
```
Expected: no output (no errors outside the known, not-yet-fixed `AppClient.tsx`).

- [ ] **Step 4: Commit**

```bash
git add web/src/app/api/initial-data/route.ts web/src/types.ts
git commit -m "feat: migrate /api/initial-data to real permissions"
```

---

### Task 7: New `/api/roles` route

**Files:**
- Create: `web/src/app/api/roles/route.ts`

**Interfaces:**
- Consumes: `getNucleusPermissions` (`@/lib/access`, Task 2), `getAssignableRoleDetails` (`@/lib/clusterNotebook`, Task 1).
- Produces: `GET /api/roles?nucleus=<name>` → `{ roles: RoleGrant[] }`. Consumed by Task 8 (`ManageAccessCard`).

- [ ] **Step 1: Create the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getAssignableRoleDetails } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// Backs the "manage access" card (DetailView.tsx) -- lists which roles the
// signed-in user may grant at this nucleus, each paired with its real
// PermissionSet so the card can describe what a role actually does.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canAssignRoles) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const roles = await getAssignableRoleDetails(nucleus);
    return NextResponse.json({ roles });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "AppClient.tsx"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/roles/route.ts
git commit -m "feat: add /api/roles route for the manage-access card"
```

---

### Task 8: New `ManageAccessCard` component

**Files:**
- Create: `web/src/components/ManageAccessCard.tsx`

**Interfaces:**
- Consumes: `GET /api/roles?nucleus=` (Task 7), `GET /api/workers?nucleus=&type=` and the existing `WorkerListModal` component (both already relaxed to accept any role string in Task 4 — `WorkerListModal` itself is untouched, just now receives arbitrary role names).
- Produces: `<ManageAccessCard nucleus={string} />`. Consumed by Task 9 (`DetailView.tsx`).

- [ ] **Step 1: Create the file**

```tsx
'use client';

import { useState, useEffect } from 'react';
import WorkerListModal from './WorkerListModal';
import type { RoleGrant } from '@/lib/clusterNotebook';
import type { Worker } from '@/types';

interface Props {
  nucleus: string;
}

// Real, human descriptions built from a role's actual PermissionSet, not just
// its bare name -- e.g. "ATC-Collaborator" alone tells a viewer nothing, but
// "can edit everything including this nucleus's name/location" does.
function describePermissions(p: RoleGrant['permissions']): string {
  const bits: string[] = [];
  if (p.canChangeIdentity) bits.push("can edit everything including this nucleus's name/location");
  else if (p.canWrite) bits.push('can edit day-to-day info, not identity');
  else bits.push('read-only');
  if (p.canDelete) bits.push('can delete this nucleus');
  if (p.canAssignRoles) bits.push('can assign roles to others');
  return bits.join(' · ');
}

export default function ManageAccessCard({ nucleus }: Props) {
  const [roles, setRoles] = useState<RoleGrant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRole, setOpenRole] = useState<string | null>(null);
  const [openRoleWorkers, setOpenRoleWorkers] = useState<Worker[]>([]);
  const [loadingRole, setLoadingRole] = useState(false);

  useEffect(() => {
    fetch(`/api/roles?nucleus=${encodeURIComponent(nucleus)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setRoles(data.roles);
      })
      .catch(() => setError('Failed to load assignable roles.'));
  }, [nucleus]);

  // WorkerListModal takes its initial `workers` list as a prop -- it doesn't fetch
  // its own (matches how DetailView.tsx already uses it for the fixed worker-list
  // types). For an arbitrary recognized role, there's no pre-loaded list to hand
  // it, so this fetches the current holders via the same /api/workers GET used
  // everywhere else, then opens the modal with that as its starting state.
  async function openRoleModal(role: string) {
    setLoadingRole(true);
    setError(null);
    try {
      const res = await fetch(`/api/workers?nucleus=${encodeURIComponent(nucleus)}&type=${encodeURIComponent(role)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load current holders');
      setOpenRoleWorkers(data.workers);
      setOpenRole(role);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load current holders');
    } finally {
      setLoadingRole(false);
    }
  }

  if (error) return <div style={{ fontSize: 13, color: '#e53e3e', padding: '8px 0' }}>{error}</div>;
  if (!roles) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>Loading roles...</div>;
  if (roles.length === 0) return <div style={{ fontSize: 13, color: '#718096', padding: '8px 0' }}>No roles available to assign here.</div>;

  return (
    <div>
      {roles.map(r => (
        <div key={r.role} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{r.role}</div>
            <div style={{ fontSize: 12, color: '#718096' }}>{describePermissions(r.permissions)}</div>
          </div>
          <button
            onClick={() => void openRoleModal(r.role)}
            disabled={loadingRole}
            style={{ fontSize: 13, color: '#3182ce', background: 'none', border: '1px solid #bee3f8', borderRadius: 6, padding: '5px 12px', cursor: loadingRole ? 'default' : 'pointer', flexShrink: 0 }}
          >
            Manage
          </button>
        </div>
      ))}

      {openRole && (
        <WorkerListModal
          title={openRole}
          role={openRole}
          nucleus={nucleus}
          workers={openRoleWorkers}
          onChange={setOpenRoleWorkers}
          onClose={() => setOpenRole(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "AppClient.tsx"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/ManageAccessCard.tsx
git commit -m "feat: add ManageAccessCard component"
```

---

### Task 9: Migrate `DetailView.tsx` to real permissions

**Files:**
- Modify: `web/src/components/DetailView.tsx`

**Interfaces:**
- Consumes: `PermissionSet` (`@/lib/access`, Task 1/2), `ManageAccessCard` (Task 8).
- Produces: `Props.permissions: PermissionSet` replaces `Props.role`/`Props.roleMap`. Consumed by Task 10 (`AppClient.tsx`).

- [ ] **Step 1: Update imports and `Props`**

Replace:
```ts
import { NucleusDetail, NucleusRow, Activity } from '@/types';
import type { Role, Worker } from '@/types';
import WorkerListModal from './WorkerListModal';
import AccessPanel from './AccessPanel';

interface Props {
  detail: NucleusDetail;
  role: Role;
  roleMap: Record<string, Role>;
  email: string;
  showBack: boolean;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
}
```
with:
```ts
import { NucleusDetail, NucleusRow, Activity } from '@/types';
import type { Worker } from '@/types';
import type { PermissionSet } from '@/lib/access';
import WorkerListModal from './WorkerListModal';
import ManageAccessCard from './ManageAccessCard';

interface Props {
  detail: NucleusDetail;
  permissions: PermissionSet;
  email: string;
  showBack: boolean;
  onBack: () => void;
  onSaved: (savedBy: string, savedAt: string) => void;
}
```

- [ ] **Step 2: Update the function signature and derived flags**

Replace:
```ts
export default function DetailView({ detail, role, roleMap, email, showBack, onBack, onSaved }: Props) {
```
with:
```ts
export default function DetailView({ detail, permissions, email, showBack, onBack, onSaved }: Props) {
```

Replace:
```ts
  const canWrite       = role === 'read-write' || role === 'collaborator' || role === 'admin';
  const isAdmin        = role === 'admin';
  const canManageAccess = role === 'admin' || role === 'collaborator';
```
with:
```ts
  const canWrite = permissions.canWrite;
```

(`isAdmin`/`canManageAccess` are removed entirely — every one of their former call sites is replaced individually below with the specific permission it actually needs, per the spec's flag-mapping table. `canWrite` stays as a local alias since it's used at many call sites and reads more clearly inline than `permissions.canWrite` repeated everywhere.)

- [ ] **Step 3: Type/Stage — `isAdmin` becomes `permissions.canChangeIdentity`**

Replace:
```tsx
              {isAdmin
                ? <SelectField label="Type" value={form.nucleusType} options={TYPE_OPTIONS} onChange={v => setAndSave('nucleusType', v, { identity: { nucleusType: v } }, 'Type')} />
                : <Field label="Type" value={form.nucleusType} readonly />
              }
              {isAdmin
                ? <SelectField label="Stage" value={form.stage} options={STAGE_OPTIONS} onChange={v => setAndSave('stage', v, { stage: v }, 'Stage')} />
                : <Field label="Stage" value={form.stage} readonly />
              }
```
with:
```tsx
              {permissions.canChangeIdentity
                ? <SelectField label="Type" value={form.nucleusType} options={TYPE_OPTIONS} onChange={v => setAndSave('nucleusType', v, { identity: { nucleusType: v } }, 'Type')} />
                : <Field label="Type" value={form.nucleusType} readonly />
              }
              {permissions.canChangeIdentity
                ? <SelectField label="Stage" value={form.stage} options={STAGE_OPTIONS} onChange={v => setAndSave('stage', v, { stage: v }, 'Stage')} />
                : <Field label="Stage" value={form.stage} readonly />
              }
```

- [ ] **Step 4: Contact and ABM-Assistant triggers — `isAdmin` becomes recognized-role gating**

Replace:
```tsx
                onLabelClick={isAdmin ? () => setShowContactModal(true) : undefined}
```
with:
```tsx
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('contact') ? () => setShowContactModal(true) : undefined}
```

Replace:
```tsx
                onLabelClick={isAdmin ? () => setShowAbmAssistantModal(true) : undefined}
```
with:
```tsx
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('abm-assistant') ? () => setShowAbmAssistantModal(true) : undefined}
```

- [ ] **Step 5: Accompanying, Helping, Promoting triggers — add the gate that was missing (Accompanying) or absent (Helping/Promoting)**

There are three `onLabelClick` sites for these (Overview card) plus three more inside the diagram data arrays (`diagramData`, `alignedRings`, `staggeredLabels`) that also carry `onClick` for the same modals — **only the three Overview-card `Field`'s `onLabelClick` props need gating** (the diagram circles' click-to-open behavior is a secondary, already-informal entry point into the same modals and is out of scope for this task — leave every `onClick` inside `diagramData`/`alignedRings`/`staggeredLabels` exactly as it is).

Replace:
```tsx
                onLabelClick={() => setShowPromotersModal(true)}
```
(the one inside the Overview card's "Promoting" `Field`, not any other occurrence) with:
```tsx
                onLabelClick={permissions.canAssignRoles ? () => setShowPromotersModal(true) : undefined}
```

Replace:
```tsx
                onLabelClick={() => setShowProtagonistsModal(true)}
```
(the one inside the Overview card's "Helping" `Field`) with:
```tsx
                onLabelClick={permissions.canAssignRoles ? () => setShowProtagonistsModal(true) : undefined}
```

Replace:
```tsx
                onLabelClick={() => setShowAccompaniersModal(true)}
```
(the one inside the Overview card's "Accompanying" `Field` — this is the real gap fix: today this has no gate at all) with:
```tsx
                onLabelClick={permissions.canAssignRoles && permissions.assignableRoles.includes('accompanier') ? () => setShowAccompaniersModal(true) : undefined}
```

- [ ] **Step 6: Manage Access card — `canManageAccess` becomes `permissions.canAssignRoles`, `AccessPanel` becomes `ManageAccessCard`**

Replace:
```tsx
        {/* Manage Access — collaborator and admin */}
        {canManageAccess && (
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access</span>
            </div>
            {accessOpen && (
              <div className="card-body">
                <AccessPanel nucleus={row.nucleus} roleMap={roleMap} />
              </div>
            )}
          </div>
        )}
```
with:
```tsx
        {/* Manage Access — anyone cluster-notebook lets assign roles here */}
        {permissions.canAssignRoles && (
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access</span>
            </div>
            {accessOpen && (
              <div className="card-body">
                <ManageAccessCard nucleus={row.nucleus} />
              </div>
            )}
          </div>
        )}
```

- [ ] **Step 7: Danger Zone — `isAdmin` becomes `permissions.canDelete`**

Replace:
```tsx
        {/* Danger Zone — admin only */}
        {isAdmin && (
```
with:
```tsx
        {/* Danger Zone — requires delete permission on this specific nucleus */}
        {permissions.canDelete && (
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc --noEmit 2>&1 | grep -v "AppClient.tsx"`
Expected: no output (every use of `role`/`roleMap`/`isAdmin`/`canManageAccess`/`AccessPanel` in this file is gone; `AppClient.tsx` is still expected to error until Task 10).

- [ ] **Step 9: Commit**

```bash
git add web/src/components/DetailView.tsx
git commit -m "feat: migrate DetailView.tsx to real permissions, fix Accompanying's missing gate and Danger Zone's wrong scope"
```

---

### Task 10: Migrate `AppClient.tsx` to real permissions

**Files:**
- Modify: `web/src/components/AppClient.tsx`

**Interfaces:**
- Consumes: `InitialData.access` (Task 6's new shape), `PermissionSet` (`@/lib/access`), `DetailView`'s new `permissions` prop (Task 9).
- This is the last consumer of the old `roleMap`/`Role`/`AccessPanel` shape in the app — once this task lands, Task 11 can safely delete them.

- [ ] **Step 1: Update imports**

Replace:
```ts
import { InitialData, NucleusDetail, Role } from '@/types';
import Picker from './Picker';
import DetailView from './DetailView';
import AccessPanel from './AccessPanel';
import CreateNucleusModal from './CreateNucleusModal';
```
with:
```ts
import { InitialData, NucleusDetail } from '@/types';
import type { PermissionSet } from '@/lib/access';
import Picker from './Picker';
import DetailView from './DetailView';
import CreateNucleusModal from './CreateNucleusModal';
```

- [ ] **Step 2: Update the per-nucleus permissions lookup**

Add this constant at module scope (top of the file, after the imports, alongside the existing `norm` function) — not inside the component, so it isn't recreated every render:
```ts
const NO_ACCESS: PermissionSet = {
  canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
  canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
};
```

Then replace:
```tsx
  if (detail && selectedNucleus) {
    const roleMap = initialData.access.roleMap;
    const role: Role = (roleMap[norm(selectedNucleus)] ?? roleMap['*'] ?? 'read') as Role;
    return (
      <DetailView
        detail={detail}
        role={role}
        roleMap={initialData.access.roleMap}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }
```
with:
```tsx
  if (detail && selectedNucleus) {
    const permissions = initialData.access.permissions[norm(selectedNucleus)] ?? NO_ACCESS;
    return (
      <DetailView
        detail={detail}
        permissions={permissions}
        email={initialData.email}
        showBack={initialData.rows.length > 1}
        onBack={handleBack}
        onSaved={() => {}}
      />
    );
  }
```

- [ ] **Step 3: Update the top-level "Add nucleus" gate and drop the top-level Manage Access card**

Replace:
```tsx
  const roleMap = initialData.access.roleMap;
  const isGlobalAdmin = roleMap['*'] === 'admin' || roleMap['*'] === 'collaborator';
```
with:
```tsx
  const isAdministrator = initialData.access.isAdministrator;
```

Replace every remaining use of `isGlobalAdmin` in this file (the `onAdd` prop on `<Picker>`) with `isAdministrator`:
```tsx
        onAdd={isAdministrator ? () => setCreatingNew(true) : undefined}
```

Remove the top-level Manage Access card entirely (it has no cross-nucleus replacement — see the spec's "New manage access experience" section):
```tsx
      {isGlobalAdmin && (
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px 32px' }}>
          <div className="card">
            <div
              className="card-header"
              onClick={() => setAccessOpen(o => !o)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <span><span style={{ fontSize: 11, marginRight: 6 }}>{accessOpen ? '▼' : '▶'}</span>Manage Access</span>
            </div>
            {accessOpen && (
              <div className="card-body">
                <AccessPanel roleMap={roleMap} />
              </div>
            )}
          </div>
        </div>
      )}
```
Delete this block entirely (no replacement). Also remove the now-unused `accessOpen`/`setAccessOpen` state declaration (`const [accessOpen, setAccessOpen] = useState(false);`) — nothing else in this file uses it once this block is gone.

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: **no errors anywhere in the project now** — this was the last consumer of the old shape.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/AppClient.tsx
git commit -m "feat: migrate AppClient.tsx to real permissions, drop top-level Manage Access card"
```

---

### Task 11: Remove the stopgap, Sheet-backed access system, and old types

**Files:**
- Delete: `web/src/app/api/access/route.ts` (and the now-empty `web/src/app/api/access/` directory, if empty)
- Delete: `web/src/components/AccessPanel.tsx`
- Modify: `web/src/lib/access.ts` (remove `getAccess`/`UserAccess`, keep everything Task 2 added)
- Modify: `web/src/lib/access.test.ts` (remove the old `describe('getAccess (everyone-admin stopgap)', ...)` block, keep everything Task 2 added)
- Modify: `web/src/lib/data.ts` (remove `getAccessEntries`/`saveAccessEntries` and their now-unused imports)
- Modify: `web/src/lib/data.test.ts` (remove their tests)
- Modify: `web/src/lib/config.ts` (remove `ACCESS_TAB`/`ACCESS_COL`)
- Modify: `web/src/types.ts` (remove `Role`/`AccessEntry`)

**Interfaces:**
- Nothing in the codebase should reference `getAccess`, `UserAccess`, `AccessPanel`, `getAccessEntries`, `saveAccessEntries`, `ACCESS_TAB`, `ACCESS_COL`, `Role`, or `AccessEntry` after this task.

- [ ] **Step 1: Confirm nothing still references what's about to be deleted**

```bash
grep -rln "getAccess\b\|UserAccess\|AccessPanel\|getAccessEntries\|saveAccessEntries\|ACCESS_TAB\|ACCESS_COL" web/src --include='*.ts' --include='*.tsx' | grep -v -E '(access\.ts|access\.test\.ts|data\.ts|data\.test\.ts|config\.ts)$'
```
Expected: no output. (If anything shows up, a Task 3-10 migration was missed — go fix that file first, don't delete out from under it. Matches are expected and fine *inside* the 5 files this step is about to edit — that's what the next steps do.)

```bash
grep -rln "\bRole\b\|AccessEntry" web/src/types.ts web/src --include='*.ts' --include='*.tsx' | grep -v -E '(types\.ts|access\.ts|access\.test\.ts|data\.ts|data\.test\.ts)$'
```
Expected: no output (every remaining reference to `Role`/`AccessEntry` should only be inside the files this task edits).

- [ ] **Step 2: Delete the route and component**

```bash
rm web/src/app/api/access/route.ts
rmdir web/src/app/api/access 2>/dev/null || true
rm web/src/components/AccessPanel.tsx
```

- [ ] **Step 3: Remove the stopgap from `access.ts`**

In `web/src/lib/access.ts`, remove the `import type { Role, AccessEntry } from '@/types';` line, the `UserAccess` interface, the entire `getAccess` function and its STOPGAP comment block. Keep everything Task 2 added (`import { getMyPermissions } from './clusterNotebook';`, `import type { PermissionSet } from './clusterNotebook';`, the `export type { PermissionSet };` / `export { getIsAdministrator as isAdministrator } from './clusterNotebook';` lines, `NO_ACCESS`, `getNucleusPermissions`).

- [ ] **Step 4: Remove the stopgap's tests from `access.test.ts`**

In `web/src/lib/access.test.ts`, remove the entire `describe('getAccess (everyone-admin stopgap)', ...)` block and the `getAccess` import from `import { getAccess, getNucleusPermissions, isAdministrator } from './access';` (leave `getNucleusPermissions, isAdministrator` imported). Keep the `describe('getNucleusPermissions', ...)` and `describe('isAdministrator', ...)` blocks Task 2 added.

- [ ] **Step 5: Remove the Access-tab functions from `data.ts`**

In `web/src/lib/data.ts`, remove the `getAccessEntries` and `saveAccessEntries` functions entirely. Update the import block at the top:
```ts
import {
  MASTER_SHEET_ID,
  MASTER_TAB, ACCESS_TAB,
  MASTER_DATA_ROW,
  COL,
  ACCESS_COL,
} from './config';
```
becomes:
```ts
import {
  MASTER_SHEET_ID,
  MASTER_TAB,
  MASTER_DATA_ROW,
  COL,
} from './config';
```
and:
```ts
import type { AccessEntry, Activity, Worker } from '@/types';
```
becomes:
```ts
import type { Activity, Worker } from '@/types';
```

- [ ] **Step 6: Remove their tests from `data.test.ts`**

In `web/src/lib/data.test.ts`, remove the entire `describe('getAccessEntries', ...)` and `describe('saveAccessEntries', ...)` blocks (the last two blocks in the file). Update the import line:
```ts
import { getAccessEntries, saveAccessEntries } from './data';
```
— remove this line if `getAccessEntries`/`saveAccessEntries` aren't imported for any other reason (check the full import block at the top of the file for exactly what else is imported from `./data` and keep the rest). Also remove `import type { AccessEntry } from '@/types';` if nothing else in the file uses `AccessEntry`.

- [ ] **Step 7: Remove `ACCESS_TAB`/`ACCESS_COL` from `config.ts`**

In `web/src/lib/config.ts`, remove the `ACCESS_TAB` constant and the `ACCESS_COL` object entirely.

- [ ] **Step 8: Remove `Role`/`AccessEntry` from `types.ts`**

In `web/src/types.ts`, remove:
```ts
export type Role = 'read' | 'read-write' | 'collaborator' | 'admin';

export interface AccessEntry {
  name: string;
  email: string;
  role: Role;
  nucleus: string; // specific nucleus name or '*' for all
}
```
entirely.

- [ ] **Step 9: Verify nothing references any of it anymore**

```bash
grep -rln "getAccess\b\|UserAccess\|AccessPanel\|getAccessEntries\|saveAccessEntries\|ACCESS_TAB\|ACCESS_COL" web/src
grep -rn "\bRole\b\|AccessEntry" web/src/types.ts
```
Expected: no output from either command.

- [ ] **Step 10: Verify the app still compiles and tests pass**

```bash
cd web
npx tsc --noEmit
npm run test
npm run lint
```
Expected: all three clean. (Per the Clerk auth plan's precedent, `npm run lint` may still show the same small set of pre-existing, unrelated problems it already had before this plan — that's not a regression; only new lint issues from files this task touched would need fixing.)

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: remove authorization stopgap, Sheet-backed access system, and old Role/AccessEntry types"
```

---

### Task 12: Full verification pass

**Files:** none — verification only.

- [ ] **Step 1: Automated checks**

```bash
cd web
npx tsc --noEmit
npm run lint
npm run test
```
Expected: all clean (same pre-existing-lint caveat as Task 11 applies).

- [ ] **Step 2: Manual check — read-only role**

Sign in as an account with a real, non-administrator cluster-notebook role at some nucleus (e.g. Michael's ABM-Assistant grant at South Estes). Confirm:
- That nucleus's fields render read-only immediately (no failed-save round trip needed to discover it) — this is the core UX improvement this plan exists to deliver.
- Type/Stage show as plain text, not dropdowns.
- No "Manage Access" or "Danger Zone" card appears for that nucleus.

**Manual check — a role with real write access.** Sign in as (or find) an account with `canWrite`/`canAssignRoles` on some nucleus. Confirm:
- Ordinary fields (population, activities, narrative, etc.) are editable.
- The "Manage Access" card appears, lists roles from `assignableRoleDetails` with real descriptions (not bare names), and clicking "Manage" on one opens a working `WorkerListModal` showing that role's current holders.
- Accompanying's label in the Overview card is now gated (no longer clickable for someone without `assignableRoles` including `accompanier`) — confirms the bug-fix from Task 9 actually took effect.

**Manual check — administrator.** Confirm the top-level "Add nucleus" button appears, and that creating a nucleus under a Cluster the administrator has rights to succeeds.

- [ ] **Step 3: Report to the user**

Summarize: what was migrated, the two gating bugs fixed (Accompanying's missing gate, Danger Zone's wrong global-vs-per-nucleus scope), that `/api/access`/`AccessPanel`/the Access Sheet tab's code are gone (issue #37 closed), and that the new "Manage Access" card is per-nucleus only (no cross-nucleus view was rebuilt — flag this explicitly in case it's missed). Remind them the Access Sheet tab itself (the Google Sheet) still exists and holds old data, untouched — only the app's reads/writes to it were removed.
