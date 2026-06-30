# Workers Named List — Generalization & Protagonists Feature

**Date:** 2026-06-30
**Status:** Approved

## Overview

Generalize the "Accompaniers in Nucleus" named-list pattern to support multiple worker types in a single shared `Workers` tab. Apply the same pattern to the "Protagonists / Workers" field, including an import feature that merges the accompanier list into the protagonists list.

This replaces the previous single-purpose `Accompaniers` tab (renamed to `Workers`) and `AccompaniersModal` component with type-aware, reusable equivalents.

---

## Architecture

Four layers change:

1. **Config** (`lib/config.ts`) — rename constants, add `TYPE` column to `ACC_COL`
2. **Data** (`lib/data.ts`) — generalize tab-reading and save functions to accept a `type` parameter; `getRowData` fetches both list types concurrently
3. **API** (`app/api/workers/route.ts`) — new generic route with `type` param replaces `/api/accompaniers`
4. **UI** — `AccompaniersModal` → `NamedListModal` (generic); `DetailView` wires up protagonists field identically to accompaniers

---

## Data & Sheets Schema

### `Workers` tab (renamed from `Accompaniers`)

- Row 1: headers
- Data from row 2 down
- Row order = display/sort order within each type

| Col | Field | Notes |
|-----|-------|-------|
| A | cluster | Copied from neighborhood context at save time |
| B | cluster_code | Copied from neighborhood context |
| C | locality | Copied from neighborhood context |
| D | parent_neighborhood | Copied from neighborhood context |
| E | neighborhood | Lookup key |
| F | type | `"accompanier"` or `"protagonist"` |
| G | name | User-entered free text |

Existing accompanier rows were migrated: `type = "accompanier"` added to column F.

### Updated config constants (`lib/config.ts`)

```ts
// Renamed:
export const WORKERS_TAB = 'Workers';        // was ACCOMPANIERS_TAB = 'Accompaniers'
export const WORKERS_DATA_ROW = 2;           // was ACCOMPANIERS_DATA_ROW

// Updated (TYPE inserted at index 5, NAME shifted to 6):
export const ACC_COL = {
  CLUSTER:             0,
  CLUSTER_CODE:        1,
  LOCALITY:            2,
  PARENT_NEIGHBORHOOD: 3,
  NEIGHBORHOOD:        4,
  TYPE:                5,
  NAME:                6,
} as const;
```

### Updated data functions (`lib/data.ts`)

**`getAllWorkerRows(): Promise<string[][]>`** (replaces `getAllAccompanierRows`)
- Reads `Workers!A2:G` (7 columns)

**`getWorkerNames(neighborhoodName: string, type: string): Promise<string[]>`** (replaces `getAccompanierNames`)
- Filters by both neighborhood (case-insensitive) and type
- Returns names in row order

**`saveWorkerNames(neighborhoodName, type, names, context): Promise<void>`** (replaces `saveAccompanierNames`)
- Reads all rows; removes only rows where **both** neighborhood and type match
- Preserves rows of the same neighborhood but different type
- Appends new rows with 7 columns (including type)
- Clears `Workers!A2:G`; writes combined list back

**`getRowData` update**
- Calls `getWorkerNames(name, 'accompanier')` and `getWorkerNames(name, 'protagonist')` concurrently in the existing `Promise.all`
- Returns both as `accompanierNames` and `protagonistNames`

### Type update (`types.ts`)

```ts
export interface NeighborhoodDetail {
  row: NeighborhoodRow;
  srp: SrpData | null;
  accompanierNames: string[];   // existing
  protagonistNames: string[];   // new
}
```

---

## API

### `GET /api/workers?neighborhood=X&type=Y`

- Auth required; same access control as `/api/neighborhood`
- Returns `{ names: string[] }`

### `POST /api/workers`

