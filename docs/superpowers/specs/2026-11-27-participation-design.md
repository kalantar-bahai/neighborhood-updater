# Participation in collective spaces

Status: design agreed with the owner, 2026-11-27. Mockups: https://claude.ai/artifact/JBwwbMjTex1BYLR9PXB1F8 (private
to the owner; six phone screens, referred to below as screens 1–6).

## Why

A neighborhood team wants to record participation in its collective spaces: social action, community gatherings,
an expansion phase, visiting neighbors, reflection gatherings, and others no fixed list can foresee. The owner gave
five reasons:

1. **Remember who is participating.** Teams know "about 14 came" but forget which 14.
2. **Statistics for higher levels** (cluster and above).
3. **The team's reflection meetings**, possibly weekly.
4. **History over time**, so the team can reflect on why participation changed.
5. **The Participating estimate** on the Overview card (the concentric circle).

Today the Additional Details card holds only SRP's yes/no for "Social Action" and "Regular Gatherings / Festivals",
each with a note. This feature sits beside it; it does not replace it.

## Goals

- Each neighborhood has its own list of **spaces**. Anyone who can edit the neighborhood adds them.
- A space is recorded one of two ways:
  - **Each time it happens** (a gathering): a date, a participant count, optionally who came, optionally a note.
  - **A running count** (visiting, an expansion phase): entries add to the current period until the team closes
    the period and starts again from 0. Closed periods are kept.
- Recording a gathering is quick on a phone. The count is the only required number; names are optional and can be
  added later.
- Over time: a space's history, who has been coming, and a quarter summary across spaces.

## Non-goals

- Replacing or changing the Additional Details card or its SRP fields.
- Sending any of this to SRP.
- A cluster-wide view across neighborhoods (a natural follow-up; the **kind** field below makes it possible).
- Attendance for core activities (children's classes, junior youth groups, study circles, devotionals). Those stay on
  the Activities card.

## Anti-goals (failure even if it works)

- **Recording feels like a chore.** If a team must tick through a list of 80 names, it stops recording. The count must
  always be enough on its own.
- **The app silently changes Participating.** The Overview estimates are typed in by hand and stay independent of
  name lists (CLAUDE.md). This feature may *suggest* a number; it never writes the estimate unless the user taps to.
- **Adding up counts as if they were people.** 12 at a reflection plus 15 in the expansion phase is not 27 people.
  Any cross-space "how many people" figure counts distinct named people only, and says so.

## Approach (decided: B, in stages)

The data lives in cluster-notebook; this app keeps no data of its own.

- A. Ask cluster-notebook for everything and build all six screens at once. Rejected: nothing usable until the end,
  and one large request.
- **B. Three stages, each usable on its own.** Chosen by the owner. Stage 1 is useful by itself, and its first weeks
  of use inform stages 2 and 3.
- (Storing data in this app was not considered: the app has no database by design.)

### Stage 1: spaces and gatherings

- Screen 1: a **Participation** card on the nucleus page, listing the spaces, each with its last count and date.
  Placed after Overview and before Additional Details. Collapsible like every card (closed by default is the builder's
  call, matching the other cards' defaults).
- Screen 6: **Add a space**: name, how it is recorded (each time / running count), and **kind** (required; the
  list includes **Other**; kind does not limit the mode). *Builder-check call.*
  - Starting suggestions: the owner's five examples (Social action, Community gathering, Reflection gathering,
    Expansion phase, Visiting neighbors). Tapping one fills name, mode and kind.
- Screen 2: **Record a gathering**: date (default today), participants (required, whole number ≥ 0), who came
  (optional), note (optional).
  - "Came last time": the people named at this space's most recent gathering, as one-tap buttons.
  - "Someone else": the **same search as the People card's "+ Add"** (everyone in the cluster by name and place, with
    **Create "…"** as the last option). Picking or creating does **not** ask for roles.
  - Shows "N of M named". Named people may not exceed the count; if they would, the count rises to match.
  - A saved gathering can be edited later (count, names, note, date), e.g. to add names at the next reflection.
