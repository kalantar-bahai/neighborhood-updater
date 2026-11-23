# Hiding people Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors can hide a person at a nucleus from the People card, review hidden people under a Hidden filter, and unhide them.

**Architecture:** cluster-notebook stores the hide and filters its own lists. The card reads `people(includeHidden: true)` once and splits hidden rows out in `lib/people.ts`. A new `/api/hide` route calls hide/unhide. Role writes from the card become hidden-aware.

**Tech Stack:** Next.js 16, React 19, Clerk, Vitest (see `web/AGENTS.md`: read `node_modules/next/dist/docs/` before Next code).

**Spec:** `docs/superpowers/specs/2026-11-23-hide-people-design.md`

**Start only after cluster-notebook deploys hide-person.** Querying `hidden`, `hide` or `includeHidden` before then breaks the People card.

## Global Constraints

- Copy, verbatim: button "Hide…", confirm title "Hide {name} from {nucleus}?", line "Stays in SRP; a CSO can review and archive.", roles line "{name} is {Role icon, …} here; hiding keeps the role." ("roles" when more than one), "Reason (optional)", buttons "Cancel" / "Hide"; filter label "Hidden"; tag "Hidden"; note "Hidden by {name} on {YYYY-MM-DD}: {reason}"; "Unhide"; search suffix "(hidden here)".
- Total line with Hidden chosen: "3 hidden", "1 of 3 hidden".
- `hide` (who/when/why) is shown only when non-null; cluster-notebook already withholds it from non-editors.
- Every route that calls cluster-notebook catches through `clusterNotebookErrorResponse`. `NOT_AT_NUCLEUS` → 409 "This person isn't connected to this nucleus.".
- Made-up names only in tests and docs. Public repo.
- Null means "not recorded"; send only what changed.

## Review Focus

1. Unticking a role on a hidden person must actually remove it (the write is `includesHidden: true`, built from `includeHidden: true`).
2. The Overview's WorkerListModal saves must keep their defaults (never `includesHidden: true`), so hidden holders survive them.
3. A hidden person must not appear under any filter but Hidden, nor in the total line's main count.
4. Picking a hidden person in "+ Add" and saving unhides before the move/role writes, and a failed unhide stops the save with an error.
5. Readers (no `canWrite`) get no Hide/Unhide buttons and no hide note even if `hide` were somehow non-null.

---

### Task 1: cluster-notebook client

**Files:** Modify `web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebookError.ts`; Test `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces: `PersonHide { hiddenAt: string; hiddenBy: PersonSummary | null; reason: string | null }`; `NucleusPerson.hidden: boolean`, `NucleusPerson.hide: PersonHide | null`; `getNucleusPeople(nucleusName)` now selects `people(includeHidden: true) { … hidden hide { hiddenAt reason hiddenBy { PERSON_NAME_SELECTION } } }`; `getNucleusWorkers(nucleusName, role, includeHidden = false)`; `updateNucleusWorkers(nucleusName, role, personIds, includesHidden = false)`; `hideIndividual(individualId, nucleusName, reason: string | null): Promise<NucleusPerson | null>`; `unhideIndividual(individualId, nucleusName): Promise<NucleusPerson | null>` (both select the same fields as `getNucleusPeople`).
- `getNucleusPeopleFlags` is unchanged (default excludes hidden).

- [ ] Tests: query text contains `people(includeHidden: true)` and the `hide { … }` selection; `getNucleusWorkers('A','promoter', true)` sends `includeHidden: true` and the default sends `false`; `updateNucleusWorkers` sends `includesHidden` (default `false`); hide sends `{ individualId, nucleusName, reason }` and returns the person or null; unhide likewise.
- [ ] Run `npx vitest run src/lib/clusterNotebook.test.ts`: FAIL.
- [ ] Implement; add `NOT_AT_NUCLEUS: { status: 409, message: "This person isn't connected to this nucleus." }` to `CODED_ERRORS` with a dated "Confirmed with cluster-notebook 2026-11-23" comment.
- [ ] Run: PASS. `npx tsc --noEmit`: fix fixtures (`hidden: false, hide: null`).
- [ ] Commit `feat: cluster-notebook client for hiding people`.

### Task 2: pure decisions

**Files:** Modify `web/src/lib/people.ts`; Test `web/src/lib/people.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `PersonRow.hidden: boolean`, `PersonRow.hide: PersonHide | null` (from `toPersonRow`); `peopleFilters` ends with `{ key: 'hidden', label: 'Hidden' }`; `filterPeople` keeps only hidden rows for `'hidden'` and only non-hidden rows for every other key; `peopleCountLabel(shown, total, hidden = false)`; `hideNote(h: PersonHide): string`; `hideRolesLine(name: string, roles: string[]): string | null`.

