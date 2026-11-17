# Create in SRP, and SRP status: design

Date: 2026-11-16. Status: draft for owner approval (updated after cluster-notebook's answers, 2026-11-16).
Backend counterpart: cluster-notebook issue #32 ("nucleus: create, rename and delete SRP Focus Neighbourhoods in step with the notebook"), built on cluster-notebook branch `fn-lifecycle` and **not yet deployed**.

## Why

A nucleus added in Nucleus Assistant exists only in cluster-notebook. To get it into SRP, someone has to create the Focus Neighbourhood (FN) by hand, and the two then drift apart. The owner wants a nucleus added here to be able to become an FN in SRP directly. Users should also see at a glance which nuclei are in SRP and which are not.

## Goals

1. **Create dialog** (`+ Add`): choose a cluster, then optionally a locality from that cluster. Once a locality is chosen, a **"Create in SRP"** checkbox becomes available.
2. **SRP status badge** on every nucleus. It appears in the "My Nuclei" list (Picker) and next to Location on the nucleus page (DetailView).
3. **Fix after a refusal by renaming or moving.** On the nucleus page, a nucleus that is not in SRP can be renamed. Renaming (or moving to another locality) a nucleus whose SRP create was refused automatically queues a fresh SRP create; there is no "push again" step. Owner, 2026-11-16.
4. **"Push to SRP"** on the nucleus page, only for an existing nucleus that was never sent to SRP (such as Royal Park).
5. **Queued delete:** once `fn-lifecycle` deploys, deleting a nucleus that is in SRP is queued and can be refused. The UI must show the pending delete and any refusal, including the counts of people and activities still assigned in SRP.

## Non-goals

- Renaming a nucleus that is already in SRP. cluster-notebook supports it (queued, SRP first), but it is left for later to keep this piece small. *Builder's note: our call, 2026-11-16.*
- "Keep local", i.e. dismissing a refusal without fixing it. Owner decision 2026-11-16: no `dismissSrpAction`. A refused action stays until a later SRP action for that nucleus succeeds.
- Moving people or activities between FNs. Per #32, that is done by hand in SRP.
- A richer create dialog with stage, type, parent and population. The owner decided against it for now; those stay on the nucleus page, which opens editable right after create (fixed in PR #40).

## Anti-goals

- A checkbox the user can tick that cannot work, for example with no locality chosen. It must be disabled, with the reason given.
- A nucleus silently stuck in a wrong state: every pending, refused or failed state is visible, with SRP's reason.
- Coercing or guessing status. If the API gives no status, show none rather than "In SRP".

## Constraints

- cluster-notebook is the only backend. We never call SRP. The SRP call is made by cluster-notebook's worker, because SRP allows one login per account.
- Permission gate for "Create in SRP" and "Push to SRP": the same as creating a nucleus, i.e. `createableEntityTypes.includes('nucleus')` on the cluster. Confirmed with cluster-notebook 2026-11-16.
- Users are mostly non-technical and on phones. Badges must be small and readable at phone width.
- Per-field autosave stays as it is. Fields stay editable while an SRP create is pending, and cluster-notebook sends current values when the FN is created.

## Backend contract (confirmed with cluster-notebook 2026-11-16)

- `createNucleus(name, clusterName, srpLocalityName: String)`. With `srpLocalityName`, the nucleus is created at that Locality and the SRP create is queued in the same transaction.
  - The server refuses at once if another Setting or nucleus in that locality has the same name ignoring case.
  - A late refusal from SRP is still possible, because SRP can hold names cluster-notebook hasn't read yet.
- Locality chosen but box not ticked: `createNucleus(name, clusterName)`, then `updateNucleus(name, { locationName })`. `createRowData` already does this.
- `pushNucleusToSrp(name)` works for an existing local-only Neighborhood nucleus at a Locality, or at a Setting not yet in SRP. It refuses non-Neighborhood nuclei (`SRP_NOT_NEIGHBORHOOD`).
- Rename: `updateNucleus(name, { name: "New" })`, gated by `canChangeIdentity`. A nucleus not in SRP is renamed at once.
- Re-queue (promised, after their current fix wave): if the latest `srpAction` is `{create, refused}` and the nucleus is not linked, a rename or a move to another Locality or an unlinked Setting applies locally and queues a fresh create in the same transaction. If the new name or locality clashes, the whole update is refused with `SRP_NAME_CLASH` and nothing changes. A `failed` create is never re-queued.
- `refused` means SRP or cluster-notebook's own checks said no; it needs a change by a person. `failed` means an unexpected error persisted through 3 automatic attempts; it needs a developer. `in_flight` means the worker is running it now.
- Error codes (`extensions.code`, promised): `NAME_TAKEN`, `SRP_NAME_CLASH`, `SRP_NOT_AT_LOCALITY`, `SRP_ALREADY_LINKED`, `SRP_ACTION_PENDING`, `SRP_IN_USE`, `SRP_NOT_DEFAULT`, `SRP_NOT_NEIGHBORHOOD`. Branch on these, never on message text; this replaces today's `/already exists/` regex.
- `Nucleus.srpAction` is null when no action is unfinished. Otherwise it holds:
  - `action`: create | rename | delete
  - `status`: pending | in_flight | refused | failed
  - `requestedAt`
  - `error`
  - `individuals` and `activities`: counts on a refused delete
- `Nucleus.inSrp: Boolean!`: true when the nucleus's location is a Setting linked to SRP. **Promised, not yet landed.**
- While any SRP action is pending, name and location changes are refused (`SRP_ACTION_PENDING`). While a delete is pending, field edits are refused too.
- Delete of a nucleus in SRP is queued, and `deleteNucleus` returns true. The nucleus stays in `nuclei` and `nucleus(name)` with `srpAction {delete, pending}` until SRP accepts, then disappears. A refused delete leaves it fully live, with the counts.

## Status model (pure function in `lib/`, unit tested)

| State | Rule | Badge |
|---|---|---|
| `IN_SRP` | `inSrp && !srpAction` | green "SRP" |
| `PENDING` | `srpAction.status` in pending, in_flight | amber "SRP pending" (for a delete: "Deleting in SRP") |
| `REFUSED` | `srpAction.status` = refused | red "SRP refused"; reason on the nucleus page, with "rename or move it to try again" for a refused create |
| `FAILED` | `srpAction.status` = failed | red "SRP error"; "Something went wrong sending this to SRP. Contact an admin." |
| `LOCAL_ONLY` | `!inSrp && !srpAction` | grey "Not in SRP" |
| none | nucleus type is not Neighborhood (Network, Population) | no badge (owner, 2026-11-16) |

If `srpAction` is non-null with `status` absent or unknown, show no badge rather than guess.

## Design

### Create dialog (`CreateNucleusModal`)

```
New Neighborhood
  Name      [ Chapelboro - New Place        ]
            ⚠ "Chapelboro - new place" already exists in Chapelboro      (only if it clashes)
  Cluster   [ NC-215 Triangle            ▾ ]
  Locality  [ (none)                      ▾ ]   ← list of the chosen cluster's localities
  [ ] Create in SRP                              ← disabled until a locality is chosen
      "Choose a locality to create this in SRP"  (hint while disabled)
                                     [Cancel] [Create]
```

- Localities come from a new route, `GET /api/locations?cluster=…`. It uses the existing `getLocationOptions`, and its permission check is that the caller can create in that cluster. The list loads when the cluster changes.
- Name pre-check, client side: for the chosen locality, compare the name case-insensitively and trimmed with that locality's Setting names and their `nuclei`. A clash shows a warning and disables Create when the box is ticked. Without the box, the existing global exact-match check still applies on the server.
  - Nuclei placed directly on the Locality (not on a Setting) aren't in that tree, so the pre-check misses them. The server's `SRP_NAME_CLASH` refusal catches them at submit instead. *Our call, 2026-11-16.*
- Submit:
  - Box ticked: send `srpLocalityName`.
  - Locality without the box: send the location as an identity field, the existing path.
  - `NAME_TAKEN` and `SRP_NAME_CLASH` come back as a 409 with a plain message, shown in the dialog.
- After create: as today (PR #40), reload initial data and open the nucleus editable.

### Badges

- **Picker:** a small badge on each nucleus row, at the right, using the state's color and label. A nucleus row only, not cluster or locality rows. `getAllNuclei` adds `inSrp` and `srpAction { action status error }`, and `NucleusSummary` carries the derived state.
- **DetailView:** the badge sits next to the Location field.
  - For `REFUSED`, show `srpAction.error` beneath it.
  - For a refused delete, say "N people and M activities are still assigned in SRP. Move them in SRP, then try again."
  - Today's `srpLinked` warning ("This Setting isn't linked to SRP yet…") stays as is.

### Rename (DetailView)

- The nucleus name becomes editable on the nucleus page when the caller has `canChangeIdentity` and the nucleus is not in SRP (`LOCAL_ONLY` or `REFUSED`). Otherwise it stays read-only, as today.
- It saves on blur like other fields, through `updateNucleus { name }`. On success the app's state switches to the new name. Because the name is the key, this needs care: re-fetch under the new name and refresh the list.
- A refused create re-queues automatically on rename or move (backend rule above), so the badge turns amber.
- Errors: `NAME_TAKEN` or `SRP_NAME_CLASH` show under the field and revert it. `SRP_ACTION_PENDING` says "Wait for the pending SRP change to finish."

### Push to SRP (DetailView)

- Shown only when the state is `LOCAL_ONLY` (never pushed), the nucleus is a Neighborhood at a Locality or at an unlinked Setting, and the caller may create in its cluster.
- New route, `POST /api/nucleus/push-srp` with `{ name }`, which calls `pushNucleusToSrp`. It uses the same permission gate and the same `clusterNotebookErrorResponse`.
- On success, re-fetch the nucleus. The badge turns to pending.

### Delete

- The delete button's call is unchanged. After a successful response, always re-fetch the nucleus: a 404 means it is gone, so go back to the list as today. Otherwise stay and show "Deleting in SRP". This covers retrying a refused delete too.
- While a delete is pending, the nucleus page is read-only, because cluster-notebook refuses edits then.
- A refused delete shows the counts message above.

### Freshness

The status changes when cluster-notebook's worker finishes, usually within seconds. We don't poll: the status is re-read on every list load and every nucleus open, and there is a small "Refresh" link next to a pending badge. *Builder's call whether to add a single delayed re-fetch (say 10 s) after create, push or delete.*

## Approaches considered

- **A. Create first, then queue the SRP create** (chosen; owner, 2026-11-16). "+ Add" behaves the same whether or not the box is ticked, and the nucleus opens editable at once. A late refusal leaves a local nucleus with a red badge, retried through Push to SRP. cluster-notebook's build already works this way.
- **B. SRP first; the dialog waits for the worker.** Refusals surface in the dialog, but the dialog blocks for seconds or longer, and a slow worker means a stuck dialog. Rejected.
- **C. Only a "Push to SRP" button, with no checkbox in the dialog.** Simplest, but it takes two steps for the common case, and users would forget the second step. Rejected; the button is still built, for nuclei never sent to SRP.

For fixing a refusal: delete and re-add (nothing to build), rename then push again, or rename with an automatic re-queue. The owner chose the automatic re-queue on 2026-11-16, and cluster-notebook agreed to build it.

## Testing

- Unit tests in `lib/`:
  - the status derivation (every row of the table, plus the null and unknown cases)
  - the name pre-check (case, whitespace, nuclei vs Setting names)
  - the new clusterNotebook calls: request shape and error mapping
  - `createRowData` with `srpLocalityName`
- Browser check against cluster-notebook branch `fn-lifecycle` run locally. Per #32, a live SRP test needs the owner's go-ahead and a throwaway name.

## Rollout

- This depends on `fn-lifecycle` being deployed before ours, including `inSrp`, the error codes and the re-queue rule (all promised, not yet on the branch). If our code queries `inSrp` or `srpAction` against the current production schema, those queries fail.
- Merge only after cluster-notebook confirms the deploy, and coordinate the release with them (CLAUDE.md: "Coordinate releases that change the API").

## Left to the builder

- Exact badge styling within the existing look: small pill, matching current colors.
- Whether to add the delayed re-fetch.
- How the locality dropdown loads (spinner or disabled while loading).
