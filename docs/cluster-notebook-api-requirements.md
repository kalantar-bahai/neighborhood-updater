# nucleus-assistant → cluster-notebook: target read/write requirements

Written from nucleus-assistant's side, for the cluster-notebook session, per the incremental migration described in `docs/superpowers/specs/2026-09-13-cluster-notebook-integration-design.md`. This documents nucleus-assistant's **full target surface** — everything the app will eventually need from cluster-notebook — so the schema can be designed toward the whole shape. We are implementing against it incrementally; today only the devotional-gathering slice (already built) is wired up.

Source of truth for current field shapes: `web/src/types.ts` (`NucleusRow`, `NucleusSummary`, `NucleusDetail`, `InitialData`), `web/src/lib/config.ts` (`COL`), `web/src/lib/data.ts`.

This is additive to what your own `docs/data-model.md` ("Nucleus Assistant" section) and `docs/requirements.md` already captured — that analysis is more thorough on the *why*; this doc is the concrete *what*, shaped as operations.

## 1. Nucleus summary list (Picker page)

**Read**: all nuclei the caller can see, with enough per-nucleus data to compute activity totals and group by type. Today: `NucleusSummary` — nucleus, parentNucleus, grouping, cluster, locality, nucleusType, stage, totalAct, totalPart, totalFof (summed across CC/JYG/SC/Devotionals). Needs pagination/filtering eventually (your own doc already flags `nuclei` as unfiltered/unpaginated) — not urgent at current scale (tens of nuclei), but will matter at the multi-cluster scale your requirements doc targets.

**Write**: none (this is a derived/aggregate view).

## 2. Nucleus detail (read)

**Read**: one nucleus by name, full `NucleusRow` shape:
- Identity: nucleus name, parentNucleus, nucleusType, grouping, cluster, pg, clusterCode (admin-only to edit, see §7)

**parentNucleus — done, 2026-09-14.** You added `parentNucleus: Nucleus` (one-hop lookup, null if unset) and `updateNucleus`'s `parentNucleusName: String` patch field (same partial-update pattern as everything else; `null` clears it). This is our "pocket" grouping feature — one nucleus nested under another in the picker (unrelated to the grouping/cluster hierarchy) — and was the last field with any Sheet dependency; it's now fully wired on both read (`getRowData`) and write (`saveRowData`/`createRowData`), no Sheet involvement left.

**Corrected, 2026-09-13 (the user directly):** the nucleus *name* itself is now treated as canonical from your side, not ours. Our picker (`/api/initial-data`) is now driven by iterating your `nuclei` list (not the Sheet's rows filtered by membership in yours). The name displayed/used as the lookup key everywhere in our app is your `Nucleus.name`, not the Sheet's own copy of it. Consequence: our "Nucleus" field is now read-only for any existing nucleus (same treatment as Locality/Grouping/Cluster/PG) — renaming via our UI only ever wrote to the Sheet, and since you have no rename mutation, that edit would've silently reverted on next load. It stays editable only when creating a brand-new nucleus (which doesn't exist in your system yet). No change needed on your side — this is purely how we consume your existing `name` field, not a new field request.

**Sheet dependency for authorization/existence — eliminated, 2026-09-14.** The Sheet is no longer consulted at all for per-user authorization or to check whether a nucleus "exists": our own `Access` tab's role entries (a wildcard `*`, or the exact nucleus names an entry names) are the complete authorization answer on their own — cross-referencing those names against Sheet rows was redundant for named entries and, for a wildcard admin, silently capped "everything" at "everything with a Sheet row" (a real bug — a nucleus created without one was invisible to a wildcard admin). Existence is now purely your `nuclei`/`nucleus(name)` answer. This was the last non-field-level Sheet dependency in the app; combined with parentNucleus (above) and create no longer seeding a Sheet row (§4), nucleus creation/access has zero Sheet dependency now.
- Standard: locality, stage, contact name + email, auxBoard, makeup
- Population: totalPop, totalHH, indNum, indPct, hhNum, hhPct (currently hand-entered aggregates; per your data model, should become derived rollups once real Individual/Household records exist — until then, needs to accept a manually-entered aggregate). **Done, 2026-09-13**: totalPop/totalHH/indNum/hhNum now wired to your `population`/`households`/`connectedPopulation`/`connectedHouseholds` fields. indPct/hhPct remain purely client-side computed (percentage of total) — no cluster-notebook equivalent, confirmed not needed.
- Activities: four rollups (ccs, jygs, scs, devotionals), each `{act, part, fof}`. **Done, 2026-09-14**: all four now wired to `ActivitySummary` via `childrensClasses`/`juniorYouthGroups`/`studyCircles`/`devotionalGathering` + the shared `updateActivitySummary` mutation (`ActivityType` enum values are singular: `CHILDRENS_CLASS`/`JUNIOR_YOUTH_GROUP`/`STUDY_CIRCLE`/`DEVOTIONAL_GATHERING`). We also consume `ActivitySummary.isOverridden` now — one flag per activity per nucleus (not per-field) — to highlight manually-entered values in the UI, replacing our old per-field diff against a separately-fetched SRP sheet row entirely. That SRP-sheet cross-check (§7) is now unused for these four fields.
- Qualitative fields, each paired with notes: level, supported/notesSupported, presence/notesPresence, involved/notesInvolved, efforts/notesEfforts, gatherings/notesGatherings
- ~~protagonists/accompaniers as free-text counts~~ — **retired, 2026-09-14**. No longer read/written at all; the Overview card ("Promoting"/"Helping"/"Accompanying") now shows the `protagonist`/`accompanier`/`promoter` role lists (§5) directly, no separate hand-typed count or mismatch signal.
- narrative (free text). **Done, 2026-09-13**: wired to your `Nucleus.narrative` field, plain string, no special semantics needed.

**Correction, 2026-09-13** — verified directly against `web/src/components/DetailView.tsx`, since your read of which qualitative fields are live turned out wrong in both directions:
- **Actually live in the UI today:** `stage` (dropdown for admins / read-only text otherwise, in the Identity card; also shown as a colored badge per nucleus in the `Picker.tsx` list — values `Potential/1, Initial/2, Emerging/3, Expanding/4, Advanced/5, Advanced+/6`), `locality` (dropdown for admins / read-only otherwise in the Identity card, fixed client-side option list `LOCALITY_OPTIONS`; also shown as the subtitle under each nucleus in `Picker.tsx`), `makeup` (free-text "Makeup of Population" textarea, Population card), `presence`/`notesPresence` (the "Social Action" toggle — NOT `efforts`, which has no UI at all), `gatherings`/`notesGatherings` ("Regular Gatherings / Festivals" toggle, correctly mapped to your `hasCommunityGatherings`), and `notesPrevalence` (the general "Notes" field under "Workers & Prevalence", paired with protagonists/accompaniers, not with `level`).
- **Actually dead (no UI, no plans to revive) — removed entirely, 2026-09-14:** `level` (our own field of this name — see resolution below), `supported`/`notesSupported`, `involved`/`notesInvolved`, `efforts`/`notesEfforts`. These weren't just unused — `saveRowData` was still round-tripping their stale page-load values back to the spreadsheet on every unrelated save, silently overwriting anyone editing those columns directly in Sheets. Removed from our data model entirely (not requesting anything from you — this was purely internal cleanup); the spreadsheet columns themselves are untouched for anyone still maintaining them by hand.
- **Field-name mapping is nucleus-assistant's job, not yours** — matches your own stated policy of not naming your fields after any one client's, though in this case you ended up renaming to match ours directly (see below).

