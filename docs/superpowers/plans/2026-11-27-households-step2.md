# Households Step 2 (Editing Families) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, a user with `canWrite` can start a family, add or move someone into a family, remove a member, and change the contact, all from the Families card. Edited families show their SRP state.

**Architecture:**
- clusterNotebook.ts gains the four household mutations and `srpState`, and clusterNotebookError.ts maps the new codes.
- One `POST /api/families` route performs the actions.
- Pure helpers in `lib/households.ts` cover picker candidates and badges.
- `FamiliesList.tsx` gets the member actions, a picker sheet, badges and error lines. Everything re-reads after each change.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-households-step2-design.md`

## Global Constraints

- **Backend names (built on a cluster-notebook branch, owner-confirmed 2026-11-27; adjust only Task 1 if they change):**
  - `createHousehold(contactId: String!, memberIds: [String!]): Household!`
  - `addHouseholdMember(householdId: String!, individualId: String!, fromHouseholdId: String): Household!`
  - `removeHouseholdMember(householdId: String!, individualId: String!): Household`. It may be null when the household dissolves.
  - `setHouseholdContact(householdId: String!, individualId: String!): Household!`
  - `Household.srpState: IN_SRP | WAITING | LOCAL_ONLY`
- **Codes, mapped status and copy, verbatim:**
  - `CONTACT_MUST_STAY` 409: `Make someone else the contact first.`
  - `ALREADY_IN_HOUSEHOLD` 409 and `NOT_IN_HOUSEHOLD` 409: `That person's family changed. The list has been refreshed; try again.`
  - `NOT_A_MEMBER` 409: `That person isn't in this family any more. The list has been refreshed.`
  - `DIFFERENT_PLACE` 409: `That person lives somewhere else. Move them here first (People card).`
  - `HOUSEHOLD_NOT_FOUND` 409 and `INDIVIDUAL_NOT_FOUND` 409: `That family or person no longer exists. The list has been refreshed.` (codes added by cluster-notebook 2026-11-27)
  - `FORBIDDEN` is already mapped to 403.
- **Badges:** `WAITING` shows `Waiting for SRP`, `LOCAL_ONLY` shows `Only in Nucleus Assistant`, and `IN_SRP` shows nothing.
- **Copy:**
  - `Make contact`
  - `Remove`
  - The contact's disabled Remove note: `To remove <name>, make someone else the contact first.`
  - `Add someone…`
  - `Start a family with…`
  - The move confirm: `Move <name> from the <family title>?` (the family title already ends in "household").
- **Phone first:** targets are at least 44px, with no drag. A sheet overlaying a card uses `createPortal`, because cards have `overflow: hidden`.
- **Editing is gated** on the nucleus's `canWrite`. The server's FORBIDDEN is still shown.
- **After every change** (success or a 409), the Families list re-reads, and the People card's data refreshes.
- No real names in tests. Record the confirmed API in `docs/cluster-notebook-api-requirements.md`. Commit only when asked.

## Review Focus

- **The contact of a multi-person family.** Expected: Remove is disabled with the note. If it's the only member, Remove is allowed and dissolves the family. A Task 3 test covers the gate helper.
- **Picking, in "Add someone…", a person who is the contact of another multi-person family.** Expected: the confirm appears. The server replies CONTACT_MUST_STAY, the copy shows, and the list re-reads. The Task 2 route passes the code through; the error mapping is tested in Task 1.
- **Two editors racing.** Expected: a 409 shows its copy and the list re-reads, without a crash. Tested via the error mapping (Task 1) and the 409 handling in Task 4.
- **A caller without `canWrite`.** Expected: no edit controls at all. Covered by Task 4's gating, which is checked in the browser.
- **Removing the last member (a dissolved household, null return).** Expected: the person reappears as a one-person entry after the re-read. The Task 1 test covers the null return.

---

### Task 1: Mutations, `srpState`, error codes

**Files:**
- Modify:
  - `web/src/lib/clusterNotebook.ts`: `srpState` goes in `HOUSEHOLD_FIELDS` and on `Household`, plus four functions.
  - `web/src/lib/clusterNotebookError.ts`: the `CODED_ERRORS` entries.
  - `docs/cluster-notebook-api-requirements.md`
- Test: `clusterNotebook.test.ts`, `clusterNotebookError.test.ts`

**Interfaces:**
- Produces:
  - `export type HouseholdSrpState = 'IN_SRP' | 'WAITING' | 'LOCAL_ONLY'`
  - `Household.srpState: HouseholdSrpState`
  - `createHousehold(contactId: string, memberIds: string[]): Promise<Household>`
  - `addHouseholdMember(householdId: string, individualId: string, fromHouseholdId?: string): Promise<Household>`, which omits the variable when undefined.
  - `removeHouseholdMember(householdId: string, individualId: string): Promise<Household | null>`
  - `setHouseholdContact(householdId: string, individualId: string): Promise<Household>`

- [ ] **Step 1: Write the failing tests.**
  - Each mutation sends its name and variables, and selects `HOUSEHOLD_FIELDS` including `srpState`.
  - `addHouseholdMember` without `from` omits `fromHouseholdId` from the variables.
  - `removeHouseholdMember` returns null when the response is null.
  - Each new code maps to its status and verbatim copy.
- [ ] **Step 2: Run `cd web && npx vitest run src/lib/clusterNotebook.test.ts src/lib/clusterNotebookError.test.ts`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the tests, `npx tsc --noEmit`, and the validator against :8123.** Expected: PASS, exit 0, and only the "unchanged" false positive. This needs cluster-notebook's step-2 API locally.

