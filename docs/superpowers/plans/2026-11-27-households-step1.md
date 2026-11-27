# Households Step 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The Families card lists the nucleus's households, plus its household-less people as one-person entries. Each entry can be searched and expanded.
- Every move warns who else in the household moves too.

**Architecture:**
- cluster-notebook supplies `Nucleus.namedHouseholds` and `household` on each person (`PersonSummary.household`).
- A pure, tested `lib/households.ts` builds the card's entries and the move warning.
- A new `/api/families` route serves the card.
- PeopleCard's and HiddenCard's move confirmations show the warning.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-households-step1-design.md`

## Global Constraints

- **Backend names, from cluster-notebook 2026-11-27** (built on their branch, not yet merged):
  ```
  Household { id: String!, size: Int!, contact: PersonSummary (null if unreadable), members: [PersonSummary!]!, address: String }
  PersonSummary.household: Household   (null = in none)
  Nucleus.namedHouseholds: [Household!]!   (NOT `households`, which is the hand-entered Int estimate)
  ```
  - `namedHouseholds` holds real households only, each with at least one of the nucleus's non-hidden people, ordered by the contact's family and first name.
  - `address` is filled only on `namedHouseholds`, under the personDetails rule. It is always null on `PersonSummary.household`.
  - The data stays empty until srp-client ships `household_contact_id` and production reads run.
- `members` holds only the people the caller may read, contact first. `size` counts everyone. Hidden count = `size - members.length`.
- **Copy, verbatim:**
  - `Find a family by anyone in it`
  - `No address in SRP`
  - `1 person` / `N people`
  - `and N other(s) you can't see`
  - `Move all N people`
  - `Move only <name>`, disabled, with the note `They would first leave the household. That comes with editing families.`
- ★ marks the contact. The SRP dot appears per member, as on the People card.
- Step 1 adds no editing controls, no placeholder buttons, and no building/street arranging.
- Moves keep sending `withHousehold: true`; that's unchanged.
- No real names in tests or docs (public repo). Record the confirmed fields in `docs/cluster-notebook-api-requirements.md`, with a dated comment.
- Commit only when the owner asks.

## Review Focus

- **The caller can see none of a household's other members** (`members` = [self], `size` 4). Expected: the warning still shows `and 3 others you can't see` and `Move all 4 people`. Covered by a Task 2 test.
- **A person who is a member of the nucleus's household but hidden on this nucleus.** Expected: the household still lists them, because the backend scopes households. A household-less hidden person gets no entry. Covered by a Task 2 test.
- **A null contact** (unreadable, or the backend sends null). Expected: the title falls back to the first member's family name, and then to `Household`. Covered by a Task 2 test.
- **Search on a household whose matching member is unreadable.** Expected: no match, because only visible names are searched. Covered by a Task 2 test.
- **The household-of-one case** (`size` 1). Expected: the move confirmation is unchanged from today, with no warning. Covered by a Task 2 test.

---

### Task 1: Read households from cluster-notebook

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`
  - Add the types and a selection near `PERSON_SUMMARY_SELECTION`.
  - Add `household { … }` to `NUCLEUS_PERSON_SELECTION`'s `individual` and to `getHiddenPeople`'s individual selection.
  - Add `getNucleusHouseholds`.
