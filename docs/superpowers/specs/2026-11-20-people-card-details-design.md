# People card, phase 3: who is this person? (design)

Status: draft for owner review, 2026-11-20.
Builds on `2026-11-18-people-card-design.md` (phase 1) and `2026-11-19-people-card-moves-design.md` (phase 2).
Backend: cluster-notebook SDL proposed 2026-11-20 (owner agreed), built in two phases (A, B), each deployed
separately. Not built yet.

## Intent

Once neighbourhood contacts use the People card, they will find many names they don't know, entered over about ten
years. Before anyone can sensibly archive people (a later phase), a contact needs to learn more than a name and
roles: is this person taking part in or facilitating an activity, how recently, how old are they, and, for a
trusted few, how to reach them and what SRP knows about them.

## Decisions (owner, 2026-11-19 and 2026-11-20)

- **Recency** comes from activity and study-item start and end dates. SRP keeps no per-person join or leave dates,
  and that is enough.
- **On every row, for anyone who can read the nucleus:**
  - age category (Child, Junior Youth, Youth, Adult);
  - devotional host;
  - participates in an activity (yes/no);
  - facilitates an activity (yes/no).
  Each of these is also a filter.
- **The list of a person's activities** (name, type, role, book or grade, dates) is visible to anyone who can read
  the nucleus.
- **Details, restricted (tier 1):** estimated age, registration (registered yes/no, date), address, phones, emails,
  SRP comments. Tier 1 is a current contact or accompanier on this nucleus, or a cluster role with write.
- **Checks, more restricted (tier 2):** background check expiry and motor vehicle clearance. Tier 2 is an
  accompanier on this nucleus, or a cluster role with write. Not contacts.
- **Notes:** for now, SRP's comments, read-only, with srp-client's identity tag stripped. A notes field of
  cluster-notebook's own comes later (it will also serve the tutor tracker), so in the long run both.
- **Exact age is restricted;** age category is not. There is no birth date: SRP synthesizes one from an estimated
  year.
- **Layout: one person panel per row** (approach 1, "we'll try it and see how it works").

## Behaviour

Clicking a name opens a panel under that row, for everyone who can read the nucleus (today only editors can click).
Clicking again, or another name, closes it. The panel shows what the caller may see; editors also get the existing
Resident and roles editor at the bottom.

```
Ana Lopez●  🏠 📣   🎓 🕯  Youth
  Activities
    🎓 Facilitates  JY group "Sunrise"            2025-09 → now
    📖 Participant  Book 3 study circle           2024-01 → 2024-06 (completed)
  Details
    Age 17 · Registered since 2019-03-02
    12 Elm St
    555-0100 · ana@example.org
    Background check expires 2027-03-01 · Motor vehicle: cleared
    SRP comments: …
  ─────────
  🏠 Resident   ☐ Promoting  ☐ Helping Others  …          [Save] [Cancel]
```

**Row marks** (after the roles, in this order): 🎓 facilitates, 📖 participates, 🕯 devotional host (co-host
too), then the age category as a small grey tag ("Youth"). These icons are the builder's call; each has a title.

