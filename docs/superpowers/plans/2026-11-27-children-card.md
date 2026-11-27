# Children Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A collapsible "Children" card, second on the nucleus page, listing child nuclei as home-page rows with
twisties for deeper levels; tapping a row opens that nucleus.

**Architecture:** A pure `childTree` in `lib/children.ts` builds the tree from the loaded `NucleusSummary[]`
(`parentNucleus` names). A shared `NucleusListRow` (`NucleusRow` is already a type) component (extracted from Picker's `NeighborhoodItem`) renders one
row. `ChildrenCard` renders the tree; DetailView places it after Identity; AppClient passes the rows.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-children-card-design.md`

## Global Constraints

- Card title "Children · N" (N = direct children), open by default, card key `children`, shown only when N > 0.
- Rows identical to the home page: name, locality, stage badge, SRP badge.
- Children sorted by name; a visited set guards against cycles (cluster-notebook doesn't fully prevent them yet).
- Run from `web/`: `npm test`, `npx tsc --noEmit`, `npx eslint <changed files>`; check real exit codes.

## Review Focus

- A nucleus listed as its own parent: must not appear as its own child, no infinite render.
- A cycle A → B → A: the walk ends; each nucleus appears at most once in the tree.
- `parentNucleus` with surrounding whitespace still matches (Picker trims it).
- A nucleus with no children: no card at all.
- Tapping the twisty must not also open the nucleus.

---

### Task 1: `childTree` in lib

**Files:**
- Create: `web/src/lib/children.ts`
- Test: `web/src/lib/children.test.ts`

**Interfaces:**
- Produces: `export type ChildNode = { row: NucleusSummary; children: ChildNode[] }` and
  `export function childTree(rows: NucleusSummary[], name: string): ChildNode[]`

- [ ] **Step 1: Write the failing tests** (rows built with a small `row(nucleus, parentNucleus)` helper)
  - `direct children, sorted by name`: parent P with children "b", "a" → `['a','b']`.
  - `grandchildren nest`: P → A → A1 gives `tree[0].children[0].row.nucleus === 'A1'`.
  - `no children`: `childTree(rows, 'Z')` → `[]`.
  - `parent name is trimmed`: child with `parentNucleus: ' P '` is P's child.
  - `self-parent is not its own child`: row P with parentNucleus P, `childTree(rows,'P')` → `[]`.
  - `cycle ends`: A under B, B under A; `childTree(rows,'A')` → one node B with `children: []`.
- [ ] **Step 2: Run** `npx vitest run src/lib/children.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** a depth-first walk with a `visited` set seeded with `name`; skip any row already visited.
- [ ] **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** `feat: childTree for the Children card`.

### Task 2: Shared `NucleusListRow` (`NucleusRow` is already a type), `ChildrenCard`, wiring

**Files:**
- Create: `web/src/components/NucleusListRow.tsx`, `web/src/components/ChildrenCard.tsx`
- Modify: `web/src/components/Picker.tsx` (`NeighborhoodItem` and `typeBadgeStyle` move out),
  `web/src/components/DetailView.tsx` (prop `rows`, card after Identity), `web/src/components/AppClient.tsx`
  (pass `rows={initialData.rows}`), `web/src/app/globals.css` (child indent)

**Interfaces:**
- Consumes: `childTree`, `ChildNode` from Task 1.
- Produces: `NucleusListRow({ r, isPocket, onSelect, twisty? })` where `twisty` is
  `{ open: boolean; onToggle: () => void } | undefined`; `typeBadgeStyle` exported from `NucleusListRow.tsx`;
  `ChildrenCard({ rows, name, open, onOpenChange, onOpenNucleus })`.

- [ ] **Step 1:** Move `NeighborhoodItem` to `NucleusListRow` (`NucleusRow` is already a type) unchanged in look; Picker uses it. With `twisty`, a ▶ (the
  `parent-arrow` style) sits before the name; its click calls `onToggle` and stops propagation.
- [ ] **Step 2:** `ChildrenCard` renders nothing when `childTree` is empty; otherwise the standard card with header
  "Children · N" and the rows. Open twisties are local state (`Set<string>` of names). Nested levels are indented
  (`.child-rows { margin-left: 16px }`).
- [ ] **Step 3:** DetailView: new card key `children` (default open) through the existing `card()` helper, rendered
  right after the Identity card.
- [ ] **Step 4: Run** `npm test`, `npx tsc --noEmit`, `npx eslint` on the changed files → all exit 0.
- [ ] **Step 5:** Check in the browser on local data: Chapelboro - T107.08BG2 shows three children; tapping one opens
  it; Back returns. Home page rows look unchanged.
- [ ] **Step 6: Commit** `feat: Children card on the nucleus page`.

## As built (2026-11-27)

The owner reshaped Task 2 while reviewing it: no `ChildrenCard` component and no twisty on `NucleusListRow`. The
nucleus page has a standard "Child nuclei" card (closed by default) whose body is `NucleusGroupRows`; the home page's
parent bar and pocket rows became `NucleusGroup` / `NucleusGroupRows` (`web/src/components/NucleusGroup.tsx`),
shared by both pages and nesting to any depth. `rootOf` (lib/children.ts) buckets a grandchild by its topmost
parent's locality on the home page.
