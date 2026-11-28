# Household SRP Problems Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** When SRP doesn't take a family change, the Families card says why, and lets an editor send it again or take SRP's version.

**Backend (cluster-notebook PR #67, writes switched off until srp-client's canary passes):**
- `Household.srpProblem: String`, null unless SRP didn't take the change. While set, `srpState` stays WAITING and nothing resends.
- `retryHouseholdSrp(householdId: String!): Household!` sends ours again; over a conflict, ours wins.
- `takeSrpHousehold(householdId: String!): Household!` drops the changes made here; the next read makes it match SRP.
- Both give FORBIDDEN unless the caller may move the household's contact, and HOUSEHOLD_NOT_FOUND otherwise.
- Any edit clears the problem and resends.

**Design (controller's calls, owner-authorized autonomy 2026-11-27):**
- The problem line shows on the family row without expanding, in red 12px, under the address.
- Actions show inside the expanded family when `canEdit`:
  - `Send again` (`Keep ours` when the problem is SRP_CONFLICT);
  - `Use SRP's version`, which first confirms `Drop the changes made here? The family will match SRP after the next read.`
- The badge stays as it is (WAITING shows `Not in SRP yet`).
- After either action the list re-reads, as with other edits (onChanged).

## Global Constraints

- **Copy (verbatim), produced by `srpProblemText(problem: string | null): string | null`:**
  - `SRP_CONFLICT`: `Changed in SRP since we last looked.`
  - `OTHER_HOUSEHOLD_CONTACT`: `SRP refused: someone here is the contact of another SRP household.`
  - `PLACE_MISMATCH`: `SRP refused: the members aren't all at the same place in SRP.`
  - `OUTSIDE_WRITABLE_SCOPE`: `SRP refused: we aren't allowed to change this family in SRP.`
  - `MEMBER_NOT_IN_SRP`: `SRP refused: someone here isn't in SRP yet.`
  - `STATE_CHANGED` and `NOT_CONVERGED`: `Sending to SRP didn't finish. Try again.`
  - any other non-null code: `SRP couldn't save this family (code <code>). Try again later.`
  - null: null.
- Phone first: targets are at least 44px. ESLint enforces `react-hooks/set-state-in-effect`. No real names in tests.
- Record the API in `docs/cluster-notebook-api-requirements.md` with a dated "Confirmed with cluster-notebook 2026-11-27 (PR #67)" line.

---

### Task 1: Data layer and helpers

**Files:**
- `web/src/lib/clusterNotebook.ts`:
  - add `srpProblem` to `HOUSEHOLD_FIELDS`, and `srpProblem: string | null` to `Household`;
  - add `retryHouseholdSrp(householdId): Promise<Household>` and `takeSrpHousehold(householdId): Promise<Household>`.
- `web/src/lib/familyActions.ts`: `parseAction` gains `{ action: 'retry', householdId }` and `{ action: 'take', householdId }`.
- `web/src/app/api/families/route.ts`: dispatch the two new actions.
- `web/src/lib/households.ts`:
  - `FamilyEntry` gains `srpProblem: string | null`, null for one-person entries;
  - add `srpProblemText`.
- The docs, plus tests in `clusterNotebook.test.ts`, `familyActions.test.ts` and `households.test.ts`.

**Tests:**
- Each mutation's query and variables, selecting `srpProblem`.
- `parseAction` accepts retry and take, and rejects an empty `householdId`.
- `srpProblemText` for every code above, plus an unknown code (`O026`) and null.
- `familyEntries` carries `srpProblem`.

**Verify:** `npx tsc --noEmit` and `npm test` exit 0, and the validator against :8123 shows only the known "unchanged" false positive.

### Task 2: Families card UI

**Files:** `web/src/components/FamiliesList.tsx`.

**Changes:** the problem line on the row; when expanded with `canEdit` and `srpProblem` non-null, the `Send again` / `Keep ours` button and the `Use SRP's version` button (with the confirm). The buttons use the existing `run(...)` busy, onChanged and error handling.

**Verify:** `npx tsc --noEmit`, `npm test` and eslint on the file all exit 0.