### Task 2: `POST /api/families`

**Files:**
- Modify: `web/src/app/api/families/route.ts`, adding `POST` next to the existing `GET`.

**Interfaces:**
- Consumes: the Task 1 functions.
- Produces: `POST /api/families` with a JSON body:
  - `{ nucleus, action: 'create', contactId, memberIds }`
  - `{ nucleus, action: 'add', householdId, individualId, fromHouseholdId? }`
  - `{ nucleus, action: 'remove', householdId, individualId }`
  - `{ nucleus, action: 'contact', householdId, individualId }`
  - It returns `{ household }`, which may be null for a remove.
  - Errors:
    - 401 when signed out;
    - 400 for a malformed body or unknown action;
    - 403 when `canWrite` is false;
    - everything else through `clusterNotebookErrorResponse`, with the permission check inside the `try`.

- [ ] **Step 1: Write the handler.**
- [ ] **Step 2: Run `npx tsc --noEmit && npx eslint src/app/api/families/route.ts`.** Expected: exit 0.

### Task 3: Pure helpers

**Files:**
- Modify: `web/src/lib/households.ts`, `web/src/lib/households.test.ts`

**Interfaces:**
- Consumes: `Household.srpState` (Task 1).
- Produces:
  - `FamilyEntry` gains `householdId: string | null` (null for a one-person entry) and `srpState: HouseholdSrpState | null` (null for a one-person entry).
  - `export function srpBadge(state: HouseholdSrpState | null): string | null` returns the badge copy, or null for IN_SRP or null.
  - `export function canRemoveMember(entry: FamilyEntry, memberId: string): boolean` is false only for the contact of an entry with `size > 1`.
  - `export type Candidate = { id: string; name: string; familyTitle: string | null; fromHouseholdId: string | null; familyName: string; firstName: string; address: string | null }`
  - `export function addCandidates(entries: FamilyEntry[], targetKey: string): Candidate[]`
    - It lists every visible member of every other entry, excluding the target's members.
    - `familyTitle` and `fromHouseholdId` are set for people in a household, and null for one-person entries.
    - It is sorted by family name, then first name.
  - `export function startCandidates(entries: FamilyEntry[], personKey: string): Candidate[]` covers only people in one-person entries, excluding `personKey`'s person. This is the ruling recorded in the spec's "Left to the builder".

- [ ] **Step 1: Write the failing tests.**
  - `srpBadge` on all four inputs.
  - `canRemoveMember`: the contact of a size-3 entry → false; a non-contact → true; the contact of a size-1 household → true.
  - `addCandidates` excludes the target's members, marks a household member with `fromHouseholdId` and `familyTitle`, and includes solo people with null.
  - `startCandidates` excludes household members and self.
  - `familyEntries` sets `householdId` and `srpState` for households and null for solo entries.
- [ ] **Step 2: Run `npx vitest run src/lib/households.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run.** Expected: PASS.

### Task 4: Editing on the Families card

**Files:**
- Create: `web/src/components/FamilyPicker.tsx`, a bottom sheet via `createPortal`.
- Modify:
  - `web/src/components/FamiliesList.tsx`
  - `web/src/components/DetailView.tsx`: pass `canEdit={permissions.canWrite}` and an `onChanged` that bumps the same counter the People card refresh uses.

**Interfaces:**
- Consumes: `POST /api/families` (Task 2); `srpBadge`, `canRemoveMember`, `addCandidates`, `startCandidates` (Task 3); and the existing `filterFamilies`-style search and `sortFamilies` order, applied to candidates by name and address.
- Produces:
  - `FamiliesList` props: `{ nucleus: string; refreshKey: number; canEdit: boolean; onChanged: () => void }`.
  - `FamilyPicker` props: `{ title: string; candidates: Candidate[]; onPick: (c: Candidate) => void; onClose: () => void }`.
    - It has a search box, Family name / Address sort pills, and rows of at least 44px. Each row shows the name and either `in the <familyTitle>` or the address.

- [ ] **Step 1: Add the row badge.** When `srpBadge(f.srpState)` is non-null, show it in the row header as a small amber chip.
- [ ] **Step 2: Add the member actions.** When `canEdit` and the entry is a household, each member gets `Make contact` (non-contacts only) and `Remove`. Remove is disabled with the note when `!canRemoveMember`. Below the members goes an `Add someone…` button.
- [ ] **Step 3: Add the one-person entry action.** When `canEdit`, a one-person entry gets `Start a family with…`, which opens the picker with `startCandidates`.
- [ ] **Step 4: Wire the picker.**
  - Picking for "Add someone…" with `fromHouseholdId` first asks `window.confirm("Move <name> from the <familyTitle>?")`.
  - Each action POSTs and, while saving, disables that family's buttons.
  - On success or a 409, it re-reads the list (the same fetch as the refresh) and calls `onChanged()`.
  - On failure, it shows `data.error` in red under that family.
- [ ] **Step 5: Run `npx tsc --noEmit && npm test && npx eslint` on the changed files.** Expected: exit 0.
- [ ] **Step 6: Check in the browser** against local cluster-notebook, on Whispering Hills.
  - Start a family.
  - Add someone.
  - Move someone between families.
  - Make contact.
  - Try removing the contact, then remove the contact after changing it.
  - Remove the last member.
  - Check the badges.
  - Check that a reader without `canWrite` sees no controls.
