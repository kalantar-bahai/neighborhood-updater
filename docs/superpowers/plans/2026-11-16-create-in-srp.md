# Create in SRP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users can create a nucleus in SRP from "+ Add", and see each nucleus's SRP status. They can fix a refused create by renaming or moving the nucleus, push never-sent nuclei to SRP, and see deletes that are queued in SRP.

**Architecture:**
- All SRP behavior is cluster-notebook's (branch `fn-lifecycle`). We add GraphQL calls and fields in `lib/clusterNotebook.ts`.
- Pure, tested logic lives in a new `lib/srp.ts`: the status, badge copy, name pre-check and permission override.
- Two thin API routes are added, `/api/locations` and `/api/nucleus/push-srp`.
- UI changes are in `CreateNucleusModal`, `Picker`, `DetailView` and `AppClient`, with a shared `SrpBadge` component.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Clerk, Vitest. Read `web/AGENTS.md`: this Next differs from training data, so check `node_modules/next/dist/docs/` before writing route code.

**Spec:** `docs/superpowers/specs/2026-11-16-create-in-srp-design.md`, with the API contract in `docs/cluster-notebook-api-requirements.md` §4 ("Create in SRP…" and "Follow-ups"). Read both.

## Global Constraints

- Work on branch `feat/create-in-srp`. Commit after each task with conventional prefixes and a *why* body, ending with `Co-authored-by: Claude <noreply@anthropic.com>`. Never `--no-verify`. Don't push.
- **Never read `../cluster-notebook` source.** It is a public API only. If its live schema disagrees with this plan, stop and report; don't guess.
- Never read `web/.env.local`.
- Branch on `extensions.code`, never on message text. Codes:
  - `FORBIDDEN`
  - `NAME_TAKEN`
  - `SRP_NAME_CLASH`
  - `SRP_NOT_AT_LOCALITY`
  - `SRP_ALREADY_LINKED`
  - `SRP_ACTION_PENDING`
  - `SRP_IN_USE`
  - `SRP_NOT_DEFAULT`
  - `SRP_NOT_NEIGHBORHOOD`