- Screen 4 (stage 1 part): a space's page lists its gatherings, newest first, with "Who's been coming" (each named
  person and how many of the gatherings in the **last 12 weeks** they came to; fixed window in stage 1, matching
  stage 3's chart). *Builder-check call.*
- **Navigation** (*builder-check call*): a space's page is a full view inside the app, like a nucleus page, with Back
  returning to the nucleus page and the card's open state restored (the existing `openByView` mechanism). It carries
  the space in the address bar so reload and the browser's Back work. Recording opens from the space's page
  ("+ Record a gathering" / "+ Record visits"); tapping a row on the Participation card opens the space's page.
- **Rename and archive** (*builder-check call*): in stage 1, a space's page has a small "Edit space" action (rename,
  change kind, archive). An archived space leaves the card; its records still count everywhere else (People filter,
  stage 3 summaries) since those people did take part.
- Running-count spaces in stage 1: entries (date, how many, optional names, optional note) add up to a total since the
  space was created. No closing or reset yet.
- **People card filters** (owner, 2026-11-27), lined up with the Overview's two figures:
  - The existing filter labelled "Participating" (people on a current core-activity roster, `participates`,
    `PRIMARY_FILTERS` in `web/src/lib/people.ts`) is **relabelled "In educational activities"**. Same people, new label.
  - A new **"Participating"** filter lists **everyone** named at any gathering or entry of this nucleus, with or
    without a role here. Someone named only at a gathering has no role yet; they can be given roles as usual.
  - Example: a promoter who comes to every reflection and facilitates a study circle shows under "Promoter",
    "Participating" and "In educational activities".

### Stage 2: running counts with periods (screen 3)

- Current period: start date, total, and number of different people named ("visitors").
- "Close period and reset": closes at today's totals, starts a new period at 0. Past periods are listed.

### Stage 3: quarter summary (screen 5) and the 12-week chart (screen 4)

- Per quarter, per space: times held, total participants, the largest single gathering, and people named (distinct).
- "Different people named in any space this quarter", beside the current Participating estimate, with
  **"Set estimate to N"** (the user's choice; never automatic) and an explanation that unnamed people may add more.
- "Copy as text" for cluster reports.
- Quarters are calendar quarters (Q1 = Jan–Mar).

## Constraints

- All reads and writes go through cluster-notebook's GraphQL API, forwarding the user's Clerk token. Every route catches
  errors through `clusterNotebookErrorResponse()`.
- **Permissions** (proposed; to confirm with cluster-notebook): reading needs `canRead` on the nucleus; adding a space
  and recording need `canWrite`. Same as the rest of the nucleus page.
- **Null means not recorded.** A gathering always has a count; a space with no gatherings shows "—", not 0.
- Phone first: touch targets ≥ 44px, no long lists to scroll through when recording.
- No real names in code, tests, docs or commits (public repo).

## Data we will ask cluster-notebook for (stage 1)

None of this exists yet. Stage 1 starts with this request to cluster-notebook; the plan builds against their answer,
not an assumed shape. A proposal for them to shape; names are illustrative.

- `ParticipationSpace`: id, nucleus, name, mode (`EACH_TIME` | `RUNNING`), kind, createdAt, archivedAt.
- `ParticipationRecord`: id, space, date, count, note, people (Individuals), lastUpdated.
- Queries: a nucleus's spaces with their latest record; a space's records (newest first, paged); the people named at
  a space with how many records each appears in, over a date window.
- Mutations: create/rename/archive a space; create/update/delete a record.
- `kind`: a fixed list owned by cluster-notebook, so the cluster can add spaces up across neighborhoods.
- The People card's "Participating" connection: either a derived list from cluster-notebook or a filter we compute
  from records. Their call.

Stage 2 adds a period to `RUNNING` spaces; stage 3 adds the quarter rollup.

## Left to the builder

- Component structure, file layout, and where logic sits in `lib/` (with tests).
- Exact wording of help text not given here (the owner supplies `InfoTip` wording; leave placeholders).
- Loading and error states, matching the rest of the nucleus page.
