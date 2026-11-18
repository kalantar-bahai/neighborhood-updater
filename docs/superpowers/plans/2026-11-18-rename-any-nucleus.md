# Rename Any Nucleus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any nucleus be renamed, show home-nucleus SRP state correctly (out of step, push to a new FN), and explain what a delete moves.

**Architecture:** Pure decisions go in `web/src/lib/srp.ts` with tests; `srpName` flows from cluster-notebook through `data.ts` into `NucleusDetail.srp`; `DetailView` only wires the helpers into the UI.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-rename-any-nucleus-design.md`

## Global Constraints

- cluster-notebook #39 step one is in production: `inSrp` = "is a home nucleus"; `srpName: String` (null unless `inSrp`).
- Null counts mean "not recorded"; never coerce to 0.
- Copy, verbatim:
  - Out of step: `SRP calls this “<srpName>”.`
  - Push confirm at a linked Setting: `This creates a new neighbourhood in SRP named “<name>” and moves this nucleus there.`
  - Location note: `Location can't be changed while this nucleus is in SRP.`
  - `SRP_FN_HAS_NO_HOME` → 409 `This neighbourhood in SRP has no home nucleus. Ask an admin.`
  - Delete, home: `This also deletes its neighbourhood in SRP once SRP accepts. Other nuclei at its place move to the parent nucleus's neighbourhood, or to the locality.`
  - Delete, has children: `Its child nuclei move up to its parent.`
- Record confirmed backend facts in `docs/cluster-notebook-api-requirements.md` §4 with dated comments.

## Review Focus

- A home nucleus renamed while `srpName` still holds the old name: no out-of-step line while the rename is PENDING (amber badge only).
- Network/Population nuclei (no badge, `state === null`) are renamable.
- `srpName` null on an IN_SRP nucleus (older data): no out-of-step line, no push button.
- FAILED state: name stays read-only (admin must check SRP).
- Renaming to the old SRP name (adopting SRP's name) clears out-of-step after reload; no special client handling needed.

---

### Task 1: Data and decision helpers

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts` (`SRP_SELECTION`, `NucleusFields.srpName?: string | null`)
- Modify: `web/src/types.ts` (`NucleusDetail.srp` gains `srpName: string | null`)
- Modify: `web/src/lib/data.ts` (`getRowData` sets `srp.srpName`)
- Modify: `web/src/lib/srp.ts`, `web/src/lib/srp.test.ts`
- Modify: `web/src/lib/clusterNotebookError.ts`, `web/src/lib/clusterNotebookError.test.ts`

**Interfaces — Produces:**
- `canRenameNucleus(canChangeIdentity: boolean, state: SrpState | null): boolean`
- `srpOutOfStepMessage(state: SrpState | null, name: string, srpName: string | null): string | null`
- `pushToSrpMode(input: { state: SrpState | null; name: string; srpName: string | null; locationType: string; settingLinked: boolean | undefined; canCreateInCluster: boolean }): 'create' | 'newNeighbourhood' | 'resendName' | null`
- `deleteNotice(isHome: boolean, hasChildren: boolean): string`

- [ ] **Step 1: Tests in `srp.test.ts`**
  - `canRenameNucleus`: true for (true, null), (true, 'LOCAL_ONLY'), (true, 'IN_SRP'), (true, 'REFUSED'); false for (true, 'PENDING'), (true, 'FAILED'), (false, 'LOCAL_ONLY').
  - `srpOutOfStepMessage('IN_SRP', 'B', 'A')` → `SRP calls this “A”.`; null for same names, null srpName, and states 'PENDING'/'LOCAL_ONLY'.
  - `pushToSrpMode`: LOCAL_ONLY + LOCALITY → 'create'; LOCAL_ONLY + SETTING settingLinked false → 'create'; LOCAL_ONLY + SETTING settingLinked true → 'newNeighbourhood'; IN_SRP with srpName ≠ name → 'resendName'; IN_SRP in step → null; any case with canCreateInCluster false → null; PENDING → null.
  - `deleteNotice(false,false)` → `Deleting a nucleus removes it immediately. This can’t be undone here.`; `(true,false)` → the home copy; `(false,true)` → base + space + children copy; `(true,true)` → home + space + children copy.
- [ ] **Step 2:** `cd web && npx vitest run src/lib/srp.test.ts` — FAIL (not exported).
- [ ] **Step 3:** Implement the four helpers in `srp.ts`. Add `srpName` to `SRP_SELECTION`, `NucleusFields`, `NucleusDetail.srp`, and `getRowData` (`nucleusFields?.srpName ?? null`). Fix any `NucleusDetail` fixtures tsc flags.
- [ ] **Step 4:** Errors: delete `SRP_IN_USE` from `CODED_ERRORS` and its two test rows; add `SRP_FN_HAS_NO_HOME` (409, copy above) with a test row; change `SRP_NOT_DEFAULT` copy to `This nucleus isn't the home nucleus of its SRP neighbourhood, so it can't be changed in SRP from here.` (test updated). Update the comment above `CODED_ERRORS` that cites SRP_IN_USE.
- [ ] **Step 5:** `npm test && npx tsc --noEmit` — all pass.
- [ ] **Step 6:** Commit `feat: srpName and rename/push/delete decisions for home nuclei`.

### Task 2: Nucleus page wiring

**Files:**
- Modify: `web/src/components/DetailView.tsx`, `web/src/components/AppClient.tsx`
- Modify: `docs/cluster-notebook-api-requirements.md` §4

**Interfaces — Consumes:** Task 1 helpers; `detail.srp.srpName`.

- [ ] **Step 1:** `canRename = canRenameNucleus(permissions.canChangeIdentity, detail.srp.state)`. Update the stale "#42" comment near the Location/Nucleus fields.
- [ ] **Step 2:** In the SRP status field, after `srpMessage`, render `srpOutOfStepMessage(...)` in grey 12px.
- [ ] **Step 3:** Replace `canPushToSrp` with `pushMode = pushToSrpMode({... settingLinked: locationSetting?.srpLinked ...})`. Show the button when `pushMode`; for `'newNeighbourhood'` call `window.confirm(<push confirm copy>)` first and stop on cancel.
- [ ] **Step 4:** Location note copy → `Location can't be changed while this nucleus is in SRP.`
- [ ] **Step 5:** New prop `childCount: number` (AppClient: `initialData.rows.filter(r => r.parentNucleus === selectedNucleus).length`). Danger Zone paragraph text → `deleteNotice(srpState === 'IN_SRP', childCount > 0)`.
- [ ] **Step 6:** API doc §4: add "Confirmed with cluster-notebook 2026-11-18 (#39 step one, in production)" covering inSrp meaning, srpName, local-first rename, push (a)/(b), SRP_FN_HAS_NO_HOME, delete moves and SRP_IN_USE removal. Remove the CLAUDE.md "#42" open-thread reference and close #42 in the PR body ("Closes #42").
- [ ] **Step 7:** `npm test && npx tsc --noEmit && npx eslint src/components/DetailView.tsx src/components/AppClient.tsx` — tests pass, tsc clean, no new lint errors.
- [ ] **Step 8:** Owner checks locally (cluster-notebook on 8123 restarted; worker `--serve --fake-srp`): rename "Test Shared" (immediate, grey); rename a home nucleus (amber, then green); push "Test Shared" (confirm, becomes its own home); delete notice text on a home nucleus.
- [ ] **Step 9:** Commit `feat: rename any nucleus and handle home-nucleus SRP states`.