- Modify: `docs/cluster-notebook-api-requirements.md` (a new "Households, step 1" section).
- Test: `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces:
  - `export type HouseholdMember = PersonName & { inSrp: boolean }`
  - `export interface Household { id: string; contact: HouseholdMember | null; members: HouseholdMember[]; size: number; address: string | null }`
  - `HOUSEHOLD_FIELDS = 'id size address contact { <PERSON_NAME_SELECTION> inSrp } members { <PERSON_NAME_SELECTION> inSrp }'`, used as `namedHouseholds { … }` and as `household { … }`.
  - On a person, only `id size contact members` are used; `address` is always null there.
  - `NucleusPerson.individual.household?: Household | null` and `HiddenPerson.individual.household?: Household | null`
  - `getNucleusHouseholds(nucleusName: string): Promise<Household[] | null>`, which returns null when the nucleus isn't found.

- [ ] **Step 1: Write the failing tests.**
  - `getNucleusHouseholds` sends a query containing `nucleus(name: $name) { namedHouseholds { id size address contact {` with `members {`, returns the households unchanged, and returns null for `{ nucleus: null }`.
  - `getNucleusPeople`'s query contains `household { id size address`.
  - `getHiddenPeople`'s query contains `household { id size address`.
- [ ] **Step 2: Run `cd web && npx vitest run src/lib/clusterNotebook.test.ts`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Use the `PersonSummary`-like member selection without `place`, which the card doesn't need.
- [ ] **Step 4: Run the tests and `npx tsc --noEmit`.** Expected: PASS, exit 0.
- [ ] **Step 5: Validate against :8123** with `python3 <scratchpad>/validate.py src/lib/clusterNotebook.ts`. Expected: only the known "unchanged" false positive. This needs cluster-notebook's households API locally.

### Task 2: `lib/households.ts`, the card entries and the move warning

**Files:**
- Create: `web/src/lib/households.ts`, `web/src/lib/households.test.ts`

**Interfaces:**
- Consumes: `Household`, `HouseholdMember`, `NucleusPerson` (Task 1), and `individualDisplayName` from `lib/personName.ts`.
- Produces:
  - `export type FamilyMember = { id: string; name: string; inSrp: boolean; isContact: boolean }`
  - `export type FamilyEntry = { key: string; title: string; address: string | null; size: number; members: FamilyMember[]; hidden: number }`
  - `export function familyEntries(households: Household[], people: NucleusPerson[]): FamilyEntry[]`
    - One entry per household, with `key` = its id. The contact comes first in `members`.
    - Plus one entry per non-hidden person whose `individual.household` is null, with `key` = `person:<id>`, `size` 1, `address` = null, and title = their display name.
    - Sorted by title (`localeCompare`).
  - `export function familyTitle(h: Household): string`
    - Gives `<contact's familyName> household`.
    - Falls back to the first member's familyName, then to `Household`.
    - A `size` 1 household uses the contact's full display name.
  - `export function filterFamilies(entries: FamilyEntry[], query: string): FamilyEntry[]`
    - Matches case-insensitively, trimmed, against visible member names.
    - An empty query returns everything.
  - `export function sizeText(n: number): string` returns `1 person` / `N people`.
  - `export function hiddenText(n: number): string | null` returns `and 1 other you can't see` / `and N others you can't see`, and null for 0.
  - `export type HouseholdMove = { others: string[]; hidden: number; total: number }`
  - `export function householdMove(h: Household | null | undefined, movingId: string): HouseholdMove | null`
    - Returns null when `h` is missing or `size <= 1`.
    - `others` = the display names of visible members other than `movingId`, contact first.
    - `hidden` = `size - members.length`.
    - `total` = `size`.

- [ ] **Step 1: Write the failing tests,** with made-up names.
  - `familyEntries`:
    - merges two households and one household-less person;
    - skips a hidden household-less person;
    - sorts by title;
    - puts the contact first with `isContact`;
    - sets `hidden` = `size - members.length`.
  - `familyTitle`:
    - contact present → `"Okoro household"`;
    - null contact → the first member's family name;
    - no members → `Household`;
    - `size` 1 → full name.
  - `filterFamilies` matches any visible member, is case-insensitive, and returns all on blank.
  - `sizeText(1)` → `1 person`, `sizeText(3)` → `3 people`.
  - `hiddenText(0)` → null, `(1)` → `and 1 other you can't see`, `(2)` → `and 2 others you can't see`.
  - `householdMove`:
    - null and `size` 1 → null;
    - a 4-person household with the caller seeing 3 → `{ others: [contact, other], hidden: 1, total: 4 }`;
    - seeing only the mover → `{ others: [], hidden: 3, total: 4 }`.
- [ ] **Step 2: Run `npx vitest run src/lib/households.test.ts`.** Expected: FAIL (the module doesn't exist).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Re-run.** Expected: PASS.

### Task 3: `/api/families` and the list on the Families card

**Files:**
- Create: `web/src/app/api/families/route.ts`, `web/src/components/FamiliesList.tsx`
- Modify: `web/src/components/DetailView.tsx` (the Families card body, ~line 1402)

**Interfaces:**
- Consumes: `getNucleusHouseholds`, `getNucleusPeople` (Task 1); `familyEntries`, `filterFamilies`, `sizeText`, `hiddenText` (Task 2).
- Produces: `GET /api/families?nucleus=<name>` → `{ families: FamilyEntry[] }`.
  - It checks Clerk auth and then `canRead`, the same as `/api/nucleus/counts`.
  - It returns 404 when either read returns null.
  - Errors go through `clusterNotebookErrorResponse`.

- [ ] **Step 1: Write the route.** It runs both reads with `Promise.all` and returns `familyEntries(households, people)`.
- [ ] **Step 2: Write `FamiliesList({ nucleus }: { nucleus: string })`.**
  - It fetches on mount, showing `Loading families…` meanwhile, and an error line on failure.
  - The search input is labelled `Find a family by anyone in it`.
  - Each entry is a `<button aria-expanded>` row showing:
    - a chevron;
    - the title;
    - the address, or `No address in SRP`;
    - a size chip (`sizeText`).
  - When expanded, it shows the members, each with the SRP dot, using the same component or colours as the People card. The contact is prefixed `★ `. `hiddenText` shows when it's non-null.
  - When nothing matches the search: `No family has anyone by that name.`
- [ ] **Step 3: Mount `<FamiliesList nucleus={row.nucleus} />`** in the Families card body, below the existing `field-grid-2`.
- [ ] **Step 4: Run `npx tsc --noEmit && npm test && npx eslint src/components/FamiliesList.tsx src/app/api/families/route.ts src/components/DetailView.tsx`.** Expected: exit 0.
- [ ] **Step 5: Check in the browser** against local cluster-notebook, on a Neighborhood with SRP households.
  - The entries match the people on the People card.
  - Search finds a family by a non-contact member.
  - Expanding a family shows ★ on the contact.

### Task 4: The move warning

**Files:**
- Modify:
  - `web/src/components/PeopleCard.tsx`: `confirmMove`, ~line 373. The `Editing` type gains `household`, taken from the person record.
  - `web/src/components/admin/HiddenCard.tsx`: `moveView`, ~line 130.

**Interfaces:**
- Consumes: `householdMove`, `hiddenText` (Task 2); `individual.household` (Task 1).

- [ ] **Step 1: Add a small shared component, `HouseholdMoveNote({ move, name }: { move: HouseholdMove; name: string })`,** in `web/src/components/HouseholdMoveNote.tsx`. It renders:
  - a heading, `Their whole household moves with them`;
  - the line `In SRP a household always moves together. These people move too:`;
  - a list of `move.others`, then `hiddenText(move.hidden)` when non-null;
  - a disabled `Move only {name}` button with the note `They would first leave the household. That comes with editing families.`
- [ ] **Step 2: In PeopleCard.** When `householdMove(e.household, e.id)` is non-null, show the note above the buttons, and label the Move button `Move all {total} people` (`Moving…` while saving).
- [ ] **Step 3: Make the same change in HiddenCard's `moveView`,** using `h.individual.household`.
- [ ] **Step 4: Run `npx tsc --noEmit && npm test && npx eslint src/components/PeopleCard.tsx src/components/admin/HiddenCard.tsx src/components/HouseholdMoveNote.tsx`.** Expected: exit 0.
- [ ] **Step 5: Check in the browser.**
  - Moving a member of a multi-person household shows the note and `Move all N people`.
  - Moving someone with no household shows today's plain `Move`.
- [ ] **Step 6: Commit when the owner asks.** Use `feat: Families card lists households; moves warn who comes along`.

### Task 5: Addresses for everyone; sort by family name or address (owner, 2026-11-27)

**Owner:**
- "default sort by family name but want to be able to sort by address".
- For people not in a household: "they have an address; show it".

**Backend:** cluster-notebook PR #63 adds `NucleusPerson.address: String`.
- It is free text, as SRP holds it.
- It is null unless the caller may see person details at that nucleus, or when none is recorded.
- For a household member it equals the contact's address.

**Files:**
- Modify:
  - `web/src/lib/clusterNotebook.ts`: add `address` to `NUCLEUS_PERSON_SELECTION`, and `address: string | null` to `NucleusPerson`.
  - `web/src/lib/households.ts`
  - `web/src/components/FamiliesList.tsx`
  - `docs/cluster-notebook-api-requirements.md`: a line in the Households section.
- Test: `web/src/lib/households.test.ts`, `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- `FamilyEntry` gains `familyName: string` and `firstName: string`, the sort keys.
  - A household uses its contact's names, else the first member's, else `''`.
  - A one-person entry uses that person's names.
- A one-person entry's `address` = `person.address ?? null`.
- `export type FamilySort = 'name' | 'address'`
- `export function sortFamilies(entries: FamilyEntry[], by: FamilySort): FamilyEntry[]` returns a new array.
  - `'name'`: by `familyName`, then `firstName`, then `title`, case-insensitively with `localeCompare`.
  - `'address'`: parse `^\s*(\d+)\s+(.*)$` from the address.
    - A parsed address sorts by its street text (the rest, lowercased), then its number numerically.
    - An address with no leading number sorts by its whole lowercased text, among the streets.
    - Entries with a null or blank address go last, ordered among themselves by name.
- `familyEntries` returns entries sorted with `sortFamilies(…, 'name')`, replacing its title sort.

- [ ] **Step 1: Write the failing tests.**
  - A one-person entry carries `person.address`.
  - Name sort:
    - "Ada Zed" (solo) sorts next to "Zed household";
    - a family name tie is broken by first name.
  - Address sort:
    - `['120 Oak Ridge Ct', '34 Birch Ln', '118 Oak Ridge Ct', null, 'Rural Route 5']` → `34 Birch Ln`, `118 Oak Ridge Ct`, `120 Oak Ridge Ct`, `Rural Route 5`, then the null.
    - "rural route 5" sorts after "oak ridge ct" by text.
    - A blank address counts as null.
  - The `getNucleusPeople` query contains ` address `.
- [ ] **Step 2: Run them; they FAIL.**
- [ ] **Step 3: Implement.**
  - FamiliesList gets a "Sort by" control with two options, `Family name` and `Address`, as 44px-tall pill buttons with `aria-pressed`. `Family name` is the default.
  - The sort applies after search filtering.
- [ ] **Step 4: Check that `npx tsc --noEmit`, eslint on the changed files, and `npm test` all exit 0. Validate the queries against :8123.**
