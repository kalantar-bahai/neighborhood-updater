# Households, step 1 (read-only) — design (2026-11-27)

## Intent

Today, moving a person silently moves their whole SRP household. The owner wants two things:
- a warning before a move that says who else moves;
- a Families card that lists families the way the People card lists individuals.

## Decisions

- **Mockups, approved by the owner 2026-11-27:** https://claude.ai/artifact/Nc7xJJY1LZDeHqVWy7ge7j
- **Owner to cluster-notebook, 2026-11-27:**
  - Step 1 reads SRP households in, read-only here.
  - Editing (step 2) comes later, before SRP writes exist, and waits for SRP the way nucleus edits do.
- **Backend (cluster-notebook, names as built 2026-11-27):**
  - `Household { id, contact: PersonSummary, members: [PersonSummary!]!, size: Int!, address: String }`.
    - `members` holds only the people the caller may read, contact first.
    - `size` counts all members.
    - `address` is the contact's free-text address.
  - `PersonSummary.household` is null when the person isn't in a household. Its `address` is always null; the address comes only on `namedHouseholds`, under the personDetails rule.
  - `Nucleus.namedHouseholds: [Household!]!` (final name, 2026-11-27) lists real households only, with no invented singletons. Its scope is households with a member among `nucleus.people`.
- In SRP a household always moves together. Moves keep sending `withHousehold: true`.

## Goals

1. **Families card.**
   - The current Total Households and Households Connected fields stay at the top.
   - Below them is a list of:
     - every household from `Nucleus.namedHouseholds`;
     - each of the nucleus's people (non-hidden) whose household is null, shown as a one-person entry with no household id.
   - Each entry shows:
     - its name;
     - the address, or "No address in SRP";
     - the size ("1 person" / "N people").
   - Tapping an entry expands it to the members, each with the SRP dot. The contact is marked ★. "and N other(s) you can't see" shows when `size > members.length`.
   - A search box ("Find a family by anyone in it") keeps the entries where any visible member's name matches.
   - The list is sorted by name.
2. **Move warning.** This applies wherever a move is started: the People card, and the admin Hidden card's move.
   - When anyone being moved has a household with `size > 1`, the confirmation lists, per household, the other members who move too, plus "and N others you can't see".
   - The confirm button counts everyone who moves: "Move all N people".
   - "Move only <name>" shows disabled, with "They would first leave the household. That comes with editing families."
   - With no household, or a household of one, the move works as today.

## Non-goals (step 1)

- No editing: no add/remove member, contact change or new family, and no placeholder buttons for them. That's step 2.
- No arranging by building or street. It needs structured addresses, which are OPEN, so only name order ships.
- The Overview counts are unchanged, and Total Households stays hand-entered.

## Approaches

There is one sensible way here. The backend owns households, so the app only displays them.
- Grouping people into families in the app was rejected: SRP's real households come from the backend.
- The backend's wrapper (`Nucleus.families`) was set aside, by agreement with cluster-notebook. It isn't needed while the card can merge households with the household-less people it already has.

## Left to the builder

- **Entry name.** Builder's call: "<contact's family name> household"; a one-person entry uses the person's full name.
- **Where the household data loads.** It could load with the People card's data, or as its own route that the Families card calls when opened.
- **Where the move warning gets household data.** It could come from the person's `household` field in the move flow, or from a lookup at confirm time.
- **Shared code.** The list-building, search and warning text go in a tested `lib/` module. Their exact shape is up to the builder.
