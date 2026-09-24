# Real Authorization (cluster-notebook-backed) Design

**Date:** 2026-09-24
**Status:** Approved

## Problem

Since the Clerk auth swap, `getAccess()` (`web/src/lib/access.ts`) has been a
deliberate stopgap: every authenticated user is treated as global admin,
tracked in [neighborhood-updater#37](https://github.com/kalantar-bahai/neighborhood-updater/issues/37).
cluster-notebook has since started enforcing real per-user roles server-side,
which the stopgap can't see — a write our stub allows locally can still be
rejected upstream (surfaced first as an uncaught-exception crash, then fixed
to a generic 502, then to a real 403 once cluster-notebook exposed
`extensions.code: "FORBIDDEN"`). None of those fixes let the *app* know a
user's real capabilities in advance — every rejection is still learned from
a failed write, not shown upfront.

cluster-notebook has since built, and confirmed live, everything needed to
replace the stopgap with real per-entity permissions: `PermissionSet`,
`myPermissions`, `rolePermissions`, `assignableRoleDetails`, and
`isAdministrator`. This design replaces `getAccess()` and every consumer of
its old `Role`/`roleMap` shape with the real thing.

## Goals

- Replace the everyone-admin stopgap with real per-nucleus permissions
  sourced from cluster-notebook, fetched in the same request that already
  lists nuclei (no N+1).
- Drop the internal `Role` enum (`read`/`read-write`/`collaborator`/`admin`)
  entirely — it can't express what cluster-notebook actually grants (this is
  the exact problem that started this work: `canWrite` without
  `canChangeIdentity` has no clean `Role` value).
- Fix real, newly-discovered gaps in the current UI's permission gating
  along the way (see "Current gating bugs this fixes" below) — not
  optional cleanup, these are the concrete reason this work matters beyond
  cluster-notebook's own enforcement.
- Retire the Sheet-backed `/api/access` route, `AccessPanel.tsx`, and the
  `Access` Sheet tab's read/write code entirely, replacing them with a new
  "manage access" experience built on cluster-notebook's own role-assignment
  system (`updateNucleusWorkers` + `assignableRoleDetails`).

## Non-goals

