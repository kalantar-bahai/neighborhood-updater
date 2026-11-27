# "+ Add" in context Implementation Plan

**Goal:** "+ Add" on cluster, locality and parent bars and on the Child nuclei card, opening the new-nucleus form
with what is known already filled in.

**Spec:** `docs/superpowers/specs/2026-11-27-add-in-context-design.md`

### Task 1: presets in lib (tests first)
- `web/src/lib/createPreset.ts`: `type CreatePreset = { cluster: string; locality?: string; parent?: string }`;
  `childPreset(rows, parentName): CreatePreset | null` (cluster and locality from the parent's row; '' locality
  omitted); `presetLocalityId(localities, name): string` (the id when exactly one locality has that name, else '').
- `createPayload` (lib/srp.ts) takes optional `parent` → `identity.parentNucleus`.

### Task 2: UI
- `AddHere` button (small, after the name, stops the bar's click).
- CreateNucleusModal: optional `preset`; fixed parts shown as text; localities loaded on open.
- Picker: cluster, locality and parent bars; NucleusGroup gets an optional `addChild`.
- DetailView: Child nuclei card shown with children or when adding is allowed, title "Child nuclei · N".
- AppClient: one create state with an optional preset, rendered on both pages.