**Resolved, 2026-09-13**: your schema briefly had both a `level: String` field (added with our `stage`'s real values, `Potential/Nascent/.../Advanced+` — "Nascent" was your own correction-in-progress typo for "Initial") and an unrelated, uncommented `stage: Int` (stale leftover from an early schema sketch, nothing read/wrote it). You've since removed `stage: Int` and renamed `level` → `stage` (kept as `String`, values corrected to `Initial/2` not `Nascent/2`) — one field, directly named to match our `stage`, no mapping needed. `makeup` maps to your `populationMakeup` (confirmed). ~~`locality` is a plain, unconstrained string on your side~~ — see 2026-09-13 breaking-change correction below, this changed. Our own (separate, dead) `level` field stays unmapped/unmodeled on your side — legacy data, not carried forward.

**Breaking change, 2026-09-13**: `locality` was a hand-entered string on your side; the user found it was wrong relative to your own tracked structure (e.g. Kingswood's hand-typed `locality` was "Kingswood", but its real `location` chain resolves to "Chapel Hill"). You corrected it: `locality` on `Nucleus` is now a **read-only derived value** (walked up from `location`'s containment chain to the nearest Locality-type entity, or null if the chain never reaches one), and `NucleusPatch.locality` was **removed entirely** — writing it now fails GraphQL validation. Nothing currently sets `location`/`locationId` from our side either, so there's no write path to influence this value at all right now. On our side: stopped sending `locality` in `updateNucleus` calls (it was being sent on every single save, not just locality edits, so this was a live break until fixed); the "Locality" field in `DetailView.tsx` is now always read-only (was an admin-editable dropdown against a client-side option list, which is now dead code, removed). If a real write path for `location` ever gets designed, revisit.

**Done, 2026-09-13**: `presence`/`notesPresence` (our "Social Action" toggle) and `gatherings`/`notesGatherings` (our "Regular Gatherings / Festivals" toggle) now wired to your `hasSocialAction`/`socialActionDescription` and `hasCommunityGatherings`/`communityGatheringDescription`. Confirmed your booleans are full tri-state (true/false/null), matching our Yes/No/never-touched exactly — no lossy mapping needed. `level`, `supported`/`notesSupported`, `involved`/`notesInvolved`, `efforts`/`notesEfforts` remain dead, no UI, not modeled on your side either.

**Contact — done, 2026-09-13.** `contact`/`email` (the free-text identity strings above) are retired. Contact is now the same `Individual`/`RoleInNE` pattern as §5's worker lists, using a new `contact` role — the only difference is it holds at most one person (picking/creating someone replaces the current occupant rather than appending). Contact Email is a derived display of that `Individual.email`, not a separately stored value — no write path for it exists or is needed. Uses your existing `workers(role)`/`updateNucleusWorkers`/`individuals`/`createIndividual` operations unchanged; `role` being an open string (per our original §5 request) is what let us add `contact` without any schema change on your side.

**auxBoard — done, 2026-09-13.** You added `Cluster.auxiliaryBoardMembers` (String, nullable, read-only, no mutation): plain text, comma-separated `"<Name> (<Portfolio>)"` entries sourced from your SRP data. We map it straight to our `auxBoard` field, same read-only treatment as `groupOfClusters`/`growthMilestone` above it in the Identity card. This is a stand-in — real per-person linkage (an `Individual` + `RoleInNE` per ABM, portfolio parsed out) is explicitly deferred on your side, not something we're asking for now.

## 3. Nucleus detail (write)

**Write**: update any subset of the above fields for one nucleus, by name. Today this is one `saveRowData(name, formData)` call that writes whichever fields are present in `formData` (partial update semantics — omitted fields are left alone). A single broad "patch nucleus" mutation (rather than one mutation per field) would match this pattern most directly, though per-field mutations (as already done for devotionals) also work if patch semantics are preserved per field.

**Field sensitivity — updated, 2026-09-24.** Two tiers now come from your own `PermissionSet`, not a role name on our side: `canWrite` gates the standard fields (locality — already read-only regardless, see above — stage, makeup, activities, and the protagonist/promoter worker lists); `canChangeIdentity` additionally gates just `nucleusType` and `stage`'s write path specifically (not the read-only identity fields like nucleus/parentNucleus/grouping/cluster/pg/clusterCode, which stay read-only for everyone regardless of any permission). Contact, ABm Assistant, and Accompanying are no longer admin-gated at all — they're your *recognized* roles now, gated by whether the caller's `assignableRoles` includes that specific role name. Enforcement is no longer solely on our side: we still strip disallowed fields client-side as defense-in-depth, but you reject unauthorized mutations independently now too (`extensions.code: "FORBIDDEN"`, which we detect and surface as a real error).

## 4. Nucleus create / delete

**Write**: create a new nucleus (name + all fields from §2, conflict error if name already exists) and delete a nucleus by name. **Write — updated, 2026-09-24.** No longer global-admin-gated. Create checks `createableEntityTypes.includes('nucleus')` via `myPermissions(entityName: <the target Cluster's name>)` — anchored on the Cluster the new nucleus would belong to. Delete checks `canDelete` via `myPermissions(entityName: <that nucleus's name>)` — anchored on the nucleus itself, not its parent Cluster. Both per-entity now, matching your model.

**Create — done, 2026-09-14.** Wired to `createNucleus(name: String!, clusterName: String!): Nucleus` + the new top-level `clusters: [Cluster!]!` query (for our picker). Identity-only at creation, as we settled on together: name + cluster is all `createNucleus` takes, everything else (stage, population, activities, narrative, social action/gatherings, parentNucleus) is set immediately after via the exact same `updateNucleus`/`updateActivitySummary` calls we already use for editing — no separate full-field create payload needed on your side. `createNucleus` returning `null` (unknown cluster) vs. throwing a real GraphQL error (duplicate name, enforced at your DB level) let us map both to distinct client-facing errors (400 vs. 409) cleanly.

**Update, 2026-09-14:** we no longer write a Sheet stub row on create at all — access control dropped the Sheet dependency entirely (§6/§2), so there's nothing left on our side that needs one.

**Delete — done, 2026-09-14.** Wired to `deleteNucleus(name: String!): Boolean!`. `deleteRowData` is now a pure delegate to it — zero Sheet interaction, matching create/save. Your implementation turned out richer than what we'd assumed when we first asked:

- **Soft delete, not hard delete**: the `Nucleus` row persists (`archivedAt` set) rather than being destroyed, so nothing referencing it is ever left dangling — but it disappears from `nuclei`/`nucleus(name)`/`parentNucleus` immediately, which is all our side needs (we treat `nucleus(name) === null` as "doesn't exist" already, see §2).
- `ActivitySummaryOverride` rows are hard-deleted (no longer meaningful once decoupled from the nucleus).
- Real per-activity `Activity` rows (data we didn't know you modeled separately from `ActivitySummary` — the genuine SRP-sourced cc/jyg/sc/devotional records) are never deleted, only **reassigned** — to the nucleus's `parentNucleus` if it has one, else its resolved Locality, else its resolved Cluster (always present). Mirrors SRP's own "activities are owned by the location" behavior when a Focus Neighbourhood is retired.
- Current `RoleInNE` role-holders are ended, using the same same-day-hard-delete-else-backdated-soft-end rule as ordinary worker-list removal (so undoing a same-session mis-add doesn't leave junk, but real historical tenure is preserved).
- Children pointing here via `parentNucleus` are nulled out, not cascade-deleted — exactly as asked.
- Returns `false` for both "never existed" and "already deleted" (idempotent-delete convention) — we surface that boolean up through `deleteRowData` so our API route can 404 on it, matching how `getRowData`'s existence check already works.

We didn't ask for anything further here — this fully covers what we needed. Our own UI already has a type-the-name-to-confirm step before calling this.

**Create in SRP, SRP status, queued delete — confirmed with cluster-notebook 2026-11-16, not yet deployed** (their issue #32, branch `fn-lifecycle`). Our design is `docs/superpowers/specs/2026-11-16-create-in-srp-design.md`.

- **Create:** `createNucleus(name, clusterName, srpLocalityName: String)`. With `srpLocalityName`, the nucleus is created at that Locality, immediately and editable, and an SRP create is queued in the same transaction. The worker makes the SRP call. On success it creates and links a Setting and moves the nucleus onto it.
  - The server refuses up front if another Setting or nucleus in that locality has the same name ignoring case.
  - SRP can still refuse later, because it may hold FNs cluster-notebook hasn't read.
- **Locality without SRP:** `createNucleus(name, clusterName)` then `updateNucleus(name, {locationName})`.
- **Push an existing nucleus:** `pushNucleusToSrp(name)` works for a local-only nucleus at a Locality, or at a Setting not yet in SRP. This is also the retry after a refusal.
- **Gate:** for both create-in-SRP and push, the same as create: the cluster's `createableEntityTypes` includes `'nucleus'`.
- **Status:** `Nucleus.srpAction` is null when no action is unfinished. Otherwise it holds:
  - `action`: create | rename | delete
  - `status`: pending | in_flight | refused | failed
  - `requestedAt`
  - `error`
  - `individuals` and `activities`: counts on a refused delete
- **`Nucleus.inSrp: Boolean!`:** true when the location is an SRP-linked Setting. **Promised, not yet landed.**
- **While an SRP action is pending:**
  - Field edits are allowed. They are queued, and the create sends current values.
  - Name and location changes are refused with "An SRP change for this nucleus is pending".
  - Delete works locally, and the queued create is then refused.
- **After a refusal:** the nucleus stays local with `srpAction.status = refused` and the reason. The user fixes the cause, usually by renaming, then calls `pushNucleusToSrp` again.
- **Delete of a nucleus in SRP:** it is queued and `deleteNucleus` returns true. `srpAction` then shows the pending delete, or a refusal with the counts of people and activities still assigned in SRP. Those are moved by hand in SRP, the locality is read again, then the delete is retried.
- Rename and delete of a nucleus already in SRP stay "SRP first".

**Follow-ups, confirmed with cluster-notebook 2026-11-16 (fn-lifecycle; some still promised):**
- **Rename:** `updateNucleus(name, {name: "New"})`, gated by `canChangeIdentity`.
  - A nucleus not in SRP is renamed at once.
  - A nucleus in SRP has its rename queued.
  - Rename is refused while any SRP action is pending.
- **Re-queue (promised):** if the latest `srpAction` is `{create, refused}` and the nucleus isn't linked, a rename, or a move to another Locality or an unlinked Setting, queues a fresh create in the same transaction. A clash refuses the whole update with `SRP_NAME_CLASH`. A `failed` create is never re-queued. The owner asked for this so users never press "push" again.
- **`refused` vs `failed`:**
  - `refused`: SRP or cluster-notebook's own checks said no, and a person has to change something.
  - `failed`: an unexpected error persisted through 3 automatic attempts, and it needs a developer.
  - `in_flight`: the worker is running it now; treat it as pending.
- **Error codes (promised):** `NAME_TAKEN`, `SRP_NAME_CLASH`, `SRP_NOT_AT_LOCALITY`, `SRP_ALREADY_LINKED`, `SRP_ACTION_PENDING`, `SRP_IN_USE`, `SRP_NOT_DEFAULT`, `SRP_NOT_NEIGHBORHOOD`.
- **Pending delete:**
  - The nucleus stays visible in `nuclei` and `nucleus(name)` with `srpAction {delete, pending}` until SRP accepts, then it is archived.
  - Field edits are refused while the delete is pending (promised).
  - A refused delete leaves the nucleus fully live.
- **Push of non-Neighborhood nuclei** will be refused (`SRP_NOT_NEIGHBORHOOD`). Network and Population nuclei never get `inSrp` or `srpAction`.
- **No `dismissSrpAction`:** owner decision. A refused action stays until a later SRP action succeeds.

**Final API, confirmed with cluster-notebook 2026-11-16** (fn-lifecycle; not yet pushed or deployed):
- `Nucleus.inSrp: Boolean!` has landed. Every code listed above is live.
- **Extra code `SRP_IS_NEIGHBOURHOOD`:** keep the "OU" spelling. It is returned when someone moves a nucleus that is already in SRP, and its message tells the user to delete it instead. We map it to a 409 using their message.
- **While a delete is pending,** all edits are refused, including `updateActivitySummary`.
- **`deleteNucleus` is refused only while an action is pending or in_flight** (`SRP_ACTION_PENDING`). A refused or failed action blocks nothing, so a nucleus whose create was refused can be deleted locally.
- **`SrpAction.srpChanged: Boolean!`** (confirmed 2026-11-17, live): true when SRP has applied the change, or may have. Meaningful when `status` is `failed`. `refused` means it did not happen in SRP; `failed` with false means it never reached SRP; `failed` with true means SRP may already hold the change (a failed create can exist in SRP though `inSrp` is false; a failed delete can be gone from SRP though `inSrp` is true). We show it as check-SRP.
- **Giving up on SRP:** moving a refused-create nucleus to its Cluster applies the move without re-queueing. `srpAction` stays `{create, refused}`, and whether to show it is our UI call. We show such a nucleus as "Not in SRP" (grey), not refused.

**Home nucleus, confirmed with cluster-notebook 2026-11-18** (cluster-notebook #39 step one; in production at their 6f7bbb6, migration 7d2f4a6c8e10). Supersedes the rename and delete notes above where they differ:
- **`inSrp` means "is the home nucleus of an SRP FN"**, recorded explicitly (set by create-in-SRP, push, and the read path). Other nuclei at the same Setting get false.
- **`srpName: String`**: SRP's last-known name for the FN; null unless `inSrp`. It differs from `name` while a rename waits for SRP, after SRP refused one, or after an FN was renamed in SRP directly (seen at the next read).
- **Rename applies at once** for any nucleus. For a home nucleus it also renames the Setting and queues the SRP rename. Up-front refusals: `NAME_TAKEN`, `SRP_NAME_CLASH`, `SRP_ACTION_PENDING`. Renaming to `srpName` adopts SRP's name and queues nothing.
- **`pushNucleusToSrp`** also re-sends the name for an out-of-step home, and on a non-home nucleus at a linked Setting creates a new FN and Setting and moves the nucleus there as its home. New code `SRP_FN_HAS_NO_HOME`.
- **Delete of a home nucleus** is queued (no `SRP_IN_USE` any more). SRP's live count decides: refused leaves `{delete, refused}` with `individuals`/`activities`; success archives it and moves other nuclei at the Setting to the parent nucleus's home Setting (same locality) or the Locality. Deleting any nucleus moves its child nuclei up to its own parent.
- Only a home nucleus's edits go to SRP. Moving a home nucleus stays refused (`SRP_IS_NEIGHBOURHOOD`).

**Further changes, confirmed with cluster-notebook 2026-11-17** (fn-lifecycle; no field changes, no code change needed here):
- **Names are unique among live nuclei only.** An archived nucleus keeps its name, and a new nucleus or a rename may reuse it. Every lookup by name skips archived entities, so a name held only by an archived nucleus resolves to null.
- **`createNucleus` with `srpLocalityName` is all-or-nothing.** If the SRP request is refused at once (for example `SRP_NAME_CLASH`), the mutation fails and no nucleus is created. The "+ Add" dialog already shows that error and stays open. A late refusal from the worker still gives `{create, refused}`.
- **Edits to SRP-mapped fields are queued whether or not the nucleus is in SRP.** Being in SRP only decides when they are sent; a later push sends the current values. Edits made while local do reach SRP once pushed.
- **`pushNucleusToSrp`:** the nucleus type, when set, must be Neighborhood (`SRP_NOT_NEIGHBORHOOD`).
- **`individuals` / `activities`** can also appear on a failed delete, not only a refused one. We show them only for a refused delete; a failed delete shows the generic or check-SRP message.
- **`srpChanged` on a pending action** means the worker is finishing the local half itself. We show it as pending.
- **A failed action's `error`** always starts with a prefix saying whether SRP already changed. We don't display `error` for failed actions.

## 5. Worker lists (named-list pattern)

**Done, 2026-09-13.** Worker lists are now backed by your `Individual`/`RoleInNE` model end to end, not free-text strings.

**Read**: `nucleus(name).workers(role)` returns ordered `Individual` records (`id`, `firstName`, `familyName`, `middleNames`, `nickname`, `sex`, `phone`, `email`, `ageCategory`). We display `individualDisplayName` — first + middle + family, falling back to `(unnamed)`, with `nickname` appended in parens.

**Write**: `updateNucleusWorkers(nucleusName, role, personIds: [String!]!)` replaces the full ordered list for a (nucleus, type) pair, taking `Individual.id`s rather than name strings — matches our "send the new full ordered list" pattern exactly.

**New**: `individuals(nucleusName, search)` (PII-scoped search by the nucleus's cluster) and `createIndividual(name, nucleusName)` (full-string name only) back a search-or-create UX in the worker-list editor — type to search, click a suggestion to add, or press Enter with no match to create a brand-new `Individual` and add them in one step. No `Individual` update mutation exists yet, so the editor never offers renaming an existing person — only add/remove/reorder.

**`promoter` — done, 2026-09-14.** Added as a fifth role value (alongside `accompanier`/`protagonist`/`abm-assistant`/`contact`), displayed as "Promoters" in a restructured Overview card. No schema change needed on your side — same as `contact`, this only worked because `role` is an open string. Multi-valued (not single, unlike `contact`), read-write access level (not admin-gated).

Wired into nucleus-assistant: `getRowData`/`getNucleusWorkers`, `/api/workers` (read/write personIds), new `/api/individuals` (search/create). 34+ new/updated tests, all passing.

**Cross-check signal**: the `protagonists`/`accompaniers` free-text count fields in §2 are compared against these lists' lengths client-side to flag a "mismatch" (not auto-reconciled). No API implication beyond exposing both.

## 6. Access control — done, 2026-09-24

No longer deferred — this is now our sole authorization source, replacing the Sheet-based `Access` tab entirely (that tab and its code are removed from our side; the underlying Google Sheet itself is untouched, just no longer read).

We read your `PermissionSet` (`canRead`, `canWrite`, `canChangeIdentity`, `canDelete`, `canAssignRoles`, `assignableRoles: [String!]!`, `createableEntityTypes: [String!]!`) via `Nucleus.myPermissions` (batched onto our existing nuclei-list query — no extra round trip), `Query.myPermissions(entityName)` (ad hoc, per-route checks), and `Query.assignableRoleDetails(entityName)` (role name + its real `PermissionSet` together, backing a "manage access" picker with real descriptions instead of bare role names). `Query.isAdministrator` is the one global concept we use, for our own "create a new nucleus" entry point's visibility.

Recognized roles (gated by `assignableRoles` membership when assigning): `accompanier`, `contact`, `abm-assistant`, plus whatever else your `assignableRoleDetails` returns (ATC/ATC-Collaborator/CIC/CIC-Collaborator/CSO, per our design consult). Informal roles (`protagonist`, `promoter` — your own open question, #14 on your side): freely assignable to anyone with `canAssignRoles` true, no `assignableRoles` check.

Role assignment (both kinds) goes through the same `updateNucleusWorkers`/`workers(role)` you already exposed for §5's worker lists — no separate mutation needed. Permission denials carry `extensions.code: "FORBIDDEN"` on the GraphQL error, which we detect specifically and surface as a real "you don't have permission" message rather than a generic failure.

Full design: `docs/superpowers/specs/2026-09-24-real-authorization-design.md`.

## 7. SRP-sourced comparison data — fully retired, 2026-09-14

The Devotionals/Education report aggregates (scraped into our own Sheet by `srp-cache`) were used as a read-only cross-check against the hand-entered activity rollups in §2 — retired when all four rollups moved onto your `ActivitySummary.isOverridden` flag directly (§2). The one field that outlived that migration, `facilitators` (a per-nucleus name list, sourced from the Education tab), is also done now: you added `ActivitySummary.facilitators` (Int, count) and `.facilitatorNames` (String) — human-entered only on your side too, no real SRP source for either, but now readable/writable through you instead of our sheet. Our UI only shows one combined line per nucleus, not per activity type, so we dedupe/join the four `facilitatorNames` values client-side. We're not yet writing to `facilitators`/`facilitatorNames` (still read-only in our UI) — flagging that as the natural next micro-slice if useful, otherwise no urgency. With this, our Education sheet tab is no longer read anywhere in the app. **Update, 2026-09-14:** the `srpNames` picker-badge feature (§1) that was the Devotionals tab's last remaining use has been dropped outright (the badge itself is retired, not just its data source) — `srp-cache`'s entire spreadsheet is now unread anywhere in this app.

## Suggested next-slice ordering

Given devotionals (§2/§3, one of four activity rollups) is done, natural next slices in rough order of value/effort:
1. **Done, 2026-09-14** (initially 2026-09-13 for devotionals only). All four activity rollups (cc/jyg/sc/devotionals) — same shape, one shared `updateActivitySummary` mutation and `ActivityType` enum (singular values: `CHILDRENS_CLASS`/`JUNIOR_YOUTH_GROUP`/`STUDY_CIRCLE`/`DEVOTIONAL_GATHERING`). Also consuming `ActivitySummary.isOverridden` now to drive the UI's amber-highlight, replacing our old SRP-sheet cross-check (§7) entirely for these four fields.
2. **Done, 2026-09-13.** `stage`/`locality`/`populationMakeup` are live via `updateNucleus(name, patch: NucleusPatch)` and wired into nucleus-assistant's `getRowData`/`saveRowData` (not `createRowData` — see below). **Contact — done, 2026-09-13**, see §2. **auxBoard — done, 2026-09-13**, see §2 — landed as a plain read-only `Cluster.auxiliaryBoardMembers` string rather than the Individual-role shape originally expected; real per-person linkage remains deferred on your side.
3. **Done, 2026-09-13.** Worker lists (§5) — now backed by `Individual`/`RoleInNE`, search-or-create UX wired up.
4. Identity fields + create/delete (§4) — lowest frequency of use, fine to defer. **Nucleus creation — done, 2026-09-14**, see §4: `createNucleus`/`clusters` are live, `createRowData` no longer does a full-row Sheet seed-write (or any Sheet write) at all. **Partially done, 2026-09-13**: `grouping`/`cluster`/`pg` (`Cluster.groupOfClusters`/`name`/`growthMilestone`) are wired read-only — confirmed with the user: `grouping` = Group of Clusters (the SRP tier above Cluster), `pg` = Program of Growth milestone code (M1/M2/M3, mapped from your three verbatim strings), `clusterCode` needs no field, parsed from `cluster.name` — **done, 2026-09-13**: derived client-side (first whitespace-separated token of `cluster.name`), no longer a stored/editable field on our side either. `contact`/`email` — **done, 2026-09-13**, see §2. `auxBoard` — **done, 2026-09-13**, see §2, via `Cluster.auxiliaryBoardMembers`. `parentNucleus` — **done, 2026-09-14**, see §2. `nucleus` (the name itself) remains read-only everywhere except create — no rename mutation exists, by design (§2). **Delete — done, 2026-09-14**, see §4: soft delete, with Activity-row reassignment and role-holder ending; `deleteRowData` is now Sheet-free.

**`nucleusType` — done, 2026-09-13.** You exposed `nucleusType` (query + patch); it always reads "Neighborhood" when `location` is set. Initially held this back over a miscategorization concern (our picker groups nuclei into Neighborhood/Network/Population cards by this field), but the user corrected the premise: Network/Population nuclei aren't location-bound by definition, so they'd never have a `location` set and would naturally take the settable path, keeping their real stored type. The override only ever fires for nuclei that are already location-bound Neighborhoods — not a data-corruption risk. Wired up on both the detail view and the picker (`/api/initial-data`, matching how locality/stage/devotionals are sourced there).

No response needed by any deadline — this is context for whatever schema-design work you're already doing. Happy to answer follow-up questions about any field's exact current semantics.

## People card, confirmed with cluster-notebook 2026-11-18 (phase 1, main eb96f9d)

Design: `docs/superpowers/specs/2026-11-18-people-card-design.md`.

```graphql
type PersonSummary { id: String! firstName: String middleNames: String familyName: String nickname: String place: Location }
type Location { name: String! type: PlaceType! locality: String cluster: String }  # locality only for a SETTING; cluster null for a CLUSTER
type NucleusPerson { individual: PersonSummary! roles: [String!]! isResident: Boolean! }
Nucleus.people: [NucleusPerson!]!
Query.individuals(nucleusName: String!, search: String = null, limit: Int = null): [PersonSummary!]!
```

- `people`: current roles held on this nucleus itself (not at its Cluster or Locality), plus, on a home nucleus
  only, everyone placed at its Setting (`isResident`). A parent's list doesn't include its children's people.
  Ordered by family then first name. Readable wherever the nucleus is readable.
- `individuals`: everyone placed in the nucleus's cluster, not only role holders. Needs WRITE on the nucleus (a
  reader gets `[]`). We ask for `limit: 21` and show 20.
- Owner's rulings (new read exposures, recorded in cluster-notebook's authorization rules): readers of a nucleus
  see the names of its people, including residents with no role; editors can search everyone in the cluster.
  Names and place only: `PersonSummary` has no phone, email, sex or age.
- `PersonSummary.id` is the id `updateNucleusWorkers.personIds` takes.
- Breaking change: `individuals` returns `PersonSummary`, not `Individual`. We switched our selection to the name
  fields first (PR #48). `workers(role)` and `createIndividual` still return `Individual`.

## People card moves, confirmed with cluster-notebook 2026-11-19

Phase 2 of the People card (spec `docs/superpowers/specs/2026-11-19-people-card-moves-design.md`). Built on
cluster-notebook branch `move-individuals`; SRP follows through srp-client `set_place`.

- `Location.id: String!` on every Location (`PersonSummary.place`, `Nucleus.location`, ...). Moves always use it,
  never a name: setting names repeat across localities (cluster-notebook #41).
- `moveIndividuals(individualIds: [String!]!, locationId: String!, withHousehold: Boolean = false): [MoveResult!]!`
  - `MoveResult { individual: PersonSummary  moved: Boolean!  code: String }`. Per-person codes `NOT_FOUND`,
    `OTHER_CLUSTER`, `FORBIDDEN`, `ALREADY_THERE`; `individual` is null for the first three (privacy).
  - Whole-call errors (`extensions.code`): `FORBIDDEN`, `LOCATION_NOT_FOUND`, `NOT_A_PLACE` (a Cluster, a Nucleus, or a
    Setting not linked to an SRP FN).
  - We always send `withHousehold: true` (owner, 2026-11-19: srp-client looks up the household contact, so a
    household moves together).
  - Permission: the caller can edit the home nucleus of the old place or the new one; where a side has no home
    nucleus, editing any nucleus in the person's cluster counts.
- `PersonSummary.placeSync: PlaceSync` (null if no change): `{ status code error household householdSize requestedAt }`.
  We read `status` (`pending | in_flight | synced | refused | failed | not_in_srp`) and `code`, never `error` (#43).
  Refusal codes: `FN_NOT_IN_LOCALITY`, `LOCATION_NOT_FOUND`, `NOT_IN_SRP_RECORDS`, `OUT_OF_SCOPE`, `INVALID`; a failed
  write carries SRP's code (e.g. `O026`, record locked).
- `Location.localityId` (the containing Locality's id for a SETTING, else null) and `Location.homeNucleus` (the home
  nucleus name for an FN-linked Setting with a recorded home, else null; shown to anyone who sees the place, owner's
  choice). Both are on every Location, including `Nucleus.location` and `parentNucleus { location }` (branch
  `move-individuals`, b0f035e).
- `withHousehold: true` always works: srp-client finds the household contact and moves the whole household, and
  cluster-notebook moves the other members locally from its result.

## Person in SRP, confirmed with cluster-notebook 2026-11-19

- `PersonSummary.inSrp: Boolean!` (cluster-notebook PR #45), on every PersonSummary (`Nucleus.people[].individual`,
  `individuals(...)`, `placeSync.household`). True if SRP has given us this person; false if they exist only here
  (`createIndividual` never creates anyone in SRP). False doesn't prove SRP lacks them: someone typed in here may
  duplicate a person SRP holds. No pending or unknown state.
- The People card shows it as a dot after each name: green "In SRP", red "Not linked to SRP (only in Nucleus Assistant)".

## People card details, confirmed with cluster-notebook 2026-11-20

Phase A (cluster-notebook PR #46). Spec: `docs/superpowers/specs/2026-11-20-people-card-details-design.md`.

- `NucleusPerson.ageCategory: AgeCategory` (`CHILD | JUNIOR_YOUTH | YOUTH | ADULT`; null when SRP hasn't given us the
  person) and `NucleusPerson.devotionalHost: DevotionalHostRole` (`HOST | CO_HOST`; null = not a host, or not known).
  They are on `NucleusPerson`, not `PersonSummary`, so they don't reach the cluster-wide "+ Add" search. The People
  card shows them as row marks (🕯, a grey age tag) and filters.
- `Query.personDetails(individualId: String!, nucleusName: String!): PersonDetails`
  - `PersonDetails { individual: PersonSummary!  estimatedAge: Int  isRegistered: Boolean  registrationDate: Date
    address: String  phones: [String!]!  emails: [String!]!  srpComments: String  checks: PersonChecks }`
  - `PersonChecks { backgroundCheckExpiration: Date  motorVehicleClearance: Boolean }` (true cleared, false not
    cleared, null unknown).
  - Null means not permitted, an unknown nucleus, or the person isn't one of that nucleus's people. No error codes.
    `/api/person-details` turns null into a 404, and the card then shows no Details section and no hint.
  - `individual.inSrp` false means an app-created person: the card shows "Not in SRP; nothing synced".
  - These restricted fields are read only through `/api/person-details`, one call per panel open, never with a list.
- Tiers:
  - Tier 1 (`personDetails` non-null): anyone who can edit the nucleus: its contacts and accompaniers, those of a
    parent nucleus, and the cluster roles ATC, CSO and CIC and their collaborators.
  - Tier 2 (`checks` non-null): an accompanier on the nucleus itself, or one of those cluster roles. A contact alone
    never sees checks.
- Side effect: `Individual.phone` / `email` on `workers(role)` are now null unless the caller is tier 1 on that
  nucleus, so the Identity card's "Contact Email" is blank for other readers.

### Phase B, confirmed with cluster-notebook 2026-11-21 (deployed)

- `NucleusPerson.participates: Boolean!`: a participant on the roster of an activity that is not completed.
- `NucleusPerson.facilitates: Boolean!`: a current facilitator on the roster of an activity that is not completed.
- `NucleusPerson.participation: [Participation!]!`, newest first, visible to anyone who can read the nucleus.
  - `Participation { activityId: String!  activityType: String!  heldAt: String  role: ActivityRole!
    studyItem: String  studyItemTitle: String  startDate: Date  endDate: Date  completed: Boolean!  current: Boolean! }`,
    `enum ActivityRole { PARTICIPANT FACILITATOR }`.
  - `activityType` is `cc`, `jyg` or `sc` (shown as Children's class, Junior youth group, Study circle).
  - SRP activities have no name, so `heldAt` (the name of the activity's nucleus, Setting or Locality) replaced
    the proposed `activityName`.
  - One entry per study item (book, grade or text) the person was on, plus one per activity with no study item at
    all (`studyItem` null, the activity's own dates). `participates` / `facilitates` cover both.
- Rosters are read with each locality read request (srp-client `activity-rosters`), not live.
- The People card shows 🎓 (facilitating) and 📖 (participating) on rows, "Participating" and "Facilitating" filters, and
  an Activities section in every reader's panel: current entries first, then the server's order.

## Hiding people, confirmed with cluster-notebook 2026-11-23

Phase 4, cluster-notebook PR #54 (27ac384, live in production). Spec: `docs/superpowers/specs/2026-11-23-hide-people-design.md`.

- `PersonHide { hiddenAt: DateTime!  hiddenBy: PersonSummary  reason: String }`. A hide is per person, per nucleus.
  `hiddenBy` is null only for a hide not made by a signed-in person.
- `NucleusPerson.hidden: Boolean!` and `NucleusPerson.hide: PersonHide`. `hide` is null unless the person is hidden
  there and the caller can edit that nucleus.
- `Nucleus.people(includeHidden: Boolean = false)` and `Nucleus.workers(role: String!, includeHidden: Boolean = false)`.
  The defaults leave hidden people out, so counts and lists need no change.
- `hideIndividual(individualId, nucleusName, reason)` and `unhideIndividual(individualId, nucleusName)` return
  `NucleusPerson`.
  - `FORBIDDEN` unless the caller can edit the nucleus. Null for an unknown nucleus.
  - `NOT_AT_NUCLEUS` when the person is neither a role holder nor a resident there.
  - Repeats are no-ops. Hiding someone already hidden keeps the original reason.
  - `unhideIndividual` also works for someone hidden there who has since left (the result has roles [], isResident
    false, hidden false).
- `updateNucleusWorkers(nucleusName, role, personIds, includesHidden: Boolean = false)`. Note the spelling: the
  field arguments use `includeHidden`, the mutation argument uses `includesHidden`.
  - With `includesHidden` false, hidden holders missing from `personIds` are kept.
  - With `includesHidden` true, `personIds` is authoritative for everyone.
  - Either way, a hidden person newly given the role is unhidden. A resident (move) does not unhide.
- `Query.hiddenPeople(clusterName)` returns `HiddenPerson { individual, nucleusName, roles, isResident, hide }`. It is for
  Administrator or CSO of the cluster (or above), and returns [] for an unknown cluster. It is for the later
  review dashboard, not used yet.
- `hide` is editor-only (`canWrite` on the nucleus).
- Confirmed with cluster-notebook 2026-11-24: `moveIndividuals` never touches hides; a hide ends only through
  `unhideIndividual`. There is no hide or unhide across all nuclei. After a move away from N the person is still hidden
  at N and `hiddenPeople` still lists them "from N" (isResident false). At a new nucleus M they are visible unless they
  also have a hide at M. cluster-notebook prefers that a move not unhide on the server (SRP can refuse and undo a move,
  but an unhide would stay); a client that wants both calls `unhideIndividual(id, N)` after a successful move.
  This app does (owner 2026-11-24): the Admin page's Move unhides everyone it placed, in every nucleus of the cluster.

How this app uses it:

- The People card reads `people(includeHidden: true)` once and filters hidden rows itself (the Hidden filter, the
  "(hidden here)" tag in "+ Add").
- The card's per-person role writes read `workers(role, includeHidden: true)` and save with `includesHidden: true`, so
  unticking a role on a hidden person works.
- The Overview's name lists and counts keep the defaults.
- "+ Add" unhides a picked hidden person before saving their Resident and roles.

## Admin page, Phase 1, confirmed with cluster-notebook 2026-11-24

Spec: `docs/superpowers/specs/2026-11-24-admin-page-design.md`. cluster-notebook's final shape below supersedes the
spec where they differ. Status: in production (2026-11-24).

```graphql
type Query {
  isAdministrator: Boolean!                                  # exists
  adminClusters: [Cluster!]!
  me: PersonSummary
  searchPeople(clusterName: String!, search: String!, limit: Int = 20): [AdminPerson!]!
  individualRoles(individualId: String!): [RoleHolding!]!
  personDetails(individualId: String!, nucleusName: String = null): PersonDetails
  hiddenPeople(clusterName: String!): [HiddenPerson!]!       # exists
  adminPlaces(clusterName: String!): [AdminPlace!]!
  assignableRolesAt(entityId: String!): [RoleGrant!]!
  unlinkedSignIns: [UnlinkedSignIn!]!                        # Administrator only
}
type AdminPlace { id: String!  name: String!  type: String!  parentId: String  parentName: String }  # cluster|locality|setting|nucleus
type AdminPerson { individual: PersonSummary!  ageCategory: AgeCategory  placePath: [String!]!  hasAccess: Boolean!
                   pendingInvitation: Invitation }           # pendingInvitation arrives with Phase 2
type RoleHolding { id: String!  role: String!  entity: AdminPlace  start: Date }   # entity null for Administrator
type UnlinkedSignIn { providerUserId: String!  firstSeenAt: DateTime!  lastSeenAt: DateTime! }
type Mutation {
  grantRole(individualId: String!, role: String!, entityId: String = null): RoleHolding!
  endRole(roleId: String!): Boolean!
  moveIndividuals(...)                                       # exists
  unhideIndividual(individualId: String!, nucleusName: String!): NucleusPerson   # exists
}
```

- `Cluster`, `Locality`, `Setting` and `Nucleus` gain `id: String!`. Names such as "Chapel Hill" repeat, so roles and
  places are chosen by id; nuclei stay keyed by name elsewhere.
- `RoleHolding.entity` and `Invitation.entity` are `AdminPlace`, because `Location` can't represent a nucleus. We ask
  only for `{ id name type }`.
- `AdminPerson.ageCategory` is the existing `AgeCategory` enum (`CHILD | JUNIOR_YOUTH | YOUTH | ADULT`).
- `grantRole`: `entityId` is required except for the role `Administrator` (`ENTITY_REQUIRED`). `role` must be one of
  `ATC`, `CSO`, `CIC`, `LSA`, `ATC-Collaborator`, `CIC-Collaborator`, `abm-assistant`, `accompanier`, `contact`, or
  `Administrator`; anything else is `UNKNOWN_ROLE`. Free-text informal roles still go through `updateNucleusWorkers`.
  Granting a role the person already holds leaves it unchanged. Gated exactly like `assignableRolesAt`.
- `adminClusters`: all clusters for an Administrator; for a CSO, the clusters at or below their role (a CSO role
  above a cluster covers every cluster under it). Empty means no Admin link.
- A CSO (at the cluster or above) and an Administrator can unhide and move anyone in the cluster with no role at the
  nucleus: they inherit WRITE down from the cluster.
- `SELF_LOCKOUT` fires only when `endRole` ends the caller's own last role giving admin standing over a cluster (last
  Administrator, or last CSO covering it).
- A disabled account (after `removeAccess`, Phase 2) is treated as signed out; `removeAccess` also revokes the
  person's pending invitations.
- Error codes: `FORBIDDEN`, `NOT_FOUND`, `UNKNOWN_ROLE`, `ENTITY_REQUIRED`, `SELF_LOCKOUT`, `EMAIL_IN_USE`,
  `ALREADY_HAS_ACCESS`, `INVITATION_PENDING`, `NOT_PENDING`, `BAD_INPUT`, `CLERK_ERROR`, `CLERK_NOT_CONFIGURED`.
- Deploy gating: a field asked for before it is in production breaks the whole query (the People card went down that
  way on 2026-11-23). Branch `feat/admin-page` therefore waits to merge until these fields are live.
- Phase 2 (invitations, `removeAccess`, `accounts`) is recorded in the next section. Phase 3 (`peopleNotInSrp`,
  `changeLog`) is agreed and documented in the spec; it gets its own section here when cluster-notebook confirms its deploy.

## Admin page, Phase 2, confirmed with cluster-notebook 2026-11-24

Invitations and account access. Status: in production, introspected 2026-11-24. This app never calls Clerk's backend
for any of it; cluster-notebook owns the permission check, the Clerk call, the record and the link at first sign-in.

```graphql
type Query {
  invitations(clusterName: String!, status: InvitationStatus): [Invitation!]!
  accounts(clusterName: String!): [AccountInfo!]!
  me: PersonSummary
}
enum InvitationStatus { PENDING ACCEPTED EXPIRED REVOKED }
type Invitation { id: String!  individual: PersonSummary!  email: String!  role: String  entity: AdminPlace
                  status: InvitationStatus!  invitedBy: PersonSummary  createdAt: DateTime!  expiresAt: DateTime!
                  acceptedAt: DateTime  replacedBy: String }
type AccountInfo { individual: PersonSummary!  email: String  provider: String!  createdAt: DateTime!
                   lastSeenAt: DateTime  disabledAt: DateTime }          # email is nullable
type AdminPerson { ...  pendingInvitation: Invitation }                  # we ask only for { id expiresAt }
type Mutation {
  inviteIndividual(individualId: String!, email: String!, role: String, entityId: String,
                   expiresInDays: Int! = 30, replaceExisting: Boolean! = false): Invitation!
  resendInvitation(id: String!): Invitation!      # revokes the old invitation and issues a new one
  revokeInvitation(id: String!): Invitation!
  removeAccess(individualId: String!, endRoles: Boolean! = false): Boolean!
  restoreAccess(individualId: String!): Boolean!
}
```

- **Standing over the person.** All five access mutations check, in order: (1) `administers_person`: the caller is an
  Administrator, or the person is placed at a location under, or holds a current role at an entity under, a cluster
  the caller administers; otherwise `FORBIDDEN`. (2) `may_manage_access`: the caller is an Administrator, or can end
  every current role the person holds; otherwise `FORBIDDEN`. A role-less person outside the caller's clusters is
  refused. The cluster our route names is not used by these mutations; our `requireAdmin(cluster)` gate is ours alone.
  On these routes we show a 403 as "You can't manage access for this person."
- **Invitation lifecycle.** `PENDING` becomes `ACCEPTED` at first sign-in, `EXPIRED` after `expiresInDays`, or
  `REVOKED` by `revokeInvitation`, by a resend (the old one is revoked, `replacedBy` points at the new one) or by
  `removeAccess`. Resend and revoke on anything not pending fail with `NOT_PENDING`. We show `REVOKED` as "cancelled".
- **One account per person.** `accounts.individual_id` is unique. An accepted `replaceExisting: true` invitation
  re-points the account to the new login and re-enables it; without the flag, inviting someone who already has access
  is `ALREADY_HAS_ACCESS` and nothing changes.
- **`removeAccess`** bans the login in Clerk and revokes the person's pending invitations; `endRoles: true` also ends
  their roles. On yourself it throws `SELF_LOCKOUT` (we show "You can't remove your own access."). It returns `false`
  when the person has no enabled account: nothing was done (we show "No active login to remove."). `CLERK_ERROR` and
  `CLERK_NOT_CONFIGURED` mean nothing changed.
- **`restoreAccess`** lifts the ban and re-enables the same login. Roles ended earlier stay ended. It returns `false`
  when there is no disabled account (we show "No removed login to restore.").
- **The login email is not the contact email.** It is kept only on the invitation and the account. We show it only on
  the invitation and account rows and never write it anywhere else.
- **No Clerk session-token claim is needed.** At the new user's first sign-in cluster-notebook asks Clerk for their
  invitation, links them, and grants the invitation's role on their first request. Owner setup: only the Clerk secret
  key on Render.
- **Error codes and our wording** (`CODED_ERRORS`): `EMAIL_IN_USE` 409 "This address belongs to someone else.";
  `ALREADY_HAS_ACCESS` 409 "{name} already has access." (the card offers "Replace their login?");
  `INVITATION_PENDING` 409 "An invitation is already pending; resend it instead."; `NOT_PENDING` 409 "This
  invitation is no longer pending."; `BAD_INPUT` 400, upstream message shown; `CLERK_ERROR` 502 "The invitation email
  couldn't be sent. Try again."; `CLERK_NOT_CONFIGURED` 503 "Invitations aren't set up yet."
- `pendingInvitation` goes only into the admin search query, never into a query the home page or People card uses.

## Admin page, Phase 3, confirmed with cluster-notebook 2026-11-25

People not in SRP and the change log. Status: in production 2026-11-25. Part B below is confirmed and deployed
2026-11-25 (cluster-notebook 5a0b624); cluster-notebook changed existing queries rather than adding new ones (owner 2026-11-25).

```graphql
peopleNotInSrp(clusterName: String!): [AdminPerson!]!
changeLog(clusterName: String!, before: DateTime, limit: Int! = 100, beforeId: String): [LogEntry!]!
type LogEntry { id: String!  occurredAt: DateTime!  actor: PersonSummary  mutation: String
                entityType: String!  entityId: String!  changeType: String!  changes: JSON! }
```

- `peopleNotInSrp`: people **placed** in the cluster with no SRP link (holding a role there doesn't count); ordered by family name, first name (case-insensitive), id.
- `changeLog`: newest first (`occurredAt` desc, `id` desc). Keyset: strictly older than (`before`, `beforeId`); for Older pass the last row's `occurredAt` and `id`. `limit` 1..500 else `BAD_INPUT`; `beforeId` without `before` is `BAD_INPUT`.
- `entityType` is one of `cluster, locality, setting, nucleus, individual, role_in_ne, person_hide, invitation, account`. `changeType` is one of `create, update, delete`.
- `changes` is `{ field: { old, new } }`; create has `old` null, delete has `new` null, update lists only changed fields; timestamps are ISO strings.
- `actor` is null for the SRP sync, scripts, or anything not done by a signed-in person. `mutation` is the GraphQL mutation name or null.
- Both: same admin gate as `hiddenPeople` (FORBIDDEN otherwise); unknown cluster gives `[]`.
- The Admin page uses `createdAt`/`createdBy` (People not in SRP, "added <date> by <name>") and `entityName` (the Log card's headline; `mutation` and the entity type are the fallback when it is null).

### Part B: confirmed and deployed 2026-11-25 (cluster-notebook 5a0b624)

All additive; nothing Part A calls changed.

```graphql
searchPeople(clusterName: String!, search: String! = "", limit: Int! = 20,
             holdsRole: Boolean = null, hasAccess: Boolean = null): [AdminPerson!]!
type AdminPerson { ...existing...  roles: [RoleHolding!]!  accessRemovedAt: DateTime
                   createdAt: DateTime  createdBy: PersonSummary }
type LogEntry { ...existing...  entityName: String }
```

- "Role holders without access" is `searchPeople(clusterName, search: "", limit: 1000, holdsRole: true, hasAccess: false)`. There is no maximum limit; the default stays 20. A null filter means no filter.
- `holdsRole: true` is a current recognised role (not Administrator, not promoter/protagonist) at a live place in the cluster. `hasAccess: false` is no enabled account, so removed-access people are included.
- `roles` lists every current role (informal ones included), with the same visibility as `individualRoles`.
- `accessRemovedAt`: when the account was disabled; null if enabled or never had one.
- `createdAt`: from the audit log, null before auditing began. `createdBy`: null for SRP sync, scripts, or before auditing.
- `entityName`: place name; person name for individual, invitation and account; `"<person> · <role> at <place>"` for a role; `"<person> · hidden at <nucleus>"` for a hide; null if the row is gone.
- `pendingInvitation` is null once an invitation expires (only pending, unexpired), so there is no "invitation expired" tag.

## Nucleus ids and names, confirmed with cluster-notebook 2026-11-25

- `Nucleus.id` is a stable uuid that survives renames. The app puts it in the address (`/?nucleus=<id>`) so refresh,
  the browser's back button and shared links keep a nucleus open.
- Today names are unique among live nuclei across **all** clusters, case-sensitive (`NAME_TAKEN`; a pending SRP
  rename also reserves its name). An archived nucleus gives up its name.
- **Owner decision 2026-11-25:** names must be unique within a locality (or cluster, for a nucleus placed on the
  cluster), and may repeat across them. cluster-notebook will ignore case (matches SRP's own clash check).
- Id forms are deployed (cluster-notebook fe01c5d). Each takes the name **or** the id, exactly one, else
  `BAD_INPUT`: `nucleus(name, id)`, `updateNucleus(patch, name, id)`, `deleteNucleus(name, id)`,
  `pushNucleusToSrp(name, id)`, and `nucleusId` beside `nucleusName` on `updateNucleusWorkers`, `hideIndividual`,
  `unhideIndividual`, `updateActivitySummary`, `individuals`, `createIndividual`, `personDetails`.
  `NucleusPatch.parentNucleusId` (null clears; not with `parentNucleusName`). `HiddenPerson.nucleusId: String!`.
  `nucleus(id)` returns null for the same reasons as by name: signed out, unknown, archived, not readable.
- **Still to do before names can repeat:** this app must stop looking nuclei up by name (switch to the id forms
  above, and stop keying permissions by lower-cased name). Then cluster-notebook narrows uniqueness to the locality
  and adds `NucleusPatch.locationId`, since setting names can repeat across localities too.

## Members of a nucleus, confirmed with cluster-notebook 2026-11-26

Design: `docs/superpowers/specs/2026-11-26-nucleus-members-design.md`. Not yet deployed. Selecting these fields before
deploy breaks every read, so the app merges only after cluster-notebook confirms they are live.

```graphql
type Nucleus {
  isHome: Boolean!        # has its own Setting (any Neighborhood); inSrp = that Setting is linked to SRP
  inSrp: Boolean!
  memberCount: Int!
  srpPlace: Location      # null unless isHome
}
type Location {
  srpLinked: Boolean!
  homeNucleusId: String
}
input NucleusPatch {
  localityId: String
  membersOnTypeChange: MembersOnTypeChange   # MOVE_IN | END
}
# LogEntry gains: reason: String, names: JSON!
```

- **Residence and membership.** A Neighborhood nucleus has its own Setting. Its residents are the people placed there,
  linked or not. Network and Population nuclei have no Setting; their members hold the informal `member` role in
  `updateNucleusWorkers`. A `member` role on a Neighborhood is refused.
- **`isHome` and `inSrp`.** `isHome && !inSrp` is a Neighborhood that isn't in SRP yet. Residents there are placed at its
  Setting locally, and SRP places them at the projected place until the nucleus is pushed.
- **`srpPlace`** is null unless `isHome`. It is the nucleus's own Setting when that Setting is in SRP. Otherwise it is the
  projection: the nearest ancestor in the same Locality whose Setting is linked, or else the Locality.
- **`memberCount`** counts residents for a Neighborhood and current `member` holders for any other type. Each person
  counts once, whatever roles they hold. Hidden people are left out.
- **Interim locality rule** (for an app that still sends `locationName` or `locationId`). On a Neighborhood, a value that
  points to a Locality acts as `localityId`. Pointing it at the Cluster gives `NEEDS_LOCALITY`. Pointing it at another
  Setting is refused: `SRP_IS_NEIGHBOURHOOD` for a home that is in SRP, and `BAD_INPUT` otherwise.
- **Error codes:**
  - `HAS_MEMBERS {memberCount}`: a non-Neighborhood with members became a Neighborhood without `membersOnTypeChange`.
  - `MOVE_REFUSED {people: [{id, code}]}`: `code` is `FORBIDDEN` or `OTHER_CLUSTER`. Only ids are listed, for privacy.
    `MOVE_IN` is all-or-nothing, so nothing changed.
  - `NEEDS_LOCALITY`: a Neighborhood needs a Locality.
  - `MEMBER_ON_NEIGHBORHOOD`: a `member` role was granted on a Neighborhood.
- **`MOVE_IN` results.** SRP refusals happen later, in the worker, so nothing reports them at once. Outcomes arrive on each
  person's `placeSync`.
- **Refused moves in the log.** The undo that follows an SRP refusal is audited with mutation `srpRefusedMove`, and
  `reason` carries the refusal code. `names` maps every id in a row's `changes` to its current display name. Names are
  resolved when the log is read, so a renamed place shows its current name. An id whose row is gone is left out of the
  map, and the app shows the id.
- **Type null.** A null `nucleusType` means "not decided yet". It is allowed only away from a Setting, and counts as not
  a Neighborhood.
- **Behaviour updates, confirmed with cluster-notebook later on 2026-11-26:**
  - **`Location.homeNucleus`** is now set for unlinked Settings too, so having a `homeNucleus` no longer means "in SRP".
    Use `srpLinked` or `Nucleus.inSrp` to tell. The app uses `homeNucleus` only to find a person's previous nucleus when
    they move in.
  - **A Neighborhood's location is always its own Setting**, including migrated ones that used to sit at a Locality.
    Re-sending that Setting as `locationName` does nothing.
  - **Any other Setting given as `locationName` is `BAD_INPUT`**, and so is moving a nucleus onto another nucleus's
    linked Setting.
  - **`moveIndividuals`** accepts a Locality, any linked Setting, or an unlinked Setting that has a home nucleus.
  - **Pushing an untyped nucleus at a Locality** first makes it a Neighborhood with its own Setting. If it has members,
    the push is refused with `HAS_MEMBERS`. The app doesn't offer Push for an untyped nucleus.
    - **What the app does:** Push is offered for any `isHome && !inSrp` nucleus, as a create, whatever its Setting.
  - **Pushing a Neighborhood** moves each resident's whole SRP household into the new FN (owner's decision).
  - **A move that leaves SRP's placement unchanged** is not sent to SRP. `placeSync` shows it as synced, with code
    `UNCHANGED_IN_SRP`.
  - **`createNucleus` with `srpLocalityName`** returns the new nucleus's own Setting as `location` (type `SETTING`).
  - **Creating a Neighborhood without SRP:** after `createNucleus(name, clusterName)`, one `updateNucleus` with
    `{nucleusType: "Neighborhood", localityId}` leaves it a Neighborhood at its own unlinked Setting in that Locality,
    as a single savepointed change. Send `localityId`, not `locationName`: `locationName` is looked up by name across
    Clusters, Localities and Settings, and names aren't unique (cluster-notebook #41).
  - **`getLocationOptions`** lists every Setting under a readable Locality, including an unpushed Neighborhood's own
    Setting (`srpLinked: false`, `nuclei: [its name]`). Archived Settings are left out (cluster-notebook's members
    branch, 2026-11-26).

## Named counts (the Overview's "(x)"), agreed with cluster-notebook 2026-11-27

Not yet deployed. Selecting `namedCounts` before then breaks every nucleus read, so the app merges only after
cluster-notebook confirms it is live.

```graphql
type Nucleus { namedCounts: NamedCounts! }
type NamedCounts {
  inConversation: Int!            # residents (Neighborhood) or members (other types)
  inEducationalActivities: Int!   # "In core activity": people taking part in an educational activity
  educationalFacilitators: Int!   # people facilitating one
  devotionalHosts: Int!           # hosts and co-hosts of a devotional gathering
  protagonists: Int!              # "Promoting": promoter role holders
  helpingOthers: Int!             # "Helping Others": protagonist role holders
  accompanying: Int!              # accompanier role holders
  nucleiCounted: Int!             # how many nuclei the counts cover; 1 = just this one
}
```

- **cluster-notebook owns every rule** and the app passes no switches. The app shows these as they come. A rule
  change, for example who counts or which nuclei, needs no app change.
- **Scope (owner):** a Neighborhood plus all its Neighborhood descendants, recursively. The walk passes only through
  Neighborhoods and skips archived nuclei. A Network or Population nucleus counts only itself.
- **Each person counts once** across the scope. Today's data has no overlaps, but they can happen: someone who holds
  a role on the parent and lives in a child is among both nuclei's people, and a role can be held on two nuclei.
  Residents never overlap.
- **Hidden people:** a person counts if they qualify at any nucleus in scope where they aren't hidden (owner: "not
  ideal but acceptable for now").
- **Nuclei the caller can't read** are still counted. These are counts, never names (owner).
- **Not affected:**
  - `inCommunityActivities` ("Participating") has no named count.
  - Activity summaries stay per nucleus; they use a different counting strategy (owner).
  - `memberCount` stays this nucleus's own; the app uses it for the type-change prompts.
- **Cost:** about 7 SQL statements whatever the group size. The app re-reads `memberCount` and `namedCounts` after
  every change on the page, through `GET /api/nucleus/counts`.

## Parent nucleus rules, confirmed with cluster-notebook 2026-11-27

These are the owner's rules. `updateNucleus` refuses:
- **`PARENT_CYCLE`:** a parent that is the nucleus itself or one of its descendants.
- **`PARENT_OTHER_CLUSTER`:** a parent in another cluster. Also: moving a nucleus to another cluster while it has a
  parent or children in this one.

- **`PARENT_FORBIDDEN`** (cluster-notebook #60): a new parent the caller can't edit. The parent's contacts and
  accompaniers gain access to the child, so this needs edit rights on the parent. Re-setting the current parent or
  clearing it needs none. Checked after the two above.

**Create under a parent** (cluster-notebook #60): `createNucleus(name, clusterName, srpLocalityName?, parentNucleusId?)`
creates the nucleus under that parent in one all-or-nothing call; any refusal creates nothing. Without
`srpLocalityName` it is placed at the parent's Locality, or the Cluster if the parent has none. An unknown parent id is
an uncoded error. The app's "+ Add" on a parent uses this (`createRowData`), so there is no separate parent patch.

The app's Parent Nucleus picker suggests only nuclei in the same cluster that the user can edit (`canWrite`), leaving
out the nucleus and its descendants (`parentOptions` in `web/src/lib/nucleusIdentity.ts`). "+ Add" on a parent shows
only when the user can create in the cluster and edit the parent. The field is free text, though, so a refused value
can still be typed, and the three codes have messages.

## Activity totals (the activities card's group view), confirmed with cluster-notebook 2026-11-27

The owner decided that activity figures roll up by summing, over every nucleus under this one. It was built in cluster-notebook PR #61.

```graphql
Nucleus.activityTotals: ActivityTotals!
type ActivityTotals {
  nucleiCounted: Int!
  devotionalGathering: ActivityCounts!
  childrensClasses: ActivityCounts!
  juniorYouthGroups: ActivityCounts!
  studyCircles: ActivityCounts!
}
type ActivityCounts { number: Int  participants: Int  participantsFof: Int }
```

- **Scope:** this nucleus plus all its live descendants, recursively, **of any type**. The "(x)" named counts cover Neighborhood descendants only.
  - Archived nuclei are skipped. Archiving moves a nucleus's children up to its parent, so no subtree is lost.
  - Children the caller can't read are counted. The totals carry no names.
- **Figures:** each is the sum of each in-scope nucleus's effective value, using the same per-field precedence (override, else SRP-derived) as its own ActivitySummary.
  - A figure is null when no in-scope nucleus has a value for it.
  - A nucleus with no open activities and no override contributes null, not 0.
- **Counting:** `nucleiCounted - 1` is the "With N under it" count. It is a different N from `namedCounts.nucleiCounted`.
- **Read in:** both the nucleus query and the counts refresh (`/api/nucleus/counts`), which runs after each activity save. It's a fixed 3 database queries whatever the tree size.
- **Known limits:**
  - A child not yet pushed to SRP has its SRP activities in the parent's FN, so they show on the parent, and are still counted once.
  - Participants are counted once per activity, as SRP does.
  - A group total typed into a parent's own cells would be counted twice. The card says so in the "This nucleus" view.

## Households, step 1, confirmed with cluster-notebook 2026-11-27

Households are read-only in this step. They were built in cluster-notebook PR #62.

```graphql
Nucleus.namedHouseholds: [Household!]!
PersonSummary.household: Household        # null: the person is in no household
type Household {
  id: String!
  size: Int!
  contact: PersonSummary                  # null if the caller can't read the contact
  members: [PersonSummary!]!
  address: String
}
```

- **Address:** it is filled only on `Nucleus.namedHouseholds`. It is always null on `PersonSummary.household`.
- **Person's household:** null means the person is in none.
- **Contact:** null when the caller can't read the contact.
- **Read in:** `getNucleusHouseholds` (the nucleus query), and `household` on each person in `getNucleusPeople` and `getHiddenPeople`.
- **NucleusPerson.address:** confirmed with cluster-notebook 2026-11-27 (PR #63). It is free text, as SRP holds it. It sits beside `individual` on a nucleus person, not inside it. It is null unless the caller may see person details at that nucleus, or when none is recorded. For a household member it equals the contact's address.
- **Selection:** the app reads only `id firstName familyName middleNames nickname inSrp` for the contact and members. It does not read `place`.

## Households, step 2 (editing), confirmed with cluster-notebook 2026-11-27

```graphql
createHousehold(contactId: String!, memberIds: [String!]): Household!
addHouseholdMember(householdId: String!, individualId: String!, fromHouseholdId: String): Household!
removeHouseholdMember(householdId: String!, individualId: String!): Household   # null when the household dissolved
setHouseholdContact(householdId: String!, individualId: String!): Household!
Household.srpState: HouseholdSrpState!   # IN_SRP | WAITING | LOCAL_ONLY
Household.srpProblem: String             # null unless SRP didn't take the change
retryHouseholdSrp(householdId: String!): Household!
takeSrpHousehold(householdId: String!): Household   # null when the household dissolved
```

- **Rights:** the caller must be allowed to move each person a call touches.
  - create: everyone named.
  - add: the person and the contact.
  - remove: the person.
  - setContact: the new contact and the old one.
- **Address:** the returned Household's address is null. The app re-reads `namedHouseholds` afterwards.
- **Error codes (all 409; the app refreshes the list after each):**
  - `CONTACT_MUST_STAY`: the contact can't be removed; make someone else the contact first.
  - `ALREADY_IN_HOUSEHOLD`, `NOT_IN_HOUSEHOLD`: the person's family changed since the list was loaded.
  - `NOT_A_MEMBER`: the person isn't in that household (any more).
  - `DIFFERENT_PLACE`: the person lives at a different place than the household.
  - `HOUSEHOLD_NOT_FOUND`, `INDIVIDUAL_NOT_FOUND`: the family or person no longer exists.
  - `FORBIDDEN` is unchanged (403).
- **srpState:** it is selected wherever `Household` is read (people, hidden people, search, `namedHouseholds`).
- **srpProblem:** confirmed with cluster-notebook 2026-11-27 (PR #67).
  - It is null unless SRP didn't take the change. While set, `srpState` stays WAITING and nothing resends.
  - Codes we word: `SRP_CONFLICT`, `OTHER_HOUSEHOLD_CONTACT`, `PLACE_MISMATCH`, `OUTSIDE_WRITABLE_SCOPE`, `MEMBER_NOT_IN_SRP`, `STATE_CHANGED`, `NOT_CONVERGED`. Any other code gets a generic line with the code.
  - `retryHouseholdSrp` sends ours again; over a conflict, ours wins.
  - `takeSrpHousehold` drops the changes made here; the next read makes it match SRP.
  - `takeSrpHousehold` returns a nullable `Household`: null when nobody is left and the family dissolved. People only in the app leave the family at once; the rest follow SRP on the next read. Confirmed with cluster-notebook 2026-11-27.
  - Both are FORBIDDEN unless the caller may move the household's contact, and `HOUSEHOLD_NOT_FOUND` otherwise.
  - Any edit clears the problem and resends.
- **Moving a person who is in a household:** confirmed with cluster-notebook 2026-11-27 (PR #65).
  - `moveIndividuals` with `withHousehold` moves every member of one of their households, including members the caller can't read.
  - Without `withHousehold` it returns `HOUSEHOLD_MOVES_TOGETHER`, and nobody moves.
  - It is FORBIDDEN unless the caller may move every member.
  - The app always sends `withHousehold: true`.

## Participation spaces, confirmed with cluster-notebook 2026-11-27 (#66)

- **Schema:**
  - `spaceKinds: [SpaceKind!]! { key label }` is cluster-notebook's list and changes over time. The app reads it and
    does not hard-code it. Current keys: `social_action`, `community_gathering`, `devotional`, `reflection`,
    `expansion`, `visiting`, `other`.
  - `Nucleus.participationSpaces(includeArchived: Boolean = false)` is ordered by name.
  - `ParticipationSpace { id name kind mode: EACH_TIME | RUNNING createdAt archivedAt recordCount: Int! total: Int!
    latestRecord records(limit, offset) people(since, until) }`. `recordCount` and `total` are never null.
  - `ParticipationRecord { id date count note people: [PersonSummary!]! createdAt updatedAt }`. `Date` is ISO
    `YYYY-MM-DD`.
  - `SpacePeople { recordCount people: [SpacePerson { individual: PersonSummary, records }] }`. People come most
    records first. A space's records come newest date first.
- **Writes:**
  - `createParticipationSpace(nucleusId, name, kind, mode)`
  - `updateParticipationSpace(id, name?, kind?, archived?)`
  - `createParticipationRecord(spaceId, date, count, note?, personIds?)`
  - `updateParticipationRecord(id, date?, count?, note?, personIds?)`: only the given fields change. `note: null`
    clears the note, and `personIds` replaces the list.
  - `deleteParticipationRecord(id): Boolean!` archives the record. It stops counting.
- **Permissions:** reads need `canRead` on the nucleus.
  - `updateParticipationSpace` and the three record mutations check `canWrite` on the nucleus that owns the space (for
    a record, its space's nucleus), never on anything the client sends.
  - `createParticipationSpace` checks `canWrite` on the `nucleusId` passed, since that is where the space is created.
  - The app's routes check the same permissions first, but cluster-notebook enforces them too.
- **Errors:** `FORBIDDEN`, `NUCLEUS_NOT_FOUND`, `SPACE_NOT_FOUND`, `RECORD_NOT_FOUND`, `UNKNOWN_KIND`, `NAME_TAKEN`,
  `BAD_INPUT`, `BAD_COUNT`, `NAMED_EXCEED_COUNT`, `OTHER_CLUSTER`, `INDIVIDUAL_NOT_FOUND`, `SPACE_ARCHIVED`. Branch on
  the code, as with the other routes.
- **Counts:** a space with no records has `recordCount` 0 and `latestRecord` null. The app shows "—" for it, never 0.
- **`inSpaces`:** `NucleusPerson.inSpaces: Boolean!` is true for anyone named on a live record of any of the nucleus's
  spaces, archived spaces included, with or without a role. They can be hidden like anyone else. `namedCounts` is
  unchanged: it still counts residents only.
- **SRP:** nothing goes to SRP. Participation is local to cluster-notebook.
- **App side:** the routes are `/api/participation/spaces` and `/api/participation/records`. The People card's
  "Participating" filter uses `inSpaces`. The old roster filter is relabelled "In educational activities".