- Building any new UI for `protagonist`/`promoter` role semantics —
  cluster-notebook confirmed these are genuinely undecided on their side
  (their own issue #14), not something this app should invent meaning for.
  They stay informal: freely assignable whenever `canAssignRoles` is true.
- Migrating or preserving the `Access` Sheet tab's existing data. It's
  simply stopped being read; the Google Sheet itself isn't touched.
- A per-cluster-aware "create nucleus" entry point in the top-level picker.
  See "Create-nucleus button visibility" below for the judgment call this
  makes instead.
- Any change to how NextAuth/Clerk identity itself works — this only
  replaces `getAccess()`'s internals and its consumers' shape, per the seam
  that Clerk auth swap deliberately built for this moment.

## cluster-notebook's confirmed API surface

All confirmed live via direct consultation (cross-session messages,
2026-09-24), not assumed:

```graphql
type PermissionSet {
  canRead: Boolean!
  canWrite: Boolean!            # ordinary fields only
  canChangeIdentity: Boolean!   # Nucleus name/location-class fields (Type, Stage)
  canDelete: Boolean!
  canAssignRoles: Boolean!      # any role-assignment standing here at all
  assignableRoles: [String!]!   # which RECOGNIZED roles specifically -- informal
                                 # roles are always assignable whenever
                                 # canAssignRoles is true, regardless of this list
  createableEntityTypes: [String!]!   # subset of "nucleus"/"setting"/"individual"/"activity"
}

type RoleGrant {
  role: String!
  permissions: PermissionSet!
}
```

- `Nucleus.myPermissions: PermissionSet!` — a field, so a list of nuclei
  costs one request regardless of size.
- `Query.myPermissions(entityName: String!): PermissionSet` — ad hoc, for
  one entity (Cluster/Locality/Setting/Nucleus). Null if `entityName`
  doesn't match anything; all-false if not authenticated.
- `Query.rolePermissions(role: String!, entityName: String!): PermissionSet`
  — what a role grants at a specific entity, independent of who's signed
  in. Unrecognized role string → all-false, not an error.
- `Nucleus.assignableRoleDetails: [RoleGrant!]!` / `Query.assignableRoleDetails(entityName: String!): [RoleGrant!]`
  — same batching pattern as `myPermissions`, pairs each grantable role name
  with its actual `PermissionSet` so a picker can describe what a role does,
  not just its name.
- `Query.isAdministrator: Boolean!` — the one true global/org-wide concept
  (the `Administrator` role, no entity attached). False when unauthenticated.
  "Setting" is **not** global — confirmed it's just the smallest geography
  tier (Cluster > Locality > Setting), same category as Cluster/Locality.
  An earlier assumption in this project's design history that Setting was
  global was wrong; corrected here.
- Permission denials carry `extensions.code: "FORBIDDEN"` on the GraphQL
  error — already wired into `ClusterNotebookForbiddenError` /
  `clusterNotebookErrorResponse` (`web/src/lib/clusterNotebook.ts`,
  `web/src/lib/clusterNotebookError.ts`). No change needed there.
- Role assignment (both informal and recognized roles) is the *same*
  `updateNucleusWorkers(name, role: String!, personIds)` mutation already
  used for the worker lists, and the *same* `nucleus(name).workers(role:
  String!)` query for reading current holders — no separate mechanism.
  One exception: `"Administrator"` is never assigned through this mutation
  (it can't express global scope) — `assignableRoles` already excludes it
  for everyone, so this needs no special-casing on our side.
- Create-nucleus gating: `myPermissions(entityName: <target Cluster's
  name>).createableEntityTypes.includes('nucleus')` — anchored on the
  Cluster the new nucleus would belong to, not global.
- Delete-nucleus gating: `myPermissions(entityName: <that nucleus's
  name>).canDelete` — anchored on the nucleus itself, not its parent
  Cluster.

Which of our five worker-list role names are recognized (confirmed against
cluster-notebook's actual code, not inferred):

| Role name | Recognized? | Grants |
|---|---|---|
| `accompanier` | Yes | read + write |
| `contact` | Yes | read + write (same tier as accompanier) |
| `abm-assistant` | Yes | read-only, no write |
| `protagonist` ("Helping") | No — informal | n/a, cluster-notebook's own open question (#14) |
| `promoter` ("Promoting") | No — informal | n/a, same open question |

Note: cluster-notebook found and fixed a real bug on their side while
verifying this — `abm-assistant` (our real hyphenated string) had been
registered as `abm_assistant` (underscore) from an unverified guess, so it
matched nothing. Already fixed and confirmed live; no action needed on our
side, but worth recording since it means `abm-assistant` gating was
previously a no-op on their end regardless of what we sent.

## Current gating bugs this fixes

Auditing every `role`/`isAdmin`/`canWrite`/`canManageAccess` use in
`DetailView.tsx` against cluster-notebook's confirmed recognized-role list
surfaced real, pre-existing gaps — not just the stopgap:

- **Accompanying's worker-list trigger has no permission gate at all
  today** (`DetailView.tsx:942`, `onLabelClick={() =>
  setShowAccompaniersModal(true)}`) — unlike Contact (`:867`) and
  ABM-Assistant (`:880`), which are at least `isAdmin`-gated. Since
  `accompanier` is now confirmed a real, recognized, read+write grant (not
  informal), this was a real gap: anyone could open the modal regardless of
  role (the server-side `/api/workers` POST check caught unauthorized
  *saves*, but the UI itself never reflected who should even be trying).
  This design closes it the same way as Contact/ABM-Assistant.
- **Danger Zone (delete) is gated by `isAdmin`** (`:1079`), i.e. today's
  stopgap-derived global-admin-like flag. Per cluster-notebook, delete is a
  *per-nucleus* `canDelete` check, not global. A future real per-nucleus
  admin who isn't a global `Administrator` would have been wrongly denied
  under the old model (harmless today since the stopgap made everyone
  "admin" everywhere) — this design fixes the check to be correctly scoped.

## Data model

`web/src/lib/access.ts` is rewritten. The `Role` type and `AccessEntry`
type (`web/src/types.ts`) are deleted — nothing imports `AccessEntry` once
`/api/access`/`AccessPanel.tsx`/`lib/data.ts`'s Sheet functions are gone.

```ts
// New shape, replacing UserAccess/Role entirely
export interface NucleusPermissions {
  canRead: boolean;
  canWrite: boolean;
  canChangeIdentity: boolean;
  canDelete: boolean;
  canAssignRoles: boolean;
  assignableRoles: string[];
  createableEntityTypes: string[];
}

export interface UserAccess {
  isAdministrator: boolean;
  // Keyed by nucleus name (normalized lowercase/trimmed, matching today's
  // `norm()` convention). No '*' wildcard -- isAdministrator is the
  // separate, explicit global concept now.
  permissions: Record<string, NucleusPermissions>;
}

export async function getAccess(userId: string): Promise<UserAccess> {
  // Queries cluster-notebook: Query.isAdministrator, and nuclei's
  // myPermissions (already fetched alongside the nuclei list itself in
  // /api/initial-data -- see below). For routes that need a single
  // nucleus's permissions without the full list (nucleus/workers/
  // individuals routes), uses Query.myPermissions(entityName) directly
  // instead of re-fetching every nucleus.
}
```

`getAccess()`'s exact call shape differs by route (see below) since some
routes only need one nucleus's permissions, not the full list — this
function is the shared piece, not a single one-size query.

## Routes

- **`/api/initial-data` (GET):** the nuclei-listing query gains
  `myPermissions { ... }` per nucleus (one request, no N+1, per
  cluster-notebook's own design intent). Rows are filtered to
  `myPermissions.canRead`. Response includes `isAdministrator` and a
  per-nucleus `permissions` map instead of `roleMap`.
- **`/api/nucleus` (GET/POST/DELETE/PUT):**
  - GET: requires `myPermissions(entityName).canRead`.
  - POST: requires `canWrite` for the ordinary fields; separately requires
    `canChangeIdentity` to accept `identity`/`stage` changes (stripped
    otherwise, same strip-not-reject pattern as today, now checking the
    right flag).
  - DELETE: requires `canDelete` on that specific nucleus (not global —
    see "Current gating bugs" above).
  - PUT (create): requires `myPermissions(entityName: <chosen Cluster>).createableEntityTypes.includes('nucleus')`.
- **`/api/workers` (GET/POST):**
  - GET: requires `canRead`.
  - POST: for `protagonist`/`promoter` (informal), requires `canAssignRoles`.
    For `accompanier`/`contact`/`abm-assistant` (recognized), additionally
    requires that role name in `assignableRoles`.
- **`/api/individuals` (GET/POST):** requires `canWrite` (unchanged shape,
  just re-keyed off the new permission field instead of the old role
  string).
- **`/api/access`:** deleted. `AccessPanel.tsx` deleted.
  `lib/data.ts`'s `getAccessEntries`/`saveAccessEntries` deleted.
  `ACCESS_TAB`/`ACCESS_COL` (`web/src/lib/config.ts`) deleted. The `Access`
  Google Sheet tab itself is untouched (Non-goals) — just no longer read.

## DetailView.tsx flag mapping

Every current use of `role`/`isAdmin`/`canWrite`/`canManageAccess` in
`DetailView.tsx`, and what replaces it (component receives a
`permissions: NucleusPermissions` prop for the open nucleus instead of
`role`/`roleMap`):

| Today | Lines | Becomes |
|---|---|---|
| `canWrite` (population/activities/notes/gatherings/narrative fields) | `:954-1053` | `permissions.canWrite` |
| `isAdmin` (Type/Stage: dropdown vs. read-only text) | `:853, :857` | `permissions.canChangeIdentity` |
| `isAdmin` (Contact worker-list trigger) | `:867` | `permissions.canAssignRoles && permissions.assignableRoles.includes('contact')` |
| `isAdmin` (ABM-Assistant worker-list trigger) | `:880` | `permissions.canAssignRoles && permissions.assignableRoles.includes('abm-assistant')` |
| *(no gate today — see "Current gating bugs")* (Accompanying worker-list trigger) | `:942` | `permissions.canAssignRoles && permissions.assignableRoles.includes('accompanier')` |
| *(no gate today, stays that way)* (Helping/protagonist, Promoting/promoter triggers) | `:914, :921` | `permissions.canAssignRoles` (informal — membership in `assignableRoles` not required) |
| `canManageAccess` (old per-nucleus AccessPanel card) | `:1061` | `permissions.canAssignRoles` (gates the new manage-access card instead) |
| `isAdmin` (Danger Zone / delete) | `:1079` | `permissions.canDelete` |

`AppClient.tsx`'s `isGlobalAdmin` (`roleMap['*'] === 'admin' \|\| 'collaborator'`,
gating the top-level "Add nucleus" button and the top-level AccessPanel
card) becomes `isAdministrator` for the Add button (see "Create-nucleus
button visibility" below); the top-level AccessPanel card is dropped
entirely, not replaced (see "New manage access experience" below).

## New "manage access" experience

Replaces both `AccessPanel` usages (`AppClient.tsx`'s top-level card and
`DetailView.tsx`'s per-nucleus card) with a per-nucleus card in
`DetailView.tsx` only — the top-level, cross-nucleus version in
`AppClient.tsx` is dropped rather than rebuilt, since cluster-notebook's
model is inherently per-entity (there's no cross-nucleus "all access
grants" view to replace it with; `isAdministrator` users can already see
and manage every nucleus's own card individually).

The new card, shown when `canAssignRoles` is true for that nucleus:

- Fetches `assignableRoleDetails` for the nucleus — a list of `{role,
  permissions}` pairs the current user may grant here.
- For each grantable role, shows a real description built from its
  `PermissionSet` (e.g. "can edit everything including this nucleus's
  name/location" when `canChangeIdentity` is true) rather than a bare role
  name.
- Clicking a role opens the *existing* `WorkerListModal` component,
  unchanged, instantiated with `role={thatRoleName}` — reusing exactly the
  same add/remove/search UI already used for accompanier/protagonist/etc.,
  since `updateNucleusWorkers`/`workers(role:)` is the same mechanism for
  recognized and informal roles alike. No new list-editing UI is built.

## Create-nucleus button visibility

`AppClient.tsx`'s "Add" button (opens `CreateNucleusModal`) is shown at the
top-level picker, before any specific Cluster is chosen — there's no single
entity to check `createableEntityTypes` against at that point. This design
gates the button's *visibility* on `isAdministrator` (simplest, matches
today's existing coarse "some kind of global privilege" gate) while the
real per-Cluster enforcement still happens at submission time in `/api/nucleus`
PUT, once the user has actually picked a Cluster in the modal. A user who
isn't a global `Administrator` but does have `createableEntityTypes`
including `'nucleus'` on some specific Cluster won't see the button at all
under this design — a real limitation, not a crash or a silent failure, and
explicitly called out here as a judgment call rather than a cluster-notebook
requirement. Revisit if that turns out to matter in practice.

## Testing

- `web/src/lib/access.ts` gets new unit tests replacing the stopgap's
  fixed-return tests: mock cluster-notebook's `isAdministrator`/
  `myPermissions` responses, assert the resulting `UserAccess` shape.
- No existing route-level tests exist for any of the 5 API routes (matches
  the pattern established in the Clerk auth swap — this isn't a gap this
  design introduces).
- Manual verification: sign in as an account with a real, non-administrator
  cluster-notebook role (e.g. Michael's ABM-Assistant grant) and confirm
  read-only rendering matches what `myPermissions` actually returns, no
  round-trip through a failed save needed to discover it.

## Rollout

Lands on `cluster-notebook-integration`, no active users, no migration
period needed. The stopgap (`getAccess()` always returning admin) and this
real implementation are not run side by side — this design replaces it
outright, closing issue #37.
