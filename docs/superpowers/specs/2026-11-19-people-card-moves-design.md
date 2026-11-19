# People card, phase 2: moving residents (design)

Status: draft for owner review, 2026-11-19.
Builds on `2026-11-18-people-card-design.md` (phase 1, shipped in PR #50).
Backend: cluster-notebook `moveIndividuals` (branch `move-individuals`, not yet deployed), writing through to SRP
via srp-client `set_place`.

## Intent

Most people in SRP sit at their Locality with no FN. Fixing one person in SRP takes a search, then Open, Edit,
change the field and Save. The owner wants Nucleus Assistant to make moving people quick, one person at a time,
from the People card. SRP follows automatically.

## Decisions (owner, 2026-11-19)

- **One person at a time**, from the People card. No bulk sweep screen in this phase.
- **Move in** happens through the existing **"+ Add"**: search the cluster, pick a person, tick **Resident**, Save.
  Ticking Resident on a listed non-resident (someone with a role here) works the same way.
- **Move out**: untick **Resident** on a row, then Save.
- **Roles when someone moves:**
  - (a) Their roles at the nucleus they are leaving: the move asks. "Keep roles here (still working in this
    nucleus)" starts ticked; unticking it clears those roles as part of the move.
  - (b) Nothing transfers to the new nucleus. They arrive as a resident with no roles there. Transferring roles is
    a possible future.
- **The "Remove" button goes.** It only cleared roles, and the word suggested deleting someone or moving them out.
  Unticking roles does the same thing.
- **Permission** (cluster-notebook enforces it): the caller can edit the home nucleus of the old place or of the
  new one. Where a side has no home nucleus (a Locality), editing any nucleus in the person's cluster counts.

## Behaviour

