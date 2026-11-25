# Admin Page Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three read-mostly cards to the Admin page: People not in SRP, Log, and No account yet (role holders who
can't sign in, with Invite… that fills the Invite card).

**Architecture:** As in Phases 1–2: each card is a client component in `web/src/components/admin/`, reading one
`/api/admin/*` route that checks `requireAdmin(cluster)` and calls one cluster-notebook query in
`web/src/lib/clusterNotebook.ts`. Every decision a test can pin lives in `web/src/lib/admin.ts`
(tests in `admin.test.ts`). Cards are mounted per open cluster in `AdminClient`.

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Vitest. No component tests: verify cards in the browser.

**Spec:** `docs/superpowers/specs/2026-11-24-admin-page-design.md` (sections "People not in SRP", "No account yet",
"Log"). Backend answers: `docs/cluster-notebook-api-requirements.md` (Task 1 adds the Phase 3 section).

**Branch:** `feat/admin-phase3` from `main` (6458a0a or later). Part A merges on its own; Part B starts only when
its gate passes.

## Global Constraints

- Every route that calls cluster-notebook catches through `clusterNotebookErrorResponse()` and checks `requireAdmin(cluster)` first.
- Lists never grow without end (owner 2026-11-24): a person list shows at most 20 rows with a search box and "Showing 20 of N. Search to find others."; the Log pages 100 at a time with **Older**.
- Login emails appear only on the Invite and Accounts cards. This repo is public: tests use made-up names (Ana Lopez, Ben Okafor, …) and `example.org` emails.
- A field asked for before it is in production breaks the whole query. Never select a Part B field until the gate's introspection shows it.
- Card look follows the existing admin cards: `.card` / `.card-header` with the `▼`/`▶` twisty (`fontSize: 11, marginRight: 6`), buttons `minHeight: 44`, inputs `fontSize: 16`, count in the title as `Title (n)`.
- Dates read like the rest of the app: `formatDate` from `lib/people.ts` ("Mar 2, 2019") on the `YYYY-MM-DD` part.
- Record each confirmed answer in `docs/cluster-notebook-api-requirements.md` and as a dated code comment ("Confirmed with cluster-notebook 2026-11-25: …").
- No `useEffect` that only sets state from props (ESLint `react-hooks/set-state-in-effect`); fetch-then-set inside an effect, as the existing cards do, is fine.

## Confirmed with cluster-notebook 2026-11-25 (live in production)

```graphql
peopleNotInSrp(clusterName: String!): [AdminPerson!]!
changeLog(clusterName: String!, before: DateTime, limit: Int! = 100, beforeId: String): [LogEntry!]!
type LogEntry { id: String!  occurredAt: DateTime!  actor: PersonSummary  mutation: String
                entityType: String!  entityId: String!  changeType: String!  changes: JSON! }
```

