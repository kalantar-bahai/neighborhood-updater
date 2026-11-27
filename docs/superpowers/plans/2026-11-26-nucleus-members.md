# Members of a Nucleus (app side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Residents on every Neighborhood nucleus (pushed or not), members on Network/Population nuclei, "(n)" from
`memberCount` everywhere, the type-change prompts, a Locality field for Neighborhoods, and readable SRP refusals in
the Admin Log.

**Architecture:** cluster-notebook does the work (Settings, projection, migration). The app reads new fields
(`isHome`, `srpPlace`, `memberCount`, `LogEntry.reason/names`), sends new patch fields (`localityId`,
`membersOnTypeChange`), and maps new error codes. Decisions live in tested helpers in `lib/`; components only wire
them up (there is no component-test infrastructure).

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Vitest. Read `web/node_modules/next/dist/docs/` before
writing Next.js code.

**Spec:** `docs/superpowers/specs/2026-11-26-nucleus-members-design.md`

## Global Constraints

- Backend schema (confirmed with cluster-notebook 2026-11-26, not yet deployed):
  - **Nucleus:** `isHome: Boolean!`, `inSrp: Boolean!`, `memberCount: Int!`, `srpPlace: Location`. `srpPlace` is null unless `isHome`.
  - **Location:** `srpLinked: Boolean!`, `homeNucleusId: String`.
  - **NucleusPatch:** `localityId: String`, `membersOnTypeChange: MembersOnTypeChange` (`MOVE_IN | END`).
  - **Error codes:**
    - `HAS_MEMBERS {memberCount}`
    - `MOVE_REFUSED {people: [{id, code: FORBIDDEN|OTHER_CLUSTER}]}`
    - `NEEDS_LOCALITY`
    - `MEMBER_ON_NEIGHBORHOOD`
  - **Role string:** `"member"`, granted through `updateNucleusWorkers`.
  - **LogEntry:** `reason: String`, `names: JSON!` (a map from id to name). The undo row's mutation is `"srpRefusedMove"`.
- **Not mergeable until cluster-notebook has deployed** these fields, because selecting unknown fields breaks every read. Build and test now, then merge after deploy, with the owner's approval.
- **Labels:**
  - **Resident** 🏠 on a nucleus where `isHome`.
  - **Member** on all others; the role is `member`, with icon 👤 (my call).
- **Copy, verbatim from the spec:**
  - "In SRP they'll be at <srpPlace> until this nucleus is sent to SRP."
  - "This nucleus has <n> members. A Neighborhood's members are its residents."
  - "Move them in" / "each becomes a resident here; SRP is updated, and anyone SRP refuses goes back to where SRP has them"
  - "End their memberships" / "nobody moves"
  - "<n> moved in; SRP is being updated"
  - "Its <n> residents become members. SRP is not changed."
  - "Until this nucleus is in SRP, its residents count toward its parent's neighbourhood in SRP."
  - "SRP refused the move: <reason>. Back at <place>."
- **Conventions:**
  - Never authorize by email.
  - Every route that calls cluster-notebook catches errors through `clusterNotebookErrorResponse`.
  - Use made-up names in tests.
  - Null means "not recorded".

## Review Focus

1. **A pushed (in-SRP) home nucleus must behave exactly as today:**
   - Resident is shown.
   - Moving out goes to the parent's linked Setting or the Locality.
   - Type and Locality are read-only.

   Test in Task 2 (`moveTargets` for inSrp) and Task 4 (`identityControls` for inSrp).
2. **A nucleus with no type (null) at a Locality:** Neighborhood is offered, Member is offered, and Resident is not. Tests in Task 2 and Task 4.
3. **`MOVE_REFUSED`** gives ids only. The message must still be useful without names: a count and the reason. Test in Task 1 (`errorMessage`) and Task 4.
4. **A Log entry whose `names` lacks an id** (the row was deleted) falls back to the raw id, not "undefined". Test in Task 6.
5. **A refused SRP create** used to be undone by moving the nucleus to the Cluster ("Moving to the Cluster is how a user gives up on SRP"). Now a Neighborhood can't go there (`NEEDS_LOCALITY`), so the Location control must not offer the Cluster to a Neighborhood. Test in Task 4.

---