**Move in (to this nucleus's Setting).** Only on a home nucleus (Resident shows only there).

```
Move Ana Lopez here?
  Lives in: Chapel Hill › Carrboro › Lloyd Farm
  Ana Lopez is Promoting 📣 at Lloyd Farm.
  [✓] Keep roles at Lloyd Farm (still working there)
                                        [Cancel] [Move]
```

- The roles line and checkbox show only if the person holds roles at their current place's home nucleus and the
  caller can change those roles there. Otherwise those roles stay, with no question.
- Someone at a Locality or the Cluster (no home nucleus) gets no roles question.
- Ticking roles here in the same Save is allowed; the move goes first, then the role writes.

**Move out (from this nucleus's Setting).** The destination is the parent nucleus's Setting if the parent is a home
nucleus in the same Locality; otherwise the Locality.

```
Move Ana Lopez out of Lloyd Farm?
  To: Chapel Hill › Carrboro
  Ana Lopez is Promoting 📣 here.
  [✓] Keep roles here (still working in this nucleus)
                                        [Cancel] [Move]
```

- To move someone to a different nucleus, open that nucleus and use "+ Add". The card has no general place picker.
- A person who leaves and keeps no roles drops out of the list after the re-read.

**Move state** (from `PersonSummary.placeSync`), shown beside 🏠 on the row:

| status | shows |
|---|---|
| pending, in_flight | ⏳ "On its way to SRP" |
| synced, or no placeSync | nothing |
| refused | red note with the reason; the move was undone |
| failed | red note "Couldn't reach SRP: <code>"; SRP's place returns on the next read |
| not_in_srp | nothing (created here; nothing to send) |

- **Households move together** (owner, 2026-11-19): every move sends `withHousehold: true`. srp-client finds the
  household contact and moves the whole household, so there is no household prompt.
- Refusal codes get plain-language text: `FN_NOT_IN_LOCALITY` "That neighbourhood isn't in their locality",
  `OUT_OF_SCOPE` "SRP doesn't let us change this person", `NOT_IN_SRP_RECORDS` "SRP doesn't have this person",
  anything else "SRP refused the move (<code>)"; each ends "The move was undone." Key off `code`, never `error`.
- Per-person results from `moveIndividuals`: `FORBIDDEN` "You can't move this person", `OTHER_CLUSTER`
  "This person is in another cluster", `NOT_FOUND` "Person not found", `ALREADY_THERE` treated as success.
- The move state survives reloads (it comes from the server), so a slow SRP is visible for as long as it takes.

## What we need from cluster-notebook

- Built (branch `move-individuals`, SDL as sent 2026-11-19):
  - `Location.id: String!` (on `PersonSummary.place`, `Nucleus.location`, ...).
  - `moveIndividuals(individualIds: [String!]!, locationId: String!, withHousehold: Boolean = false): [MoveResult!]!`
  - `type MoveResult { individual: PersonSummary  moved: Boolean!  code: String }`; per-person codes `NOT_FOUND`,
    `OTHER_CLUSTER`, `FORBIDDEN`, `ALREADY_THERE` (`individual` is null for the first three). Whole-call errors
    (`extensions.code`): `FORBIDDEN`, `LOCATION_NOT_FOUND`, `NOT_A_PLACE`.
  - `PersonSummary.placeSync: PlaceSync` (null if no change): `{ status, requestedAt, code, error, household:
    [PersonSummary!], householdSize }`; status `pending | in_flight | synced | refused | failed | not_in_srp`.
- Asked 2026-11-19: `Location.localityId`; `Location.homeNucleus` (name, or null); parent nucleus's location id
  and `inSrp`. Needed to choose the move-out destination and to ask about roles at the old nucleus.
- Our location picker still sends `updateNucleus(locationName)`; switch it to an id when available (#41).

## Calls made after the builder check (for owner review)

- **Two kinds of refusal.** `moveIndividuals` answers at once for permission, cluster and not-found; the card shows
  those in the editor and nothing moves. SRP's answer (synced, refused, household) comes later through `placeSync`,
  so it shows on the row, not in the Save.
- **Watching a move.** While the card is open and any row is pending or in flight, it re-reads every 10 seconds.
- **Who sees Resident enabled:** anyone who can edit this nucleus (`canWrite`). That always satisfies the move rule,
  because this nucleus is one side of the move.
- **People created here** (`not_in_srp`) can be moved too; the place changes in Nucleus Assistant and nothing is sent.
- **One Save, in order:** the move first. If it's refused at once, no role changes are written. If it goes through
  (even if SRP hasn't answered), the role changes follow. If SRP refuses later, the move is undone but role changes
  stay; the red note on the row tells you, and you can re-tick roles.
- **The confirm decides roles at the old nucleus.** On a move out, the confirm lists the roles as ticked in the
  editor; "Keep roles here" unticked clears them all.
- **Roles at someone's old nucleus** (move in) are read through a new route from `Location.homeNucleus` once
  cluster-notebook adds it; we plan when those three asks are answered.

## Approaches

- **A. Moves inside the existing People card flows** (chosen): "+ Add" plus Resident to move in, untick Resident
  to move out. No new screens; matches how the owner fixes people, one at a time.
- **B. A bulk "sweep" screen** (people at the Locality with no FN, tick many, move): deferred. The API already
  supports many people per call, so this can follow.
- **C. A general place picker on each row**: rejected for now. It duplicates "+ Add" from the destination nucleus
  and makes it easy to move someone by mistake.

## Non-goals and anti-goals

- No bulk moves, no household management screen, no role transfer.
- No moves to a Cluster, a Nucleus, or a Setting not linked to an SRP FN (the API refuses them).
- Anti-goal: moving anyone by place name. Always by id.
- Anti-goal: hiding a refused or failed move. The person must see that SRP didn't take it.

## Testing

- Locally against cluster-notebook `move-individuals` with the worker on `--fake-srp` (never the real SRP). The fake
  never refuses for a household, so that path is covered by unit tests of the decision helpers only.
- First production use follows the canary rule: a few people, with full SRP records compared before and after.

## Left to the builder

Exact layout of the confirm (inline in the editor, as phase 1's editor is), icons, and how the card polls or
re-reads while moves are on their way.
