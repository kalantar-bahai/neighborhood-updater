# Clerk Authentication Swap Design

**Date:** 2026-09-23
**Status:** Approved

## Problem

Nucleus Assistant currently authenticates through NextAuth with a Google OAuth
provider (`web/src/auth.ts`), keyed on the signed-in user's email address.
Authorization is a separate, Sheet-backed layer (`getAccess(email)` in
`web/src/lib/access.ts`) that reads an `Access` tab and returns a per-nucleus
`roleMap`.

The project is moving to Clerk for identity, and — per a design consult with
the `cluster-notebook` session, which owns the GraphQL service this app talks
to — that Clerk instance is meant to be a **shared identity substrate**: not
just for Nucleus Assistant, but for tutor-tracker and other apps still to
come. cluster-notebook also has its own (not-yet-built) authorization model
in mind: per-entity role assignments (Nucleus, Cluster, Locality, Setting),
not a flat global tier, keyed on the Clerk user id rather than email — email
is mutable and a poor foreign key.

Separately, the branch's real authorization scheme (role checks against
cluster-notebook rather than the Sheet) isn't built yet. This design covers
only the identity swap and a deliberate authorization stopgap; the follow-up
work is tracked in
[neighborhood-updater#37](https://github.com/kalantar-bahai/neighborhood-updater/issues/37).

## Goals

- Replace NextAuth + Google with Clerk as the identity provider.
- Key identity on Clerk's stable user id, not email.
- Forward the Clerk session token to cluster-notebook on every GraphQL call,
  even though cluster-notebook verifies nothing yet — so the plumbing exists
  before enforcement does.
- Keep every existing API route and UI component that consumes `roleMap`
  working unchanged; only `getAccess`'s *source* changes.
- Preserve the existing custom sign-in/sign-out UI rather than swapping in
  Clerk's default styled components.
- Preserve today's "last saved by" display behavior as-is (see Audit trail
  below — it's ephemeral today, and stays that way here).

## Non-goals

- Building cluster-notebook's real per-entity role enforcement. Tracked in
  issue #37.
- Migrating the `Access` Sheet tab's data anywhere. It becomes unused; not
  deleted, in case the stopgap needs to be rolled back before #37 lands.
- Resolving whether cluster-notebook needs its own API access into the
  shared Clerk org to verify tokens. Open item on cluster-notebook's side,
  not blocking this work.
- Coordinating tutor-tracker's or any other app's onboarding onto the shared
  Clerk org. Out of scope for this branch.
- Persisting a durable save-audit trail (who/when last saved a nucleus).
  Today's "last saved by" is ephemeral client state, not stored anywhere;
  it stays that way here. Tracked in issue #38.
- Deciding the fate of `/api/access` and the `Access` Sheet tab now that
  nothing enforces what it grants (once `getAccess` is stubbed). Left as-is;
  worth resolving alongside #37, not here.

## Identity

Clerk replaces NextAuth. `clerk init` scaffolds the SDK, provider, and
proxy/middleware wiring for this Next.js version (verify the dev-resource
matcher per Clerk's own setup notes).

- `web/src/auth.ts` (NextAuth config) and the `next-auth` dependency are
  removed.
- `web/src/app/api/auth/[...nextauth]/route.ts` is removed; Clerk's own
  routes replace it.
- The sign-in page (`web/src/app/page.tsx`) keeps its current card markup
  and copy. Its button is wrapped in Clerk's unstyled `<SignInButton>`
  (renders nothing of its own; just triggers Clerk's flow on the existing
  button) instead of calling NextAuth's `signIn('google')`. Google is
  configured as Clerk's social connection so the sign-in flow looks the same
  to users.
- The sign-out page (`web/src/app/signout/page.tsx`) and the header's sign-out
  icon (`DetailView.tsx`) keep their markup, wrapped in Clerk's unstyled
  `<SignOutButton>` instead of calling NextAuth's `signOut`.
- Decided for now, still open to revisiting: `UserButton` (Clerk's
  avatar-plus-dropdown component) was considered and set aside in favor of
  keeping the existing UI unchanged.
- Every route handler's `req.auth?.user?.email` check is replaced with
  Clerk's server-side `auth()` (for the user id) — see Authorization below
  for what each route actually needs.

## Token forwarding to cluster-notebook

`web/src/lib/clusterNotebook.ts`'s single `request()` helper adds the
caller's Clerk session token as an `Authorization: Bearer <token>` header on
every GraphQL call. cluster-notebook does not verify it yet; this is
plumbing for when it does. No other change to `clusterNotebook.ts`'s
request/response shape.

## Authorization (stopgap)

`getAccess(email)` in `web/src/lib/access.ts` stops reading the `Access`
Sheet tab. It becomes `getAccess(userId)` (Clerk user id, not email) and
unconditionally returns:

```ts
{ role: 'admin', roleMap: { '*': 'admin' } }
```

for any authenticated call. No route or component signature changes: the
`roleMap` shape (keyed by nucleus name, with `'*'` as the all-nuclei
wildcard) is unchanged, because that shape already answers cluster-notebook's
"what's this user's role at this entity" per nucleus — it's just computed
eagerly today instead of queried lazily. This is the seam issue #37 will
change: only `getAccess`'s internals, not its callers, when cluster-notebook
ships real per-entity roles. If cluster-notebook's `'*'`-equivalent turns out
not to be a clean fit (see the "Setting" entity type in their design), the
consuming code will need a follow-up pass then — noted in #37, not solved
here.

The six API routes that currently call `getAccess(req.auth.user.email)`
(`initial-data`, `nucleus`, `workers`, `individuals`, `access`) switch to
`getAccess(userId)`, where `userId` comes from Clerk's `auth()`. Their
`role === 'none'` / `role === 'read'` branch logic is untouched — it's
unreachable in practice today (the stub never returns `'none'`), but stays
in place so it's live code again the moment #37 lands, not something to
rebuild.

## Audit trail ("last saved by")

Contrary to an earlier assumption in this design, "last saved by" is not
persisted today: `saveRowData(name, formData, email)` in
`api/nucleus/route.ts` (and equivalents) only echoes `email` back in the
save response; `DetailView`'s `lastUpdatedBy`/`lastUpdatedAt` are plain
client-side React state set from that response, gone on reload. There is no
row or column anywhere storing it, in the Sheet or otherwise.

This design preserves that behavior as-is: the echoed value becomes a
human-readable identity from Clerk's `currentUser()` (email address),
fetched alongside the user id in the same request, rather than the raw
Clerk user id — but it's still ephemeral, still not persisted. Making it
durable, in cluster-notebook, is tracked separately in
[neighborhood-updater#38](https://github.com/kalantar-bahai/neighborhood-updater/issues/38)
and is not part of this change.

## Environment / setup

- New env vars: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
  (added to `.env.local` by the user directly, not read or printed by
  Claude — matches existing practice for this file).
- Removed env vars: `AUTH_SECRET` (NextAuth's session-signing key), once the
  swap is complete and verified.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` stay in `.env.local` unused by
  the app directly — Google becomes a social connection configured in the
  Clerk dashboard instead, using the same or a new OAuth client at the
  user's discretion. Not automated here.
- The Clerk app id this project links to (`app_3JjDrNZ3ENDbIfdKxulAFPyiRLp`)
  was confirmed by the user as one they created themselves, ahead of this
  design. Every `clerk init`/CLI step must be re-confirmed against that id,
  not silently re-picked.

## Testing

- `web/src/lib/access.test.ts` currently tests `getAccess` against a
  Sheet-shaped fixture; those tests are replaced with tests asserting the
  stopgap's fixed-admin return shape for any user id.
- Existing route/component tests that stub `req.auth.user.email` or a
  `roleMap` move to stubbing a Clerk user id and the same `roleMap` shape —
  no behavioral assertions about role gating should need to change, since
  the shape is preserved.
- Manual verification: sign in via the tunnel and via localhost (per the
  existing dual-origin dev setup), confirm the sign-in/out UI is pixel-for-
  pixel the same as today (unstyled `SignInButton`/`SignOutButton` render
  nothing of their own), confirm a save still shows a human-readable
  "last saved by" for the current session.

## Rollout

This lands on `cluster-notebook-integration`, which has no active users, so
no migration or dual-running period is needed. `next-auth` and its route are
removed in the same change that adds Clerk, not left running side by side.
