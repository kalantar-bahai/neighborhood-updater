# People card details, phase A, implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each person's age category and devotional host status on the People card. Both also become filters.
Clicking a name opens a person panel, which holds their restricted details when the caller may see them.

**Architecture:**
- `clusterNotebook.ts` reads the two new `NucleusPerson` fields and the new `personDetails` query.
- Pure decisions (filters, formatting) live in `people.ts`, with tests.
- A new route, `/api/person-details`, serves one person's details on demand. Restricted fields never travel with the
  list.
- `PeopleCard` turns its row editor into a panel that every reader can open.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-people-card-details-design.md`

## Global Constraints

- **Age labels:** CHILD "Child", JUNIOR_YOUTH "Junior Youth", YOUTH "Youth", ADULT "Adult".
- **Restricted fields** (estimatedAge, registration, address, phones, emails, srpComments, checks) appear only in
  `/api/person-details`. Never in `/api/people`, `/api/individuals` or any list.
- **Not tier 1 is silence.** `personDetails` null → the route returns 404 → the panel shows no Details section and no
  hint. Any other failure shows a short error line in the panel.
- **Not in SRP:** `individual.inSrp === false` shows "Not in SRP; nothing synced" in place of the details.
- **Blank values:** a missing value shows "—". Background check: "expires <date>", flagged expired when the date is
  before today. Motor vehicle: true "cleared", false "not cleared", null "—".
- **SRP comments** render as plain text with line breaks kept (`whiteSpace: 'pre-wrap'`), never as HTML.
- **Who gets the editor in the panel:** `permissions.canAssignRoles || (isHome && permissions.canWrite)`, the
  editor's existing condition. Every reader can open the panel.
- **Phase A only.** Nothing for participates, facilitates or participation, whether filters, sections or query
  fields.
- **Public repo:** made-up names, addresses, phones and emails in tests (use `example.org`, `555-01xx`).
- **Every route** checks Clerk auth, then `getNucleusPermissions(nucleus).canRead`, and catches errors through
  `clusterNotebookErrorResponse`.

## Review Focus

- A person with neither age category nor host: no tag and no 🕯. The row looks as it did in phase 2.
- An app-created person (`inSrp` false) opened by a tier-1 caller: "Not in SRP; nothing synced", not a column of
  dashes.
- The caller clicks person A, then person B, before A's details arrive. A's details must not show under B.
- SRP comments containing `<b>` or newlines: shown literally, with the line breaks kept.
- A tier-1 caller who is not tier 2 (`checks` null): no Checks lines at all.

---

### Task 1: cluster-notebook client

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`
- Modify: `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces:
  - `type AgeCategory = 'CHILD' | 'JUNIOR_YOUTH' | 'YOUTH' | 'ADULT'`
  - `type DevotionalHostRole = 'HOST' | 'CO_HOST'`
  - `NucleusPerson` gains `ageCategory: AgeCategory | null` and `devotionalHost: DevotionalHostRole | null`.
  - `interface PersonChecks { backgroundCheckExpiration: string | null; motorVehicleClearance: boolean | null }`
  - `interface PersonDetails { individual: PersonSummary; estimatedAge: number | null; isRegistered: boolean | null; registrationDate: string | null; address: string | null; phones: string[]; emails: string[]; srpComments: string | null; checks: PersonChecks | null }`
  - `getPersonDetails(individualId: string, nucleusName: string): Promise<PersonDetails | null>`

- [ ] **Step 1: Write failing tests**
  - In `describe('getNucleusPeople')`, the normalized query contains
    `people { individual { … } roles isResident ageCategory devotionalHost }`. Extend the existing exact-string
    assertion.
  - New `describe('getPersonDetails')`:
    - Sends `personDetails(individualId: $individualId, nucleusName: $nucleusName)` with both variables, and selects
      `checks { backgroundCheckExpiration motorVehicleClearance }`.
    - Returns the object as given.
    - Returns `null` when `data.personDetails` is null.
- [ ] **Step 2:** `cd web && npx vitest run src/lib/clusterNotebook.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Add `ageCategory devotionalHost` after `isResident` in `getNucleusPeople`.
  - Add `getPersonDetails`, selecting `individual { ${PERSON_SUMMARY_SELECTION} } estimatedAge isRegistered registrationDate address phones emails srpComments checks { backgroundCheckExpiration motorVehicleClearance }`.
  - Add a dated comment: "Confirmed with cluster-notebook 2026-11-20 (PR #46)". It says null means not permitted,
    unknown nucleus, or not one of its people, and that `checks` is null unless tier 2.
