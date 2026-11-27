# Activity rollup over child nuclei — design (2026-11-27)

## Intent

A nucleus with child nuclei should be able to show its activity numbers for the whole group: itself plus every nucleus under it.
The owner decided (2026-11-27) that summing is correct for the Educational Activities & Devotionals card.

## Scope

- **Which nuclei:** this nucleus plus all descendants, recursively, **of any type**.
  - This differs on purpose from the "(x)" named counts, which cover Neighborhood descendants only.
  - Archived nuclei are skipped.
- **Which figures:** Number, Participants and Friends of the Faith, for Children's Classes, Junior Youth Groups, Study Circles and Devotional Gatherings. The two total rows derive from these as they do today.
- **How they combine:** a plain sum of each nucleus's effective values (an override where one is set, otherwise the SRP-derived value).
  - Each activity belongs to exactly one nucleus, so the activity Number is exact.
  - Participants and Friends of the Faith are already sums of per-activity counts within a nucleus, so summing them across nuclei is consistent with that.

## Non-goals

- The editable per-nucleus values and the home list's locality sums stay per-nucleus, so nothing is counted twice.
- Facilitators, the Overview estimates and the "(x)" counts are unchanged.

## Approaches considered

- **A. "(x)" beside each cell.** Matches the Overview, but puts 12 extra numbers into narrow phone columns.
- **B. A second read-only table below.** Clean, but makes the card twice as long.
- **C. A switch between "This nucleus" and the group (chosen by the owner).** It's one table, and the switch picks which view it shows.

## Design

- **Backend.** cluster-notebook computes the group sums and returns them as a separate read-only field next to the per-nucleus summaries, together with how many nuclei were counted.
  - A group figure is null when no nucleus in scope has a value recorded for it ("null means not recorded"). Otherwise it is the sum of the recorded values.
  - Field agreed with cluster-notebook 2026-11-27 (pending the owner's confirmation to them): `Nucleus.activityTotals: ActivityTotals! { nucleiCounted: Int!, devotionalGathering / childrensClasses / juniorYouthGroups / studyCircles: ActivityCounts! }`, where `ActivityCounts { number: Int, participants: Int, participantsFof: Int }`.
  - Each figure uses the same per-field precedence as the per-nucleus summary. A nucleus with no open activities and no override contributes null, not 0.
  - Unreadable children are counted. Archiving moves a nucleus's children up, so no subtree goes missing. The query is a fixed 3 database queries, cheap enough to re-read after each save.
  - "N under it" = `activityTotals.nucleiCounted - 1`. This is a different N from `namedCounts.nucleiCounted` (Neighborhood descendants only), so the two must be labelled distinctly.
  - It will be recorded in `docs/cluster-notebook-api-requirements.md`.
- **Card.**
  - When the nucleus has nuclei under it, a switch at the top of the card offers "This nucleus" and "With N under it".
  - "This nucleus" is the default and shows today's editable table.
  - The group view shows the same table, read-only, with the group sums. Blank stays blank.
  - In "This nucleus" view on a nucleus with nuclei under it, a one-line note says these are this nucleus's own numbers, not the group's. This is cluster-notebook's caution: a group total typed into a parent's own cell would be counted twice.
  - When there are no nuclei under it, there is no switch, and the card is the same as today.
- **Responsiveness.** After an activity cell is saved, the group sums re-read, as the "(x)" counts do after People changes.

## Left to the builder

- Where the switch sits and how it looks, within the card's existing style.
- Whether the switch position persists like the card open states. Builder's call: keep it with the rest of the page state.

## Known limits (from cluster-notebook)

- A child not yet pushed to SRP shows no activities of its own: SRP puts them in the parent's FN, so they appear on the parent. They are still counted once in the group total.
- Participants count a person once per activity they're in, as SRP does.
