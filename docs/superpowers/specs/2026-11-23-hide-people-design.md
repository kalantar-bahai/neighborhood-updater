# People card, phase 4: hiding people (design)

Status: approved by the owner, 2026-11-23.
Builds on `2026-11-20-people-card-details-design.md` (phase 3: who is this person).
Backend: cluster-notebook hide-person (SDL agreed 2026-11-23; live in production, PR #54).

## Intent

Neighbourhood lists carry about ten years of names, many no one recognises. The client does not want Nucleus
Assistant to offer SRP's archive directly. Instead, a team member can **Hide** a person at the nucleus they are
working in. The person then drops out of that nucleus's lists and counts. Nothing changes in SRP. Later, a CSO or
administrator reviews the hidden people and may archive them in SRP; that review is a separate admin dashboard,
not this card, and not part of this phase.

## Decisions (owner, 2026-11-23)

- **A hide is per person, per nucleus**, recorded in cluster-notebook only. It applies only where it was done: a
  person hidden in a pocket stays visible at the parent nucleus unless hidden there too, and the other way round.
- **Hidden people leave every list and count at that nucleus:** the People list, the total line, the Overview's
  role name lists (Promoting, Helping Others, Accompanying, Contact, ABM assistant) and their "(x)" counts, and the
  devotional host / participating / facilitating "(x)" counts.
- **Roles are kept**, with the permissions they carry (contact and accompanier). They are context for the reviewer.
  If the person hiding knows the roles no longer apply, they untick them first; nothing forces it.
- **Who / when / why** is recorded; only those who can edit the nucleus see it.
- **Unhide** ends a hide (cluster-notebook keeps the history).
- srp-client is not involved.

## Behaviour

**Hide.** In an open person's panel, under the editor, editors (`canWrite`) get a **Hide…** button. It opens an
inline confirm:

```
Hide Ana Lopez from Lloyd Farm?
  Stays in SRP; a CSO can review and archive.
  Ana Lopez is Promoting 📣 here; hiding keeps the role.
  Reason (optional): [                                   ]
                                          [Cancel] [Hide]
```

- The middle line avoids a pronoun on purpose (we don't know the person's). The roles line shows only when the person holds roles here, naming them with their icons.
- Hide closes the panel and re-reads the list; the person is gone from every view except Hidden.

**Hidden filter.** "Hidden" is the last choice in the main filter, always listed. It shows only hidden people, each
with a grey "Hidden" tag. Every other filter, and the total line, leave hidden people out. With Hidden chosen the
total line reads "3 hidden" (or "1 of 3 hidden" while the age filter or search narrows it).

**A hidden person's panel.** Details and Activities as for anyone. Editors also see
"Hidden by Ben Okafor on 2026-11-23: moved away" (the reason part only when given; "Hidden on …" when the hider is
unknown) and an **Unhide** button. Readers see the Hidden filter and tag, but no who/when/why and no buttons.

**Roles on a hidden person.** Editors can tick and untick roles as for anyone. Adding a role they did not hold
unhides them (cluster-notebook: a new role means someone recognises them).

**"+ Add".** Hidden people are still found by the search, with "(hidden here)" after their name. Picking one and
saving (Resident and/or roles) unhides them first: picking them says "this person belongs here".

## What we need from cluster-notebook (agreed 2026-11-23)

```graphql
type PersonHide { hiddenAt: DateTime!  hiddenBy: PersonSummary  reason: String }
type NucleusPerson { ...  hidden: Boolean!  hide: PersonHide }   # hide null unless hidden AND caller can edit
type Nucleus {
  people(includeHidden: Boolean = false): [NucleusPerson!]!
  workers(role: String!, includeHidden: Boolean = false): [Individual!]!
}
type Mutation {
  hideIndividual(individualId: String!, nucleusName: String!, reason: String): NucleusPerson
  unhideIndividual(individualId: String!, nucleusName: String!): NucleusPerson
  updateNucleusWorkers(nucleusName: String!, role: String!, personIds: [String!]!, includesHidden: Boolean = false): Nucleus
}
type HiddenPerson { individual: PersonSummary!  nucleusName: String!  roles: [String!]!  isResident: Boolean!  hide: PersonHide! }
type Query { hiddenPeople(clusterName: String!): [HiddenPerson!]! }   # CSO and Administrator; for the later dashboard
```

- hide / unhide: `FORBIDDEN` unless the caller can edit the nucleus; null for an unknown nucleus; code
  `NOT_AT_NUCLEUS` when the person is neither a role holder nor a resident there. Repeats are no-ops.
- `updateNucleusWorkers` with `includesHidden` false keeps hidden holders missing from `personIds`; true makes
  `personIds` authoritative for everyone. Either way a hidden person newly given the role is unhidden.
- Resident (a move) does not unhide; adding a role does.
- As deployed (cluster-notebook PR #54, 27ac384, 2026-11-23): hiding someone already hidden keeps the original
  reason; `unhideIndividual` also works for someone hidden here who has since left (the result has roles [],
  isResident false, hidden false); `hiddenBy` is null only for a hide not made by a signed-in person;
  `hiddenPeople` is for Administrator or CSO of the cluster (or above), [] for an unknown cluster.

## Calls made by the builder (for owner review)

- The card reads `people(includeHidden: true)` once, and hides hidden rows itself. One read serves the Hidden
  filter and the "(hidden here)" check in "+ Add".
- The card's per-person role writes read `workers(role, includeHidden: true)` and write with `includesHidden: true`,
  so unticking a role on a hidden person works. The Overview's name lists keep the defaults, which never drop a
  hidden holder.
- The Overview counts need no change: `workers(role)` and `people` already leave hidden people out by default.

## Approaches

1. **Hide in the person's panel, a Hidden filter to review and unhide** (chosen): no new screens, the same place
   people are edited today.
2. A row-level hide icon: one tap, but easy to hit by mistake, and no room for the reason.
3. Ticking several people to hide at once: deferred, as bulk moves were.

## Non-goals and anti-goals

- No archive action, no admin dashboard (the `hiddenPeople` query is for that later work).
- No change to SRP, to anyone's SRP place, or to the numbers synced to SRP.
- Anti-goal: a hidden role holder silently losing a role through a list save.
- Anti-goal: who/when/why reaching anyone who can't edit the nucleus.

## Testing

- Pure decisions in `lib/` with Vitest: filtering with and without Hidden, the total line, the hide note, the
  confirm's roles line.
- The hide route answers 409 for `NOT_AT_NUCLEUS` and 404 when cluster-notebook returns null. Manual check against cluster-notebook's branch, worker on
  `--serve --fake-srp`. Made-up names only (public repo).