### Task 1: API layer: new fields, patch fields, error codes

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts`:
  - `NucleusFields` and `NUCLEUS_FIELDS_SELECTION` (~l.149, 419);
  - `MoveContext` and `getMoveContext` (~l.709);
  - `LocalityOption` and `getLocationOptions` (~l.325);
  - `LogEntry` and the changeLog selection (~l.910);
  - `NucleusPatch`.
- Modify: `web/src/lib/data.ts`:
  - `getRowData`'s `srp` and the new `memberCount` (~l.205);
  - `nucleusPatchFromFormData` (~l.321).
- Modify: `web/src/types.ts`:
  - `NucleusDetail.srp` gains `srpPlace: string | null`;
  - `NucleusDetail` gains `memberCount: number`;
  - the `identity` form type gains `localityId?: string` and `membersOnTypeChange?: 'MOVE_IN' | 'END'`.
- Modify: `web/src/lib/clusterNotebookError.ts`, `CODED_ERRORS`.
- Test: `web/src/lib/data.test.ts`, `web/src/lib/clusterNotebookError.test.ts`, `web/src/lib/clusterNotebook.test.ts`

**Interfaces:**
- **Produces:**
  - `NucleusFields`: `isHome: boolean`, `memberCount: number`, `srpPlace: { id: string; name: string } | null`.
  - `MoveContext`: `{ location, parent, isHome: boolean, inSrp: boolean, srpPlace: PlaceSummary | null }`.
  - `LocalityOption`: `{ id: string; name: string; settings }`.
  - `LogEntry`: `reason: string | null`, `names: Record<string, string>`.
  - `NucleusDetail.srp.isHome` now comes from `isHome`, not from `inSrp`. Also `NucleusDetail.srp.srpPlace: string | null` (the name), and `NucleusDetail.memberCount`.
  - `nucleusPatchFromFormData` maps `identity.localityId` to `localityId`, and `identity.membersOnTypeChange` to `membersOnTypeChange`.

- [ ] **Step 1: Write failing tests**
  - In `data.test.ts`:
    - `nucleusPatchFromFormData({identity:{localityId:'loc-1'}})` gives `{localityId:'loc-1'}`.
    - With `identity:{nucleusType:'Neighborhood', membersOnTypeChange:'MOVE_IN'}` it gives `{nucleusType:'Neighborhood', membersOnTypeChange:'MOVE_IN'}`.
    - `getRowData`, mocked, returns `srp.isHome === true` when `isHome: true, inSrp: false`, and `srpPlace: 'Carrboro'` and `memberCount: 3` from the fields.
  - In `clusterNotebookError.test.ts`, each new code maps to:
    - `HAS_MEMBERS`: 409, "This nucleus has members. Choose whether to move them in or end their memberships."
    - `MOVE_REFUSED`: 409. The message is built from `extensions.people.length`: "You can't move 2 of its members (another cluster, or no permission). Nothing changed."
    - `NEEDS_LOCALITY`: 400, "Choose a locality first. A Neighborhood must be in a locality."
    - `MEMBER_ON_NEIGHBORHOOD`: 400, "A Neighborhood's people are its residents. Tick Resident instead."
  - In `clusterNotebook.test.ts`, assert the query text includes the new fields: `isHome`, `memberCount`, `srpPlace { id name }`, `reason names`, and `localities { id name`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/lib/data.test.ts src/lib/clusterNotebookError.test.ts src/lib/clusterNotebook.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`MOVE_REFUSED`** needs its count from `extensions.people`. If `CODED_ERRORS` only holds fixed text, add a `message` function entry for it.
  - **`getMoveContext`** also selects `isHome inSrp srpPlace { PLACE_SELECTION }`.
- [ ] **Step 4: Run the same command.** Expected: PASS. Also run `npx tsc --noEmit`; expected exit 0. If fixtures elsewhere fail to type-check, add the new fields to them.
- [ ] **Step 5: Commit** `feat: read members fields from cluster-notebook (isHome, memberCount, srpPlace, log names)`.

### Task 2: People rules: move targets, member role, filters

**Files:**
- Modify: `web/src/lib/people.ts`:
  - `ROLES` (~l.21);
  - `moveTargets` (~l.158);
  - `peopleFilters` (~l.73);
  - add `editorRoleList`;
  - export `refusalText`.
- Modify: `web/src/lib/config.ts`: `INFORMAL_WORKER_TYPES` gains `'member'`.
- Test: `web/src/lib/people.test.ts`

**Interfaces:**
- **Consumes:** `MoveContext` from Task 1.
- **Produces:**
  - `moveTargets(ctx): { here: MoveTarget | null; out: MoveTarget | null; srpAt: string | null }`.
  - `editorRoleList(isHome: boolean, held: string[]): string[]`.
  - `peopleFilters(rows, isHome)`: unchanged signature.
  - `refusalText(code: string | null): string`: the reason words `syncNote` already uses, without "The move was undone."

- [ ] **Step 1: Write failing tests**
  - **`moveTargets`:**
    - `isHome:false` gives `{here:null,out:null,srpAt:null}`.
    - `isHome:true, inSrp:true` keeps today's `out` rule (parent's linked Setting in the same Locality, otherwise the Locality) and gives `srpAt:null`.
    - `isHome:true, inSrp:false, srpPlace:{id:'loc-c',name:'Carrboro',…}`:
      - `here` is its own Setting;
      - `out.id === 'loc-c'`;
      - `srpAt === 'Carrboro'`.
  - **`editorRoleList`:**
    - `(true, [])` excludes `'member'`.
    - `(false, [])` includes `'member'` first, then the other known roles.
    - `(false, ['contact'])` keeps `'contact'`.
  - **`peopleFilters`:**
    - With `isHome:false`, it lists `{key:'member', label:'Member'}` and no `resident`.
    - With `isHome:true`, it lists `resident` and no `member`.
  - **`roleLabel('member')`** is `{label:'Member', icon:'👤'}`.
  - **`refusalText('HOUSEHOLD_MOVES_TOGETHER')`** equals the wording `syncNote` shows for that code. Add the code to `REFUSALS` if it's missing, as "Households move together".
- [ ] **Step 2: Run** `npx vitest run src/lib/people.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `syncNote` is rebuilt on top of `refusalText`, and its existing tests still pass.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: member role and move targets for Neighborhoods not in SRP`.

### Task 3: People card wiring

**Files:**
- Modify: `web/src/app/api/people/route.ts`: `move` now carries `srpAt`.
- Modify: `web/src/components/PeopleCard.tsx`:
  - `Moves` type;
  - `editorRoles` → `editorRoleList(isHome, e.roles)`;
  - `confirmMove` copy.
- Modify: `web/src/components/DetailView.tsx:1245`: `isHome` comes from the new `detail.srp.isHome`, and its meaning changes with no code change.

**Interfaces:**
- **Consumes:** `moveTargets`, `editorRoleList`, `roleLabel` from Task 2.

- [ ] **Step 1: Wire it.**
  - In `confirmMove` for `kind === 'in'`, when `moves.srpAt` is set, add a line: "In SRP they'll be at {srpAt} until this nucleus is sent to SRP."
  - The `member` role saves through the existing `writeRole` path, which `/api/workers` allows as an informal role.
- [ ] **Step 2: Verify.** Run `npx tsc --noEmit` and `npx vitest run`; both should exit 0. Then run `npx eslint src/components/PeopleCard.tsx src/app/api/people/route.ts` and expect no new errors.
- [ ] **Step 3: Commit** `feat: People card offers Resident on every Neighborhood and Member elsewhere`.

### Task 4: Identity card: Locality, Location, Type, prompts, (n), pocket advice

**Files:**
- Create: `web/src/lib/nucleusIdentity.ts` and `web/src/lib/nucleusIdentity.test.ts`
- Modify: `web/src/components/DetailView.tsx`:
  - the Location select (~l.1033);
  - the Type select (~l.1067) and its SETTING note;
  - the pocket advice (~l.1129);
  - `residentsNamed` (~l.611): use `detail.memberCount`.

**Interfaces:**
- **Consumes:** `NucleusDetail.srp.isHome`, `srp.state`, `memberCount`, and `LocalityOption.id` from Task 1.
- **Produces:**
  - `identityControls(input: { isHome: boolean; inSrp: boolean; pending: boolean; canChangeIdentity: boolean; locationType: string }): { place: 'locality' | 'location' | 'readonly'; typeOptions: string[] | null }`. A `typeOptions` of null means Type is read-only.
  - `typeChangePrompt(input: { from: string; to: string; isHome: boolean; memberCount: number }): { kind: 'none' } | { kind: 'membersIn'; text: string } | { kind: 'residentsOut'; text: string }`.

- [ ] **Step 1: Write failing tests** in `nucleusIdentity.test.ts`.
  - **`identityControls`:**
    - **In SRP** (`isHome:true, inSrp:true`): `place:'readonly'`, `typeOptions:null`.
    - **Pending:** the same as in SRP.
    - **Unpushed Neighborhood** (`isHome:true, inSrp:false`): `place:'locality'`, `typeOptions:['Neighborhood','Network','Population']`.
    - **Network at a LOCALITY:** `place:'location'`, `typeOptions:['','Neighborhood','Network','Population']`.
    - **Network at the CLUSTER:** `place:'location'`, `typeOptions:['','Network','Population']`. Neighborhood needs a Locality.
    - **`canChangeIdentity:false`:** `readonly` and null.
  - **`typeChangePrompt`:**
    - Network → Neighborhood with `memberCount:14`: `kind:'membersIn'`, text "This nucleus has 14 members. A Neighborhood's members are its residents."
    - The same with `memberCount:0`: `none`.
    - `''` → Neighborhood with 2 members: `membersIn`.
    - Neighborhood → Network with `isHome:true, memberCount:5`: `kind:'residentsOut'`, text "Its 5 residents become members. SRP is not changed."
    - Neighborhood → Network with 0 residents: `none`.
- [ ] **Step 2: Run** `npx vitest run src/lib/nucleusIdentity.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers, then wire DetailView.**
  - **`place:'locality'`:** a **Locality** select over `detail.locationOptions`, saving `{ identity: { localityId: <id> } }`.
  - **`place:'location'`:** the existing Location select, limited to "This cluster" plus Localities. A non-Neighborhood can't be at a Setting.
  - **`place:'readonly'`:** the read-only field, as today.
  - **Type onChange:**
    - `membersIn`: a portal dialog with the spec's three buttons. "Move them in" sends `{identity:{nucleusType:'Neighborhood', membersOnTypeChange:'MOVE_IN'}}`, and on success shows "{n} moved in; SRP is being updated". "End their memberships" sends `'END'`. Cancel restores the old value.
    - `residentsOut`: `window.confirm(text)` before saving.
  - **Remove** the "This nucleus is at a Setting, so its type is fixed to Neighborhood…" note.
  - **Pocket advice:** replace it with "Until this nucleus is in SRP, its residents count toward its parent's neighbourhood in SRP.", shown when `form.parentNucleus && detail.srp.isHome && srpState !== 'IN_SRP'`.
  - **`residentsNamed`:** becomes `detail.memberCount`, on every nucleus.
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit`, both exit 0; `npx eslint src/components/DetailView.tsx src/lib/nucleusIdentity.ts` gives no new errors.
- [ ] **Step 5: Commit** `feat: Identity card follows Neighborhood rules (Locality, type prompts, member count)`.

### Task 5: New Neighborhood needs a Locality

**Files:**
- Modify: `web/src/lib/srp.ts`: `createPayload` (~l.128).
- Modify: `web/src/components/CreateNucleusModal.tsx`: the Locality becomes required; the Create button is disabled without one.
- Test: `web/src/lib/srp.test.ts`

**Interfaces:**
- **Produces:** `createPayload` without SRP gives `identity: { nucleus, cluster, location: <locality>, nucleusType: 'Neighborhood' }`. With SRP it stays as today: `srpLocality`, and no `nucleusType`, because cluster-notebook sets it.

- [ ] **Step 1: Write failing tests**
  - `createPayload({name:'Elm', cluster:'C', locality:'Carrboro', createInSrp:false}).identity` equals `{nucleus:'Elm', cluster:'C', location:'Carrboro', nucleusType:'Neighborhood'}`.
  - The `createInSrp:true` case is unchanged.
- [ ] **Step 2: Run** `npx vitest run src/lib/srp.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and make the modal require a Locality. The locality error reads "Choose a locality for this neighborhood."
- [ ] **Step 4: Run.** Expected: PASS. `npx tsc --noEmit` exits 0.
- [ ] **Step 5: Commit** `feat: a new Neighborhood is created in a locality, as a Neighborhood`.

### Task 6: Log card shows names and refused moves

**Files:**
- Modify: `web/src/lib/admin.ts`: `logHeadline` and `logChanges` (~l.231–249).
- Test: `web/src/lib/admin.test.ts`

**Interfaces:**
- **Consumes:** `LogEntry.reason` and `names` from Task 1, and `refusalText` from Task 2.
- **Produces:**
  - `logChanges(e)` replaces any old or new value that is a key of `e.names` with that name.
  - `logRefusal(e: LogEntry): string | null` gives "SRP refused the move: {refusalText(reason)}. Back at {names[new location_id] ?? new location_id}." when `e.mutation === 'srpRefusedMove'`, and null otherwise.

- [ ] **Step 1: Write failing tests**
  - `logChanges` with `changes:{location_id:{old:'a1',new:'b2'}}` and `names:{a1:'Royal Park',b2:'Carrboro'}` gives `old:'Royal Park', new:'Carrboro'`.
  - The same with `names:{}` gives `old:'a1', new:'b2'`.
  - `logRefusal` for `srpRefusedMove`, `reason:'HOUSEHOLD_MOVES_TOGETHER'`, `names:{b2:'Carrboro'}` gives "SRP refused the move: Households move together. Back at Carrboro." It is null for `mutation:'moveIndividuals'`.
  - `logHeadline` for a null actor still says "System".
- [ ] **Step 2: Run** `npx vitest run src/lib/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, and in `LogCard.tsx` render `logRefusal(e)` under the headline when it isn't null.
- [ ] **Step 4: Run.** Expected: PASS. `npx tsc --noEmit` exits 0.
- [ ] **Step 5: Commit** `feat: Log card names places and explains moves SRP refused`.

### Task 7: Record the contract

**Files:**
- Modify: `docs/cluster-notebook-api-requirements.md`: add a section "Members of a nucleus, confirmed with cluster-notebook 2026-11-26" listing the Global Constraints schema lines and the interim `locationName` rule.

- [ ] **Step 1: Write the section.** Keep the wording factual; no real names.
- [ ] **Step 2: Commit** `docs: members of a nucleus API contract`.
