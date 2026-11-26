# Members of a nucleus (design)

Status: approved by the owner, 2026-11-26.
Covers both sides. cluster-notebook builds the backend from this, and Nucleus Assistant builds the UI.
It builds on `2026-11-19-people-card-moves-design.md` (residents and moves) and `2026-11-23-hide-people-design.md`.

## Intent

A nucleus can be created without sending it to SRP. Today, though, only a nucleus that is the SRP home of a linked
Setting can have residents, so "create without pushing" can't record who lives there. Network and Population
nuclei (for example "teachers in the city") have no way at all to name the people who make up their population.

The owner wants every nucleus to be able to say who its people are:

- **Neighborhood nuclei: their residents.** Residence is a place, and SRP is the record of it. A Neighborhood that
  isn't in SRP yet still has residents. SRP places them at the nearest SRP place above it now, and in the
  neighbourhood itself once it is pushed.
- **Network and Population nuclei: their members.** Membership isn't a place, and a person can belong to several.

The Overview estimates stay hand-entered numbers (owner, 2026-11-26). The named count only appears as "(n)" beside
**In conversation**, as it already does for residents on a home nucleus: if we know someone well enough to write
their name down, we are probably in conversation with them.

## Goals

- A Neighborhood nucleus that isn't in SRP can have residents, added and removed from the People card exactly as on
  a home nucleus.
- Pushing that nucleus to SRP later carries its residents into the new SRP neighbourhood, with no re-entry.
- Network and Population nuclei can have members, added and removed from the People card.
- "(n)" beside In conversation on every nucleus.

## Non-goals

- Counting members into the Overview numbers. They stay independent.
- Bulk-adding members.
- Adopting an existing nucleus as the home of an FN that SRP already has (the SRP read skips it today). That is a
  separate gap, raised by cluster-notebook with the owner.

## Anti-goals

- Two records of where someone lives. Residence stays `Individual.location`, and nothing else.
- Anything reaching SRP for a Network or Population member.

## Approaches considered

1. **One "member" list for every nucleus**, stored as a role, with an SRP move on the side for Neighborhoods.
   Rejected: for a Neighborhood it is a second record of where someone lives, next to `location`. "At most one
   Neighborhood", SRP reads, and moves made elsewhere would all need code to keep the two in step.
2. **Residence for Neighborhoods, a role for everything else** (chosen, cluster-notebook's proposal, owner said yes
   2026-11-26). Every Neighborhood nucleus has its own Setting, and residents are the people placed there.
   Network and Population members hold an informal `member` role.
3. **Residents only once pushed** (today). Rejected: it defeats creating a nucleus without pushing.

## Decisions

### Owner, 2026-11-26

- Members/residents as above. Overview numbers stay numbers. "(n)" beside In conversation.
- **The home nucleus moves to the Setting** (`Setting.home_nucleus_id`), so an unlinked Setting can have one too.
- **Every Neighborhood nucleus has its own Setting.** Existing Neighborhood nuclei at a Locality are migrated once,
  for example Royal Park and its parent. The invariant: a Neighborhood nucleus is at a Setting, and a nucleus at a
  Setting is a Neighborhood.
- **Type changes** follow the rules in Type changes below (owner approved the addendum).
- **Members SRP refuses on "Move them in"** (any non-Neighborhood type → Neighborhood): the type change applies
  and their `member` roles end. Each is moved locally at once; if SRP later refuses, the move is undone and they go
  back to where SRP has them, connected to neither. Accepted, provided the refusals are named in the Admin page Log (owner, 2026-11-26). The change
  mostly corrects an earlier mistake, so it is rare.

### My calls (please check)

- **Labels:** the People card keeps **Resident** 🏠 on Neighborhood nuclei, and shows **Member** on Network and
  Population nuclei. A `member` role on a Neighborhood is refused, since residence covers it.
- **Pockets:** a Neighborhood pocket under a parent gets its own Setting like any other Neighborhood. Until the
  pocket is pushed, its residents sit in SRP at the nearest ancestor in its Locality that is in SRP, otherwise at
  the Locality (see projected place below). The Identity card's pocket advice changes to match (below).
- **Refused move at push:** if SRP refuses to move a resident into the newly created FN, the person stays a
  resident locally, and their row shows "SRP refused" with the reason. The next SRP read then moves them to wherever
  SRP has them, so they stop being a resident. Accepted as a known edge; neither side sees a better outcome.
- **A Neighborhood's Locality:** the Identity card shows a **Locality** field in place of Location. While the
  nucleus isn't in SRP it is editable: it moves the nucleus's Setting to the new Locality, and the residents'
  projected place is re-sent to SRP. Once the nucleus is in SRP it is read-only, as Location is today.
- **Projection changes re-send:** anything that changes a resident's projected place re-queues their SRP place
  write. That covers a change anywhere up the parent chain: a push, move, delete, type change or reparent. The
  writes go to the residents of every descendant whose projection changed. For example, pushing a parent moves an unpushed pocket's residents from the Locality to
  the parent's new FN.
