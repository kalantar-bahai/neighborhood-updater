# People Card Moves (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move a person into or out of a home nucleus's Setting from the People card, one at a time, with SRP following and its answer shown on the row.

**Architecture:** `clusterNotebook.ts` gains place ids, `placeSync`, `moveIndividuals` and a move-context read. Pure decisions (move-out destination, sync note, result copy, roles to clear, polling) live in `lib/people.ts` with tests. `/api/people` returns each row's place and sync state plus the nucleus's move targets, a new `/api/move` wraps the mutation, and `PeopleCard` adds the confirm, status and household flows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-people-card-moves-design.md`

## Global Constraints

- cluster-notebook SDL (branch `move-individuals`, sent 2026-11-19):
  - `Location { id: String! name type locality cluster }`
  - `moveIndividuals(individualIds: [String!]!, locationId: String!, withHousehold: Boolean = false): [MoveResult!]!`
  - `MoveResult { individual: PersonSummary  moved: Boolean!  code: String }`; codes `NOT_FOUND | OTHER_CLUSTER | FORBIDDEN | ALREADY_THERE`
  - Whole-call errors (`extensions.code`): `FORBIDDEN`, `LOCATION_NOT_FOUND`, `NOT_A_PLACE`
  - `PersonSummary.placeSync: PlaceSync | null`, `PlaceSync { status code error household: [PersonSummary!] householdSize requestedAt }`; status `pending | in_flight | synced | refused | failed | not_in_srp`
- **Pending with cluster-notebook (asked 2026-11-19):** `Location.localityId: String` (SETTING only), `Location.homeNucleus: String` (home nucleus name or null), readable `parentNucleus { inSrp location { id name type locality cluster localityId } }`, and `PlaceSync.to: Location` (the requested destination, so a household resend targets the same place). Task 1 starts by confirming the names. If they differ, use theirs and ledger a ruling.
- Never move by name; always send `locationId`. Key off `code`, never `error`.
- Copy (exact):
  - in-flight: `On its way to SRP`
  - refusals: `FN_NOT_IN_LOCALITY` → `That neighbourhood isn't in their locality`; `OUT_OF_SCOPE` → `SRP doesn't let us change this person`; `NOT_IN_SRP_RECORDS` → `SRP doesn't have this person`; other → `SRP refused the move (<code>)`
  - failed: `Couldn't reach SRP: <code>`
  - household: `<name> lives with <N> others in SRP. Move them all?` (N = householdSize − 1; append ` (<contact name> is the contact)` when `household[0]` is present)
  - move results: `FORBIDDEN` → `You can't move this person`; `OTHER_CLUSTER` → `This person is in another cluster`; `NOT_FOUND` → `Person not found`; `ALREADY_THERE` is success
  - confirm in: `Move <name> here?`, line `Lives in: <path>`; confirm out: `Move <name> out of <here name>?`, line `To: <path>`
  - keep box: in `Keep roles at <old name> (still working there)`; out `Keep roles here (still working in this nucleus)`; ticked by default
- Move-out destination: the parent's Setting if the parent nucleus `inSrp` and its location is a SETTING in the same locality as here; otherwise here's Locality (`localityId`).
- Resident editable when `isHome && permissions.canWrite`.
- Save order: move first; a non-moved result (other than `ALREADY_THERE`) stops the Save with no role writes; then role writes (here and, when keep is unticked, at the old nucleus).
- Poll: while the card is open and any row's sync is `pending` or `in_flight`, re-read every 10 s.
- The "Remove" button is removed.

## Review Focus

- A person with no roles moved out with keep unticked: no role calls at all (nothing to clear).
- Move in for someone at a Locality (no `homeNucleus`): no roles question, no extra reads.
- Caller can read but not assign roles at the old nucleus: the roles question is hidden and roles stay.
- A household refusal followed by "Move them all": the resend uses `withHousehold: true` and the same `locationId`; Cancel leaves the refused note.
- Polling stops when nothing is pending, and stops when the card closes (unmounts).

---

### Task 1: cluster-notebook client

**Files:** Modify `web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebook.test.ts`