- [ ] Tests: `filterPeople(rows, 'all', '')` drops hidden; `'hidden'` keeps only hidden, combined with age and search; `peopleFilters(...).at(-1)` is `{ key: 'hidden', label: 'Hidden' }`; `peopleCountLabel(3, 3, true)` → "3 hidden", `(1, 3, true)` → "1 of 3 hidden"; `hideNote` → "Hidden by Ben Okafor on 2026-11-23: moved away", without reason "Hidden by Ben Okafor on 2026-11-23", without hider "Hidden on 2026-11-23" (date is the first 10 characters of `hiddenAt`); `hideRolesLine('Ana Lopez', ['promoter'])` → "Ana Lopez is Promoting 📣 here; hiding keeps the role.", two roles → "… is Promoting 📣, Contact ★ here; hiding keeps the roles.", none → null (roles in `sortRoles` order, label then icon when there is one).
- [ ] Run: FAIL. Implement. Run `npx vitest run`: PASS.
- [ ] Commit `feat: hidden people in the People card's decisions`.

### Task 3: hide route

**Files:** Create `web/src/app/api/hide/route.ts`

**Interfaces:**
- Produces: `POST /api/hide` with JSON `{ nucleus, individualId, hidden: boolean, reason?: string }` → `{ person: PersonRow }`. 401 unauthenticated; 400 missing nucleus or person; 403 without `canWrite`; 404 when cluster-notebook returns null; errors through `clusterNotebookErrorResponse`. A blank reason is sent as null.

- [ ] Write it in the shape of `api/move/route.ts`. `npx tsc --noEmit` and `npx eslint` on it: clean.
- [ ] Commit `feat: hide route`.

### Task 4: role writes and the People route

**Files:** Modify `web/src/app/api/workers/route.ts`, `web/src/components/PeopleCard.tsx` (`writeRole` only)

- [ ] `/api/workers` GET accepts `includeHidden=1`; POST accepts `includesHidden: true`; both pass through. WorkerListModal and DetailView are unchanged.
- [ ] `writeRole` reads with `&includeHidden=1` and posts `includesHidden: true`. Comment why (spec, "Calls made by the builder").
- [ ] `npx tsc --noEmit`, `npx vitest run`: clean. Commit `fix: People card role writes see hidden holders`.

### Task 5: the card

**Files:** Modify `web/src/components/PeopleCard.tsx`

**Interfaces:** Consumes Tasks 2 to 4.

- [ ] Rows: a grey "Hidden" tag (the existing `TAG` style) after the marks when `r.hidden`. Total line uses `peopleCountLabel(shown, total, activeFilter === 'hidden')`, where total counts hidden rows for Hidden and non-hidden rows otherwise.
- [ ] Panel, editors (`permissions.canWrite`): under the editor, "Hide…" (not hidden) opens the inline confirm from the spec (title, "Stays in SRP; a CSO can review and archive.", `hideRolesLine`, reason input, Cancel / Hide); Hide posts `/api/hide` with `hidden: true`, then closes and re-reads. A hidden person instead shows `hideNote(r.hide)` (only when `r.hide` is non-null) and "Unhide", which posts `hidden: false` and re-reads. Errors show in the panel as other save errors do.
- [ ] Readers: no Hide/Unhide, no note.
- [ ] "+ Add": results whose id is a hidden row get " (hidden here)" after the name. Picking an existing hidden row sets the main filter to Hidden (not All) so its row shows. On Save for a hidden person picked through "+ Add", post `/api/hide` `hidden: false` first; on failure show the error and write nothing.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npx eslint src/components/PeopleCard.tsx`: clean. Browser check against cluster-notebook's branch (or the owner, in production after deploy).
- [ ] Commit `feat: hide and unhide people from the People card`.

### Task 6: docs

- [ ] Add "Hiding people, confirmed with cluster-notebook 2026-11-23" to `docs/cluster-notebook-api-requirements.md` with the SDL and behaviour from the spec. Commit `docs: record the hide-person contract`.
