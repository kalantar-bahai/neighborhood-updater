# Follow-ups Implementation Plan (households and activity totals)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the deferred minors from the households step 1/2 and activity-totals reviews, at the owner's request ("let's get the missing items implemented", 2026-11-27).

**Specs:**
- `docs/superpowers/specs/2026-11-27-households-step1-design.md`
- `docs/superpowers/specs/2026-11-27-households-step2-design.md`
- `docs/superpowers/specs/2026-11-27-activity-rollup-design.md`

**Branch:** `fix/family-error-names`, which already holds the names-in-error-copy commit.

## Global Constraints

- Null means "not recorded"; never coerce it to 0.
- Phone first: targets are at least 44px. ESLint enforces `react-hooks/set-state-in-effect`.
- No real names in tests. Commit only on this branch, with the session trailers.

## Review Focus

- **A whitespace-only address.** Expected: it shows "No address in SRP" and sorts last (Task 1).
- **Addresses like "12B Oak St" and "12-14 Oak St".** Expected: they sort by street "oak st", then number 12 (Task 1).
- **A nucleus with no people at all.** Expected: an empty-state line instead of a bare search box (Task 2).

---

### Task 1: households.ts edge cases and tests

**Files:** `web/src/lib/households.ts` and `households.test.ts`.

**Changes:**
- **Blank addresses become null:** `familyEntries` treats a blank or whitespace-only address as null, for households and solo entries alike.
- **More address forms parse:** `addressKey` accepts a leading number with an optional letter suffix and an optional range: `^\s*(\d+)[A-Za-z]?(?:\s*-\s*\d+[A-Za-z]?)?\s+(.*)$`. The number is the first integer.
- **Street comparison** uses the same `localeCompare` options (`sensitivity: 'base'`) as the name comparator.
- **Rename:** the `sortBy` generic's `byName` parameter becomes `compareByName`, so it no longer shadows the module-level `byName`.
- **New `matchesCandidate(c: Candidate, query: string): boolean`:** a case-insensitive, trimmed match on name or address; a blank query matches everything.

**Tests to add:**
- a whitespace address becomes null on both entry kinds;
- `'12B Oak St'` and `'12-14 Oak St'` order after `'10 Oak St'` and before `'14 Oak St'`;
- a hidden person (`hidden: true`) who is a household member is still listed inside that household's entry;
- a search for a name that appears only among unreadable members (not in `members`) doesn't match;
- a size-1 household whose contact is unreadable (`contact: null`, `members: []`) gets the title `Household`;
- `addCandidates` and `startCandidates` with a size-1 household and with a household that has hidden members;
- `matchesCandidate` on a name match, an address match, and a blank query.

**Verify:** `npx vitest run src/lib/households.test.ts`, then `npm test` and `npx tsc --noEmit`. All must exit 0.

### Task 2: UI polish

**Files:**
- `web/src/components/FamilyPicker.tsx`
- `web/src/components/FamiliesList.tsx`
- `web/src/components/HouseholdMoveNote.tsx`
- `web/src/components/admin/HiddenCard.tsx`

**Changes:**
- **Picker search:** FamilyPicker's search uses `matchesCandidate` (Task 1), so typing an address finds people.
- **Dimmed disabled buttons:** FamiliesList's small action buttons look disabled when disabled (grey text #a0aec0, `cursor: default`), including the contact's Remove.
- **Empty state:** when the families list is empty and there's no search query, FamiliesList shows `No people in this nucleus yet.` in grey 13px.
- **One move computation:** HiddenCard's `moveView` computes `householdMove(...)` once, as a local `hm`, and drops the duplicate IIFE.
- **Stable list keys:** HouseholdMoveNote keys its list items by `${i}-${name}`, not `i` alone.

**Verify:** `npx tsc --noEmit`, `npm test`, and eslint on the changed files. All must exit 0.

### Task 3: Testable route logic and the counts refresh race

**Files:**
- Create: `web/src/lib/familyActions.ts` and `familyActions.test.ts`.
- Modify:
  - `web/src/app/api/families/route.ts`: move `parseAction` and its types into `familyActions.ts` and import it.
  - `web/src/app/api/individuals/route.ts`: move its per-individual mapping into a pure, exported `toFoundIndividual(ind)` in an appropriate lib file, and import it.
  - `web/src/components/DetailView.tsx`: in `refreshCounts`, re-check the sequence number after `await res.json()`, before setting state.

**Tests to add:**
- `parseAction` accepts each of the four valid shapes, including `personName` handling: trimmed, and ignored when empty or over 200 characters.
- `parseAction` rejects:
  - an unknown action;
  - an empty id;
  - an empty `memberIds`;
  - a non-string `fromHouseholdId`;
  - a non-object body.
- `toFoundIndividual` passes `household` through, with null when it's absent.

**Verify:** `npx tsc --noEmit`, `npm test`, and eslint on the changed files. All must exit 0.