- Null means "not recorded". Never coerce it to 0. Autosave sends only the edited field.
- Every route checks Clerk auth, then permissions, and catches cluster-notebook errors through `clusterNotebookErrorResponse`.
- Create-in-SRP and Push are gated on the cluster's `createableEntityTypes.includes('nucleus')`. Rename is gated on the nucleus's `canChangeIdentity`.
- Popovers inside `.card` use `createPortal`. No `setState` in `useEffect` (`react-hooks/set-state-in-effect`).
- Use made-up names in tests ("Alpha", "Beta", "Elm Locality"). This repo is public.
- Out of scope: renaming a nucleus that is already in SRP (issue #42), and dismissing a refusal.
- Verify with `cd web && npm test && npx tsc --noEmit && npx eslint <changed files>`, checking real exit codes with no pipes.

## Review Focus

1. **Rename changes the key.** After a rename, every later save, re-fetch and the permissions lookup must use the new name. If the old name lingers in `row.nucleus` or `selectedNucleus`, the next autosave goes to a nucleus that no longer exists. Task 8 tests the AppClient handoff through `nextNameAfterRename`.
2. **A queued delete returns success but the nucleus remains.** The page must stay on it, show "Deleting in SRP" and turn read-only, not navigate away. A 404 on re-fetch must still go back to the list, not reach the error screen. Task 3 (`effectivePermissions`) and Task 8 (`reloadOutcome`) cover this.
3. **Case and whitespace in the name pre-check:** " elm park " must clash with "Elm Park" in that locality. Task 3 covers this.
4. **Unknown or missing SRP status from an older server:** show no badge and don't crash. This matters if this ships before `inSrp` exists everywhere. Task 3 covers the unknown `status` and `inSrp: undefined`.
5. **The checkbox is ticked and then the locality is cleared.** The submit must not send `srpLocality`. Task 6 covers this through `createPayload` in `lib/srp.ts`.

---

### Task 1: cluster-notebook client: coded errors, SRP fields, new calls

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`
- Test: `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- Produces:
  - `export class ClusterNotebookCodedError extends Error { constructor(message: string, public code: string) }`. `request()` throws it when the first error carries a code other than `FORBIDDEN`, which keeps throwing `ClusterNotebookForbiddenError`. With no code, it throws a plain `Error` as today.
  - `export interface SrpAction { action: 'create' | 'rename' | 'delete'; status: string; requestedAt: string; error: string | null; individuals: number | null; activities: number | null }`. `status` is a string, so unknown values survive.
  - `inSrp?: boolean` and `srpAction: SrpAction | null` are added to `NucleusSummary` and `NucleusFields`. `inSrp` is optional because the field isn't on the branch yet.
  - `const SRP_SELECTION = 'inSrp srpAction { action status requestedAt error individuals activities }'` is appended to the `getAllNuclei` selection and to `NUCLEUS_FIELDS_SELECTION`.
  - `createNucleus(name: string, clusterName: string, srpLocalityName?: string): Promise<NucleusFields | null>` adds the `$srpLocalityName: String` variable, sent only when it is given.
  - `pushNucleusToSrp(name: string): Promise<NucleusFields | null>` calls the mutation `pushNucleusToSrp(name: $name) { NUCLEUS_FIELDS_SELECTION }`.
  - `updateNucleus` patch type gains `name?: string`.

- [ ] **Step 1: Write failing tests** in `clusterNotebook.test.ts`:
  - `request maps extensions.code to ClusterNotebookCodedError`: a mocked `{errors:[{message:'x', extensions:{code:'SRP_NAME_CLASH'}}]}` makes `createNucleus('Alpha','NC-1 Test','Elm Locality')` reject with an instance of `ClusterNotebookCodedError` with `.code === 'SRP_NAME_CLASH'`.
  - `FORBIDDEN still throws ClusterNotebookForbiddenError`: keep the existing test passing.
  - `createNucleus sends srpLocalityName only when given`: the body's `variables` equal `{name:'Alpha', clusterName:'NC-1 Test', srpLocalityName:'Elm Locality'}`, and without the third argument they equal `{name:'Alpha', clusterName:'NC-1 Test'}`.
  - `pushNucleusToSrp posts the mutation with the name`: the body's query contains `pushNucleusToSrp(name: $name)`, the variables equal `{name:'Alpha'}`, and the result is returned.
  - `getAllNuclei requests inSrp and srpAction`: the query string contains `inSrp` and `srpAction { action status`.
- [ ] **Step 2:** Run `cd web && npx vitest run src/lib/clusterNotebook.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the interfaces above. Update the stale comment on `createNucleus` ("Identity-only at creation…") and the DetailView-facing "no rename mutation" comments in this file to the 2026-11-16 facts.
- [ ] **Step 4:** Run the same command. Expected: all PASS.
- [ ] **Step 5:** Commit: `feat: cluster-notebook client support for SRP actions and coded errors`.

### Task 2: map coded errors to HTTP responses

**Files:**
- Modify: `web/src/lib/clusterNotebookError.ts`, `web/src/lib/data.ts` (`createRowData`'s catch)
- Test: `web/src/lib/clusterNotebookError.test.ts`, `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: `ClusterNotebookCodedError` (Task 1).
- Produces: `clusterNotebookErrorResponse(e)` maps each code to a status and a user-facing message:

| code | status | `error` text |
|---|---|---|
| `NAME_TAKEN` | 409 | `That name is already used by another nucleus.` |
| `SRP_NAME_CLASH` | 409 | `That name is already used in this locality (in SRP or here).` |
| `SRP_ACTION_PENDING` | 409 | `An SRP change for this nucleus is still pending. Try again once it finishes.` |
| `SRP_IN_USE` | 409 | the upstream message (it carries the counts) |
| `SRP_ALREADY_LINKED` | 409 | `This nucleus is already in SRP.` |
| `SRP_NOT_AT_LOCALITY` | 400 | `Choose a locality for this nucleus before sending it to SRP.` |
| `SRP_NOT_NEIGHBORHOOD` | 400 | `Only Neighborhood nuclei can be sent to SRP.` |
| `SRP_NOT_DEFAULT` | 409 | `This nucleus shares its Setting with another, so it can't be changed in SRP from here.` |
| other code | 502 | the raw message, as today |

  Every coded response also includes `code` in its JSON body.
- `createRowData` no longer regex-matches "already exists". It lets `ClusterNotebookCodedError` propagate, and the routes map it. Remove the now-dead `CONFLICT` branch in `PUT /api/nucleus` but keep `BAD_CLUSTER`.

- [ ] **Step 1: Failing tests:**
  - One table-driven test over the rows above, checking `res.status` and `body` equal to `{ error, code }`.
  - In `data.test.ts`, update the existing duplicate-name test so a `NAME_TAKEN` error propagates as `ClusterNotebookCodedError`.
- [ ] **Step 2:** Run `npx vitest run src/lib/clusterNotebookError.test.ts src/lib/data.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Keep the cause-logging line in `clusterNotebookErrorResponse`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `fix: branch on cluster-notebook error codes instead of message text`.

### Task 3: `lib/srp.ts`, pure SRP logic

**Files:**
- Create: `web/src/lib/srp.ts`
- Test: `web/src/lib/srp.test.ts`

**Interfaces:**
- Consumes: `SrpAction`, `PermissionSet`, `LocalityOption` from `lib/clusterNotebook.ts`.
- Produces:
  - `export type SrpState = 'IN_SRP' | 'PENDING' | 'REFUSED' | 'FAILED' | 'LOCAL_ONLY'`
  - `export function srpStateFor(nucleusType: string, inSrp: boolean | undefined, srpAction: SrpAction | null): SrpState | null`
  - `export function srpBadge(state: SrpState, action?: SrpAction['action']): { label: string; color: 'green' | 'amber' | 'red' | 'grey' }`
  - `export function srpDetailMessage(state: SrpState, srpAction: SrpAction | null): string | null`
  - `export function findNameClash(name: string, locality: LocalityOption | undefined): string | null`
  - `export function effectivePermissions(p: PermissionSet, state: SrpState | null, action?: SrpAction['action']): PermissionSet`
  - `export function createPayload(input: { name: string; cluster: string; locality: string; createInSrp: boolean }): { identity: { nucleus: string; cluster: string; location?: string; srpLocality?: string } }`

- [ ] **Step 1: Failing tests** in `srp.test.ts`:
  - `srpStateFor`:
    - `('Neighborhood', true, null)` → `'IN_SRP'`
    - `('Neighborhood', false, null)` → `'LOCAL_ONLY'`
    - `status: 'pending'` → `'PENDING'`
    - `status: 'in_flight'` → `'PENDING'`
    - `status: 'refused'` → `'REFUSED'`
    - `status: 'failed'` → `'FAILED'`
    - `status: 'weird'` → `null`
    - `('Network', false, null)` → `null`
    - `('Population', false, null)` → `null`
    - `('', false, null)` → `'LOCAL_ONLY'` (an empty type means Neighborhood, as in Picker's `typeKey`)
    - `('Neighborhood', undefined, null)` → `null` (`inSrp` unknown, so no badge)
  - `srpBadge`:
    - IN_SRP → `{label:'SRP', color:'green'}`
    - PENDING → `{label:'SRP pending', color:'amber'}`
    - PENDING with `'delete'` → `{label:'Deleting in SRP', color:'amber'}`
    - REFUSED → `{label:'SRP refused', color:'red'}`
    - FAILED → `{label:'SRP error', color:'red'}`
    - LOCAL_ONLY → `{label:'Not in SRP', color:'grey'}`
  - `srpDetailMessage`:
    - REFUSED create with error `'Name taken'` → `'SRP refused this: Name taken. Rename it or move it to another locality to try again.'`
    - REFUSED delete with `individuals: 3, activities: 2` → `'3 people and 2 activities are still assigned in SRP. Move them in SRP, then try again.'`
    - FAILED → `'Something went wrong sending this to SRP. Contact an admin.'`
    - IN_SRP → `null`
  - `findNameClash`, with locality `{name:'Elm Locality', settings:[{name:'Elm Park', srpLinked:true, nuclei:['Elm Park']}, {name:'Oak Row', srpLinked:false, nuclei:['Oak Row North']}]}`:
    - `' elm park '` → `'Elm Park'`
    - `'OAK ROW NORTH'` → `'Oak Row North'`
    - `'Maple'` → `null`
    - an `undefined` locality → `null`
    - `''` → `null`
  - `effectivePermissions`:
    - PENDING with `'delete'` gives `canWrite`, `canChangeIdentity`, `canDelete` and `canAssignRoles` all false, other fields unchanged.
    - PENDING with `'create'` gives `canChangeIdentity:false` and leaves `canWrite` unchanged.
    - IN_SRP returns the input unchanged.
  - `createPayload`:
    - `{name:' Alpha ', cluster:'C', locality:'Elm Locality', createInSrp:true}` → `{identity:{nucleus:'Alpha', cluster:'C', srpLocality:'Elm Locality'}}`
    - the same with `createInSrp:false` → `{identity:{nucleus:'Alpha', cluster:'C', location:'Elm Locality'}}`
    - `locality:''` with `createInSrp:true` → `{identity:{nucleus:'Alpha', cluster:'C'}}`, with no `srpLocality`
- [ ] **Step 2:** Run `npx vitest run src/lib/srp.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement. Name comparison is `trim().toLocaleLowerCase()` against each Setting name and each entry of `nuclei`. Return the existing spelling.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: SRP status, badge copy and name pre-check logic`.

### Task 4: data layer: create in SRP, rename, SRP info on rows

**Files:**
- Modify: `web/src/lib/data.ts`, `web/src/types.ts`, `web/src/app/api/initial-data/route.ts`
- Test: `web/src/lib/data.test.ts`

**Interfaces:**
- Consumes: Task 1 client, Task 3 `srpStateFor`.
- Produces:
  - `types.ts`: `NucleusSummary.srpState: SrpState | null`; `NucleusDetail.srp: { state: SrpState | null; action: SrpAction | null }`.
  - `FormDataInput.identity` gains `srpLocality?: string` and `name?: string`.
  - `createRowData`: when `identity.srpLocality` is set, it calls `createNucleus(name, cluster, srpLocality)` and does **not** send `locationName`, because cluster-notebook places the nucleus.
  - `nucleusPatchFromFormData`: `identity.name` (trimmed, non-empty) maps to `patch.name`.
  - `getRowData` returns `srp` from `nucleusFields`.
  - `/api/initial-data` sets `srpState: srpStateFor(cn.nucleusType ?? '', cn.inSrp, cn.srpAction ?? null)` on each row.

- [ ] **Step 1: Failing tests** in `data.test.ts`:
  - `createRowData with srpLocality passes it to createNucleus and sends no locationName`: `createNucleus` is called with `('Alpha','NC-1 Test','Elm Locality')`, and `updateNucleus` is not called when there are no other fields.
  - `nucleusPatchFromFormData maps identity.name to patch.name`: `{identity:{name:' Beta '}}` → `{name:'Beta'}`, and `{identity:{name:'  '}}` → `{}`.
  - `getRowData returns srp state and action`: with mocked fields `inSrp:false` and `srpAction {action:'create', status:'refused', error:'Name taken', …}`, the result has `srp.state === 'REFUSED'` and `srp.action.error === 'Name taken'`.
- [ ] **Step 2:** Run `npx vitest run src/lib/data.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement, and in `/api/nucleus` POST, also delete `formData.identity.name` when `!canChangeIdentity`. That already happens, because the whole `identity` object is deleted; confirm it.
- [ ] **Step 4:** Run `npm test && npx tsc --noEmit`. Expected: PASS and exit 0.
- [ ] **Step 5:** Commit: `feat: create-in-SRP and rename through the data layer; SRP state on rows`.

### Task 5: API routes for localities and Push to SRP

**Files:**
- Create: `web/src/app/api/locations/route.ts`, `web/src/app/api/nucleus/push-srp/route.ts`

**Interfaces:**
- Consumes: `getLocationOptions`, `getNucleusFields`, `pushNucleusToSrp`, `getNucleusPermissions`, `clusterNotebookErrorResponse`.
- Produces:
  - `GET /api/locations?cluster=<name>` returns `{ localities: LocalityOption[] }`.
    - 401 when unauthenticated, 400 when `cluster` is missing.
    - 403 unless `getNucleusPermissions(cluster).createableEntityTypes.includes('nucleus')`.
  - `POST /api/nucleus/push-srp` with body `{ name }` returns `{ success: true }`.
    - 401 when unauthenticated, 400 when `name` is missing, 404 when `getNucleusFields(name)` is null.
    - 403 unless the nucleus's cluster's `createableEntityTypes` includes `'nucleus'`.
    - Errors go through `clusterNotebookErrorResponse`.

There are no route tests in this repo. Keep the routes thin, so that all logic is in already-tested lib functions.

- [ ] **Step 1:** Read the route-handler guide under `web/node_modules/next/dist/docs/`, then mirror `app/api/nucleus/route.ts`'s auth and error pattern.
- [ ] **Step 2:** Implement both routes.
- [ ] **Step 3:** Run `npx tsc --noEmit && npx eslint src/app/api/locations/route.ts src/app/api/nucleus/push-srp/route.ts`. Expected: exit 0.
- [ ] **Step 4:** Commit: `feat: API routes for cluster localities and Push to SRP`.

### Task 6: Create dialog: locality, Create in SRP, name check

**Files:**
- Modify: `web/src/components/CreateNucleusModal.tsx`

**Interfaces:**
- Consumes: `GET /api/locations` (Task 5); `findNameClash`, `createPayload` (Task 3); the existing `PUT /api/nucleus`.

Layout, from the spec, in this order:
- **Name.**
- **Clash warning:** `⚠ "<existing>" already exists in <locality>`, shown when `findNameClash` returns a name.
- **Cluster.**
- **Locality:** a `<select>` with "(none)" first, then the cluster's localities.
- **"Create in SRP" checkbox:** disabled while no locality is chosen, with the hint `Choose a locality to create this in SRP`.

Behavior:
- **Changing the cluster** fetches its localities and resets the locality to "(none)" and the box to unticked. Do this in the change handler, not an effect.
- **Clearing the locality** unticks the box.
- **Create is disabled** when the box is ticked and there's a clash.
- **Submit** sends `createPayload(...)` as `formData`.
- **A 409 or 400** response's `error` shows in the dialog.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit && npx eslint src/components/CreateNucleusModal.tsx`. Expected: exit 0.
- [ ] **Step 3: Browser check** (needs local cluster-notebook on `fn-lifecycle`):
  - Choosing a cluster fills the localities.
  - The box is disabled until a locality is chosen.
  - Typing a name that exists in the locality with different case shows the warning.
  - A create with the box ticked opens the nucleus editable, with an amber "SRP pending" badge once Task 7 lands.
- [ ] **Step 4:** Commit: `feat: locality and Create in SRP in the new-nucleus dialog`.

### Task 7: SRP badge in My Nuclei and on the nucleus page, plus Push to SRP

**Files:**
- Create: `web/src/components/SrpBadge.tsx`
- Modify: `web/src/components/Picker.tsx` (the nucleus row, around line 214-220), `web/src/components/DetailView.tsx` (the Location field, around line 888-920)

**Interfaces:**
- Consumes: `srpBadge`, `srpDetailMessage` (Task 3); `NucleusSummary.srpState`, `NucleusDetail.srp` (Task 4); `POST /api/nucleus/push-srp` (Task 5).
- Produces:
  - `SrpBadge({ state, action }: { state: SrpState | null; action?: SrpAction['action'] })` renders nothing for `null`. Otherwise it renders a small pill, 11px with matching existing badge padding, with colors from the existing palette:
    - green `#2f855a` on `#f0fff4`
    - amber `#b7791f` on `#fffff0`
    - red `#c53030` on `#fff5f5`
    - grey `#718096` on `#f7fafc`
  - DetailView gains the prop `onReload: () => void`, which AppClient wires up in Task 8.

DetailView:
- Next to the Location label, render `<SrpBadge>`.
- Below the badge, render `srpDetailMessage` when it is non-null.
- When the state is PENDING, add a small "Refresh" link that calls `onReload`.
- Show a **"Push to SRP"** button when all of these hold:
  - the state is `LOCAL_ONLY`
  - `row.locationType` is `LOCALITY`, or it is `SETTING` and that Setting isn't `srpLinked`
  - `permissions.createableEntityTypes.includes('nucleus')`. This uses the nucleus's own permissions as a proxy; the route re-checks against the cluster.

  It POSTs to `/api/nucleus/push-srp`, then calls `onReload`, and shows any `error` in the existing save-status bar.

Picker: render `<SrpBadge state={r.srpState} />` at the end of each nucleus row, on nucleus rows only.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit && npx eslint src/components/SrpBadge.tsx src/components/Picker.tsx src/components/DetailView.tsx`. Expected: exit 0.
- [ ] **Step 3: Browser check at phone width (375px):**
  - Badges don't wrap the row name awkwardly.
  - Network and Population rows show no badge.
  - Push on a local-only nucleus at a Locality turns the badge amber after the reload.
- [ ] **Step 4:** Commit: `feat: SRP status badges and Push to SRP`.

### Task 8: rename, reload and queued delete in AppClient and DetailView

**Files:**
- Modify: `web/src/components/AppClient.tsx`, `web/src/components/DetailView.tsx`, `web/src/lib/srp.ts`
- Test: `web/src/lib/srp.test.ts`

**Interfaces:**
- Consumes: `effectivePermissions` (Task 3); `NucleusDetail.srp` (Task 4).
- Produces, in `lib/srp.ts`:
  - `export function reloadOutcome(status: number): 'show' | 'gone' | 'error'`: 200 → `show`, 404 → `gone`, anything else → `error`.
  - `export function nextNameAfterRename(oldName: string, submitted: string, ok: boolean): string`: returns the trimmed `submitted` when `ok` and it is non-empty, else `oldName`.

AppClient:
- `reloadNucleus(name)` fetches `/api/nucleus?name=`. Per `reloadOutcome`:
  - `show` sets the detail.
  - `gone` calls `handleBack()`, which also reloads the list.
  - `error` sets the error as today.
- Pass `onReload={() => reloadNucleus(selectedNucleus)}` to DetailView.
- Pass `onRenamed={(newName) => loadInitialData(newName)}`. That reloads permissions and opens the nucleus under its new name, the same mechanism as PR #40.
- Pass DetailView `permissions={effectivePermissions(perms, detail.srp.state, detail.srp.action?.action)}`.

DetailView:
- **Nucleus name:** editable (text input, save on blur) when `permissions.canChangeIdentity` and `detail.srp.state` is `LOCAL_ONLY` or `REFUSED`; read-only otherwise. Replace the comment at around line 876-889 that says no rename mutation exists.
  - On blur with a changed value, `saveField({ identity: { name: value } }, 'Nucleus')`.
  - On success, call `onRenamed(nextNameAfterRename(row.nucleus, value, true))`.
  - On error, revert the field and show the error, using the existing save-status bar.
- **Delete:** after a successful `DELETE`, call `onReload()` instead of `onBack()`. `reloadOutcome` sends a gone nucleus back to the list, and a queued one stays with "Deleting in SRP".

- [ ] **Step 1: Failing tests** in `srp.test.ts`:
  - `reloadOutcome(200) === 'show'`, `(404) === 'gone'`, `(502) === 'error'`, `(403) === 'error'`.
  - `nextNameAfterRename('Alpha', ' Beta ', true) === 'Beta'`, `('Alpha', 'Beta', false) === 'Alpha'`, `('Alpha', '  ', true) === 'Alpha'`.
- [ ] **Step 2:** Run `npx vitest run src/lib/srp.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the lib functions and wire up AppClient and DetailView. The `/api/nucleus` GET must return 404 for a missing nucleus; it already does.
- [ ] **Step 4:** Run `npm test && npx tsc --noEmit && npx eslint src/components/AppClient.tsx src/components/DetailView.tsx src/lib/srp.ts`. Expected: PASS and exit 0.
- [ ] **Step 5: Browser check:**
  - Renaming a refused nucleus shows the new name in the header and list, and the badge turns amber.
  - Autosaving any field after the rename succeeds.
  - Deleting a local-only nucleus returns to the list.
  - Deleting an in-SRP nucleus stays on the page with "Deleting in SRP", with fields read-only.
- [ ] **Step 6:** Commit: `feat: rename nuclei not yet in SRP; handle queued SRP deletes`.

### Task 9: whole-branch verification and docs

**Files:**
- Modify: `CLAUDE.md` (Open threads: point at issue #42 and the `fn-lifecycle` deploy dependency)

- [ ] **Step 1:** Run `cd web && npm test && npx tsc --noEmit && npm run lint`. Expected: all exit 0.
- [ ] **Step 2: Walk through the spec's Goals 1-5 in the browser** against local cluster-notebook on `fn-lifecycle`. Don't create anything in live SRP without the owner's go-ahead (#32: use a throwaway name).
- [ ] **Step 3:** Add one line to CLAUDE.md "Open threads": `Create in SRP (feat/create-in-srp) must not merge before cluster-notebook deploys fn-lifecycle with inSrp, error codes and re-queue; in-SRP rename is #42.`
- [ ] **Step 4:** Commit: `docs: note fn-lifecycle dependency and #42 in CLAUDE.md`.
