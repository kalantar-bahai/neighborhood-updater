# Child nuclei on the nucleus page (design, short)

Approved by the owner 2026-11-27.

## Why

A nucleus can have child nuclei (`parentNucleus`), and children can have children. Today the nucleus page only
counts them (for the delete warning). The owner wants to see a nucleus's children on its page and move between
parent and children.

## What

- Second on the nucleus page (after Identity): a **"Child nuclei" card**, styled like the page's other cards,
  closed by default (key `children`), shown only when there are children the user can see (owner, 2026-11-27).
  Inside, the children as the home page's pocket rows (name, locality, stage badge, SRP badge).
- One shared component (`NucleusGroup` / `NucleusGroupRows`) for the rows and nested bars, used by the home page
  and the card.
- A child with children of its own is again a parent bar, indented, to any depth; nested bars start closed. On the
  home page this replaces the one-level parent/pocket nesting, and a grandchild buckets under its topmost parent's
  locality.
- Tapping a row (or a nested bar's name) opens that nucleus (`onOpenNucleus` pushes a history entry), so Back
  returns to the parent.

## Non-goals

- No hidden children: a child the user can't read isn't in their nucleus list and isn't shown
  (cluster-notebook's recommendation, 2026-11-27).

## Constraints

- Children are derived from the loaded nucleus list (`parentNucleus` names); there is no server-side child list
  (confirmed with cluster-notebook 2026-11-27).
- cluster-notebook doesn't prevent cycles (A under B under A, or a nucleus as its own parent), so the tree walk
  keeps a visited set.
- Children sorted by name.

## Approaches

1. **Derive from the loaded list (chosen).** No server change; the data and navigation already exist.
2. Ask cluster-notebook for a children field. Waits on a server change for no gain today.

## Left to the builder

- Tree logic in `web/src/lib/` with tests; the row component lives in `web/src/components/`.
- The card's open state goes through the existing `cardOpen` / `onCardOpenChange`.
