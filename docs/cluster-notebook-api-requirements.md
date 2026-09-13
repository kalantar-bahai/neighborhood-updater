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
- Standard: locality, stage, contact name + email, auxBoard, makeup
- Population: totalPop, totalHH, indNum, indPct, hhNum, hhPct (currently hand-entered aggregates; per your data model, should become derived rollups once real Individual/Household records exist — until then, needs to accept a manually-entered aggregate). **Done, 2026-09-13**: totalPop/totalHH/indNum/hhNum now wired to your `population`/`households`/`connectedPopulation`/`connectedHouseholds` fields. indPct/hhPct remain purely client-side computed (percentage of total) — no cluster-notebook equivalent, confirmed not needed.
- Activities: four rollups (ccs, jygs, scs, devotionals), each `{act, part, fof}` — devotionals already covered by `devotionalGathering`; need the same shape for cc/jyg/sc (your `ActivitySummaryOverride` entity already generalizes this — just needs the other three `activityType` values wired to query/mutation)
- Qualitative fields, each paired with notes: level, supported/notesSupported, presence/notesPresence, involved/notesInvolved, efforts/notesEfforts, gatherings/notesGatherings
- protagonists/accompaniers as free-text counts (separate from the named worker lists in §4 — used today only as a cross-check "mismatch" signal against the named list length)
- narrative (free text). **Done, 2026-09-13**: wired to your `Nucleus.narrative` field, plain string, no special semantics needed.

**Correction, 2026-09-13** — verified directly against `web/src/components/DetailView.tsx`, since your read of which qualitative fields are live turned out wrong in both directions:
- **Actually live in the UI today:** `stage` (dropdown for admins / read-only text otherwise, in the Identity card; also shown as a colored badge per nucleus in the `Picker.tsx` list — values `Potential/1, Initial/2, Emerging/3, Expanding/4, Advanced/5, Advanced+/6`), `locality` (dropdown for admins / read-only otherwise in the Identity card, fixed client-side option list `LOCALITY_OPTIONS`; also shown as the subtitle under each nucleus in `Picker.tsx`), `makeup` (free-text "Makeup of Population" textarea, Population card), `presence`/`notesPresence` (the "Social Action" toggle — NOT `efforts`, which has no UI at all), `gatherings`/`notesGatherings` ("Regular Gatherings / Festivals" toggle, correctly mapped to your `hasCommunityGatherings`), and `notesPrevalence` (the general "Notes" field under "Workers & Prevalence", paired with protagonists/accompaniers, not with `level`).
- **Actually dead (no UI, no plans to revive):** `level` (our own field of this name — see resolution below), `supported`/`notesSupported`, `involved`/`notesInvolved`, `efforts`/`notesEfforts`.
- **Field-name mapping is nucleus-assistant's job, not yours** — matches your own stated policy of not naming your fields after any one client's, though in this case you ended up renaming to match ours directly (see below).