- Body: `{ neighborhood: string, type: string, names: string[] }`
- Validates access; reads master row by neighborhood name for context fields
- Calls `saveWorkerNames(masterRow[COL.NEIGHBORHOOD], type, names, context)`
- Returns `{ success: true }`

### Removed

`/api/accompaniers` is deleted. No external consumers.

---

## UI

### `NamedListModal` (`components/NamedListModal.tsx`, replaces `AccompaniersModal.tsx`)

Props:

```ts
interface Props {
  title: string;          // e.g. "Accompaniers in Nucleus" or "Protagonists / Workers"
  type: string;           // 'accompanier' or 'protagonist' — sent to API
  neighborhood: string;
  initialNames: string[];
  importNames?: string[]; // if provided, import button is shown
  onSave: (names: string[]) => void;
  onClose: () => void;
}
```

Behavior changes from `AccompaniersModal`:
- Title rendered from `title` prop (not hardcoded)
- Posts to `/api/workers` with `{ neighborhood, type, names }`
- Import button: shown above the list only when `importNames` is provided. Icon only (no text). Clicking merges `importNames` into local list — case-insensitive dedup by name, existing order preserved, new names appended at the end.

`AccompaniersModal.tsx` is deleted.

### `DetailView.tsx` changes

**Protagonists field** — wired up identically to accompaniers:

```tsx
const [protagonistNames, setProtagonistNames] = useState<string[]>(() => detail.protagonistNames);
const [showProtagonistsModal, setShowProtagonistsModal] = useState(false);

const protagonistsMismatch = protagonistNames.length > 0 &&
  protagonistNames.length !== parseInt(form.protagonists || '0', 10);
```

```tsx
<Field
  label="Protagonists / Workers"
  value={form.protagonists}
  onChange={v => set('protagonists', v)}
  integer
  highlighted={protagonistsMismatch}
  onLabelClick={() => setShowProtagonistsModal(true)}
  onSync={() => set('protagonists', String(protagonistNames.length))}
/>
```

Auto-sync on save: same logic as accompaniers — if count matched list length before modal opened, update count to new length after save.

**Modal render:**

```tsx
{showProtagonistsModal && (
  <NamedListModal
    title="Protagonists / Workers"
    type="protagonist"
    neighborhood={row.neighborhood}
    initialNames={protagonistNames}
    importNames={accompanierNames}
    onSave={names => {
      const wasInSync = protagonistNames.length === parseInt(form.protagonists || '0', 10);
      setProtagonistNames(names);
      if (wasInSync) set('protagonists', String(names.length));
      setShowProtagonistsModal(false);
    }}
    onClose={() => setShowProtagonistsModal(false)}
  />
)}
```

Accompaniers modal updated to use `NamedListModal`:

```tsx
{showAccompaniersModal && (
  <NamedListModal
    title="Accompaniers in Nucleus"
    type="accompanier"
    neighborhood={row.neighborhood}
    initialNames={accompanierNames}
    onSave={names => {
      const wasInSync = accompanierNames.length === parseInt(form.accompaniers || '0', 10);
      setAccompanierNames(names);
      if (wasInSync) set('accompaniers', String(names.length));
      setShowAccompaniersModal(false);
    }}
    onClose={() => setShowAccompaniersModal(false)}
  />
)}
```

### Access control

Unchanged — global users can manage any neighborhood's list; contacts can only manage their own. Enforced server-side.

---

## Testing

`data.test.ts` updates:
- **Update existing tests**: all `sheetsGet` mocks that return accompanier rows must change from 6-column to 7-column format (inserting type at index 5)
- `getWorkerNames`: verify type filtering — same neighborhood + different types return separate lists; wrong type returns empty
- `saveWorkerNames`: verify rows of the same neighborhood but different type are preserved after save (critical correctness check)

---

## Migration

The `Accompaniers` tab was renamed to `Workers` and a `type` column was inserted at position F (`"accompanier"`) before the existing `name` column. This was done manually by the user before implementation began.