- **No residence on Network or Population:** they have no Setting, so there is no Resident control and
  `moveIndividuals` can't target them. Someone who lives in a neighbourhood and is a member of a Network shows as
  Resident on the one and Member on the other.
- **The count:** each person counts once. For a Neighborhood it is its residents, whatever roles they hold; for
  Network and Population it is its `member` holders. Hidden people are left out, as `residentsNamed` does today.
- **Order of release:** cluster-notebook ships first, with the migration and the new fields. The app follows once
  they are confirmed live, as with earlier phases. Names keep working throughout.
- **MOVE_IN results** (settled with cluster-notebook 2026-11-26): SRP refusals happen later, in the worker, so
  nothing can report them at once. MOVE_IN is all-or-nothing locally: if the caller can't move every member, the
  type change is refused (`MOVE_REFUSED`, listing the people) and nothing changes. On success the app says
  "14 moved in; SRP is being updated". SRP outcomes arrive later on each person's `placeSync`.

## Backend (cluster-notebook)

Field and code names are cluster-notebook's proposal; they settle the final ones and we record them in
`docs/cluster-notebook-api-requirements.md`.

### Residence (Neighborhood)

- `Individual.location` stays the only record of residence. A person may now be placed at an **unlinked Setting
  that has a home nucleus**. Today that is `NOT_A_PLACE`.
- `moveIndividuals(locationId: <the nucleus's Setting id>)` is the one call for moving someone in, for any
  Neighborhood. The local move happens at once. The worker sends SRP the **projected place**:
  - a linked Setting projects to itself;
  - an unlinked one walks up the parent chain within the same Locality, and projects to the first ancestor whose
    Setting is **linked**; if there is none, it projects to the Locality. The FN-delete rule (`remove_fn_place`)
    moves to the same walk.

  A refusal works as today: the local move is undone, `placeSync` shows `refused` with a code, and households move
  together.
- `NucleusPerson.isResident` is true for people placed at the nucleus's Setting, linked or not.
- **SRP reads** compare SRP's place for each person with our projected place. If they match, the person stays. If
  they differ, the person moves to SRP's place, and so stops being a resident here. A pending write holds the read
  back, as today.
- **Push:** linking an unlinked Setting keeps its id, so nobody moves locally. The worker queues a place write for
  each resident, because their SRP place changes from the projection to the new FN. Results arrive per person in
  `placeSync`.
- **Parent change or delete of an unpushed Neighborhood:** a parent change re-queues the residents' place writes,
  because their projection changed. A delete moves residents to the projected place, using the same rule as an FN
  delete.
- **Permission:** `can_move_individual`, as today.

### Membership (Network, Population)

- An informal role `member` in RoleInNE. It grants no permissions and is not counted by `holdsRole`, like
  `promoter`. It keeps start/end history, audit, hides and `NucleusPerson.roles`.
- Managed with `updateNucleusWorkers(nucleusId, role: "member", …)`, with worker-list permissions.
- Refused on a Neighborhood nucleus.

### Counts

- `Nucleus.memberCount`, on `nuclei` and `nucleus`, from one batched query. For a Neighborhood it counts residents
  at its Setting, linked or not; for Network and Population it counts current `member` holders. Hidden people are
  left out, matching the People card's default view.

### Type changes

- **Neighborhood → Network or Population:**
  - Home of a linked Setting (in SRP): refused, as today (`SRP_IS_NEIGHBOURHOOD`).
  - Not in SRP: automatic. Residents become `member` holders. Each is moved locally to the projected place, where
    SRP already has them, so SRP's place for them doesn't change. The unlinked Setting is archived.
- **Any non-Neighborhood type (Network, Population or null) → Neighborhood:**
  - With no members: the change just happens, and the nucleus's Setting is created.
  - With members: refused with `HAS_MEMBERS` unless the patch carries `membersOnTypeChange`:
    - `MOVE_IN`: each member becomes a resident through `moveIndividuals`. SRP follows, with `placeSync` per
      person; household refusals apply.
    - `END`: their member roles end, and nobody moves.
  - `MOVE_IN` is all-or-nothing locally: if the caller can't move every member (FORBIDDEN, OTHER_CLUSTER), the
    change is refused with `MOVE_REFUSED`, listing the people, and nothing changes. There is no per-person result
    payload; SRP outcomes arrive on each person's `placeSync`.
- The Setting is created or archived in the same transaction as the type change.
- **A Neighborhood's Locality:** `NucleusPatch.localityId` moves its Setting to another Locality. It is refused on
  an SRP home (`SRP_IS_NEIGHBOURHOOD`), checks for name clashes in the new Locality, and re-projects the residents.
  Until the app switches over, setting `locationName` or `locationId` on a Neighborhood to a Locality means the
  same thing. Pointing it at the Cluster is refused (`NEEDS_LOCALITY`), and so is pointing it at another Setting.

### Refused moves in the Log

Confirmed with cluster-notebook 2026-11-26. Today an SRP refusal undoes the local move, and the undo is audited as
"srpSync" with a null actor and `location_id` ids, without the code, so it looks the same as an SRP read.

