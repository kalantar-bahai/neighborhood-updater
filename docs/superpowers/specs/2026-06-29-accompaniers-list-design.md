# Accompaniers in Nucleus — Named List Feature

**Date:** 2026-06-29
**Status:** Approved

## Overview

Allow users to click the "Accompaniers in Nucleus" label in the Detail View and manage a named list of accompaniers for that neighborhood. The count field remains independently editable; the list and the count are loosely coupled, with a subtle visual hint when they diverge. This establishes a pattern that can later be applied to other count fields (e.g., Protagonists).

---

## Architecture

Four layers change:

1. **Sheets** — new `Accompaniers` tab in the master spreadsheet (`MASTER_SHEET_ID`). Row order = display order.
2. **`lib/`** — new config constants, two data functions (`getAccompanierNames`, `saveAccompanierNames`), and a `sheetsClear` helper in `sheets.ts`.
3. **API** — new route `/api/accompaniers` (GET + POST), following the same auth/access pattern as `/api/neighborhood`.
4. **UI** — accompanier names loaded eagerly alongside existing row data (piggybacked onto `getRowData`). `NeighborhoodDetail` gains `accompanierNames: string[]`. New `AccompaniersModal` component. Clickable label and mismatch hint in `DetailView`.

---

## Data & Sheets Schema

### `Accompaniers` tab (in `MASTER_SHEET_ID`)

- Row 1: headers
- Data from row 2 down
- Row order = display/sort order

| Col | Field | Notes |
|-----|-------|-------|
| A | cluster | Copied from neighborhood context at save time |
| B | cluster_code | Copied from neighborhood context |
| C | locality | Copied from neighborhood context |
| D | parent_neighborhood | Copied from neighborhood context |
| E | neighborhood | Used as the lookup key |
| F | name | User-entered free text |

Context columns (A–E) are populated automatically from the `NeighborhoodRow` being edited — users only type the name.

### New config constants (`lib/config.ts`)

```ts
export const ACCOMPANIERS_TAB = 'Accompaniers';
export const ACCOMPANIERS_DATA_ROW = 2;

export const ACC_COL = {
  CLUSTER:              0,
  CLUSTER_CODE:         1,
  LOCALITY:             2,
  PARENT_NEIGHBORHOOD:  3,
  NEIGHBORHOOD:         4,
  NAME:                 5,
} as const;
```

### New data functions (`lib/data.ts`)

**`getAccompanierNames(neighborhoodName: string): Promise<string[]>`**
- Reads all rows from the `Accompaniers` tab
- Filters by neighborhood (case-insensitive, trimmed)
- Returns names in row order

**`saveAccompanierNames(neighborhoodName: string, names: string[], context: { cluster, clusterCode, locality, parentNeighborhood }): Promise<void>`**
- Reads all existing rows from the `Accompaniers` tab
- Removes rows matching this neighborhood
- Appends new rows (one per name, with full context columns)
- Clears the tab's data range (`Accompaniers!A2:F`)
- Writes the full rebuilt list back

### `sheetsClear` helper (`lib/sheets.ts`)

New function alongside `sheetsGet` and `sheetsBatchUpdate`:

```ts
export async function sheetsClear(spreadsheetId: string, range: string): Promise<void>
```

Uses `spreadsheets.values.clear` from the Sheets API.

### `getRowData` update (`lib/data.ts`)

Calls `getAccompanierNames` in the same `Promise.all` as the existing SRP fetches. Adds result to the returned object:

```ts
// NeighborhoodDetail gains:
accompanierNames: string[]
```

### Type update (`types.ts`)

```ts
export interface NeighborhoodDetail {
  row: NeighborhoodRow;
  srp: SrpData | null;
  accompanierNames: string[];  // new
}
```

---

## API

### `GET /api/accompaniers?neighborhood=X`

- Auth required; same access control as `/api/neighborhood` (global sees all, contact must own the neighborhood)
- Returns `{ names: string[] }`

### `POST /api/accompaniers`

- Body: `{ neighborhood: string, names: string[] }`
- Validates access; reads the master row by neighborhood name (same `getAllMasterRows` lookup used in `/api/neighborhood`) to pull context fields (`cluster`, `clusterCode`, `locality`, `parentNeighborhood`)
- Calls `saveAccompanierNames`
- Returns `{ success: true }`

No per-item endpoints. Add/remove/reorder happen entirely in local modal state and are flushed as a single ordered list on Save.

---

## UI

### Mismatch hint (`DetailView.tsx`)

When `accompanierNames.length > 0` and `accompanierNames.length !== parseInt(form.accompaniers || '0', 10)`, the "Accompaniers in Nucleus" count input receives the existing `.overridden` CSS class (amber outline), matching the visual language already used for SRP value divergence. No reset button — the hint is informational only.

The `DetailView` holds `accompanierNames` in local state, initialized from `detail.accompanierNames`. The modal updates this state on Save.

### Clickable label

The "Accompaniers in Nucleus" `<Field>` label is replaced with a clickable element (underline + pointer cursor + small list icon) that opens `AccompaniersModal`. The count input remains editable as before.

### `AccompaniersModal` component (`components/AccompaniersModal.tsx`)

Modal overlay (same pattern as the existing diagram modal). Contents:

- **Title:** "Accompaniers in Nucleus — [neighborhood name]"
- **List:** each row shows ↑ / ↓ reorder buttons, the name, and an × delete button. ↑ is disabled on the first row; ↓ on the last.
- **Add row:** text input + "Add" button at the bottom. Enter key also submits.
- **Footer:** "Save" and "Cancel" buttons
  - **Save** — calls POST `/api/accompaniers`, updates `accompanierNames` state in `DetailView`, closes modal
  - **Cancel** — discards local changes, closes modal

The modal maintains its own local copy of the list while open. No changes are committed until Save.

### Access control

Follows existing pattern: global users can manage any neighborhood's list; contacts can only manage their own. Enforced server-side in the API route (same logic as `/api/neighborhood`).

---

## Future Considerations

- This pattern can be applied to other count fields (e.g., Protagonists) by adding new tabs with the same schema and reusing `AccompaniersModal` as a generic `NamedListModal`.
- Free-text names are used now; future SRP name linkage can be added as autocomplete/validation on the name input without changing the storage schema.
