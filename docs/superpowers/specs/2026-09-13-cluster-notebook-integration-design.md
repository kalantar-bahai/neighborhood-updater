# Cluster-notebook integration: migration off Google Sheets

Branch: `cluster-notebook-integration` (not merged to `main`; `main`/Vercel stay fully Sheets-backed until a field reaches real parity).

## Goal

Replace nucleus-assistant's Google Sheets data store with `cluster-notebook` (a shared Postgres-backed GraphQL platform, see `cluster-notebook/docs/requirements.md` and `data-model.md`), incrementally, field by field, starting with the one field cluster-notebook's schema already supports: the per-nucleus devotional-gathering rollup.

## Why incremental, not big-bang

`cluster-notebook`'s current GraphQL schema (`cluster-notebook/schema.graphql`) exposes exactly one field:

```graphql
type DevotionalGathering { number: Int, participants: Int, participantsFof: Int }
type Nucleus { name: String!, devotionalGathering: DevotionalGathering }
Query: nucleus(name: String!): Nucleus, nuclei: [Nucleus!]!
Mutation: updateDevotionalGathering(nucleusName: String!, number: Int, participants: Int, participantsFof: Int): Nucleus
```

Everything else nucleus-assistant needs (worker lists, access control, identity fields, qualitative fields, population counts) is undesigned or unimplemented on cluster-notebook's side (confirmed directly by the cluster-notebook session — see "Known limitations" below). Waiting for full parity blocks all progress; migrating one field at a time lets each side build only what's needed next.

## Known limitations of cluster-notebook today (as reported by that session, 2026-09-13)

- No auth/permission context at all — doesn't replicate nucleus-assistant's per-nucleus read/read-write/collaborator/admin model.
- No general "update any field" mutation — only `updateDevotionalGathering` exists.
- No `Individual` entity — worker lists (accompaniers/protagonists/ABM-assistants) can't be represented as linked people yet.
- Writes are local-only — nothing pushes back to SRP yet.
- No pagination/filtering on `nuclei`.
- No subscriptions/live updates.

These are expected to close over time as cluster-notebook's own schema work proceeds (see the full requirements doc sent to that session, `docs/cluster-notebook-api-requirements.md`).

## Decisions

- **Migration strategy**: incremental, field-by-field. A field only moves off Sheets once cluster-notebook supports it with real read+write.
- **Requirements scope**: the doc sent to cluster-notebook (`docs/cluster-notebook-api-requirements.md`) covers nucleus-assistant's *full* target surface (all `NucleusRow` fields, worker lists, access entries), not just the next slice — so cluster-notebook can design its schema toward the whole shape, even though we only implement against today's subset.
- **Access control during transition**: stays entirely on the Sheet-based `Access` tab (`lib/access.ts`, `getAccessEntries`/`saveAccessEntries`), independent of cluster-notebook, until cluster-notebook has a real permissions model. `getAccess()` is unaffected by this migration.
- **SRP-sourced comparison data**: the Devotionals/Education tabs (scraped by `srp-cache`, joined by name in `parseSrpData`/`findSrpRow`) are a separate read-only signal used only for the existing "mismatch, not forced merge" UI indicator. They keep reading directly from the Sheet for now — cluster-notebook doesn't yet own SRP sync (per its own docs, that's `srp-client`'s eventual job, not in scope here).

## Architecture

- New module `web/src/lib/clusterNotebook.ts` — a thin fetch-based GraphQL client, styled like `lib/sheets.ts` (plain HTTP POST `{query, variables}`, no Apollo/urql/graphql-request dependency — not justified for a two-operation schema). Reads `CLUSTER_NOTEBOOK_URL` from the environment (local dev default `http://localhost:8000`); this variable is never set in Vercel, so `main`'s deployment is structurally unaffected.
- `lib/data.ts` changes:
  - `parseRow`/`getRowData`: `activities.devotionals` is no longer read from `COL.DEV_ACT`/`DEV_PART`/`DEV_FOF`. Instead, `getRowData` calls `clusterNotebook.getNucleus(name)` and maps `devotionalGathering.{number,participants,participantsFof}` into the same `{act, part, fof}` shape.
  - `saveRowData`: no longer writes `COL.DEV_ACT`/`DEV_PART`/`DEV_FOF` to the sheet. Instead calls `clusterNotebook.updateDevotionalGathering(name, {...})` when `d.activities.devotionals` is present.
  - Everything else in `data.ts`/`config.ts` is untouched. The three sheet columns become dead for this one field (left in place, unused — no sheet schema change, since other tooling/history may still reference them).
- No new abstraction/interface layer across data sources. With one field moving, a routing abstraction is premature (YAGNI) — revisit if/when several fields migrate concurrently.

## Data flow

- Read: `GET /api/nucleus?name=X` → `getRowData()` → `Promise.all` of existing sheet reads (master row, dev/edu rows, worker names) **plus** one `clusterNotebook.getNucleus(X)` call → merged into the same `NucleusDetail` shape returned today. **No frontend changes** — `DetailView.tsx` and `types.ts` are unaffected.
- Write: `POST /api/nucleus` → `saveRowData()` → sheet writes for unchanged fields (as today) + one `clusterNotebook.updateDevotionalGathering(...)` call for the devotionals sub-object.

## Error handling

No fallback/degradation logic. If cluster-notebook is unreachable, `clusterNotebook.ts`'s fetch call throws, propagating through `getRowData`/`saveRowData` exactly like an `sheetsGet`/`sheetsBatchUpdate` failure does today — surfaced as a generic API error to the existing frontend error state. This matches the existing error-handling philosophy in the codebase (no silent degradation is attempted anywhere else in `data.ts`).

## Testing

- New `web/src/lib/clusterNotebook.test.ts` — unit tests for the GraphQL client wrapper (request shape, response parsing, error propagation on non-200/GraphQL error responses).
- Extend `web/src/lib/data.test.ts` with `vi.mock('./clusterNotebook')` (mirroring the existing `vi.mock('./sheets')` pattern) to verify `getRowData`/`saveRowData` route the devotionals field through the new client instead of `COL.DEV_ACT` etc.

## Local dev setup (new)

Running this branch locally now requires cluster-notebook running alongside it:

```
cd cluster-notebook && .venv/bin/uvicorn cluster_notebook.app:app --reload   # local Postgres, port 8000
cd neighborhood/web && npm run dev
```

`web/.env.local` gains `CLUSTER_NOTEBOOK_URL=http://localhost:8000`.

## What does not change

- Hosting/deployment: `main` stays Sheets-only and deployed to Vercel as-is.
- All fields other than the devotionals rollup.
- Access control (`lib/access.ts`), SRP-cache comparison reads, worker lists.
- Frontend components and `types.ts`.

## Out of scope (for this slice)

- Any other `NucleusRow` field.
- Worker lists / `Individual` modeling.
- Access control migration.
- SRP write-back.
- Deployment/cutover planning (revisit once cluster-notebook has enough parity to consider deploying any migrated field to production).
