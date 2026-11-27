# Activity Rollup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a nucleus with nuclei under it, the Educational Activities & Devotionals card gets a switch between "This nucleus" and a group view. The group view is read-only and shows cluster-notebook's `activityTotals`.

**Architecture:**
- cluster-notebook computes the sums.
- We read `activityTotals` with the nucleus fields and in the cheap counts refresh.
- Pure helpers in `lib/activityTotals.ts` turn it into table rows and labels.
- DetailView adds the switch, which persists through the existing `card()` open-state mechanism.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-activity-rollup-design.md`

## Global Constraints

- Backend shape, verbatim:
  ```
  Nucleus.activityTotals: ActivityTotals! { nucleiCounted: Int!, devotionalGathering / childrensClasses / juniorYouthGroups / studyCircles: ActivityCounts! }
  ActivityCounts { number: Int, participants: Int, participantsFof: Int }
  ```
- Null means "not recorded". Never coerce it to 0. Group cells show blank for null, and a group total row is blank only when all of its inputs are null.
- "N under it" = `activityTotals.nucleiCounted - 1`. This differs from `namedCounts.nucleiCounted`, so the two labels must not be confused.
- The switch appears only when N ≥ 1. The default is "This nucleus" (today's editable table, unchanged).
- Per-nucleus values, `NucleusSummary`, and the Picker's locality sums are untouched.
- Record the confirmed field in `docs/cluster-notebook-api-requirements.md` and in a dated code comment ("Confirmed with cluster-notebook 2026-11-27: …").
- Commit only when asked. Use the conventional prefix and the `Claude-Session` / `Co-authored-by` trailers.

## Review Focus

- **An older backend without `activityTotals`** (production before cluster-notebook deploys). Expected: GraphQL errors on the unknown field, so the nucleus page fails. This is accepted, as with namedCounts: deploy cluster-notebook first. The reviewer should confirm that nothing *else* silently breaks.
- **An activity save that fails.** Expected: the group sums are not refreshed, and the old ones stay. Task 3 refreshes only on `result.ok`.
- **The group view while an edit is unsaved.** The group view is read-only, so switching mid-edit must not lose the edit. Expected: the edit commits on blur, as today, before the switch's click registers.
- **A group of all nulls.** Expected: every cell blank, including the totals. This is covered by a Task 2 test.
- **A refresh after the nucleus is renamed.** `refreshCounts` already uses `row.nucleus`, so no new risk. The reviewer checks that the group refresh shares that path.

---

### Task 1: Read `activityTotals` from cluster-notebook

**Files:**
- Modify:
  - `web/src/lib/clusterNotebook.ts`: add the types and selection next to `NAMED_COUNTS_SELECTION`, and add the field to `NUCLEUS_FIELDS_SELECTION`, `NucleusFields`, and `getNucleusCounts`.
  - `web/src/lib/data.ts` (around line 205), `web/src/types.ts` (`NucleusDetail`).
  - `web/src/app/api/nucleus/counts/route.ts`: comment only; it passes through whatever `getNucleusCounts` returns.
  - `docs/cluster-notebook-api-requirements.md`: a new "Activity totals… agreed 2026-11-27" section.
- Test: `web/src/lib/clusterNotebook.test.ts`, `web/src/lib/data.test.ts`

**Interfaces:**
- Produces:
  - `export interface ActivityCounts { number: number | null; participants: number | null; participantsFof: number | null }`
  - `export interface ActivityTotals { nucleiCounted: number; devotionalGathering: ActivityCounts; childrensClasses: ActivityCounts; juniorYouthGroups: ActivityCounts; studyCircles: ActivityCounts }`
  - `ACTIVITY_TOTALS_SELECTION`. Define it above `SRP_SELECTION` to avoid a TDZ error, as was needed for `NAMED_COUNTS_SELECTION`.
  - `getNucleusCounts(name)` returns `{ memberCount; namedCounts; activityTotals: ActivityTotals } | null`
  - `NucleusDetail.activityTotals: ActivityTotals | null`

- [ ] **Step 1: Write the failing tests.**
  - In `clusterNotebook.test.ts`, extend the existing `getNucleusCounts` test. The query string contains `activityTotals { nucleiCounted devotionalGathering { number participants participantsFof }` (and the other three), and the returned object includes the mocked `activityTotals` unchanged, nulls kept as null.
  - In `data.test.ts`, extend the namedCounts passthrough test: `getRowData`'s detail has `activityTotals` equal to the mocked value, and `null` when the field is absent.
- [ ] **Step 2: Run `cd web && npx vitest run src/lib/clusterNotebook.test.ts src/lib/data.test.ts`.** Expected: the new assertions FAIL.
- [ ] **Step 3: Implement the above.**
- [ ] **Step 4: Re-run Step 2's command, then `npx tsc --noEmit`.** Expected: PASS, exit 0.
- [ ] **Step 5: Validate the documents against local cluster-notebook** with `python3 <scratchpad>/validate.py`. Expected: all OK apart from the known "unchanged" false positive. This needs cluster-notebook's build on :8123.

### Task 2: Pure helpers in `lib/activityTotals.ts`

**Files:**
- Create: `web/src/lib/activityTotals.ts`, `web/src/lib/activityTotals.test.ts`

**Interfaces:**
- Consumes: `ActivityCounts`, `ActivityTotals` (Task 1).
- Produces:
  - `export function sumCounts(list: ActivityCounts[]): ActivityCounts`. This is a field-wise sum of non-null values; a field is null when every input is null.
  - `export function groupLabel(nucleiCounted: number | undefined): string | null`. It returns `"With N under it"` for N = nucleiCounted − 1 ≥ 1, and null otherwise (including undefined).
  - `export function countText(n: number | null): string`. It returns `''` for null and `String(n)` otherwise.

- [ ] **Step 1: Write the failing tests.**
  - `sumCounts([{1,10,2},{null,5,null}])` → `{1,15,2}`
  - `sumCounts([{null,null,null},{null,null,null}])` → all null
  - `sumCounts([])` → all null
  - zeros kept: `sumCounts([{0,0,0}])` → `{0,0,0}`
  - `groupLabel(1)` → null, `groupLabel(undefined)` → null, `groupLabel(2)` → `"With 1 under it"`, `groupLabel(5)` → `"With 4 under it"`
  - `countText(null)` → `''`, `countText(0)` → `'0'`
- [ ] **Step 2: Run `npx vitest run src/lib/activityTotals.test.ts`.** Expected: FAIL (the module doesn't exist).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run Step 2's command.** Expected: PASS.

### Task 3: The switch and group view on the card

**Files:**
- Modify: `web/src/components/DetailView.tsx`. The changes are the counts state (~line 599), `refreshCounts`, `commitActField` (~line 849), and the activities card (~line 1366).

**Interfaces:**
- Consumes: `detail.activityTotals`, the `/api/nucleus/counts` response's `activityTotals`, and `sumCounts` / `groupLabel` / `countText`.

- [ ] **Step 1: Add state and refresh.**
  - Add `const [totals, setTotals] = useState<ActivityTotals | null>(detail.activityTotals)`.
  - `refreshCounts` also calls `setTotals(data.activityTotals ?? null)`.
  - `commitActField` calls `refreshCounts()` after `result.ok`.
- [ ] **Step 2: Add the switch.**
  - Add `const [groupView, setGroupView] = card('activitiesGroup', false)`, so it persists with the page state.
  - `const label = groupLabel(totals?.nucleiCounted)`.
  - When `label` is non-null, show a two-option segmented control at the top of the card body: "This nucleus" and `label`.
  - When `label` is null, `groupView` is ignored and the card renders exactly as today.
- [ ] **Step 3: Add the group view.**
  - It is the same table structure, with read-only cells (`className="plain"`, like `TotalRow`) showing `countText` of each figure.
  - The four rows map: ccs ← `childrensClasses`, jygs ← `juniorYouthGroups`, scs ← `studyCircles`, devotionals ← `devotionalGathering`.
  - The two total rows use `sumCounts` over the same three and four entries.
  - The "Amber rows are manually overridden" note is replaced by "Totals for this nucleus and the N nuclei under it. Read-only."
- [ ] **Step 4: Add the own-figures note.**
  - It shows in "This nucleus" view only when `label` is non-null. It goes beneath the sync note, in the same style: "These are this nucleus's own numbers. Don't enter the group's totals here — they're under “With N under it”."
- [ ] **Step 5: Run `npx tsc --noEmit && npm test && npx eslint src/components/DetailView.tsx src/lib/activityTotals.ts`.** Expected: exit 0 (apart from the 2 known `no-explicit-any` errors in data.ts, which are not in these files).
- [ ] **Step 6: Check in the browser** against local cluster-notebook, on "Chapelboro - T107.08BG2" (it has children) and on a nucleus without children.
  - The switch shows only on the first.
  - The group values match cluster-notebook's.
  - Editing a cell in "This nucleus" updates the group view without a reload.
  - The switch position survives a reload.
- [ ] **Step 7: Commit when the owner asks.** Use `feat: group activity totals on the activities card`.