- `peopleNotInSrp`: people **placed** in the cluster with no SRP link (holding a role there doesn't count); ordered by family name, first name (case-insensitive), id.
- `changeLog`: newest first (`occurredAt` desc, `id` desc). Keyset: strictly older than (`before`, `beforeId`); for Older pass the last row's `occurredAt` and `id`. `limit` 1..500 else `BAD_INPUT`; `beforeId` without `before` is `BAD_INPUT`.
- `entityType` ∈ `cluster, locality, setting, nucleus, individual, role_in_ne, person_hide, invitation, account`. `changeType` ∈ `create, update, delete`.
- `changes` is `{ field: { old, new } }`; create has `old` null, delete has `new` null, update lists only changed fields; timestamps are ISO strings.
- `actor` is null for the SRP sync, scripts, or anything not done by a signed-in person. `mutation` is the GraphQL mutation name or null.
- Both: same admin gate as `hiddenPeople` (FORBIDDEN otherwise); unknown cluster → `[]`.

## Proposed, awaiting the owner's approval in cluster-notebook (Part B)

- `roleHoldersWithoutAccess(clusterName: String!): [AdminPerson!]!`: current formal roles (ATC, CSO, CIC, LSA, ATC-/CIC-Collaborator, ABM-Assistant, accompanier, contact) at live entities in the cluster, `hasAccess` false (removed-access people included), pending invitations included; ordered by family name, first name; same gate.
- `AdminPerson.roles: [RoleHolding!]!` (same list and visibility as `individualRoles`).
- `AdminPerson.accessRemovedAt: DateTime` (null unless their account is disabled).
- `AdminPerson.createdAt: DateTime`, `AdminPerson.createdBy: PersonSummary` (null for SRP sync/scripts/before auditing).
- `LogEntry.entityName: String` (best effort; null if the row is gone).
- `AdminPerson.pendingInvitation` may be an expired invitation (`status: EXPIRED`).

Final names come from cluster-notebook when deployed; Part B's gate step adjusts the plan's names to match.

## Review Focus

1. **Log page boundary:** a page of exactly 100 followed by an empty page must end with "No older changes." and no Older button, never a spinner or a duplicate row. (Task 2 tests `nextLogCursor` and `mergeLogPages`.)
2. **Odd `changes` values:** nested objects, arrays, booleans, null, and long strings must render as readable text without crashing; null reads as "—". (Task 2 tests `changeValueText`.)
3. **Invite… while the Invite card holds another person's unsent form:** the picked person replaces the form (as Change person would), the Invite card opens and scrolls into view, and no email from the old person survives. (Task 3 browser check, using `pick`'s existing sequence guard.)
4. **After an invite is sent,** the No account card re-reads and the person shows "invited"; a stale earlier read never overwrites it. (Task 3: `version` prop in the card's effect deps plus the `readSeq` guard.)
5. **Large clusters:** hundreds of people not in SRP or without accounts stay capped at 20 rows with search. (Task 1 tests `findPeople`.)

---

## Part A: live now

### Task 1: People not in SRP card, and a shared person search

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (add `getPeopleNotInSrp`)
- Modify: `web/src/lib/admin.ts`, `web/src/lib/admin.test.ts` (add `findPeople`; make `findAccounts` use the same matcher)
- Modify: `web/src/lib/clusterNotebook.test.ts`
- Create: `web/src/app/api/admin/not-in-srp/route.ts`
- Create: `web/src/components/admin/NotInSrpCard.tsx`
- Modify: `web/src/components/admin/AdminClient.tsx`
- Modify: `docs/cluster-notebook-api-requirements.md` (new section "Admin page, Phase 3, confirmed with cluster-notebook 2026-11-25" with the confirmed block above; Part B items listed as proposed)

**Interfaces:**
- Produces: `getPeopleNotInSrp(clusterName: string): Promise<AdminPerson[]>`; `findPeople(people: AdminPerson[], search: string, limit = 20): { shown: AdminPerson[]; matched: number }`; route `GET /api/admin/not-in-srp?cluster=` → `{ people: AdminPerson[] }`.

- [ ] **Step 1: Write the failing tests**

`clusterNotebook.test.ts`, `describe('getPeopleNotInSrp')`: resolves `{ data: { peopleNotInSrp: [person] } }` and returns it; the request body's query contains `peopleNotInSrp(clusterName: $clusterName)` and selects `individual {`, `ageCategory placePath hasAccess pendingInvitation { id expiresAt }` (the same selection as `searchPeople`); variables `{ clusterName: 'NC-215 Triangle' }`.

`admin.test.ts`, `describe('findPeople')`:
```ts
const p = (first: string, last: string, place: string[] = ['Triangle']): AdminPerson =>
  ({ individual: { ...summary(first, last), id: first }, ageCategory: null, placePath: place, hasAccess: false, pendingInvitation: null });
test('every word must match the name or place path, ignoring case; keeps input order', () => {
  const list = [p('Ana', 'Lopez', ['Triangle', 'Elm St']), p('Ben', 'Okafor'), p('Cy', 'Adams', ['Triangle', 'Elm St'])];
  expect(findPeople(list, 'elm').shown.map(x => x.individual.id)).toEqual(['Ana', 'Cy']);
  expect(findPeople(list, 'ANA elm').shown.map(x => x.individual.id)).toEqual(['Ana']);
  expect(findPeople(list, '  ').matched).toBe(3);
});
test('caps at the limit and reports the match count', () => {
  const many = Array.from({ length: 25 }, (_, n) => p(`P${n}`, 'Test'));
  const r = findPeople(many, '');
  expect(r.shown).toHaveLength(20);
  expect(r.matched).toBe(25);
});
```
The existing `findAccounts` tests must keep passing unchanged.

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/admin.test.ts src/lib/clusterNotebook.test.ts`
Expected: FAIL (`findPeople` / `getPeopleNotInSrp` not exported).

- [ ] **Step 3: Implement**

- `findPeople` keeps cluster-notebook's order (it is already by family name). Factor the "every word in the text" check into one private `matchesWords(text: string, search: string): boolean` used by both `findPeople` (text = display name + place path) and `findAccounts`.
- `getPeopleNotInSrp`: copy `searchPeople`'s selection into a shared `ADMIN_PERSON_SELECTION` const and use it in both.
- Route: same shape as `api/admin/hidden` GET; 400 `Missing cluster` when empty.
- `NotInSrpCard({ cluster })`: title `People not in SRP (n)`, **starts collapsed** and loads on first open (it is a review list, not a daily task); search input (placeholder `Search by name or place…`) once the list is non-empty; rows show `adminPersonLine(p)` and the `adminPersonTag` tag as in `PersonFinder`; empty: `No one here is missing from SRP.`; load error in red as the other cards. Use the `readSeq` guard pattern from `AccountsCard`.
- `AdminClient`: card order Invite, Accounts, Roles, Hidden people, People not in SRP (Log and No account yet join in later tasks).

- [ ] **Step 4: Run tests, types, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint src/lib src/components/admin src/app/api/admin`
Expected: all pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A web/src docs/cluster-notebook-api-requirements.md
git commit -m "feat: People not in SRP card on the Admin page"
```

### Task 2: Log card

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (add `LogEntry`, `getChangeLog`), `web/src/lib/clusterNotebook.test.ts`
- Modify: `web/src/lib/admin.ts`, `web/src/lib/admin.test.ts`
- Create: `web/src/app/api/admin/log/route.ts`
- Create: `web/src/components/admin/LogCard.tsx`
- Modify: `web/src/components/admin/AdminClient.tsx`

**Interfaces:**
- Produces:
  - `interface LogEntry { id: string; occurredAt: string; actor: PersonSummary | null; mutation: string | null; entityType: string; entityId: string; changeType: string; changes: Record<string, { old: unknown; new: unknown }> }`
  - `getChangeLog(clusterName: string, page?: { before: string; beforeId: string }): Promise<LogEntry[]>` (always `limit: 100`)
  - `export const LOG_PAGE = 100`
  - `logHeadline(e: LogEntry): string`, `logChanges(e: LogEntry): { field: string; old: string; new: string }[]`, `changeValueText(v: unknown): string`, `nextLogCursor(page: LogEntry[]): { before: string; beforeId: string } | null`, `mergeLogPages(have: LogEntry[], page: LogEntry[]): LogEntry[]`
  - Route `GET /api/admin/log?cluster=&before=&beforeId=` → `{ entries: LogEntry[] }`

- [ ] **Step 1: Write the failing tests**

`clusterNotebook.test.ts`, `describe('getChangeLog')`: first page sends variables `{ clusterName, limit: 100 }` with no `before`/`beforeId` keys; with a page sends both; the query declares `$limit: Int!`, `$before: DateTime`, `$beforeId: String` and selects `id occurredAt actor { … } mutation entityType entityId changeType changes`.

`admin.test.ts`:
```ts
const entry = (o: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1', occurredAt: '2026-11-24T14:05:00Z', actor: summary('Ben', 'Okafor'), mutation: 'grantRole',
  entityType: 'role_in_ne', entityId: 'r1', changeType: 'create', changes: { role: { old: null, new: 'CSO' } }, ...o });
