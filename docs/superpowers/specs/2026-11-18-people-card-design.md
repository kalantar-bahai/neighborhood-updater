# People card — design

Status: draft for owner review, 2026-11-18.
Backend counterpart: cluster-notebook (requests listed under "What we need from cluster-notebook").

## Intent

SRP can tag each person with a Focus Neighbourhood (FN), meaning they live there. Most people in SRP sit only at
their Locality, because SRP requires a Locality but not an FN. Fixing that in SRP takes a search, opening the
person, Edit, changing the field and Save, one person at a time. The owner wants Nucleus Assistant to make
exploring a nucleus's people easy, and later to make moving people between places quick.

The Overview name lists (Promoting, Helping Others, Accompanying) already hold many of these people, but their
definitions deliberately include people who don't live there and leave out many residents. A separate card shows
everyone connected to the nucleus in one place.

## Model (owner's decisions)

- A person's **place** is a Cluster, Locality or Setting (cluster-notebook `Individual.location`, synced from SRP).
  It is never a nucleus.
- **Residents** exist only on **home nuclei** (a home nucleus's Setting is its FN). This includes child nuclei that
  are themselves home nuclei. A resident of nucleus X is a person whose place is X's Setting.
- "Resident" is shown like a role in the card but is not stored as one: it is the person's place. Ticking it
  (phase 2) moves the person; it never creates a RoleInNE row. *Why:* a person lives in exactly one place and SRP is
  the record; a stored role could disagree with SRP or put someone in two places.
- A parent nucleus's card shows only its own residents, not its children's. A roll-up is a possible future filter.
- Roles stay exactly as today (RoleInNE per nucleus): `promoter`, `protagonist`, `accompanier`, `contact`,
  `abm-assistant`, and cluster roles (ATC, CSO, ...).

## Permissions (owner's decisions)

- **See the list, filter and search it:** anyone who can read the nucleus (`canRead`).
  - Role holders' names: already visible to readers today.
  - Residents' names (people who may hold no role): **new exposure**, accepted by the owner. No phone, email, age or
    sex in the card.
- **Change roles from the card:** the same rules as today, per role. `canAssignRoles`; non-informal roles also need
  the role in `assignableRoles` (so ticking Accompanying still needs the `accompanier` grant).
- **"+ Add" search:** searches **every person in the nucleus's cluster** (today: only people holding some role).
  Each result shows the name and the full place path, e.g. "Ana Lopez · Chapel Hill › Chapelboro - Parkside" or
  "Ana Lopez · Carrboro (locality)", because names like Parkside repeat across localities. **New exposure**, accepted
  by the owner. Gate: as today's search (`canWrite` on the nucleus).
- **Move a person (phase 2):** allowed if the caller can edit **either** the old place's home nucleus **or** the new
  one (owner, 2026-11-18: assume collaboration; tighten later if needed). For a Locality or Cluster with no home
  nucleus, the nucleus being edited counts.
- cluster-notebook records these rules in its `docs/authorization-rules.md`; it enforces them too.

## Phases (owner's order)

1. **People card, roles + read-only residents.** Uses data that mostly exists. Detailed below.
2. **Move residents, through SRP.** Needs srp-client to write an individual's FN/Locality (today
   `Individuals.create_or_update` raises NotImplementedError). Owner's canary rule applies: a small batch first,
   diffing the full remote record before and after (the 2026-10-06 incident erased ~700 addresses during a
   "harmless" write). cluster-notebook rides its existing Outbox write-back.