- [ ] **Step 4:** Run the same command. Expected: PASS. Fix the `NucleusPerson` fixtures that `tsc` flags (add
  `ageCategory: null, devotionalHost: null`).
- [ ] **Step 5:** Commit: `feat: read age category, devotional host and person details`.

### Task 2: decisions in people.ts

**Files:**
- Modify: `web/src/lib/people.ts`
- Modify: `web/src/lib/people.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `PersonRow` gains `ageCategory: AgeCategory | null` and `devotionalHost: DevotionalHostRole | null`, set by
    `toPersonRow`.
  - `AGE_LABELS: Record<AgeCategory, string>`
  - `DEVOTIONAL_HOST = { label: 'Devotional host', icon: '🕯' }`
  - `peopleFilters` adds these keys, in this order:
    - after the roles: `'devotional-host'` (label "Devotional host"), always;
    - then `'age:CHILD'`, `'age:JUNIOR_YOUTH'`, `'age:YOUTH'`, `'age:ADULT'`, each only if some row has that
      category, labelled from `AGE_LABELS`.
  - `filterPeople` understands both kinds of key: `devotional-host` matches any non-null `devotionalHost`, and
    `age:X` matches `ageCategory === X`.
  - `type DetailsView`:
    ```ts
    | { inSrp: false }
    | { inSrp: true; age: string; registration: string; address: string; phones: string; emails: string;
        comments: string | null;
        checks: { background: string; backgroundExpired: boolean; motorVehicle: string } | null }
    ```
  - `detailsView(d: PersonDetails, today: string): DetailsView`

- [ ] **Step 1: Write failing tests**
  - `toPersonRow` copies `ageCategory` and `devotionalHost`. Update the existing expected objects.
  - `peopleFilters`:
    - Rows holding YOUTH and ADULT, on a home nucleus, give keys
      `['all','resident','promoter','protagonist','accompanier','contact','devotional-host','age:YOUTH','age:ADULT']`.
    - Labels include `'Devotional host'` and `'Youth'`.
  - `filterPeople`:
    - `'devotional-host'` keeps a HOST and a CO_HOST and drops a null.
    - `'age:CHILD'` keeps only CHILD.
  - `detailsView`, with `today = '2026-11-20'`:
    - `inSrp` false gives `{ inSrp: false }`.
    - Every value null or empty gives age, registration, address, phones and emails all `'—'`, comments `null`, and
      checks `null`.
    - `estimatedAge: 17` gives age `'17'`.
    - Registration:
      - `isRegistered: true, registrationDate: '2019-03-02'` gives `'Registered since 2019-03-02'`;
      - true with no date gives `'Registered'`;
      - false gives `'Not registered'`.
    - `phones: ['555-0100','555-0101']` gives `'555-0100, 555-0101'`. Emails the same way.
    - `srpComments: '  '` gives comments `null`. `'a\nb'` is kept as is.
    - Checks:
      - `backgroundCheckExpiration: '2027-03-01'` gives `'expires 2027-03-01'`, expired false;
      - `'2026-11-19'` gives expired true;
      - null gives `'—'`, expired false;
      - `motorVehicleClearance` true, false and null give `'cleared'`, `'not cleared'` and `'—'`.
- [ ] **Step 2:** `npx vitest run src/lib/people.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement in `people.ts`, with a header comment pointing at the phase 3 spec. Dates are ISO strings,
  so plain string comparison decides "expired".
