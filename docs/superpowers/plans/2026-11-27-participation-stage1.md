# Participation, Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A neighborhood can keep its own list of participation spaces, record each gathering (count, optional names,
note) or running-count entry, see a space's history and who has been coming, and filter the People card to everyone
named at a gathering.

**Architecture:** cluster-notebook (PR #66) holds all data. New GraphQL calls in `lib/clusterNotebook.ts`, pure
decisions in a new `lib/participation.ts`, two API routes (`/api/participation/spaces`, `/api/participation/records`),
a Participation card on the nucleus page, and a full-page space view that AppClient shows when the address carries
`&space=<id>`.

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Vitest. Work in the worktree `../neighborhood-participation`
(branch `feat/participation`); rebase it onto `origin/main` before Task 1 (main gained households and PR #85). Read `web/AGENTS.md` and the guide in `node_modules/next/dist/docs/` before writing Next
code.

**Spec:** `docs/superpowers/specs/2026-11-27-participation-design.md` (stage 1 section). Mockups (owner-private):
https://claude.ai/artifact/JBwwbMjTex1BYLR9PXB1F8, screens 1, 2, 4 (gathering list and "Who's been coming" only)
and 6.

## Global Constraints

- cluster-notebook API (confirmed 2026-11-27, their PR #66), verbatim:
  - `spaceKinds: [SpaceKind!]! { key label }`. Read it; never hard-code the list except as the suggestion names below.
  - `Nucleus.participationSpaces(includeArchived: Boolean = false): [ParticipationSpace!]!`, ordered by name.
  - `ParticipationSpace { id name kind mode: SpaceMode (EACH_TIME|RUNNING) createdAt archivedAt recordCount: Int!
    total: Int! latestRecord: ParticipationRecord records(limit: Int = 20, offset: Int = 0): [ParticipationRecord!]!
    people(since: Date!, until: Date): SpacePeople! }`
  - `SpacePeople { recordCount: Int! people: [SpacePerson!]! { individual: PersonSummary records: Int! } }`
  - `ParticipationRecord { id date count note people: [PersonSummary!]! createdAt updatedAt }`. `Date` is ISO
    `YYYY-MM-DD`.
  - Mutations: `createParticipationSpace(nucleusId: String!, name: String!, kind: String!, mode: SpaceMode!)`,
    `updateParticipationSpace(id: String!, name: String, kind: String, archived: Boolean)`,
    `createParticipationRecord(spaceId: String!, date: Date!, count: Int!, note: String, personIds: [String!])`,
    `updateParticipationRecord(id: String!, date: Date, count: Int, note: String, personIds: [String!])` (only given
    fields change; `note: null` clears; `personIds` replaces), `deleteParticipationRecord(id: String!): Boolean!`.
  - `NucleusPerson.inSpaces: Boolean!`.
  - Codes: FORBIDDEN, NUCLEUS_NOT_FOUND, SPACE_NOT_FOUND, RECORD_NOT_FOUND, UNKNOWN_KIND, NAME_TAKEN, BAD_INPUT,
    BAD_COUNT, NAMED_EXCEED_COUNT, OTHER_CLUSTER, INDIVIDUAL_NOT_FOUND, SPACE_ARCHIVED.
  - Permissions: read needs `canRead` on the nucleus, writes need `canWrite`. cluster-notebook enforces both.
- Every route checks Clerk auth, then `getNucleusPermissions(nucleus)`, and catches through
  `clusterNotebookErrorResponse()`.
- Null means not recorded: a space with no records shows "—", never 0.
- Touch targets ≥ 44px. Popovers inside `.card` use `createPortal`. No `setState` in `useEffect` bodies
  (`react-hooks/set-state-in-effect`).
- Copy (owner-approved via mockups): card title "Participation"; "+ Add a space"; "+ Record a gathering"; "+ Record
  visits" is generic for running spaces: use "+ Add to the count"; "Came last time"; "Someone else"; "N of M named";
  "Who's been coming · 12 weeks"; People filter labels "Participating" (new) and "In educational activities"
  (relabelled).
- Made-up names only in tests. Each commit: conventional prefix, a body saying why, trailers
  `Claude-Session: https://claude.ai/code/session_012sFawN18GFdbYfeGDWU7jN` and `Co-authored-by: Claude <noreply@anthropic.com>`.
- Verify: `cd web && npm test && npx tsc --noEmit && npx eslint <changed files>` (check real exit codes).

## Review Focus

1. **Recording on an archived space** (SPACE_ARCHIVED): the space page hides record buttons when `archivedAt` is set
   and shows "Restore" (editors). Pinned in Task 6 by `canRecord` test.
2. **Naming more people than the count:** tapping a name past the count raises the count to match
   (`countAfterNaming`), so NAMED_EXCEED_COUNT is never sent from the UI. Pinned in Task 2.
3. **A count typed as "", "-1", "2.5" or "abc":** Save stays disabled; `parseCount` returns null. Pinned in Task 2.
4. **Read-only users** (canRead, not canWrite): see the card, the space page and names, but no add/record/edit
   controls; routes return 403 on writes. Pinned in Task 3 (route guard via `canWrite` check) and Task 5/6 props.
5. **Space id in the address that isn't this nucleus's (removed, archived, or someone else's):** the space view
   shows "That space wasn't found." with Back to the nucleus; never a crash. Pinned in Task 4 (`spaceIdFromSearch`)
   and Task 7.

---

### Task 1: People filters: "In educational activities" and the new "Participating"

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (`NucleusPerson`, `NUCLEUS_PERSON_SELECTION` ~line 685)
- Modify: `web/src/lib/people.ts` (`PersonRow`, `PARTICIPATES`, `PRIMARY_FILTERS`, `matchesFilter`, `toPersonRow`)
- Modify: any component that reads `PARTICIPATES.label` for the role mark (grep `PARTICIPATES`)
- Test: `web/src/lib/people.test.ts`

**Interfaces:**
- Produces: `PersonRow.inSpaces: boolean`; filter keys `'educational'` (label "In educational activities", matches
  `participates`) and `'participating'` (label "Participating", matches `inSpaces`).

- [ ] **Step 1: Failing tests** in `people.test.ts`:
  - `peopleFilters` lists `{ key: 'educational', label: 'In educational activities' }` where `participating` used to
    sit, and `{ key: 'participating', label: 'Participating' }` right after it.
  - `filterPeople(rows, 'educational', '')` returns rows with `participates: true`; `filterPeople(rows, 'participating', '')`
    returns rows with `inSpaces: true`, including one that also has roles.
  - `toPersonRow` copies `inSpaces`.
- [ ] **Step 2:** `npx vitest run src/lib/people.test.ts`: FAIL.
- [ ] **Step 3:** Add `inSpaces` to `NucleusPerson` and the selection; add it to `PersonRow`/`toPersonRow`; rename the
  `PARTICIPATES` label to "In educational activities" (keep the 📖 icon for the roster mark) and the key to
  `'educational'`; add the new `participating` filter. Update existing fixtures that build `PersonRow`/`NucleusPerson`
  objects to include `inSpaces: false`. Add a dated comment: "Confirmed with cluster-notebook 2026-11-27 (#66):
  inSpaces = named on a live record of any of this nucleus's spaces, archived spaces included."
- [ ] **Step 4:** tests, tsc, eslint pass.
- [ ] **Step 5: Commit** `feat: People filters for educational activities and gatherings`.

### Task 2: cluster-notebook client, error codes, and pure participation logic

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (new section "Participation spaces")
- Modify: `web/src/lib/clusterNotebookError.ts` (+ `clusterNotebookError.test.ts` table)
- Create: `web/src/lib/participation.ts`, `web/src/lib/participation.test.ts`
- Test: `web/src/lib/clusterNotebook.test.ts` (uses the existing `mockFetch` pattern)

**Interfaces (Produces):**
```ts
// clusterNotebook.ts
export type SpaceMode = 'EACH_TIME' | 'RUNNING';
export interface SpaceKind { key: string; label: string }
export interface ParticipationRecord { id: string; date: string; count: number; note: string | null; people: PersonSummary[]; createdAt: string; updatedAt: string }
export interface ParticipationSpace { id: string; name: string; kind: string; mode: SpaceMode; createdAt: string; archivedAt: string | null; recordCount: number; total: number; latestRecord: ParticipationRecord | null }
export interface SpacePeople { recordCount: number; people: { individual: PersonSummary; records: number }[] }
export type SpaceDetail = ParticipationSpace & { records: ParticipationRecord[]; people: SpacePeople };
export async function getSpaceKinds(): Promise<SpaceKind[]>;
export async function getParticipationSpaces(nucleusName: string, includeArchived?: boolean): Promise<{ nucleusId: string; spaces: ParticipationSpace[] } | null>; // null: unknown nucleus
export async function getParticipationSpace(nucleusName: string, spaceId: string, since: string, limit?: number, offset?: number): Promise<SpaceDetail | null>; // includeArchived: true, then find by id; null if absent
export async function createParticipationSpace(nucleusId: string, name: string, kind: string, mode: SpaceMode): Promise<ParticipationSpace>;
export async function updateParticipationSpace(id: string, patch: { name?: string; kind?: string; archived?: boolean }): Promise<ParticipationSpace>;
export async function createParticipationRecord(spaceId: string, input: { date: string; count: number; note?: string | null; personIds?: string[] }): Promise<ParticipationRecord>;
export async function updateParticipationRecord(id: string, patch: { date?: string; count?: number; note?: string | null; personIds?: string[] }): Promise<ParticipationRecord>;
export async function deleteParticipationRecord(id: string): Promise<boolean>;

// participation.ts
export type SpaceSuggestion = { name: string; kind: string; mode: SpaceMode };
export const SPACE_SUGGESTIONS: SpaceSuggestion[];
export function availableSuggestions(kinds: SpaceKind[], existingNames: string[]): SpaceSuggestion[];
export function parseCount(text: string): number | null;
export function countAfterNaming(count: number | null, named: number): number;
export function namedLabel(named: number, count: number): string;
export function lastTimeChoices(latest: ParticipationRecord | null, pickedIds: string[]): PersonSummary[];
export function isoDate(d: Date): string;          // local calendar date, YYYY-MM-DD
export function windowStart(today: Date, weeks?: number): string; // default 12 weeks
export function shortDate(iso: string): string;    // "Nov 20"
export function spaceRowSummary(space: ParticipationSpace): { value: string; caption: string; detail: string };
export function canRecord(space: Pick<ParticipationSpace, 'archivedAt'>, canWrite: boolean): boolean;
export type RecordBody = { spaceId: string; date: string; count: number; note: string | null; personIds: string[] };
export function parseRecordBody(body: unknown): { ok: true; value: RecordBody } | { ok: false; error: string };
export function parseRecordPatch(body: unknown): { ok: true; id: string; patch: { date?: string; count?: number; note?: string | null; personIds?: string[] } } | { ok: false; error: string };
```

- [ ] **Step 1: Failing tests, `participation.test.ts`:**
  - `SPACE_SUGGESTIONS` equals, in order: Social action/`social_action`/EACH_TIME, Community gathering/
    `community_gathering`/EACH_TIME, Reflection gathering/`reflection`/EACH_TIME, Expansion phase/`expansion`/RUNNING,
    Visiting neighbors/`visiting`/RUNNING.
  - `availableSuggestions` drops a suggestion whose kind is not in `kinds` and one whose name matches an existing
    space case-insensitively ("reflection GATHERING").
  - `parseCount`: "15"→15, " 0 "→0, ""→null, "-1"→null, "2.5"→null, "abc"→null.
  - `countAfterNaming(15, 6)`→15; `(5, 6)`→6; `(null, 2)`→2.
  - `namedLabel(6, 15)`→"6 of 15 named"; `namedLabel(0, 0)`→"".
  - `lastTimeChoices(record with A,B,C, ['B'])`→[A, C]; `(null, [])`→[].
  - `windowStart(new Date(2026, 10, 27))`→"2026-09-04"; `isoDate(new Date(2026, 0, 5))`→"2026-01-05".
  - `shortDate('2026-11-20')`→"Nov 20" (format with `timeZone: 'UTC'` from a `YYYY-MM-DDT00:00:00Z` parse so no
    day shift).
  - `spaceRowSummary`: EACH_TIME with latest count 14 on 2026-11-20, recordCount 9 → `{ value: '14', caption: 'last
    time', detail: 'Last Nov 20 · 9 recorded' }`; RUNNING total 37, latest 2026-11-25 → `{ value: '37', caption: 'so
    far', detail: 'Last entry Nov 25' }`; any mode with recordCount 0 → `{ value: '—', caption: '', detail: 'Nothing
    recorded yet' }`.
  - `canRecord({archivedAt: null}, true)`→true; archived→false; canWrite false→false.
  - `parseRecordBody`: accepts `{spaceId:'s1', date:'2026-11-20', count:3, note:' hi ', personIds:['p1']}` (note
    trimmed; blank note → null; missing personIds → []); rejects missing spaceId, bad date ("Nov 20"), negative or
    non-integer count, non-string personIds.
  - `parseRecordPatch`: only fields present appear in `patch`; `note: null` and `note: ''` both → `note: null`.
- [ ] **Step 2: Failing tests, `clusterNotebook.test.ts`:** `getParticipationSpaces` returns `{ nucleusId, spaces }`
  from `{ nucleus: { id, participationSpaces } }` and null for `{ nucleus: null }`; `getParticipationSpace` returns the
  matching space and null when the id is absent; `updateParticipationRecord` sends only given variables (assert the
  request body's `variables` has no `count` key when not given, and `note: null` when clearing).
- [ ] **Step 3: Failing tests, `clusterNotebookError.test.ts`** table rows:
  `NUCLEUS_NOT_FOUND 404 'Nucleus not found.'`, `SPACE_NOT_FOUND 404 "That space wasn't found. It may have been removed."`,
  `RECORD_NOT_FOUND 404 "That record wasn't found. It may have been removed."`, `UNKNOWN_KIND 400 'Choose a kind from the list.'`,
  `BAD_COUNT 400 'The number of participants must be 0 or more.'`,
  `NAMED_EXCEED_COUNT 400 'More people are named than took part. Raise the number or remove a name.'`,
  `OTHER_CLUSTER 400 'Only people in this cluster can be named.'`,
  `SPACE_ARCHIVED 409 'This space is archived. Restore it to record again.'`.
  NAME_TAKEN (nucleus) and INDIVIDUAL_NOT_FOUND (households, PR #87) already have global messages; the routes reword
  them with `messages` (Task 3), no change here.
- [ ] **Step 4:** run them: FAIL.
- [ ] **Step 5:** Implement. GraphQL selections reuse `PERSON_SUMMARY_SELECTION`. `getParticipationSpace` asks
  `nucleus(name) { participationSpaces(includeArchived: true) { …, records(limit, offset) {…}, people(since: $since) {…} } }`
  and picks by id (resolving records for every space is acceptable at tens of spaces; note it in a comment). Error
  codes with a dated "Confirmed with cluster-notebook 2026-11-27 (#66)" comment.
- [ ] **Step 6:** tests, tsc, eslint pass. **Commit** `feat: participation client and decisions`.

### Task 3: API routes

**Files:**
- Create: `web/src/app/api/participation/spaces/route.ts`, `web/src/app/api/participation/records/route.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (JSON):
  - `GET /api/participation/spaces?nucleus=N` → `{ spaces: ParticipationSpace[]; kinds: SpaceKind[] }` (live spaces only).
  - `GET /api/participation/spaces?nucleus=N&space=ID` → `{ space: SpaceDetail; kinds: SpaceKind[] }`; 404
    `{ error: "That space wasn't found." }` when absent. `since` = `windowStart(new Date())`.
  - `POST /api/participation/spaces` `{ nucleus, name, kind, mode }` → `{ space }` (trim name; 400 on blank name or
    mode not EACH_TIME/RUNNING).
  - `PATCH /api/participation/spaces` `{ nucleus, id, name?, kind?, archived? }` → `{ space }`.
  - `POST /api/participation/records` `{ nucleus, ...RecordBody }` → `{ record }`.
  - `PATCH /api/participation/records` `{ nucleus, id, ...patch }` → `{ record }`.
  - `DELETE /api/participation/records` `{ nucleus, id }` → `{ deleted: boolean }`.
- Every handler: 401 without Clerk user; 400 without `nucleus`; `getNucleusPermissions(nucleus)`; GET needs
  `canRead`, everything else `canWrite` (403 `{ error: 'Access denied' }`); errors via
  `clusterNotebookErrorResponse(e, { messages: { NAME_TAKEN: 'This neighborhood already has a space with that name.', INDIVIDUAL_NOT_FOUND: "One of the people named wasn't found." } })`.
  Body validation through `parseRecordBody` / `parseRecordPatch`.

- [ ] **Step 1:** Implement both routes following `app/api/hide/route.ts`'s shape. (No route-test infrastructure
  exists; the decisions they make are tested in Task 2.)
- [ ] **Step 2:** tsc and eslint pass. Against local cluster-notebook (`npm run dev`, signed in), `GET
  /api/participation/spaces?nucleus=<a nucleus you can read>` returns `{ spaces, kinds }` with seven kinds.
- [ ] **Step 3: Commit** `feat: participation API routes`.

### Task 4: Space in the address

**Files:**
- Modify: `web/src/lib/nucleusUrl.ts`, Test: `web/src/lib/nucleusUrl.test.ts`

**Interfaces (Produces):**
- `spaceIdFromSearch(search: string): string | null` (param `space`, trimmed, empty → null).
- `nucleusHref(id: string | null, spaceId?: string | null): string`: `/?nucleus=<id>&space=<spaceId>`; space ignored
  when id is null.

- [ ] **Step 1: Failing tests:** `spaceIdFromSearch('?nucleus=a&space=s1')`→'s1'; `('?nucleus=a')`→null;
  `('?space=%20')`→null; `nucleusHref('a','s1')`→'/?nucleus=a&space=s1'; `nucleusHref(null,'s1')`→'/';
  `nucleusHref('a')` unchanged ('/?nucleus=a').
- [ ] **Step 2–4:** fail, implement, pass (tests, tsc, eslint).
- [ ] **Step 5: Commit** `feat: a space's page has its own address`.

### Task 5: Participation card and Add a space

**Files:**
- Create: `web/src/components/ParticipationCard.tsx`, `web/src/components/SpaceFormModal.tsx`
- Modify: `web/src/components/DetailView.tsx` (new prop, `card('participation', false)`, render immediately before
  the `{/* Additional Details */}` card)

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  - `ParticipationCard({ nucleus, canWrite, open, onOpenChange, onOpenSpace }: { nucleus: string; canWrite: boolean; open: boolean; onOpenChange(open: boolean): void; onOpenSpace(spaceId: string): void })`.
    Fetches `GET /api/participation/spaces` when first opened. Header styled like the other cards ("Participation").
    One row per space (button, ≥44px): name, a "Count" tag for RUNNING, `spaceRowSummary` detail under the name and
    value + caption on the right. Empty: "No spaces yet." Footer "+ Add a space" when `canWrite`.
  - `SpaceFormModal({ kinds, existingNames, initial?, onClose, onSaved }: { kinds: SpaceKind[]; existingNames: string[]; initial?: ParticipationSpace; onClose(): void; onSaved(space: ParticipationSpace): void; nucleus: string })`.
    New: suggestion chips from `availableSuggestions` (tap fills name, kind, mode), Name, "How do you record it?" radio
    (Each time it happens / A running count, with the mockup's one-line explanations), Kind select from `kinds`
    (required). Edit (`initial` given, used in Task 6): name and kind only, mode shown fixed; plus "Archive space" /
    "Restore space". Server errors shown inline; the form stays open.
  - DetailView: new prop `onOpenSpace(spaceId: string): void`; passes `permissions.canWrite`.
- [ ] **Step 1:** Build both components and the DetailView wiring.
- [ ] **Step 2:** tsc and eslint pass; in the browser (local cluster-notebook): card opens, lists spaces, adds a
  space from a suggestion and from scratch, NAME_TAKEN shows "This neighborhood already has a space with that name."
  A read-only user sees no "+ Add a space".
- [ ] **Step 3: Commit** `feat: Participation card on the nucleus page`.

### Task 6: Space page and recording

**Files:**
- Create: `web/src/components/PersonSearch.tsx` (moved out of `PeopleCard.tsx`'s `AddPerson`, unchanged behavior)
- Modify: `web/src/components/PeopleCard.tsx` (import `PersonSearch` instead of the local `AddPerson`)
- Create: `web/src/components/SpaceView.tsx`, `web/src/components/RecordModal.tsx`

**Interfaces:**
- Produces:
  - `PersonSearch({ nucleus, hiddenIds, onPick, placeholder? })` with `export type Found = { id: string; name: string; place: string; homeNucleus: string | null }`. Same search and **Create "…"** as today.
  - `SpaceView({ nucleus, spaceId, canWrite, onBack })`: header (space name, nucleus name, Back). Fetches `GET
    /api/participation/spaces?nucleus&space`. Not found → "That space wasn't found." and Back. Shows:
    - Record button when `canRecord(space, canWrite)`: "+ Record a gathering" (EACH_TIME) or "+ Add to the count"
      (RUNNING). Archived → "This space is archived." and, for editors, "Restore space".
    - For RUNNING: the total (big number) and "since <shortDate(createdAt)>".
    - "Who's been coming · 12 weeks": each person with "N of M" (M = `people.recordCount`); empty → "No one named
      yet."
    - Records newest first: date, count, `namedLabel`, note; tap (editors) opens RecordModal to edit; "Show more"
      fetches the next 20 (`offset`).
    - "Edit space" (editors) opens `SpaceFormModal` with `initial`.
  - `RecordModal({ nucleus, space, record?, onClose, onSaved })`: Date (default `isoDate(new Date())`), Participants
    (`parseCount`; Save disabled while null), "Who came (optional)" with `namedLabel`, "Came last time" chips from
    `lastTimeChoices(space.latestRecord, picked)` (hidden when editing that same record), "Someone else"
    (`PersonSearch`; picking or creating adds a chip, no roles asked), picked chips removable, Note. Each pick sets the
    count to `countAfterNaming`. Save → POST (new) or PATCH with only changed fields (edit). Editing also offers
    "Delete" with a confirm. Errors inline; form stays open.
- [ ] **Step 1:** Move `AddPerson` to `PersonSearch.tsx`; People card still adds people exactly as before (browser
  check).
- [ ] **Step 2:** Build SpaceView and RecordModal.
- [ ] **Step 3:** tsc and eslint pass; browser: record a gathering with a count only; with last-time chips; with a
  searched person; with **Create "…"** (the new person then appears on the People card under "Participating"); edit a
  record to add names; delete one; a RUNNING space adds to its total; archive then restore.
- [ ] **Step 4: Commit** `feat: a space's page, recording gatherings and counts`.

### Task 7: Navigation to and from a space

**Files:**
- Modify: `web/src/components/AppClient.tsx`

**Interfaces:**
- Consumes: Task 4 (`spaceIdFromSearch`, `nucleusHref`), Task 5 (`onOpenSpace`), Task 6 (`SpaceView`).
- Behavior:
  - New state `selectedSpace: string | null`. `onOpenSpace(id)` pushes `nucleusHref(nucleusId, id)` and shows
    `SpaceView` in place of `DetailView` (the nucleus detail stays loaded).
  - View key for `openByView`/scroll: `${nucleus}#space:${id}`, via `goToView`.
  - SpaceView's Back: `history.back()` when we pushed the entry, else replace the address with the nucleus's and show
    the nucleus page. The Participation card's open state comes back (it lives in `openByView[nucleus]`).
  - popstate and first load read `spaceIdFromSearch` alongside `nucleusFromUrl`: a nucleus plus space opens the
    nucleus, then the space; a space without a readable nucleus falls back to today's handling.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** tsc and eslint pass; browser: open a space and come back by in-app Back and by browser Back (card
  still open, scroll restored); reload on a space page stays there; a bad `space=` id shows "That space wasn't found."
- [ ] **Step 3: Commit** `feat: opening a space and coming back`.

### Task 8: Record the API in the requirements doc

**Files:**
- Modify: `docs/cluster-notebook-api-requirements.md` (new section "Participation spaces, confirmed with
  cluster-notebook 2026-11-27 (#66)")

- [ ] **Step 1:** Add the schema summary, codes, permissions, `inSpaces`, and that nothing goes to SRP (copy from
  Global Constraints, prose style of the file's other dated sections).
- [ ] **Step 2: Commit** `docs: participation spaces API`.