**Interfaces — Produces:**
- `PlaceSummary` adds `id: string; localityId: string | null; homeNucleus: string | null`; selection `place { id name type locality cluster localityId homeNucleus }`.
- `interface PlaceSync { status: 'pending' | 'in_flight' | 'synced' | 'refused' | 'failed' | 'not_in_srp'; code: string | null; householdSize: number | null; household: PersonName[] | null }`; `PersonSummary.placeSync: PlaceSync | null`; selection `placeSync { status code householdSize household { id firstName middleNames familyName nickname } to { id name type locality cluster } }`, with `to: PlaceSummary | null` on `PlaceSync`.
- `interface MoveResult { individual: PersonSummary | null; moved: boolean; code: string | null }`; `moveIndividuals(ids: string[], locationId: string, withHousehold: boolean): Promise<MoveResult[]>`.
- `interface MoveContext { location: PlaceSummary | null; parent: { inSrp: boolean; location: PlaceSummary | null } | null }`; `getMoveContext(nucleusName: string): Promise<MoveContext | null>` (null when the nucleus isn't found).

- [ ] **Step 0:** Confirm the pending field names with cluster-notebook (SendMessage). Ledger the answer.
- [ ] **Step 1: Tests:** `moveIndividuals(['a'],'L1',true)` sends `{ individualIds:['a'], locationId:'L1', withHousehold:true }` and returns the list; `getMoveContext('Alpha')` selects `location { …place fields }` and `parentNucleus { inSrp location { … } }`, returns null when `nucleus` is null; the people and search selections include `id`, `localityId`, `homeNucleus` and the `placeSync` block (update the existing selection tests).
- [ ] **Step 2:** `cd web && npx vitest run src/lib/clusterNotebook.test.ts` — FAIL.
- [ ] **Step 3:** Implement; `moveIndividuals` errors propagate as today (routes map them).
- [ ] **Step 4:** `npm test && npx tsc --noEmit` — PASS. Fix any fixture in `people.test.ts` that now lacks the new fields.
- [ ] **Step 5:** Commit `feat: read place ids and move state, add moveIndividuals`.

### Task 2: Move decisions

**Files:** Modify `web/src/lib/people.ts`, `web/src/lib/people.test.ts`

**Interfaces — Consumes:** Task 1 types. **Produces:**
- `PersonRow` adds `place: PlaceSummary | null; placeSync: PlaceSync | null`; `toPersonRow` copies them.
- `type MoveTarget = { id: string; path: string; name: string }`
- `moveTargets(ctx: MoveContext): { here: MoveTarget | null; out: MoveTarget | null }` — `here` only when `ctx.location` is a SETTING; `out` per the Global Constraints rule; `path` via `placePath`.
- `syncNote(sync: PlaceSync | null, name: string): { tone: 'wait' | 'error' | 'household'; text: string } | null` — wait for pending/in_flight; error for refused (non-household) and failed; household for `HOUSEHOLD_MOVES_TOGETHER`; null for synced, not_in_srp, null.
- `moveResultError(r: MoveResult): string | null` — null when moved or `ALREADY_THERE`.
- `rolesToClear(held: string[], editable: (role: string) => boolean, keep: boolean): string[]` — `[]` when keep; else the held roles that are editable.
- `isMoving(rows: PersonRow[]): boolean` — any pending/in_flight.

- [ ] **Step 1: Tests:**
  - `moveTargets`: here Setting Parkside (localityId `LOC1`) with parent `inSrp` Setting in the same locality → `out.id` is the parent's; parent not inSrp → `out.id === 'LOC1'` and `out.path === 'Chapel Hill › Chapelboro'`; parent in another locality → `LOC1`; no parent → `LOC1`; here a LOCALITY → `here: null`.
  - `syncNote`: pending → `{tone:'wait', text:'On its way to SRP'}`; refused `FN_NOT_IN_LOCALITY` → `That neighbourhood isn't in their locality`; refused `XYZ` → `SRP refused the move (XYZ)`; failed `O026` → `Couldn't reach SRP: O026`; household size 4 with contact Ben Okafor → `Ana Lopez lives with 3 others in SRP. Move them all? (Ben Okafor is the contact)`; synced and null → null.
  - `moveResultError`: FORBIDDEN, OTHER_CLUSTER, NOT_FOUND copy; ALREADY_THERE and moved → null.
  - `rolesToClear(['promoter','accompanier'], r => r === 'promoter', false)` → `['promoter']`; keep → `[]`; `([], …, false)` → `[]`.
  - `isMoving`: true with one in_flight; false with synced/refused/null.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** `npm test && npx tsc --noEmit` PASS.
- [ ] **Step 5:** Commit `feat: move decisions for the People card`.

### Task 3: Routes

**Files:** Modify `web/src/app/api/people/route.ts`, `web/src/app/api/individuals/route.ts`; Create `web/src/app/api/move/route.ts`; Modify `docs/cluster-notebook-api-requirements.md`

**Interfaces — Consumes:** Tasks 1–2. **Produces:**
- `GET /api/people?nucleus=` → `{ people: PersonRow[], move: { here: MoveTarget | null, out: MoveTarget | null }, editableRoles: string[] }` (`editableRoles` = roles in `KNOWN_ROLES` plus held roles for which `canEditRole(permissions, role)`; lets the card ask about another nucleus).
- `GET /api/individuals` results add `homeNucleus: string | null` and `placeId: string | null`.
- `POST /api/move` body `{ nucleus, individualId, locationId, withHousehold? }` → `{ result: MoveResult }`; 401/400 as other routes; 403 without `canWrite` on `nucleus`; errors via `clusterNotebookErrorResponse`.
- [ ] **Step 1:** Write the routes (pattern: `/api/people`). `/api/people` calls `getNucleusPeople` and `getMoveContext` in parallel.
- [ ] **Step 2:** API doc: section "People card moves, confirmed with cluster-notebook 2026-11-19" with the SDL above and the confirmed pending names.
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npx eslint src/app/api/people/route.ts src/app/api/individuals/route.ts src/app/api/move/route.ts` — PASS.
- [ ] **Step 4:** Commit `feat: move route and move context for the People card`.

### Task 4: People card moves

**Files:** Modify `web/src/components/PeopleCard.tsx`

**Interfaces — Consumes:** Tasks 2–3.

- [ ] **Step 1:** Editor: Resident checkbox enabled when `isHome && permissions.canWrite` (and the target is known: `move.here` for ticking, `move.out` for unticking); drop "(set in SRP for now)" and the Remove button.
- [ ] **Step 2:** Save with Resident changed shows the confirm (inline in the editor) with the Global Constraints copy. Roles line and keep box:
  - Move out: roles held here that `canEditRole` allows; keep box clears them via the existing per-role write.
  - Move in: when the picked person's `homeNucleus` is set and isn't this nucleus, GET `/api/people?nucleus=<homeNucleus>`; on 403/404 skip the question; else use that person's roles there filtered by the response's `editableRoles`.
- [ ] **Step 3:** On Move: POST `/api/move`; a `moveResultError` shows red in the editor and stops. Otherwise clear `rolesToClear(...)` at the old nucleus (here for out, `homeNucleus` for in), then the role ticks here, then re-read and `onRolesChanged`.
- [ ] **Step 4:** Rows: `syncNote` beside 🏠 — wait as `⏳` with `title`; error as a red line under the name; household as a line with "Move them all" (POST `/api/move` with `withHousehold: true` to `placeSync.to.id`; hidden if `to` is null) and "Cancel" (hides the prompt for this session).
- [ ] **Step 5:** Polling: `useEffect` on `isMoving(rows)` sets a 10 s interval that bumps `reloads`; cleared on unmount or when false.
- [ ] **Step 6:** `npm test && npx tsc --noEmit && npx eslint src/components/PeopleCard.tsx` — PASS.
- [ ] **Step 7:** Owner checks locally against cluster-notebook `move-individuals` with the worker on `--serve --fake-srp`: move in through "+ Add" (confirm, ⏳ then cleared), move out to the parent or locality, keep-roles unticked clears roles, Remove gone.
- [ ] **Step 8:** Commit `feat: move people in and out from the People card`.