- [ ] **Step 4:** Run the same command. Expected: PASS. Run `npx tsc --noEmit` and fix any `PersonRow` fixtures.
- [ ] **Step 5:** Commit: `feat: age, devotional host and details decisions for the People card`.

### Task 3: /api/person-details route

**Files:**
- Create: `web/src/app/api/person-details/route.ts`

**Interfaces:**
- Consumes: `getPersonDetails` (Task 1), `getNucleusPermissions`, `clusterNotebookErrorResponse`.
- Produces: `GET /api/person-details?nucleus=<name>&individualId=<id>`. It returns:
  - 401 if not signed in;
  - 400 if a parameter is missing;
  - 403 if `!canRead`;
  - 404 `{ error: 'Not found' }` when `personDetails` is null;
  - 200 `{ details: PersonDetails }` otherwise.

- [ ] **Step 1:** Write the route on the pattern of `web/src/app/api/people/route.ts`, with a comment that 404 also
  means "not permitted" and that the card shows nothing for it. There's no route-test infrastructure, so this
  task is verified by `tsc`, lint and Task 4's browser check.
- [ ] **Step 2:** `npx tsc --noEmit && npx eslint src/app/api/person-details/route.ts`. Expected: both clean.
- [ ] **Step 3:** Commit: `feat: person details route`.

### Task 4: People card, row marks, filters and person panel

**Files:**
- Modify: `web/src/components/PeopleCard.tsx`
- Modify: `docs/cluster-notebook-api-requirements.md`: a new section, "People card details, confirmed with
  cluster-notebook 2026-11-20", with the SDL summary, tiers and the worker phone/email side effect.

**Interfaces:**
- Consumes: Task 2 (`AGE_LABELS`, `DEVOTIONAL_HOST`, `detailsView`, the filter keys) and Task 3's route.

- [ ] **Step 1: Row marks.** In `RoleMarks`, after the roles:
  - 🕯 when `devotionalHost` is set, titled "Devotional host" or "Devotional co-host";
  - the age label as a grey tag, in the same style as the unknown-role tag, when `ageCategory` is set.
- [ ] **Step 2: Rows clickable for every reader.**
  - Clicking a name opens the panel for everyone.
  - `canEditPerson = permissions.canAssignRoles || canMove`.
  - The existing Resident/roles editor, its confirm and its Save/Cancel render only when `canEditPerson`.
  - For readers, the panel ends with a "Close" button.
  - "+ Add" keeps its current rule.
- [ ] **Step 3: Details section.**
  - On opening a person, fetch `/api/person-details`.
  - Keep `{ personId, status: 'loading' | 'none' | 'error' | 'ok', details?, error? }`.
  - Drop an answer whose `personId` no longer matches `editingId.current`.
  - 404 → `'none'`, which renders nothing.
  - Render from `detailsView(details, today)`, where `today` is the local date as YYYY-MM-DD:
    - "Not in SRP; nothing synced";
    - or the lines in the spec's sketch order: age and registration; address; phones and emails; checks (the
      background text in red when expired); then "SRP comments:" with `whiteSpace: 'pre-wrap'`.
  - Show "Loading details…" while loading.
  - The panel stays open across re-reads. Details are fetched again on each open.
- [ ] **Step 4: Filters.** These need no card change beyond what `peopleFilters` returns. Check the new options
  appear in the filter menu.
- [ ] **Step 5: Verify.**
  - `npm test`, `npx tsc --noEmit` and `npx eslint src/components/PeopleCard.tsx src/app/api/person-details/route.ts src/lib`
    are all clean.
  - Then in the browser on localhost:3000, against the owner's local cluster-notebook on its latest `main`. Phase A
    is merged there; restarting the API is the owner's step. Check:
    - the age tags and 🕯 show;
    - the filters work;
    - the panel opens for a person and shows details as a tier-1 user;
    - an app-created person shows "Not in SRP".
- [ ] **Step 6:** Commit: `feat: People card shows age, devotional host and person details`, and include the
  API-requirements doc.
