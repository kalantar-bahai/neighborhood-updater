# DetailView Autosave

**Date:** 2026-09-15
**Status:** Approved

## Overview

Replace `DetailView`'s explicit "Save"/"Discard changes" batching with per-field autosave: each field commits the moment it's edited (immediately for discrete controls, on blur/Enter for text and numeric inputs), the same way `WorkerListModal` already saves every add/remove/reorder action immediately (2026-09-13: "the old batch-everything design was a spreadsheet-write limitation, not a real UX requirement").

Users reported the current batched-Save flow as error-prone: edits sit unsaved until a manual click, and one invalid number anywhere on the page blocks saving everything else.

## Why no cluster-notebook API changes

Every mutation `saveRowData` calls is already a partial-update: `updateNucleus`'s `NucleusPatch` and `updateActivitySummary`'s `fields` argument both treat an omitted key as "leave alone," and our own `nucleusPatchFromFormData`/`activityUpdateWrites` already only touch fields present in the payload. The granularity this design needs already exists end-to-end — this is a client-side change to *when* the same mutations fire, not a request for smaller ones.

## Architecture

One layer changes: `web/src/components/DetailView.tsx`. `data.ts`, `clusterNotebook.ts`, and `app/api/nucleus/route.ts` are untouched — each autosaved field just POSTs a smaller `formData` fragment to the same route than `handleSave` used to send as one batch.

## Per-field trigger matrix

| Field(s) | Trigger | Payload fragment |
|---|---|---|
| `stage`, `nucleusType` (admin-only dropdowns) | immediate on select | `{ identity: { nucleus, stage } }` — same shape the old `handleSave` built for admin identity fields |
| `presence`, `gatherings` (Yes/No toggles) | immediate on click | `{ presence: 'Yes' }` |
| `totalPop`, `totalHH`, `indNum`, `hhNum` | blur / Enter | `{ totalPop: '120' }` |
| `makeup`, `notesPresence`, `notesGatherings`, `narrative` (textareas) | blur only (no Enter-submit — Enter inserts a newline) | `{ makeup: '...' }` |
| Activities: `act`/`part`/`fof` × 4 types (12 inputs) | blur / Enter, **per sub-field** | `{ activities: { ccs: { act: '3' } } }` — omits `part`/`fof` entirely; `updateActivitySummary`'s fields are independently optional |

A blur-triggered field only fires a request if its value differs from the last value successfully saved for that field (tracked per field, seeded from the initially loaded row) — focusing and blurring without editing sends nothing.

`parentNucleus` is wired end-to-end in the data layer (query + patch field) but has no input control anywhere in `DetailView` today — nothing to convert, since it isn't editable in the UI currently. Out of scope for this change.

## Save mechanics

A single `saveField(fragment: Record<string, unknown>)` helper replaces `handleSave`. It POSTs `{ name: row.nucleus, formData: fragment }` to `/api/nucleus` (identical endpoint, smaller body) and, same as the isOverridden-after-save fix, merges any `activities` the response returns back into `form` — so a just-saved activity override's amber highlight appears immediately, without a reload.

A single shared status area (the footer, buttons removed) shows `Saving…` / `Saved` / an error message — chosen over per-field or per-card indicators for simplicity. Overlapping saves (e.g. blurring one field while another is still in flight) show whichever settles last; this is a known, accepted imprecision given that choice, not something this design solves with a queue.

On failure: the typed value stays in the field (never silently reverted — no data loss), and the status area shows the error with a **Retry** action that resends the same fragment. Client-side validation (`isValidInt`) runs before sending — an invalid number is never POSTed; the input keeps its existing red-border error state and nothing else on the page is blocked. This directly fixes the reported error-proneness: today one bad number anywhere blocks the entire Save.

## Removed

- Both Save buttons — the header one, and the footer one (styled to match the header's in the immediately preceding change; this makes that styling change short-lived, which is expected and fine).
- "Discard changes" button and `handleDiscard`.
- `isDirty` state.
- `cannotSave`/`hasIntErrors` as a page-wide gate (superseded by per-field validation-before-send).

`handleBack`/`handleSignOut` change from "warn if `isDirty`" to "warn if a save is currently in flight" — autosave removes the need for a dirty-check (anything edited has already been committed by the time these fire, since clicking elsewhere blurs the active field first), but signing out does a real page unload (`window.location.href`) that could abort an in-progress request, so that specific case still needs a guard.

## Testing

`DetailView.tsx` has no component test suite (consistent with the rest of this app — UI correctness is verified via `tsc`, `lint`, and manual reasoning/browser check, not automated component tests). `data.ts`/`clusterNotebook.ts` are unaffected, so no new unit tests are needed there either.
