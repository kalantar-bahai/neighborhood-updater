# People Card (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "People" card after Overview listing everyone connected to a nucleus (role holders, plus residents on home nuclei), with filter, search, add, per-person role ticks and remove.

**Architecture:** cluster-notebook's new `Nucleus.people` and widened `individuals(limit)` are read through `clusterNotebook.ts`; pure decisions (labels, filtering, place path, role-list edits, permissions) live in a new `lib/people.ts` with tests; a new `/api/people` route and the existing `/api/individuals` and `/api/workers` routes serve a new `PeopleCard` component that `DetailView` mounts.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-people-card-design.md`

## Global Constraints

- cluster-notebook SDL (confirmed 2026-11-18; must be deployed before Task 3's browser check):
  - `type PersonSummary { id: String! firstName: String middleNames: String familyName: String nickname: String place: Location }`
  - `type Location { name: String! type: PlaceType! locality: String cluster: String }` (locality only for SETTING; cluster null for CLUSTER)
  - `type NucleusPerson { individual: PersonSummary! roles: [String!]! isResident: Boolean! }`
  - `Nucleus.people: [NucleusPerson!]!` (roles held on this nucleus only; residents only for a home nucleus; ordered family, first name; readable wherever the nucleus is)
  - `Query.individuals(nucleusName: String!, search: String = null, limit: Int = null): [PersonSummary!]!` (everyone in the cluster; needs WRITE)
  - `PersonSummary.id` is the id `updateNucleusWorkers.personIds` takes.
- No phone, email, age or sex anywhere in the card or search results.
- Role writes reuse `/api/workers` POST (full ordered list per role); per-role permission = `canAssignRoles` and (role is in `INFORMAL_WORKER_TYPES` or in `assignableRoles`).
- Labels and icons: `promoter` "Promoting" 📣, `protagonist` "Helping Others" 👥, `accompanier` "Accompanying" 🤝, `contact` "Contact" ★, resident "Resident" 🏠; any other role shows a grey badge with the role string.
- Place path: SETTING `"<cluster> › <locality> › <name>"`, LOCALITY `"<cluster> › <name>"`, CLUSTER `"<name>"`, null place `""`.
- Copy: empty list `No one is connected to this nucleus yet.`; contact replace confirm `This replaces <name> as contact.`; more results `Keep typing to narrow the list.`
- Search limit: request 21, show 20, `more` when 21 came back.
- Card key `people`, default closed, placed directly after Overview.

## Review Focus

- A resident with no roles: listed with 🏠, Remove does nothing harmful (no role call; button hidden when the caller can change none of their roles).
- Non-home nucleus: no Resident filter even if a response somehow has `isResident: true` on nobody.
- Contact ticked on a second person: confirm names the current contact; cancel leaves both unchanged.
- One of several role saves fails: error shown, card re-reads, others' saved changes remain visible.
- Reader without `canWrite`: no "+ Add"; without `canAssignRoles`: rows are not editable.

---

### Task 1: Data and decision helpers

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebook.test.ts`
- Create: `web/src/lib/people.ts`, `web/src/lib/people.test.ts`
- Modify: `docs/superpowers/specs/2026-11-18-people-card-design.md` (roles: "held on this nucleus itself; roles held at the Cluster or Locality are not included", per cluster-notebook 2026-11-18)

**Interfaces — Produces:**
- `clusterNotebook.ts`: `interface PlaceSummary { name: string; type: PlaceType; locality: string | null; cluster: string | null }`; `interface PersonSummary extends PersonName { place: PlaceSummary | null }`; `interface NucleusPerson { individual: PersonSummary; roles: string[]; isResident: boolean }`; `getNucleusPeople(nucleusName: string): Promise<NucleusPerson[] | null>` (null when the nucleus isn't found); `searchIndividuals(nucleusName: string, search?: string, limit?: number): Promise<PersonSummary[]>` (selection adds `place { name type locality cluster }`).
- `people.ts`:
  - `type PersonRow = { id: string; name: string; roles: string[]; isResident: boolean }`
  - `placePath(place: PlaceSummary | null): string`
  - `roleLabel(role: string): { label: string; icon: string | null }` (icon null → grey badge)
  - `canEditRole(p: PermissionSet, role: string): boolean`
  - `peopleFilters(rows: PersonRow[], isHome: boolean): { key: string; label: string }[]` — `all` first, then `resident` (only if isHome), then each role present, in the Global Constraints label order, unknown roles after, alphabetically.
  - `filterPeople(rows: PersonRow[], filter: string, search: string): PersonRow[]` — `all` | `resident` | a role; search is case-insensitive substring on name, trimmed.
  - `nextRoleIds(current: string[], personId: string, on: boolean, single: boolean): string[]` — on: append if absent (single → `[personId]`); off: remove; never duplicates.
  - `SEARCH_LIMIT = 20`

- [ ] **Step 1: Tests**
  - clusterNotebook: `getNucleusPeople` sends `{ name }`, selection contains `people { individual { id firstName middleNames familyName nickname place { name type locality cluster } } roles isResident }`, returns the list; returns null when `nucleus` is null. `searchIndividuals('Alpha','Ali',21)` sends `{ nucleusName:'Alpha', search:'Ali', limit:21 }`; omitted limit sends `limit: null`; selection is exactly the five name fields plus `place { name type locality cluster }` (update the existing selection test).
  - people: `placePath` for SETTING `{name:'Parkside',type:'SETTING',locality:'Chapelboro',cluster:'Chapel Hill'}` → `Chapel Hill › Chapelboro › Parkside`; LOCALITY → `Chapel Hill › Chapelboro`; CLUSTER `{name:'Chapel Hill',cluster:null}` → `Chapel Hill`; null → `''`.
  - `roleLabel('promoter')` → `{label:'Promoting',icon:'📣'}`; `roleLabel('cso')` → `{label:'cso',icon:null}`.
  - `canEditRole`: promoter true with canAssignRoles and empty assignableRoles; accompanier false without it in assignableRoles; anything false when canAssignRoles is false.
  - `peopleFilters`: home with roles contact+promoter → keys `['all','resident','promoter','contact']`; non-home → no `resident`.
  - `filterPeople`: `resident` keeps only isResident; `'promoter'` keeps holders; search `' ana '` matches `Ana Lopez`, case-insensitive.
  - `nextRoleIds(['a','b'],'c',true,false)` → `['a','b','c']`; adding existing → unchanged; `(['a'],'c',true,true)` → `['c']`; `(['a','b'],'a',false,false)` → `['b']`.
- [ ] **Step 2:** `cd web && npx vitest run src/lib/people.test.ts src/lib/clusterNotebook.test.ts` — FAIL (missing exports).
- [ ] **Step 3:** Implement. `/api/individuals` route keeps compiling (it maps to `{id,name}`; Task 2 changes it).
- [ ] **Step 4:** `npm test && npx tsc --noEmit` — pass.
- [ ] **Step 5:** Commit `feat: people data and decision helpers` (include the spec correction).

### Task 2: API routes

**Files:**
- Create: `web/src/app/api/people/route.ts`
- Modify: `web/src/app/api/individuals/route.ts`
- Modify: `docs/cluster-notebook-api-requirements.md` (new section "People card, confirmed with cluster-notebook 2026-11-18": the SDL above, the two read exposures, the PersonSummary breaking change)

**Interfaces — Consumes:** Task 1. **Produces:**
- `GET /api/people?nucleus=` → `{ people: PersonRow[] }`; 401 unauthenticated, 400 missing nucleus, 403 without `canRead`, 404 when `getNucleusPeople` returns null; errors via `clusterNotebookErrorResponse`.
- `GET /api/individuals?nucleus=&search=` → `{ individuals: { id, name, place: string }[], more: boolean }` (calls with `SEARCH_LIMIT + 1`, returns the first `SEARCH_LIMIT`, `place` = `placePath`). POST unchanged.

- [ ] **Step 1:** Add `toPersonRow(p: NucleusPerson): PersonRow` and `limitResults<T>(items: T[]): { items: T[]; more: boolean }` to `people.ts`, tests first: name via `individualDisplayName`; `limitResults` of 21 items → 20 and `more: true`, of 20 → 20 and `more: false`.
- [ ] **Step 2:** FAIL, implement, PASS.
- [ ] **Step 3:** Write both routes using them (pattern: `/api/workers`). `WorkerListModal` ignores the extra fields; check it still type-checks.
- [ ] **Step 4:** API doc section.
- [ ] **Step 5:** `npm test && npx tsc --noEmit && npx eslint src/app/api/people/route.ts src/app/api/individuals/route.ts` — pass.
- [ ] **Step 6:** Commit `feat: people and wider individual search routes`.

### Task 3: People card

**Files:**
- Create: `web/src/components/PeopleCard.tsx`
- Modify: `web/src/components/DetailView.tsx`

**Interfaces — Consumes:** Tasks 1-2. **Produces:** `PeopleCard({ nucleus, isHome, permissions, refreshKey, onRolesChanged }: { nucleus: string; isHome: boolean; permissions: PermissionSet; refreshKey: number; onRolesChanged: () => void })`.

- [ ] **Step 1:** DetailView: `const [peopleOpen, setPeopleOpen] = card('people', false);` card directly after Overview (same header pattern). Body: `<PeopleCard nucleus={row.nucleus} isHome={srpState === 'IN_SRP'} permissions={permissions} refreshKey={peopleRefresh} onRolesChanged={onReload} />`, rendered only when open. `peopleRefresh` is a counter bumped in each `WorkerListModal`'s `onChange`.
- [ ] **Step 2:** PeopleCard loads `/api/people` on mount and when `refreshKey` changes; shows loading, error, and the empty copy.
  - Toolbar: filter `<select>` from `peopleFilters`, search input (filters client-side), "+ Add" when `permissions.canWrite && permissions.canAssignRoles`.
  - Rows: name, 🏠 if resident (home only), then each role's icon or grey badge with `title`/`aria-label` = label. Scrolls inside the card (`maxHeight: 360`).
  - Clicking a row (when any role is editable) expands it: a checkbox per editable role (all roles in label order, plus roles the person holds), Resident shown disabled and checked/unchecked, Save and Remove. Remove unticks every editable role held.
  - Save: for each changed role, GET `/api/workers` for the current ordered ids, `nextRoleIds`, POST; contact going on calls `window.confirm(<replace copy>)` first when someone else holds it (cancel aborts all). After all calls (or the first failure, shown in red), re-read the card and call `onRolesChanged()`.
  - "+ Add": search box (debounced 250 ms, `/api/individuals`), results as `name · place`, `Keep typing to narrow the list.` when `more`, and `Create “<text>”` (POST `/api/individuals`). Picking someone opens the same role checkboxes, with nothing ticked; Save with no tick adds nothing.
  - Popovers stay inside the card flow (no portal needed unless a dropdown overflows; then `createPortal`).
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npx eslint src/components/PeopleCard.tsx src/components/DetailView.tsx` — pass, no new lint errors.
- [ ] **Step 4:** Owner checks locally against cluster-notebook with the phase-1 API (8123): open People on a home nucleus (residents 🏠, filters), a non-home nucleus (no Resident filter), add a person with Promoting (shows in Overview's Promoting list), tick Contact on a second person (confirm), Remove, search shows `name · place` path.
- [ ] **Step 5:** Commit `feat: People card`.