**Activities section:** current first, then past, newest first (the server's order). "→ now" when current; dates as
SRP gives them; "(completed)" when the study item is completed. "No activities in SRP" when the list is empty.

**Details section** (only when `personDetails` is non-null):
- "Not in SRP; nothing synced" when `individual.inSrp` is false (an app-created person).
- Otherwise each value, or "—" when SRP has none. Phones and emails are listed as given.
- Checks only when `checks` is non-null. Background check: "expires <date>", in red when past. Motor vehicle:
  "cleared", "not cleared" or "—".
- SRP comments shown as plain text, line breaks kept, never as HTML.
- No Details section at all when the caller isn't tier 1: no hint, no lock icon.

**Filters:** the filter menu gains Participating, Facilitating, Devotional host, then Child, Junior Youth, Youth,
Adult (only the age categories someone in the list has). Still one filter at a time, combined with the text search.

**Loading:** row fields come with the list (`/api/people`). Details are read when the panel opens (one call per
open), so restricted fields never travel with the list.

## What we need from cluster-notebook (phase A live 2026-11-20, PR #46; phase B proposed)

```graphql
enum AgeCategory { CHILD JUNIOR_YOUTH YOUTH ADULT }
enum DevotionalHostRole { HOST CO_HOST }
enum ActivityRole { PARTICIPANT FACILITATOR }

type NucleusPerson {
  individual: PersonSummary!  roles: [String!]!  isResident: Boolean!
  ageCategory: AgeCategory             # A; null when SRP hasn't given us the person
  devotionalHost: DevotionalHostRole   # A; null = not a host, or not known
  participates: Boolean!               # B
  facilitates: Boolean!                # B
  participation: [Participation!]!     # B; current and past, newest first
}
type Participation { activityId activityName activityType role studyItem startDate endDate completed current }
type Query { personDetails(individualId: String!, nucleusName: String!): PersonDetails }   # A
type PersonDetails {
  individual: PersonSummary!  estimatedAge: Int  isRegistered: Boolean
  registrationDate: Date  address: String  phones: [String!]!  emails: [String!]!  srpComments: String
  checks: PersonChecks                 # null unless tier 2
}
type PersonChecks { backgroundCheckExpiration: Date  motorVehicleClearance: Boolean }   # true cleared, false not, null unknown
```

- `personDetails` null means not permitted, or not one of this nucleus's people. No error codes.
- Row fields are on `NucleusPerson`, not `PersonSummary`, so they don't reach the cluster-wide "+ Add" search.
- Values fill in on the owner's re-read of each locality after phase A deployed; until then most are null.
- Tiers as built (cluster-notebook 2026-11-20): tier 1 is anyone who can edit the nucleus (its contacts and
  accompaniers, those of a parent nucleus, and cluster roles ATC/CSO/CIC and their collaborators). Tier 2 is an
  accompanier on the nucleus itself or one of those cluster roles; a contact alone never sees checks.
- Side effect: `Individual.phone`/`email` on `workers(role)` are now null unless the caller is tier 1 on that
  nucleus, so the Identity card's "Contact Email" is blank for other readers.

## Phasing here

- **Phase A** (after cluster-notebook phase A deploys): age tag, 🕯, their filters, the person panel with the
  Details section, and rows clickable for every reader.
- **Phase B** (after cluster-notebook phase B deploys): 🎓 and 📖, their filters, and the Activities section.
  Built 2026-11-21 on the deployed shape, which differs from the sketch above: no activity name (`heldAt`, where it
  is held, instead), a `studyItemTitle`, and one entry per study item. See `docs/cluster-notebook-api-requirements.md`.
- Each phase queries only fields that are deployed (an unknown field breaks the whole People card).

## Approaches

1. **One person panel per row** (chosen): a click opens everything about the person under the row, with the editor
   at the bottom for editors. One click, the same place as today, works on a phone; the panel is long for tier 2.
2. **A separate ⓘ per row opening a details pop-up**, the name still opening the editor: keeps viewing and editing
   apart, but adds a second small target on every row.
3. **A separate person page:** the most room, but you lose your place in the list.

## Non-goals and anti-goals

- No editing any of these fields. All are read-only from SRP.
- No archiving yet (next phase, which this one informs).
- No cluster-notebook notes field yet.
- Anti-goal: any restricted field (exact age, registration, contact details, comments, checks) in `/api/people`, in
  the "+ Add" search, or in any list response. They travel only in the per-person details call.
- Anti-goal: the card hinting that hidden details exist for someone who can't see them.
- Anti-goal: rendering SRP comments as HTML.

## Testing

- Pure decisions in `lib/` with Vitest: filters, row marks, activity ordering and labels, details formatting
  (dashes, expired check).
- Routes: the details route returns 404 when `personDetails` is null, and passes `checks` through untouched.
- Locally against cluster-notebook's branch with the worker on `--serve --fake-srp`. Use made-up people only in
  tests and docs (public repo).

## Calls made after the builder check (for owner review)

- **Who gets the editor in the panel:** the same people who can open the editor today (`canAssignRoles`, or
  `canWrite` on a home nucleus for Resident). Readers get the panel without it.
- **Not tier 1 is silence:** the details route answers 404 when `personDetails` is null, and the panel shows no
  Details section. Any other failure shows a short error line in the panel.
- **Phases are separate releases:** each phase adds its fields to the query in the PR that ships after
  cluster-notebook deploys that phase. No runtime switch. Until phase B, the Participating and Facilitating filters
  and the Activities section don't exist.
- **"→ now"** keys off `current`; dates are shown as the full date SRP gives (YYYY-MM-DD). The background check is
  "expired" when its date is before today.
- **The identity tag** is stripped by cluster-notebook (`srpComments`); we show the text as given.
- **The panel stays open** across the 10-second re-reads while a move is on its way, and details are read again on
  each open (no cache).

## Left to the builder

Icons, the exact panel layout and spacing, how the panel shows loading and errors, and the route shape for details.
