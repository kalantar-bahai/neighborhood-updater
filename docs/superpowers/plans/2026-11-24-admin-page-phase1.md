# Admin page, Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CSOs and Administrators get an `/admin` page, linked from the home page, with a Roles card (find a person, see details and roles, add and end roles anywhere in the cluster) and a Hidden people card (review, unhide, move); everyone gets a "My account" link.

**Architecture:** New cluster-notebook calls go in `lib/clusterNotebook.ts`; pure decisions (result lines, role lines, place tree, wording) in a new `lib/admin.ts`; thin routes under `app/api/admin/*`, each gated by `adminClusters`; a client page `app/admin/page.tsx` with components under `components/admin/`. No database; cluster-notebook enforces every permission too.

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Vitest. Read `node_modules/next/dist/docs/` before Next code (`web/AGENTS.md`).

**Spec:** `docs/superpowers/specs/2026-11-24-admin-page-design.md` (Phase 1 sections, "What we need from cluster-notebook", "Builder's calls").

## Global Constraints

- **Do not merge (or deploy) until cluster-notebook says its Phase 1 fields are in production:** `adminClusters`, `searchPeople`, `individualRoles`, `personDetails` without `nucleusName`, `adminPlaces`, `assignableRolesAt`, `grantRole`, `endRole`, `id` on Cluster/Locality/Setting/Nucleus. `initial-data` asks for `adminClusters`, so merging early takes the home page down for everyone (as #59 did to the People card on 2026-11-23). Build and test against mocks; the branch waits.
- Who: Administrator (every cluster) or CSO for clusters in `adminClusters`. The Admin link shows when `adminClusters` is non-empty.
- Copy, verbatim: link "Admin"; page title "Admin"; search placeholder "Find a person in this cluster…"; result line "Ana Lopez · Adult · NC-215 Triangle › Chapel Hill › Northside" with tag "has access"; role line "CSO · NC-215 Triangle", "Contact ★ · Northside", "Administrator"; "+ role"; confirm "End Ana Lopez's CSO role at NC-215 Triangle?"; hide note as the People card's `hideNote`; buttons "Unhide", "Move…", "Archive" (disabled, title "Coming later"); "My account"; non-admin page: "Access denied" and a link "Home".
- `SELF_LOCKOUT` → 409 "You can't end your own last admin role here." `FORBIDDEN` → 403 (existing mapping).
- Roles and places are chosen by **id**; nuclei stay keyed by name everywhere else.
- Every route: Clerk `auth()` → 401; admin check → 403; catch through `clusterNotebookErrorResponse`.
- Null means "not recorded". Made-up names only in tests and docs (public repo). Commit messages with `Claude-Session:` / `Co-authored-by: Claude` trailers.

## Review Focus

1. Two people with the same name: every search result shows age and place path, and every later call uses the picked person's id, never the name.
2. Switching the cluster selector while a person is picked or a role form is open: the selection and form clear, so nothing is granted in the wrong cluster.
3. Ending your own last admin role: the card shows "You can't end your own last admin role here." and the role stays listed.
4. A non-admin opening `/admin` or calling `/api/admin/*` directly: "Access denied" page; routes answer 403 without calling the mutating cluster-notebook call.
5. After Unhide or Move on the Hidden card, or + role / 🗑 on Roles: the list re-reads; a failure shows in words in that card and the list is unchanged.

---

### Task 1: cluster-notebook client for admin

**Files:** Modify `web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebookError.ts`; Test `web/src/lib/clusterNotebook.test.ts`, `web/src/lib/clusterNotebookError.test.ts`

**Interfaces — Produces:**
- `AdminCluster { id: string; name: string }`; `getAdminClusters(): Promise<AdminCluster[]>` (`adminClusters { id name }`).
- `AdminPerson { individual: PersonSummary; ageCategory: AgeCategory | null; placePath: string[]; hasAccess: boolean }`; `searchPeople(clusterName, search, limit = 20): Promise<AdminPerson[]>`.
- `AdminLocation { id: string; name: string; type: string }`; `RoleHolding { id: string; role: string; entity: AdminLocation | null; start: string | null }`; `getIndividualRoles(individualId): Promise<RoleHolding[]>`.
- `AdminPlace { id; name; type: 'cluster' | 'locality' | 'setting' | 'nucleus'; parentId: string | null; parentName: string | null }`; `getAdminPlaces(clusterName): Promise<AdminPlace[]>`.
- `getAssignableRolesAt(entityId): Promise<RoleGrant[]>`; `grantRole(individualId, role, entityId): Promise<RoleHolding>`; `endRole(roleId): Promise<boolean>`.
- `HiddenPerson { individual: PersonSummary; nucleusName: string; roles: string[]; isResident: boolean; hide: PersonHide }`; `getHiddenPeople(clusterName): Promise<HiddenPerson[]>`.
- `getPersonDetails(individualId: string, nucleusName: string | null)`: sends `nucleusName` only when non-null (query variable `String` not `String!`).

- [ ] Tests (mock `fetch` as the file's existing tests do): each function's query text contains its field and selection, and sends exactly its variables; `getPersonDetails('I1', null)` sends `{ individualId: 'I1' }` with no `nucleusName` key and its query declares `$nucleusName: String`; `getPersonDetails('I1', 'Northside')` unchanged; `grantRole` returns the holding; `CODED_ERRORS.SELF_LOCKOUT` maps to `{ status: 409, message: "You can't end your own last admin role here." }`.
- [ ] Run `npx vitest run src/lib/clusterNotebook.test.ts src/lib/clusterNotebookError.test.ts`: FAIL.
- [ ] Implement, with a dated comment "Confirmed with cluster-notebook 2026-11-24: …" over each new call (gates and meanings from the spec's "What we need" notes). Update existing `getPersonDetails` callers to pass the nucleus name (unchanged behaviour).
- [ ] Run tests: PASS; `npx tsc --noEmit`: clean.
- [ ] Commit `feat: cluster-notebook client for the admin page`.

### Task 2: admin decisions

**Files:** Create `web/src/lib/admin.ts`, `web/src/lib/admin.test.ts`

**Interfaces — Consumes:** Task 1 types; `roleLabel`, `AGE_LABELS` from `lib/people.ts`. **Produces:**
- `adminPersonLine(p: AdminPerson): string` — name (`individualDisplayName`), age label, `placePath.join(' › ')`, joined with " · ", skipping missing parts.
- `roleHoldingLine(h: RoleHolding): string` — `roleLabel(h.role)` as "Label icon" (icon only when there is one), then " · " entity name; "Administrator" when entity is null.
- `endRoleConfirm(name: string, h: RoleHolding): string` — "End {name}'s {label} role at {entity}?"; "End {name}'s Administrator role?" when entity is null.
- `placeTree(places: AdminPlace[], filter: string): { place: AdminPlace; depth: number }[]` — depth from parent chain; a filter (case-insensitive substring of name) keeps matches and their ancestors, in input order.
- `moveTargets(places: AdminPlace[]): AdminPlace[]` — only `locality` and `setting` (moveIndividuals takes a Location id).
- `isAdminOf(clusters: AdminCluster[], clusterName: string): boolean`.

- [ ] Tests with made-up people: `adminPersonLine` → "Ana Lopez · Adult · NC-215 Triangle › Chapel Hill › Northside"; no age → "Ana Lopez · NC-215 Triangle › Carrboro"; `roleHoldingLine` → "CSO · NC-215 Triangle", "Contact ★ · Northside", "Administrator"; `endRoleConfirm('Ana Lopez', cso)` → "End Ana Lopez's CSO role at NC-215 Triangle?"; `placeTree` depths 0/1/2 for cluster › locality › setting, and filter "north" keeps cluster, its locality and "Northside" only; `moveTargets` drops cluster and nucleus; `isAdminOf` true/false.
- [ ] Run `npx vitest run src/lib/admin.test.ts`: FAIL. Implement. Run: PASS.
- [ ] Commit `feat: admin page decisions`.

### Task 3: admin routes

**Files:** Create `web/src/lib/adminAccess.ts` and routes `web/src/app/api/admin/{clusters,people,person,places,roles,hidden,move}/route.ts`

**Interfaces — Consumes:** Tasks 1–2. **Produces** (all JSON; 401/403 as Global Constraints):
- `requireAdmin(clusterName?: string): Promise<{ clusters: AdminCluster[] } | NextResponse>` in `lib/adminAccess.ts` — 401 without user; 403 when `adminClusters` is empty or (given a name) doesn't include it.
- `GET /api/admin/clusters` → `{ clusters }`.
- `GET /api/admin/people?cluster=&q=` → `{ people: AdminPerson[] }` (400 when q is blank).
- `GET /api/admin/person?id=` → `{ details: PersonDetails | null, roles: RoleHolding[] }` (requireAdmin with no cluster; cluster-notebook gates by the person's cluster).
- `GET /api/admin/places?cluster=` → `{ places }`; `GET /api/admin/places?entityId=` → `{ roles: RoleGrant[] }` (assignableRolesAt).
- `POST /api/admin/roles { individualId, role, entityId }` → `{ holding }`; `DELETE /api/admin/roles { roleId }` → `{ ok: true }`.
- `GET /api/admin/hidden?cluster=` → `{ hidden: HiddenPerson[] }`; `POST /api/admin/hidden { individualId, nucleusName }` → unhide, `{ ok: true }` (404 when cluster-notebook returns null).
- `POST /api/admin/move { cluster, individualId, locationId }` → `{ error: string | null }` via `moveResultError`, `withHousehold: true` (owner, 2026-11-19).

- [ ] Write them in the shape of `api/hide/route.ts`. `npx tsc --noEmit`, `npx eslint src/app/api/admin src/lib/adminAccess.ts`: clean.
- [ ] Commit `feat: admin routes`.

### Task 4: the page, the Admin link, My account

**Files:** Modify `web/src/app/api/initial-data/route.ts`, `web/src/components/AppClient.tsx`, `web/src/components/Picker.tsx`; Create `web/src/app/admin/page.tsx`, `web/src/components/admin/AdminClient.tsx`, `web/src/app/account/[[...account]]/page.tsx`

**Interfaces — Consumes:** Task 3 routes. **Produces:** `AdminClient` holds `cluster: string` state and renders `<RolesCard cluster>` and `<HiddenCard cluster>` (Tasks 5–6) with `key={cluster}` so a switch remounts them (Review Focus 2).

- [ ] `initial-data` adds `isAdmin: boolean` = `(await getAdminClusters()).length > 0`, fetched in the existing `Promise.all`. Picker gets `onAdmin?: () => void` and shows an "Admin" button beside "+ Add" (same style) when set; AppClient passes `() => window.location.href = '/admin'` when `isAdmin`.
- [ ] Picker shows "My account" beside "Sign out" (same style) → `/account`. The account page renders Clerk's `<UserProfile />` with path routing at `/account` (check the installed Clerk docs for the Next 16 catch-all pattern) and a "Home" link.
- [ ] `/admin` page: server checks `auth()` (redirect to `/sign-in` as `app/page.tsx` does) and renders `AdminClient`. AdminClient loads `/api/admin/clusters`; 403 → "Access denied" with a "Home" link; one cluster → its name as heading; several → a `<select>` (first selected); "Home" link at top.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on changed files: clean. Browser (`npm run dev`, mocks or a cluster-notebook on its Phase 1 branch): the link shows only for an admin; `/admin` as a non-admin shows Access denied; My account opens Clerk's profile.
- [ ] Commit `feat: admin page shell, Admin link and My account`.

### Task 5: Roles card

**Files:** Create `web/src/components/admin/PersonFinder.tsx`, `web/src/components/admin/RolesCard.tsx`, `web/src/components/PersonDetailsBlock.tsx`; Modify `web/src/components/PeopleCard.tsx` (use the extracted block)

**Interfaces — Consumes:** Tasks 2–3. **Produces:** `PersonFinder({ cluster, onPick: (p: AdminPerson) => void })` (reused by Phase 2's Invite card); `PersonDetailsBlock({ details: PersonDetails })` — the People card's Details rendering moved verbatim (`detailsView` / `detailLines`), PeopleCard then renders it unchanged.

- [ ] PersonFinder: input with the placeholder from Global Constraints; debounced (300 ms) `GET /api/admin/people`; each result a button showing `adminPersonLine` and a grey "has access" tag when `hasAccess`.
- [ ] RolesCard: a collapsible card titled "Roles" (DetailView's card style). After a pick: person's name, `PersonDetailsBlock` (or "Not in SRP; nothing synced"), then each holding as `roleHoldingLine` with a 🗑 button (`aria-label` = the confirm text). 🗑 → `window.confirm(endRoleConfirm(...))` → DELETE → re-read person. "+ role" opens: filter input + `placeTree` list (indent 12px per depth) → on choosing a place, `GET places?entityId=` → role `<select>` → Save (POST) → re-read person; Cancel. Errors show in red under the roles. "Change person" clears the pick.
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on changed files: clean. Browser: same-named people distinguishable; add and end a role on "Test SecondAccount"; ending your own last CSO shows the SELF_LOCKOUT text; People card Details unchanged.
- [ ] Commit `feat: admin Roles card`.

### Task 6: Hidden people card

**Files:** Create `web/src/components/admin/HiddenCard.tsx`

**Interfaces — Consumes:** Tasks 2–3, `hideNote` from `lib/people.ts`.

- [ ] Collapsible card "Hidden people (n)". Rows: name, "from {nucleusName}", `hideNote(hide)`. Buttons: "Unhide" (POST hidden → re-read), "Move…" (inline: `moveTargets(places)` through `placeTree` with the filter box → Move → POST move; non-null error shown in the row; success re-reads), "Archive" disabled with title "Coming later". Empty: "No one is hidden in this cluster."
- [ ] `npx tsc --noEmit`, `npx vitest run`, `npx eslint` on the file: clean. Browser: hide someone in the People card, see them here, Unhide, see them back in the People card.
- [ ] Commit `feat: admin Hidden people card`.

### Task 7: docs

- [ ] Add "Admin page, Phase 1, confirmed with cluster-notebook 2026-11-24" to `docs/cluster-notebook-api-requirements.md`: the Phase 1 SDL and rules from the spec. Commit `docs: record the admin Phase 1 contract`.
