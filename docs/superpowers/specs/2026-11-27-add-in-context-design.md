# "+ Add" in context (design, short)

Approved by the owner 2026-11-27.

## Why

"+ Add" sits only in the home page's corner, so every new nucleus starts from a blank form. Starting it from where
it belongs gives it context: the cluster, the locality, or the parent is already known.

## What

- "+ Add" right after the name (not at the far right) on: home page **cluster** bars (cluster filled in),
  **locality** bars (cluster + locality; none on "(No Locality)"), **parent** bars (cluster + parent + the
  parent's locality), and the nucleus page's **Child nuclei** card (the same as a parent bar). Nested parent bars
  inside the card get it too.
- Shown only in clusters the user can create in (`clusterNames`, the same check as the corner button, which stays).
  Confirmed with cluster-notebook 2026-11-27: only cluster creator roles and Administrators may create; a parent's
  contact or accompanier can't.
- The Child nuclei card shows whenever there are children **or** the user can add one, titled "Child nuclei · N"
  (N may be 0), closed by default.
- The form shows the filled-in parts as fixed text; the user enters the name, the locality when not fixed, and
  Create in SRP. A locality is matched by name within the cluster; with no single match the user picks as usual.
- A child gets its parent and locality in the same updateNucleus after createNucleus (two calls; no atomic create
  with a parent yet). If that update fails, the form shows the error and the nucleus exists without a parent;
  setting the parent on its page fixes it.
- Create in SRP stays available for a child (it can be its own SRP neighbourhood; cluster-notebook 2026-11-27).
- After creating, the new nucleus opens; Back returns to where "+ Add" was tapped.

## Approaches

1. **Pass a preset to the existing form (chosen).** One form, the known parts fixed.
2. A separate "add child" form: duplicates the same fields and checks.

## Left to the builder

- Preset helpers in `web/src/lib/` with tests; the form takes an optional preset.