3. **Activity icons.** Needs cluster-notebook to store activity participants (SRP's participant lists; local only).
4. **Archiving people.** Needs an archived flag in cluster-notebook and, for SRP, the same individual-write work as
   phase 2 (SRP has `is_archived`).

## Phase 1 in detail

**Card:** "People", directly after Overview, closed by default (card key `people`, kept open across reloads like
the other cards).

```
People                                         [+ Add]
[All ▾]  [search names…        ]
 Ana Lopez        🏠  ★  📣
 Ben Okafor           👥  🤝
 Carla Diaz       🏠
 🏠 resident  ★ contact  📣 promoting  👥 helping others  🤝 accompanying
```

- **Rows:** name, then one icon per role held on this nucleus, plus 🏠 for a resident (home nuclei only). Icons have
  a text label on hover and for screen readers. Sorted by name. Scrolls inside the card when long.
- **Filter:** All, Resident (home nuclei only), and each role present. **Search:** filters the shown rows by name,
  client-side.
- **Edit a row** (if the caller can change any role here): tick or untick roles the caller may assign. Resident is
  shown but read-only in phase 1.
- **"+ Add":** search the cluster (name + place path) or create a new person (as today's pickers), then tick roles.
  A person with no ticked role isn't added.
- **Remove:** unticks all roles the caller may change. A resident with no roles stays listed (they still live
  here).
- **Same data as the Overview lists and Contact / ABm Assistant:** a change in either place shows in the other
  without a reload.
- Empty state: "No one is connected to this nucleus yet."

## Phase 2 sketch (for cluster-notebook planning)

- Ticking Resident on X moves the person's place to X's Setting. Confirm first, naming the old place with its path:
  "Ana Lopez lives in Chapel Hill › Chapelboro - Parkside. Move her here?"
- Unticking Resident, or removing a resident, offers the destination: the parent nucleus's home Setting by default
  (if the parent is a home nucleus in the same locality), otherwise the Locality, or any place the caller picks.
- A pending move shows until SRP has it; a refusal shows SRP's reason.

## What we need from cluster-notebook

- Phase 1:
  - `nucleus.people`: each person connected to the nucleus with `individual { id, name }`, `roles: [String]`,
    `isResident: Boolean` (one call, instead of one call per role).
  - `individuals(nucleusName, search)`: return all people in the cluster (not only role holders) and add each
    person's place with its path (place name, type, Locality, Cluster).
  - The two new read exposures written into their authorization rules.
- Phase 2: `setIndividualLocation(individualId, location)`, audited, with SRP following via the Outbox; srp-client
  individual writes; reads must stop undoing a pending local move.
- Phase 3: activity participants table and `people.activities`.
- Phase 4: individual archive flag; read SRP's `is_archived`.

## Approaches

- **A. Staged, roles first** (chosen). Ship what existing data supports now; residents read-only until SRP writes
  are safe.
- **B. Wait and ship everything together.** Rejected: blocks a useful card on the riskiest piece.
- **C. Local-only moves now.** Rejected: every read from SRP would undo them, and SRP stays wrong.

## Non-goals and anti-goals

- No individual detail page yet (name and icons only).
- No phone, email, age or sex in the card or search results.
- No residents for non-home nuclei; no local-only "resident" tag (possible future).
- Not changing the Overview counts' definitions, or making them derive from the list.
- Anti-goal: any SRP write to individuals before the canary passes.

## Calls made after the builder check (for owner review)

- **Source of truth:** the card reads `nucleus.people`. The Overview lists and Contact / ABm Assistant keep their
  current reads. After a role change in either place, the other re-reads, so there's no client-side merging.
- **Role writes:** reuse `updateNucleusWorkers` (it replaces one role's full list), one call per changed role. If
  one call fails, show the error and re-read the card; no optimistic rollback.
- **Contact stays one person:** ticking Contact on someone confirms first ("This replaces Ana Lopez as contact."),
  as the Contact picker does today.
- **All roles held on this nucleus itself show,** including Accompanying, Contact, ABm Assistant and any other role
  assigned here, as a generic badge with the role's name. Roles held at the Cluster or Locality are not included
  (confirmed with cluster-notebook 2026-11-18). Manage Access keeps its own exclusions.
- **Home nucleus:** taken from the existing SRP state (`IN_SRP` = home). The Resident filter and 🏠 icon show only
  then; `isResident` is false elsewhere anyway.
- **Search:** server-side, debounced, limited to the first 20 matches, with "keep typing to narrow" when more exist.
- **Order:** cluster-notebook ships the phase-1 reads first; we confirm field shapes with them before planning. The
  person id is the same `Individual.id` that roles use today.
- **A person created here** sits at the cluster, as today, until phase 2 can move them.

## Left to the builder

Icon choice, exact copy within the wording above, layout of the add flow (reuse `WorkerListModal`'s search where it
fits), and how card state is shared with the Overview lists.