- The undo's mutation becomes `srpRefusedMove`.
- A nullable `reason` on audit rows, exposed as `LogEntry.reason`, carries the refusal code (for example
  `HOUSEHOLD_MOVES_TOGETHER`). It is generic, so FN action refusals can use it later.
- **Names, not ids:** `LogEntry.names: JSON` maps every id that appears as an old or new value in `changes` to its
  current display name (a person's "First Family", or a place's name). Names are resolved when the log is read, so
  past rows and every id-valued field (`location_id`, `parent_id`, a role's entity) benefit. A place renamed since
  then shows its current name. An id whose row is gone is left out of the map, and the card shows the id.
- A refusal that arrives after the person has already been moved again undoes nothing, and stays on `placeSync`
  only (my call: the person isn't anywhere wrong).
- **App:** the Log card shows such an entry as "SRP refused the move: <reason>. Back at Carrboro.", using the same
  wording for reasons as the People card.

### Type not decided (null), and where a Neighborhood can be

Confirmed with cluster-notebook 2026-11-26: `createNucleus` never sets a type today, and a nucleus without a
Locality sits at its Cluster, where `updateNucleus` could then make it Neighborhood.

- **A null `nucleusType` means "not decided yet".** It is allowed only away from a Setting, and counts as not
  Neighborhood: no Setting, no residents, and the `member` role is allowed (my call).
- **Neighborhood needs a Locality.** Setting the type to Neighborhood is refused (`NEEDS_LOCALITY`, name
  provisional) unless the nucleus is at a Locality, or the same `updateNucleus` also moves it to one. Either way,
  its Setting is created.
- **`createNucleus`** stays identity-only. With `srpLocalityName` the nucleus becomes an FN, so it is Neighborhood
  and gets its Setting.

### Migration

- A nucleus at a Setting with a null type gets "Neighborhood" stored, so the stored and resolved types agree (11 in
  dev).
- Every live Neighborhood nucleus at a Locality gets its own unlinked Setting, with itself as home.
- **Non-home nuclei at a linked Setting** (today a Setting can hold its SRP home plus other local nuclei) each get
  their own unlinked Setting in the same Locality, with themselves as home. None exist in dev; production may have
  some. Afterwards a linked Setting holds exactly its home.
- **Neighborhood at the Cluster:** there are none (the owner checked production, 2026-11-26). The migration still
  refuses to run if any appear before it runs, so nothing changes silently.
- `link.home_nucleus_id` moves to `Setting.home_nucleus_id`.

## Nucleus Assistant (this app)

- **`isHome` → `hasSetting`.** Resident shows on every Neighborhood nucleus, not only on SRP homes. The move-in
  target is the nucleus's own Setting. Moving out goes to the projected place.
- **People card:**
  - On a Neighborhood that isn't in SRP, the move confirm says where SRP will have them: "In SRP they'll be at
    Carrboro until this nucleus is sent to SRP."
  - On Network and Population nuclei, **Member** is a role in the editor. Ticking it adds the `member` role, with
    no move confirm, and a **Members** filter appears.
- **"(n)" beside In conversation:** from `memberCount` on every nucleus, replacing `residentsNamed`.
- **Identity card, Type:** changing Network or Population to Neighborhood with members asks first:

  ```
  This nucleus has 14 members. A Neighborhood's members are its residents.
  [Move them in]  each becomes a resident here; SRP is updated, and anyone SRP refuses goes back to where SRP has them
  [End their memberships]  nobody moves
  [Cancel]
  ```

  After Move them in, it says "14 moved in; SRP is being updated". If the change is refused because some can't be
  moved (`MOVE_REFUSED`), it names them and nothing changes.

  Changing a Neighborhood that isn't in SRP to Network or Population says: "Its 5 residents become members. SRP is
  not changed." A Neighborhood in SRP keeps Type read-only, with the existing explanation.
- **Identity card, Location:** a Neighborhood is always at its own Setting, so it shows a **Locality** dropdown
  instead of Location (sent as `localityId`), editable until the nucleus is in SRP. Choosing a Locality or
  the Cluster as Location applies only to Network and Population nuclei.
- **New Neighborhood:** with a Locality chosen, the nucleus is created as a Neighborhood with its own Setting
  (the dialog is already titled "New Neighborhood"). Locality becomes required, and "Create in SRP" stays
  optional. A nucleus with no type yet ("This cluster", or Locality but no type) only comes from older data.
- **Identity card, Type:** Neighborhood is only offered when the nucleus has a Locality. A nucleus with no type
  shows "Not set".
- **Pocket advice** ("give it the Cluster or a Locality…") changes to: "Until this nucleus is in SRP, its residents
  count toward its parent's neighbourhood in SRP."
- **Picker:** the rollups may add "(n)" beside In conversation from `memberCount`. Optional, to decide in the plan.

## Left to the builders

- Exact field and code names (`membersOnTypeChange`, `HAS_MEMBERS`, `memberCount`, the MOVE_IN result field).
- How the migration names each new Setting. The nucleus's name is the natural choice.
- Copy beyond the strings above.