**Resolved, 2026-09-13**: your schema briefly had both a `level: String` field (added with our `stage`'s real values, `Potential/Nascent/.../Advanced+` — "Nascent" was your own correction-in-progress typo for "Initial") and an unrelated, uncommented `stage: Int` (stale leftover from an early schema sketch, nothing read/wrote it). You've since removed `stage: Int` and renamed `level` → `stage` (kept as `String`, values corrected to `Initial/2` not `Nascent/2`) — one field, directly named to match our `stage`, no mapping needed. `makeup` maps to your `populationMakeup` (confirmed). ~~`locality` is a plain, unconstrained string on your side~~ — see 2026-09-13 breaking-change correction below, this changed. Our own (separate, dead) `level` field stays unmapped/unmodeled on your side — legacy data, not carried forward.

**Breaking change, 2026-09-13**: `locality` was a hand-entered string on your side; the user found it was wrong relative to your own tracked structure (e.g. Kingswood's hand-typed `locality` was "Kingswood", but its real `location` chain resolves to "Chapel Hill"). You corrected it: `locality` on `Nucleus` is now a **read-only derived value** (walked up from `location`'s containment chain to the nearest Locality-type entity, or null if the chain never reaches one), and `NucleusPatch.locality` was **removed entirely** — writing it now fails GraphQL validation. Nothing currently sets `location`/`locationId` from our side either, so there's no write path to influence this value at all right now. On our side: stopped sending `locality` in `updateNucleus` calls (it was being sent on every single save, not just locality edits, so this was a live break until fixed); the "Locality" field in `DetailView.tsx` is now always read-only (was an admin-editable dropdown against a client-side option list, which is now dead code, removed). If a real write path for `location` ever gets designed, revisit.

**Done, 2026-09-13**: `presence`/`notesPresence` (our "Social Action" toggle) and `gatherings`/`notesGatherings` (our "Regular Gatherings / Festivals" toggle) now wired to your `hasSocialAction`/`socialActionDescription` and `hasCommunityGatherings`/`communityGatheringDescription`. Confirmed your booleans are full tri-state (true/false/null), matching our Yes/No/never-touched exactly — no lossy mapping needed. `level`, `supported`/`notesSupported`, `involved`/`notesInvolved`, `efforts`/`notesEfforts` remain dead, no UI, not modeled on your side either.

## 3. Nucleus detail (write)

**Write**: update any subset of the above fields for one nucleus, by name. Today this is one `saveRowData(name, formData)` call that writes whichever fields are present in `formData` (partial update semantics — omitted fields are left alone). A single broad "patch nucleus" mutation (rather than one mutation per field) would match this pattern most directly, though per-field mutations (as already done for devotionals) also work if patch semantics are preserved per field.

**Field sensitivity**: two-tier within one role — "identity fields" (nucleus, parentNucleus, grouping, cluster, pg, clusterCode, nucleusType) require `admin`; "standard fields" (locality, stage, contact, email, auxBoard, makeup, activities, worker lists) only require `read-write`. Since access control stays on our side for now (§7), this just needs the mutation to accept identity and standard fields as it does today — enforcement happens in nucleus-assistant's API route before the call reaches you.

## 4. Nucleus create / delete

**Write**: create a new nucleus (name + all fields from §2, conflict error if name already exists) and delete a nucleus by name. Both currently `admin`-only, global-scope (`roleMap['*'] === 'admin'`).

## 5. Worker lists (named-list pattern)

**Read**: given a nucleus name and a role type (`accompanier` | `protagonist` | `abm-assistant`), return an ordered list of names.

**Write**: replace the full ordered list for a (nucleus, type) pair. Order is meaningful (not alphabetized) — add/remove/reorder all currently expressed as "send the new full ordered list."

Per your data model, this is exactly the "Worker role assignment" / `RoleInNE` generalization — today these are unlinked free-text name strings, not `Individual` references. We'd want this to resolve to real `Individual` records (matching-or-creating on entry) once that entity exists on your side; until then, a plain string-list read/write is the minimum viable version. More role types beyond these three are expected over time — worth keeping the type as an open string/enum rather than hardcoding three values.

**Cross-check signal**: the `protagonists`/`accompaniers` free-text count fields in §2 are compared against these lists' lengths client-side to flag a "mismatch" (not auto-reconciled). No API implication beyond exposing both.

## 6. Access control — deferred, not requested now

Per our decision, per-nucleus role access (read / read-write / collaborator / admin, with `*` wildcard) stays on our Sheet-based `Access` tab until cluster-notebook has a real permissions model. **Not asking you to build this yet** — flagging it here only so it's visible as a known future ask, consistent with your own requirements doc's open question on the permissions model shape.

## 7. SRP-sourced comparison data — not requested from you

The Devotionals/Education report aggregates (scraped into our own Sheet by `srp-cache`, joined by name) are used only as a read-only cross-check against the hand-entered activity rollups in §2. Per your own docs, SRP sync is `cluster-notebook`'s eventual job via `srp-client`, but we're not asking for this yet — we'll keep reading it directly from our Sheet until that sync path exists on your side and we explicitly migrate this read.

## Suggested next-slice ordering

Given devotionals (§2/§3, one of four activity rollups) is done, natural next slices in rough order of value/effort:
1. **Done, 2026-09-13.** The other three activity rollups (cc/jyg/sc) — same shape as devotionals, `ActivitySummaryOverride` already generalizes to them. `updateActivitySummary` is live; not yet wired into nucleus-assistant's own code (only devotionals is wired so far).
2. **Partially done, 2026-09-13.** `stage`/`locality`/`populationMakeup` are live via `updateNucleus(name, patch: NucleusPatch)` and wired into nucleus-assistant's `getRowData`/`saveRowData` (not `createRowData` — see below). Remaining standard fields (contact, email, auxBoard) still deferred, per your own note that contact/auxBoard are Individual-role concepts.
3. Worker lists (§5) — needs a decision on your side about `Individual` modeling first, per your own "no Individual entity modeled yet" limitation.
4. Identity fields + create/delete (§4) — lowest frequency of use, fine to defer. Note: `createRowData` (nucleus creation) still writes `stage`/`locality`/`populationMakeup`/devotionals to the Sheet only, deliberately not wired to `updateNucleus`/`updateActivitySummary` — you have no create-nucleus mutation, so those calls would always fail for a brand-new nucleus. This is the real blocker on wiring nucleus creation, not a decision we're deferring for other reasons. **Partially done, 2026-09-13**: `grouping`/`cluster`/`pg` (`Cluster.groupOfClusters`/`name`/`growthMilestone`) are wired read-only — confirmed with the user: `grouping` = Group of Clusters (the SRP tier above Cluster), `pg` = Program of Growth milestone code (M1/M2/M3, mapped from your three verbatim strings), `clusterCode` needs no field, parsed from `cluster.name` — **done, 2026-09-13**: derived client-side (first whitespace-separated token of `cluster.name`), no longer a stored/editable field on our side either. `contact`/`email`/`auxBoard` remain unaddressed, still deferred per your Individual-role-concept note. `parentNucleus`/`nucleus` (the name itself) remain sheet-only.

**`nucleusType` — done, 2026-09-13.** You exposed `nucleusType` (query + patch); it always reads "Neighborhood" when `location` is set. Initially held this back over a miscategorization concern (our picker groups nuclei into Neighborhood/Network/Population cards by this field), but the user corrected the premise: Network/Population nuclei aren't location-bound by definition, so they'd never have a `location` set and would naturally take the settable path, keeping their real stored type. The override only ever fires for nuclei that are already location-bound Neighborhoods — not a data-corruption risk. Wired up on both the detail view and the picker (`/api/initial-data`, matching how locality/stage/devotionals are sourced there).

No response needed by any deadline — this is context for whatever schema-design work you're already doing. Happy to answer follow-up questions about any field's exact current semantics.
