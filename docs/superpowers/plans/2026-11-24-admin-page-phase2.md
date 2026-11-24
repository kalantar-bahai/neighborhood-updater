# Admin page, Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Admin page gets an Invite card (invite a person by email, optionally with a role; list, resend and cancel invitations; replace a lost login) and an Accounts card (who can sign in; remove access), and search results say "invited".

**Architecture:** Same shape as Phase 1 (branch `feat/admin-page`, PR #61): cluster-notebook client in `lib/clusterNotebook.ts`, pure decisions in `lib/admin.ts`, thin routes under `app/api/admin/*` gated by `requireAdmin(cluster)`, components under `components/admin/`. cluster-notebook owns invitations end to end (permission, Clerk, record, link at first sign-in); this app never calls Clerk's backend for them.

**Tech Stack:** Next.js 16 App Router, React 19, Clerk, Vitest. Read `node_modules/next/dist/docs/` before Next code (`web/AGENTS.md`).

**Spec:** `docs/superpowers/specs/2026-11-24-admin-page-design.md` (Invite card, Accounts card, "What we need" Phase 2), as amended by cluster-notebook's final shape recorded in `docs/cluster-notebook-api-requirements.md` ("Admin page, Phase 1, confirmed … 2026-11-24").

## Global Constraints

- **Branch `feat/admin-phase2` off `main`** (Phase 1 merged as #61). cluster-notebook says all Phase 2 fields are in production (2026-11-24): `inviteIndividual`, `resendInvitation`, `revokeInvitation`, `removeAccess`, `restoreAccess`, `invitations`, `accounts`, `AdminPerson.pendingInvitation`. Confirm with a schema check before merging.
- The `pendingInvitation` field goes only into the admin search query, never into a query the home page or People card uses.
- cluster-notebook shapes (final, 2026-11-24): `Invitation { id individual: PersonSummary! email role entity: AdminPlace status: PENDING|ACCEPTED|EXPIRED|REVOKED invitedBy: PersonSummary createdAt expiresAt acceptedAt replacedBy }`; `AccountInfo { individual email provider createdAt lastSeenAt disabledAt }`; `inviteIndividual(individualId, email, role, entityId, expiresInDays = 30, replaceExisting = false)`; `resendInvitation(id)`; `revokeInvitation(id)`; `removeAccess(individualId, endRoles = false): Boolean!`; `restoreAccess(individualId): Boolean!` (same login: lifts the Clerk ban, re-enables the link; roles ended earlier stay ended; false when there is no disabled login); `invitations(clusterName, status)`; `accounts(clusterName)`.
- Error wording (CODED_ERRORS, dated "Confirmed with cluster-notebook 2026-11-24"): `EMAIL_IN_USE` 409 "This address belongs to someone else."; `ALREADY_HAS_ACCESS` 409 "{name} already has access." (the card offers "Replace their login?"); `INVITATION_PENDING` 409 "An invitation is already pending; resend it instead."; `NOT_PENDING` 409 "This invitation is no longer pending."; `BAD_INPUT` 400 null (show upstream message); `CLERK_ERROR` 502 "The invitation email couldn't be sent. Try again."; `CLERK_NOT_CONFIGURED` 503 "Invitations aren't set up yet.".
- **Standing (cluster-notebook 2026-11-24):** invite, resend, cancel, remove and restore also need the caller to be an Administrator or able to end every current role the person holds; otherwise `FORBIDDEN`. On these routes show 403 as "You can't manage access for this person." (route-level wording, not the global FORBIDDEN text).
- The login email is not the contact email: show it only on the invitation and account rows; never write it anywhere else.
- Copy, verbatim: card titles "Invite", "Invitations", "Accounts (n)"; "Email"; "Expires in (days)"; "Invite"; status words "pending", "accepted", "expired", "cancelled" (REVOKED shows as "cancelled"); "Resend", "Cancel"; tag "invited"; "Remove access…"; tick box "Also end their roles"; removed rows greyed with "access removed {YYYY-MM-DD}" and a **Restore access** button (false → "No removed login to restore.").
- Every route: `auth()` → 401; `requireAdmin(cluster)` → 403; validate → 400; catch through `clusterNotebookErrorResponse`. Made-up names only (public repo). Commit trailers as Phase 1.

## Review Focus

1. Inviting someone who already has access: the card shows "{name} already has access." with a "Replace their login?" button that re-sends with `replaceExisting: true`; nothing else is replaced silently.
2. The email field: prefilled from the person's first SRP email when present, empty otherwise, always editable; picking a different person replaces it (a typed address for person A never carries over to person B).
3. Resend or Cancel on an invitation that has meanwhile been accepted or expired: "This invitation is no longer pending." and the list re-reads.
4. Removing your own access: the confirm reads "Remove your own access? You will be signed out." (the row's person id equals `me.id` from `/api/admin/clusters`), and after success the browser goes to `/signout`.
5. Switching cluster mid-invite clears the form (cards keyed `invite:${cluster}`, `accounts:${cluster}`, distinct from Phase 1's keys).

---

### Task 1: client and error wording

**Files:** Modify `web/src/lib/clusterNotebook.ts`, `web/src/lib/clusterNotebookError.ts`; Test both `.test.ts`

**Interfaces — Produces:** types `InvitationStatus`, `Invitation`, `AccountInfo` (as Global Constraints; `entity: AdminLocation | null` reusing Phase 1's `{ id name type }` selection); `AdminPerson.pendingInvitation: { id: string; expiresAt: string } | null` (select only `pendingInvitation { id expiresAt }`); `inviteIndividual(input: { individualId: string; email: string; role: string | null; entityId: string | null; expiresInDays: number; replaceExisting: boolean }): Promise<Invitation>`; `resendInvitation(id)`, `revokeInvitation(id)`: `Promise<Invitation>`; `removeAccess(individualId, endRoles): Promise<boolean>`; `restoreAccess(individualId): Promise<boolean>`; `getInvitations(clusterName, status: InvitationStatus | null)`: `Promise<Invitation[]>`; `getAccounts(clusterName): Promise<AccountInfo[]>`; `getMe(): Promise<PersonSummary | null>` (Phase 1's `me`, if not already present).

- [ ] Tests: each call's query text and exact variables (null `role`/`entityId`/`status` sent as null); `searchPeople`'s query now contains `pendingInvitation { id expiresAt }`; each new CODED_ERRORS row maps to its status and text.
- [ ] Run `npx vitest run src/lib/clusterNotebook.test.ts src/lib/clusterNotebookError.test.ts`: FAIL. Implement with dated comments. Run: PASS; `npx tsc --noEmit` clean.
- [ ] Commit `feat: cluster-notebook client for invitations and accounts`.

### Task 2: decisions

**Files:** Modify `web/src/lib/admin.ts`, `web/src/lib/admin.test.ts`

**Interfaces — Produces:**
- `invitationStatusWord(s: InvitationStatus): string` — PENDING "pending", ACCEPTED "accepted", EXPIRED "expired", REVOKED "cancelled".
- `invitationLine(i: Invitation): string` — "Ana Lopez · ana@example.org · CSO at NC-215 Triangle · invited by Ben Okafor 2026-11-24 · expires 2026-12-24" (role part only when role is set; "at {entity}" only with an entity; "invited by" only when known; dates are the first 10 characters).
- `accountLine(a: AccountInfo): string` — "Ana Lopez · ana@example.org · since 2026-11-24 · last seen 2026-11-25" ("never seen" when lastSeenAt is null; email part omitted when null); `accountRemovedNote(a): string | null` — "access removed 2026-11-26" or null.
- `prefillEmail(details: PersonDetails | null): string` — first of `details.emails` trimmed, else "".
- `adminPersonTag(p: AdminPerson): 'has access' | 'invited' | null` — "has access" wins over "invited".
- `removeAccessConfirm(name: string, isSelf: boolean): string` — "Remove Ana Lopez's access?" / "Remove your own access? You will be signed out.".

- [ ] Tests with made-up people for every line above, including the omitted-part cases and `adminPersonTag` precedence.
- [ ] Run `npx vitest run src/lib/admin.test.ts`: FAIL. Implement. PASS.
- [ ] Commit `feat: invitation and account decisions`.

### Task 3: routes

**Files:** Create `web/src/app/api/admin/invitations/route.ts`, `web/src/app/api/admin/accounts/route.ts`; Modify `web/src/app/api/admin/clusters/route.ts`

**Interfaces — Produces:**
- `GET /api/admin/invitations?cluster=&status=` → `{ invitations }` (status optional, one of the four, else 400).
- `POST /api/admin/invitations { cluster, individualId, email, role?, entityId?, expiresInDays?, replaceExisting? }` → `{ invitation }`. 400 when email is blank or has no "@", when `role` is given without `entityId` (except "Administrator"), or when `expiresInDays` isn't an integer 1–90 (default 30).
- `PATCH /api/admin/invitations { cluster, id, action: 'resend' | 'cancel' }` → `{ invitation }` (Resend and Cancel).
- `GET /api/admin/accounts?cluster=` → `{ accounts }`; `DELETE /api/admin/accounts { cluster, individualId, endRoles }` → `{ ok: true }`; `PATCH /api/admin/accounts { cluster, individualId, action: 'restore' }` → `{ restored: boolean }`. On these and the invitation routes, a 403 from cluster-notebook answers "You can't manage access for this person.".
- `/api/admin/clusters` also returns `me: { id } | null` (for Review Focus 4).

- [ ] Shape of Phase 1's admin routes. Put input validation in `lib/admin.ts` as `validateInvite(body): { ok: true; value } | { ok: false; error: string }` with Vitest tests (blank email, no "@", role without place, Administrator without place allowed, expiry 0/91/"x" rejected, default 30).
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npx eslint src/app/api/admin src/lib/admin.ts`: clean. Commit `feat: invitation and account routes`.

### Task 4: shared place-and-role picker

**Files:** Create `web/src/components/admin/PlaceRolePicker.tsx`; Modify `web/src/components/admin/RolesCard.tsx`

**Interfaces — Produces:** `PlaceRolePicker({ cluster, onChange: (v: { entityId: string; role: string } | null) => void, optional?: boolean })` — the "+ role" place tree (filter box, `placeTree`) and role select (from `GET /api/admin/places?entityId=`), lifted out of RolesCard. With `optional`, a first choice "No role" yields null.

- [ ] Move RolesCard's picker into it unchanged in behaviour (including its stale-reply guard); RolesCard uses it. `npx tsc --noEmit`, `npx vitest run`, eslint on both files: clean. Browser: "+ role" works as before.
- [ ] Commit `refactor: share the admin place-and-role picker`.

### Task 5: Invite card

**Files:** Create `web/src/components/admin/InviteCard.tsx`; Modify `web/src/components/admin/PersonFinder.tsx`, `web/src/components/admin/AdminClient.tsx`

**Interfaces — Consumes:** Tasks 1–4; Phase 1's `GET /api/admin/person?id=` for details.

- [ ] PersonFinder shows `adminPersonTag` (grey tag) instead of only "has access".
- [ ] InviteCard (collapsible, "Invite"): PersonFinder → picked person's line, then Email (prefilled with `prefillEmail(details)`, 16px bordered input, replaced on each new pick), `PlaceRolePicker optional`, "Expires in (days)" (number, default 30), **Invite**. Success: "Invitation sent to {email}." and the Invitations list re-reads. Errors in words under the button; on 409 `ALREADY_HAS_ACCESS` show "{name} already has access." plus a "Replace their login?" button that re-posts with `replaceExisting: true`. Button disabled while sending.
- [ ] Below, "Invitations": rows by `invitationLine` + status word; PENDING rows have **Resend** and **Cancel** (confirm "Cancel the invitation to {email}?"), each disabled in flight; after either, re-read. Per-row errors as HiddenCard does.
- [ ] AdminClient renders `<InviteCard key={`invite:${cluster}`} cluster={cluster} />` first.
- [ ] `npx tsc --noEmit`, `npx vitest run`, eslint: clean. Browser against cluster-notebook's Phase 2 (local or production once deployed): invite "Test SecondAccount" to the second login, accept in a private window, see it accepted; resend and cancel a second invitation.
- [ ] Commit `feat: admin Invite card`.

### Task 6: Accounts card

**Files:** Create `web/src/components/admin/AccountsCard.tsx`; Modify `web/src/components/admin/AdminClient.tsx`

- [ ] Collapsible "Accounts (n)" (n counts accounts without `disabledAt`). Rows: `accountLine`; disabled ones greyed with `accountRemovedNote`. Active rows: **Remove access…** opens an inline confirm: `removeAccessConfirm(name, individual.id === me?.id)`, tick box "Also end their roles" (unticked), Cancel / Remove. Success re-reads; removing yourself then sends the browser to `/signout`. Removed rows: **Restore access** → PATCH → re-read; false shows "No removed login to restore.". Per-row busy and errors.
- [ ] AdminClient renders `<AccountsCard key={`accounts:${cluster}`} cluster={cluster} me={me} />` after Invite.
- [ ] `npx tsc --noEmit`, `npx vitest run`, eslint: clean. Browser: remove the test login's access, confirm it can no longer sign in; re-invite it with replace.
- [ ] Commit `feat: admin Accounts card`.

### Task 7: docs

- [ ] In `docs/cluster-notebook-api-requirements.md`, add "Admin page, Phase 2, confirmed with cluster-notebook 2026-11-24": the Phase 2 SDL and rules (invitation lifecycle, resend revokes the old one, removeAccess bans in Clerk and revokes pending invitations, login email kept only on the invitation, restoreAccess; standing over the person; no Clerk session-token claim is needed: cluster-notebook asks Clerk for the new user's invitation at first sign-in; owner setup is only the Clerk secret on Render). Commit `docs: record the admin Phase 2 contract`.
