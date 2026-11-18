# Rename any nucleus (home nuclei) — design

Status: draft for owner approval, 2026-11-17. Supersedes the "SRP first" approach in issue #42.
Backend counterpart: cluster-notebook issue #39 ("step one").

## Intent

SRP is flat: a Locality holds a list of Focus Neighbourhoods (FNs), and nesting is shown only in names
("Chapelboro - BG3 - Bolinwood" inside "Chapelboro - BG3"). The owner plans to rename most in-SRP
neighbourhoods to express that nesting, and people also rename to fix mistakes. Today only nuclei that are
not in SRP can be renamed here, and a nucleus that merely shares an SRP-linked Setting is wrongly locked.

The owner's model (recorded in cluster-notebook #39):
- A nucleus is about people and activities, placed at a Cluster, Locality or Setting.
- Every SRP FN has exactly one **home nucleus**, linked explicitly (set by Create in SRP or Push to SRP).
  Other nuclei may sit anywhere, including at an FN's Setting, without becoming its home.
- Hierarchy comes only from `parentNucleus`. Names are free text; nothing builds or parses them.

## Goals

- Any nucleus can be renamed by someone with `canChangeIdentity`, and the change shows at once.
- Renaming a home nucleus also renames its SRP FN, in the background (no waiting).
- "In SRP" (green) appears only on home nuclei. Other nuclei, wherever placed, are freely renamable and movable.
- Deleting a home nucleus deletes its FN; other nuclei at its Setting move up automatically.

## Non-goals

- Moving people and activities on delete (needs srp-client writes; parked). People or activities still in the
  FN keep blocking the delete.
- Cascading a rename to children's names.
- Prompt notice of FNs renamed directly in SRP: cluster-notebook only picks them up at the next read of the
  locality (#39).

## Backend behaviour we build on (cluster-notebook step one, #39)

- `inSrp` means "is a home nucleus".
- New `Nucleus.srpName: String`: null unless `inSrp`; the FN's name as SRP last had it. It differs from `name`
  while a rename is pending in SRP or after SRP refused one ("out of step"). Each read of the locality refreshes
  it, so a rename made directly in SRP is picked up at the next read.
- `pushNucleusToSrp` also: (a) on a home nucleus whose `srpName` differs from `name`, re-sends the rename
  (the retry after a refusal); (b) on a non-home nucleus at a linked Setting, creates a new FN and Setting in
  that locality named after the nucleus, and moves the nucleus there as its home. On an in-step home it is
  still `SRP_ALREADY_LINKED`.
- Migration: each linked Setting's only live nucleus becomes its home; with several, the one named like the
  Setting.
- Built on cluster-notebook's local branch `home-nucleus` (2026-11-18). Further details from them:
  - `srpName` also differs after an FN is renamed in SRP directly (seen at the next read). Push to SRP then
    renames SRP back to `name`; renaming the nucleus to its `srpName` adopts SRP's name and queues nothing.
  - New code `SRP_FN_HAS_NO_HOME` from `pushNucleusToSrp` at a linked Setting whose FN has no recorded home.
  - Only a home nucleus's edits go to SRP; edits to other nuclei at a linked Setting stay local.
  - Deleting any nucleus moves its child nuclei up to its own parent.
  - Local end-to-end testing: worker with `--serve --fake-srp` (no real SRP).
- `updateNucleus {name}` applies immediately. For a home nucleus it also renames the Setting and queues
  `srpAction {rename, pending}`. Up-front refusals: `NAME_TAKEN`, `SRP_NAME_CLASH`, `SRP_ACTION_PENDING`,
  `FORBIDDEN`. A late SRP refusal leaves `{rename, refused|failed}` and keeps the new name.
- Moving a home nucleus stays refused (`SRP_IS_NEIGHBOURHOOD`).
- `deleteNucleus` on a home nucleus queues `{delete, pending}` (no up-front in-use check; `SRP_IN_USE` is
  dropped). The worker asks SRP with live counts:
  - in use → `{delete, refused}` with `individuals` and `activities` set, nothing changes;
  - success → nucleus and Setting archived, other live nuclei at the Setting moved to the parent nucleus's
    location (parent is a home nucleus in the same Locality), otherwise to the Locality.

## Approaches

- **A. Local-first rename** (chosen; owner, 2026-11-17). The name changes at once, SRP follows. Needs
  cluster-notebook to match people and activities by FN link, not name (in their step one).
- **B. SRP-first rename** (issue #42 as written). The name changes only after SRP accepts, so the page shows
  the old name plus "Renaming in SRP" for seconds to minutes. Rejected by the owner: "we shouldn't be waiting".
- **C. Pick the home nucleus by matching its name to the Setting's.** Rejected: fragile (any rename to the
  Setting's name silently changes it), and false in today's data before `rename-nuclei-to-settings` runs.

## Changes in this app

1. **Rename everywhere.** The Nucleus field is editable when `canChangeIdentity` and the SRP state is not
   `PENDING`, for any type and any SRP state (including Network/Population, which show no badge).
   *Our call:* also not editable in `FAILED`, where an admin must check SRP first.
2. **Out of step.** When `srpName` differs from `name` and no action is pending, show under the badge
   "SRP calls this “<srpName>”." plus SRP's reason if the rename was refused, and a "Push to SRP"
   button that sends this name to SRP. (To adopt SRP's name instead, the user renames to it.) A pending rename keeps the amber "SRP pending" badge.
3. **Badge.** Unchanged code; with the new `inSrp` meaning, non-home nuclei at a linked Setting show grey
   "Not in SRP". *Our call:* grey, consistent with Cluster- and Locality-level nuclei.
   **Push to SRP** is now also offered there (with `canCreateInCluster`); a confirm says "This creates a new
   neighbourhood in SRP named “<name>” and moves this nucleus there."
4. **Location lock.** Already "IN_SRP only"; with the new meaning it applies to home nuclei only. The note
   changes to "Location can't be changed while this nucleus is in SRP."
5. **Delete confirmation** for a home nucleus says it also deletes the neighbourhood in SRP, and that other
   nuclei at its place move to the parent nucleus's neighbourhood or the locality. *Our call:* generic
   wording, not a computed target.
6. **Remove** the `SRP_IN_USE` mapping and its test (dead once the backend drops it). **Add**
   `SRP_FN_HAS_NO_HOME` → 409, "This neighbourhood in SRP has no home nucleus. Ask an admin."
7. **Delete confirmation, any nucleus with children:** "Its child nuclei move up to its parent."

## Constraints

- Must not merge before cluster-notebook step one is deployed (it changes `inSrp` meaning and rename timing).
- Null counts mean "not recorded"; never coerce to 0.
- Live SRP testing needs the owner's go-ahead and a throwaway name.

## Left to the builder

Exact copy within the wording above, test names, and whether the rename message helper gets a new case or a
parameter.