describe('logHeadline', () => {
  test('who, what, on what', () => {
    expect(logHeadline(entry())).toBe('Ben Okafor · grantRole · role r1');
  });
  test('no actor is the system; no mutation uses the change type', () => {
    expect(logHeadline(entry({ actor: null, mutation: null, changeType: 'update', entityType: 'person_hide', entityId: 'h9' })))
      .toBe('System · update · hide h9');
  });
});
describe('logChanges and changeValueText', () => {
  test('one row per field, in key order, values as text', () => {
    expect(logChanges(entry({ changes: { name: { old: 'Elm', new: 'Elm St' }, active: { old: true, new: null } } })))
      .toEqual([{ field: 'name', old: 'Elm', new: 'Elm St' }, { field: 'active', old: 'true', new: '—' }]);
  });
  test('objects and arrays as compact JSON; numbers as written', () => {
    expect(changeValueText({ a: 1 })).toBe('{"a":1}');
    expect(changeValueText([1, 'x'])).toBe('[1,"x"]');
    expect(changeValueText(0)).toBe('0');
    expect(changeValueText(undefined)).toBe('—');
  });
});
describe('nextLogCursor and mergeLogPages', () => {
  test('a full page gives the cursor of its last row; a short page ends', () => {
    const full = Array.from({ length: 100 }, (_, n) => entry({ id: `e${n}`, occurredAt: `2026-11-24T14:${String(n % 60).padStart(2, '0')}:00Z` }));
    expect(nextLogCursor(full)).toEqual({ before: full[99].occurredAt, beforeId: 'e99' });
    expect(nextLogCursor(full.slice(0, 99))).toBeNull();
    expect(nextLogCursor([])).toBeNull();
  });
  test('merging drops rows already shown', () => {
    expect(mergeLogPages([entry({ id: 'a' }), entry({ id: 'b' })], [entry({ id: 'b' }), entry({ id: 'c' })]).map(e => e.id))
      .toEqual(['a', 'b', 'c']);
  });
});
```
Entity words for the headline: `role_in_ne` → `role`, `person_hide` → `hide`, every other type as written. (Part B Task 4 replaces `<type> <id>` with `entityName` when present.)

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/admin.test.ts src/lib/clusterNotebook.test.ts`
Expected: FAIL (exports missing).

- [ ] **Step 3: Implement**

- Route: `before` and `beforeId` must come together (else 400 `Missing log position`); pass `page` only when both are present.
- `LogCard({ cluster })`: title `Log`, **starts collapsed**, loads the first page on first open. Each row: time (browser-local, `new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })`), then `logHeadline(e)`; tapping a row toggles a small two-column-plus-field table of `logChanges(e)` (field, old → new), `fontSize: 12`, values wrapping (`overflowWrap: 'anywhere'`). Below the list: **Older** (44px) while `nextLogCursor(lastPage)` is non-null; `Loading…` while fetching; `No older changes.` once a page ends the log; `No changes logged in this cluster.` when the first page is empty. A failed Older keeps the rows already shown and shows the error under the button.
- `AdminClient`: Log goes last.

- [ ] **Step 4: Run tests, types, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint src/lib src/components/admin src/app/api/admin`
Expected: all pass, exit 0.

- [ ] **Step 5: Browser check, then commit**

Open `/admin`, open Log: rows appear newest first; Older appends without duplicates; a row opens its changes.

```bash
git add -A web/src
git commit -m "feat: Log card on the Admin page"
```

---

## Part B: after cluster-notebook deploys the approved fields

**Gate (before Task 3):** introspect production (`__type(name:"AdminPerson")`, `__type(name:"LogEntry")`, Query fields)
and confirm `roleHoldersWithoutAccess`, `AdminPerson.roles`, `AdminPerson.accessRemovedAt` exist (Task 3), and
`AdminPerson.createdAt`, `AdminPerson.createdBy`, `LogEntry.entityName` (Task 4). If a name differs from this plan,
use the deployed name and ledger the ruling. If Task 4's fields are not deployed, ship Task 3 alone.

### Task 3: No account yet card, with Invite… into the Invite card

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (types; `getRoleHoldersWithoutAccess`; `pendingInvitation { id expiresAt status }` in its selection only), `web/src/lib/clusterNotebook.test.ts`
- Modify: `web/src/lib/admin.ts`, `web/src/lib/admin.test.ts`
- Create: `web/src/app/api/admin/no-account/route.ts`
- Create: `web/src/components/admin/NoAccountCard.tsx`
- Modify: `web/src/components/admin/InviteCard.tsx`, `PersonFinder.tsx`, `AdminClient.tsx`
- Modify: `docs/cluster-notebook-api-requirements.md` (move these fields from proposed to confirmed)

**Interfaces:**
- Consumes: `findPeople` (Task 1), `roleHoldingLine`, `currentRolesLine`.
- Produces:
  - `AdminPerson` gains optional `roles?: RoleHolding[]` and `accessRemovedAt?: string | null`; `pendingInvitation` gains optional `status?: InvitationStatus`.
  - `getRoleHoldersWithoutAccess(clusterName: string): Promise<AdminPerson[]>`
  - `adminPersonTags(p: AdminPerson): string[]` replacing `adminPersonTag` (update `PersonFinder`, `InviteCard`, `NotInSrpCard`)
  - `InviteCard` accepts `ref?: React.Ref<InviteHandle>` with `export interface InviteHandle { start(p: AdminPerson): void }`, and `onInvited?: () => void`
  - `NoAccountCard({ cluster, version, onInvite }: { cluster: string; version: number; onInvite: (p: AdminPerson) => void })`

- [ ] **Step 1: Write the failing tests**

```ts
describe('adminPersonTags', () => {
  const base = { individual: summary('Ana', 'Lopez'), ageCategory: null, placePath: [], hasAccess: false, pendingInvitation: null };
  test('has access wins alone', () => {
    expect(adminPersonTags({ ...base, hasAccess: true, accessRemovedAt: null })).toEqual(['has access']);
  });
  test('removed and invited both show, removed first, with the date', () => {
    expect(adminPersonTags({ ...base, accessRemovedAt: '2026-11-20T09:00:00Z', pendingInvitation: { id: 'i', expiresAt: '2026-12-20T00:00:00Z', status: 'PENDING' } }))
      .toEqual(['access removed Nov 20, 2026', 'invited']);
  });
  test('an expired invitation says so', () => {
    expect(adminPersonTags({ ...base, pendingInvitation: { id: 'i', expiresAt: '2026-11-01T00:00:00Z', status: 'EXPIRED' } }))
      .toEqual(['invitation expired']);
  });
  test('nothing for a plain person', () => {
    expect(adminPersonTags(base)).toEqual([]);
  });
});
```
`clusterNotebook.test.ts`: `getRoleHoldersWithoutAccess` selects the shared person fields plus `roles { id role entity { id name type } start } accessRemovedAt` and `pendingInvitation { id expiresAt status }`.

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/admin.test.ts src/lib/clusterNotebook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- Route `GET /api/admin/no-account?cluster=` → `{ people }`, as Task 1's route.
- `NoAccountCard`: title `No account yet (n)`, **open by default**; search and 20-row cap via `findPeople`; each row: `adminPersonLine(p)` with `adminPersonTags(p)` pills, then a second line `p.roles.map(roleHoldingLine).join('; ')` (`fontSize: 13`, muted), then **Invite…** (44px) calling `onInvite(p)`. Empty: `Everyone with a role here can sign in.` Its load effect depends on `[cluster, version]` and uses the `readSeq` guard.
- `InviteCard`: `useImperativeHandle(ref, () => ({ start }))` where `start(p)` opens the card, calls the existing `pick(p)`, and scrolls the card's root `div` into view (`scrollIntoView({ behavior: 'smooth', block: 'start' })`). After a successful invite it calls `onInvited?.()`.
- `AdminClient`: per cluster, a `useRef<InviteHandle>` map keyed by cluster name and a `versions` state `Record<string, number>`; `onInvite = p => inviteRefs.get(c.name)?.start(p)`; `onInvited = () => bump(c.name)`. Order: Invite, No account yet, Accounts, Roles, Hidden people, People not in SRP, Log.

- [ ] **Step 4: Run tests, types, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint src/lib src/components src/app/api/admin`
Expected: all pass, exit 0.

- [ ] **Step 5: Browser check, then commit**

Invite… on a row: the Invite card shows that person with their email prefilled and scrolls into view; after Invite, the row shows "invited". With another person half-filled in the Invite card, Invite… replaces them.

```bash
git add -A web/src docs/cluster-notebook-api-requirements.md
git commit -m "feat: No account yet card; Invite… fills the Invite card"
```

### Task 4: Created when/by on People not in SRP; names in the Log

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`, `clusterNotebook.test.ts` (select `createdAt createdBy { … }` in `getPeopleNotInSrp` only; `entityName` in `getChangeLog`)
- Modify: `web/src/lib/admin.ts`, `admin.test.ts`; `web/src/components/admin/NotInSrpCard.tsx`
- Modify: `docs/cluster-notebook-api-requirements.md`

**Interfaces:**
- Produces: `AdminPerson.createdAt?: string | null`, `createdBy?: PersonSummary | null`; `LogEntry.entityName?: string | null`; `createdNote(p: AdminPerson): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
test('createdNote', () => {
  expect(createdNote({ ...base, createdAt: '2026-11-02T10:00:00Z', createdBy: summary('Ben', 'Okafor') })).toBe('added Nov 2, 2026 by Ben Okafor');
  expect(createdNote({ ...base, createdAt: '2026-11-02T10:00:00Z', createdBy: null })).toBe('added Nov 2, 2026');
  expect(createdNote(base)).toBeNull();
});
test('logHeadline uses entityName when present', () => {
  expect(logHeadline(entry({ entityName: 'Ana Lopez · CSO at Triangle' }))).toBe('Ben Okafor · grantRole · Ana Lopez · CSO at Triangle');
  expect(logHeadline(entry({ entityName: null }))).toBe('Ben Okafor · grantRole · role r1');
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd web && npx vitest run src/lib/admin.test.ts src/lib/clusterNotebook.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`NotInSrpCard` rows add a muted `createdNote(p)` line when non-null; `logHeadline` prefers `entityName`.

- [ ] **Step 4: Run tests, types, lint**

Run: `cd web && npx vitest run && npx tsc --noEmit && npx eslint src/lib src/components/admin`
Expected: all pass, exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A web/src docs/cluster-notebook-api-requirements.md
git commit -m "feat: show who added people not in SRP, and names in the Log"
```
