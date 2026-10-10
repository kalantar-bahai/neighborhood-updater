# Clerk Authentication Swap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth+Google with Clerk as Nucleus Assistant's identity provider, forward the Clerk session token to cluster-notebook on every GraphQL call, and stub authorization to everyone-admin while preserving the exact shape every route/component already consumes.

**Architecture:** Clerk is added additively first (SDK, proxy, provider) without touching NextAuth, so the app keeps compiling and running throughout. Each of the app's 7 NextAuth call sites (2 pages, 5 API routes) is then migrated to Clerk one at a time, each its own committable, independently verifiable task. NextAuth is only removed once nothing references it. Two small new library functions (`getCurrentUserEmail`, the stubbed `getAccess`) and one modified one (`clusterNotebook.ts`'s `request()`) carry the rest of the behavior change.

**Tech Stack:** Next.js 16 (this fork uses `proxy.ts`, not `middleware.ts` — see Global Constraints), `@clerk/nextjs`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-23-clerk-auth-design.md`

## Global Constraints

- This Next.js version (16.2.9) has renamed the `middleware.ts` file convention to `proxy.ts` (confirmed in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` and in Clerk's own quickstart, which explicitly says "proxy.ts for Next.js 16+"). Every step below uses `proxy.ts`. If any tool or generated code produces `middleware.ts` instead, that is wrong for this project and must be corrected.
- The Clerk app this project links to is `app_3JjDrNZ3ENDbIfdKxulAFPyiRLp` — confirmed by the user as their own, created ahead of this design. Never let `clerk init` (or any other step) link to a different app.
- `<ClerkProvider>` goes inside `<body>`, never wrapping `<html>`.
- Never expose `CLERK_SECRET_KEY` in client code — it's only read in `@clerk/nextjs/server` code (route handlers, server components), never imported into a `'use client'` file.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are added to `web/.env.local` by the user directly. No task in this plan reads or prints that file's contents.
- Existing custom sign-in/sign-out UI (markup, copy, CSS classes `signin-page`/`signin-card`/`signin-btn` in `web/src/app/globals.css`) is preserved exactly. Clerk's `<SignInButton>`/`<SignOutButton>` are used in their unstyled, child-wrapping form — they render nothing of their own.
- `getAccess()`'s `roleMap` shape (`Record<string, Role>`, keyed by nucleus name, `'*'` meaning all nuclei) does not change. Only its source and its parameter (`userId` instead of `email`) change.

---

## Before you start

Tell the user (don't do this yourself — it's their account/credentials):

1. Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` to `web/.env.local`, from the Clerk dashboard for app `app_3JjDrNZ3ENDbIfdKxulAFPyiRLp`.
2. In that Clerk app's dashboard, configure Google as the (only) social connection, and disable email/password and any other sign-in method, so `<SignInButton>`'s flow looks like "Sign in with Google" to users, matching today's behavior. This is an account-level setting — it must be done in the Clerk dashboard, not via code in this repo.

Task 1 depends on step 1 above (the dev server won't start without the keys). Manual verification in later tasks depends on step 2.

---

### Task 1: Scaffold Clerk (additive — NextAuth untouched)

**Files:**
- Create: `web/src/proxy.ts`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/package.json` (adds `@clerk/nextjs`; `next-auth` stays for now)

**Interfaces:**
- Produces: a mounted `<ClerkProvider>` and working `auth()`/`currentUser()` context for every later task to call into. Nothing here is consumed by NextAuth code, so NextAuth keeps working unmodified.

- [ ] **Step 1: Install the Clerk CLI and sign in**

```bash
cd web
command -v clerk && clerk --version || npm install -g clerk
clerk update --yes 2>/dev/null || true
clerk auth login
```

Wait for the user to complete the browser sign-in flow before continuing.

- [ ] **Step 2: Scaffold with the CLI, linked to the confirmed app id**

```bash
clerk init --app app_3JjDrNZ3ENDbIfdKxulAFPyiRLp
```

- [ ] **Step 3: Reconcile what the CLI produced against this project's conventions**

Run `git status --short` and `git diff --stat` in `web/` and check every changed/created file against these expectations:

- **`@clerk/nextjs` added to `web/package.json` dependencies.** Expected — keep.
- **A middleware/proxy file was created.** If it's `web/src/middleware.ts` (or `web/middleware.ts`), rename it to `web/src/proxy.ts` — this fork uses `proxy.ts` (Global Constraints). Its content should already be Next's proxy-compatible default export:

```ts
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest))(?:.*/)?..*)',
    '/(api|trpc)(.*)',
  ],
};
```

  If the file doesn't exist at all, create `web/src/proxy.ts` with exactly the content above.
- **`web/src/app/layout.tsx` may have been modified to add `<ClerkProvider>`.** If it wraps `<html>`, that's wrong (Global Constraints) — fix it so it's inside `<body>` only, keeping the existing `suppressHydrationWarning` comment and attribute:

```tsx
import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nucleus Assistant',
  description: 'View and update nucleus data',
  openGraph: {
    title: 'Nucleus Assistant',
    description: 'View and update nucleus data',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: some browsers (e.g. Chrome on iOS adds __gcrremoteframetoken)
    // inject attributes onto <html> before React hydrates. It only silences attribute
    // mismatches on this one element, not on its children.
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}
```

- **Any generated `/sign-in` or `/sign-up` route/page files (e.g. `web/src/app/sign-in/[[...sign-in]]/page.tsx`).** Delete these. This project keeps its own sign-in card at `/` (Task 5) and has no separate sign-up flow — Global Constraints preserves the existing custom UI, not Clerk's hosted pages.
- **Anything touching `web/src/auth.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/src/app/page.tsx`, `web/src/app/signout/page.tsx`, or any of the 5 files under `web/src/app/api/*/route.ts`.** Revert any changes there with `git checkout -- <path>` — those are migrated deliberately, one at a time, in Tasks 5–11 below, not by the scaffold.
- **`.env.local` changes.** The CLI may have appended Clerk key placeholders. Leave as-is (don't inspect or print the file's contents) — the user was already asked to fill in real values in "Before you start".

- [ ] **Step 4: Verify the app still compiles and boots**

```bash
npx tsc --noEmit
npm run dev
```

Expected: `tsc` passes with no errors. The dev server starts; visiting `http://localhost:3000/` still shows today's NextAuth-driven sign-in card (untouched — Clerk is mounted but nothing calls it yet). Stop the dev server (Ctrl-C) once confirmed.

- [ ] **Step 5: Commit**

```bash
git add web/src/proxy.ts web/src/app/layout.tsx web/package.json web/package-lock.json
git commit -m "chore: scaffold Clerk (additive, NextAuth still active)"
```

---

### Task 2: `getCurrentUserEmail()` helper

**Files:**
- Create: `web/src/lib/clerkUser.ts`
- Test: `web/src/lib/clerkUser.test.ts`

**Interfaces:**
- Consumes: `currentUser()` from `@clerk/nextjs/server` — resolves to a Backend `User` object with `id: string`, `emailAddresses: { id: string; emailAddress: string }[]`, `primaryEmailAddressId: string | null`, and an accessor `primaryEmailAddress: { emailAddress: string } | null` (confirmed against Clerk's Backend User type reference).
- Produces: `getCurrentUserEmail(): Promise<string>` — the signed-in user's primary email, or `''` if there is no signed-in user or no primary email set. Consumed by Task 7 (`initial-data/route.ts`) and Task 8 (`nucleus/route.ts`).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/clerkUser.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({
  currentUser: vi.fn(),
}));

import { getCurrentUserEmail } from './clerkUser';
import { currentUser } from '@clerk/nextjs/server';

const mockCurrentUser = vi.mocked(currentUser);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getCurrentUserEmail', () => {
  test('returns the primary email address when set', async () => {
    mockCurrentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: 'alice@x.com' },
    } as never);
    expect(await getCurrentUserEmail()).toBe('alice@x.com');
  });

  test('returns empty string when there is no signed-in user', async () => {
    mockCurrentUser.mockResolvedValue(null);
    expect(await getCurrentUserEmail()).toBe('');
  });

  test('returns empty string when the user has no primary email', async () => {
    mockCurrentUser.mockResolvedValue({ primaryEmailAddress: null } as never);
    expect(await getCurrentUserEmail()).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- clerkUser`
Expected: FAIL — `Cannot find module './clerkUser'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

```ts
// web/src/lib/clerkUser.ts
import { currentUser } from '@clerk/nextjs/server';

// Human-readable identity for display/audit purposes only (e.g. the "last saved
// by" line) -- never used as the authorization key. Authorization keys on the
// Clerk user id instead (see access.ts), because email is mutable.
export async function getCurrentUserEmail(): Promise<string> {
  const user = await currentUser();
  return user?.primaryEmailAddress?.emailAddress ?? '';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- clerkUser`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/clerkUser.ts web/src/lib/clerkUser.test.ts
git commit -m "feat: add getCurrentUserEmail helper for Clerk"
```

---

### Task 3: Stub `getAccess()` to everyone-admin

**Files:**
- Modify: `web/src/lib/access.ts` (entire file — it shrinks a lot)
- Modify: `web/src/lib/access.test.ts` (entire file — replaces the Sheet-fixture tests)

**Interfaces:**
- Produces: `getAccess(userId: string): Promise<UserAccess | { role: 'none' }>`, same shape as today (`UserAccess = { role: Role; entries: AccessEntry[]; roleMap: Record<string, Role> }`), but always resolving to `{ role: 'admin', entries: [], roleMap: { '*': 'admin' } }` for this stopgap. Consumed by all 5 API routes (Tasks 7–11).
- This is the seam [neighborhood-updater#37](https://github.com/kalantar-bahai/neighborhood-updater/issues/37) replaces later — don't inline this stub into callers.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `web/src/lib/access.test.ts`:

```ts
import { describe, test, expect } from 'vitest';
import { getAccess } from './access';

describe('getAccess (everyone-admin stopgap)', () => {
  test('any user id resolves to global admin', async () => {
    const result = await getAccess('user_abc123');
    expect(result.role).toBe('admin');
    if (result.role === 'none') return;
    expect(result.roleMap).toEqual({ '*': 'admin' });
  });

  test('resolves the same way regardless of which user id is passed', async () => {
    const a = await getAccess('user_one');
    const b = await getAccess('user_two');
    if (a.role === 'none' || b.role === 'none') throw new Error('unexpected none');
    expect(a.roleMap).toEqual(b.roleMap);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- access.test`
Expected: FAIL — `getAccess('user_abc123')` still reads the Sheet via `getAccessEntries` (which is unmocked in this rewritten file, so it will throw or hang on a real network/service-account call).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `web/src/lib/access.ts`:

```ts
import type { Role, AccessEntry } from '@/types';

export interface UserAccess {
  role: Role;
  entries: AccessEntry[];
  roleMap: Record<string, Role>;
}

// STOPGAP (2026-09-23): every authenticated user is admin, everywhere. The Sheet-
// backed per-nucleus roleMap this used to compute (see git history) is retired --
// real authorization is meant to come from cluster-notebook as per-entity role
// assignments (Nucleus/Cluster/Locality/Setting), not built yet. This function is
// the seam that swap lands in: callers (the 5 API routes) keep reading `roleMap`
// exactly as before, so only this function's body needs to change later, not its
// callers. Do not inline this stub into callers or "simplify" it away.
// Tracked: https://github.com/kalantar-bahai/neighborhood-updater/issues/37
export async function getAccess(userId: string): Promise<UserAccess | { role: 'none' }> {
  void userId;
  return { role: 'admin', entries: [], roleMap: { '*': 'admin' } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- access.test`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/access.ts web/src/lib/access.test.ts
git commit -m "feat: stub getAccess to everyone-admin (issue #37 tracks the real version)"
```

---

### Task 4: Forward the Clerk session token to cluster-notebook

**Files:**
- Modify: `web/src/lib/clusterNotebook.ts:29-45` (the `request()` helper)
- Modify: `web/src/lib/clusterNotebook.test.ts:1-13` (add a Clerk mock) and append one new test

**Interfaces:**
- Consumes: `auth()` from `@clerk/nextjs/server`, specifically `{ getToken }` — `getToken(): Promise<string | null>`.
- Produces: no change to `request()`'s own signature or any of the 15+ exported functions that call it — this is purely an added header. Every existing test in this file must still pass after this change.

- [ ] **Step 1: Write the failing test**

Add this mock at the very top of `web/src/lib/clusterNotebook.test.ts`, before the existing imports (it must exist before any other test runs, since every function in the file under test now calls `auth()`):

```ts
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ getToken: vi.fn(async () => 'test-token') })),
}));
```

Then append this new test at the end of the file (inside its own `describe`, after all existing ones):

```ts
describe('request (token forwarding)', () => {
  test('forwards the Clerk session token as a bearer Authorization header', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ data: { clusters: [] } }));
    await getClusters();
    const [, init] = mockFetch.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });
});
```

- [ ] **Step 2: Run the tests to verify the new one fails and nothing else breaks**

Run: `npm run test -- clusterNotebook.test`
Expected: every pre-existing test still PASSes (they only assert on `.body`, never on the full `init`/`headers`, confirmed by reading the file), and the new test FAILs — `Authorization` is `undefined` because `request()` doesn't send it yet.

- [ ] **Step 3: Write the implementation**

In `web/src/lib/clusterNotebook.ts`, add the import and update `request()`:

```ts
import { auth } from '@clerk/nextjs/server';
```

```ts
async function request<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(CLUSTER_NOTEBOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`cluster-notebook request failed: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as GraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(`cluster-notebook GraphQL error: ${json.errors.map(e => e.message).join('; ')}`);
  }
  if (json.data === undefined) {
    throw new Error('cluster-notebook response contained neither data nor errors');
  }
  return json.data as T;
}
```

(Only the `headers` object changed — everything else in the function is unchanged from today.)

- [ ] **Step 4: Run the tests to verify they all pass**

Run: `npm run test -- clusterNotebook.test`
Expected: PASS, including the new token-forwarding test. Run `npm run test` (full suite) too, since `data.test.ts` also exercises `clusterNotebook.ts` functions indirectly and needs the same Clerk mock to not break — if it fails on a missing `@clerk/nextjs/server` mock, add the same `vi.mock('@clerk/nextjs/server', ...)` block to the top of `web/src/lib/data.test.ts` as well.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/clusterNotebook.ts web/src/lib/clusterNotebook.test.ts web/src/lib/data.test.ts
git commit -m "feat: forward Clerk session token to cluster-notebook on every call"
```

---

### Task 5: Migrate the sign-in page

**Files:**
- Modify: `web/src/app/page.tsx` (entire file)

**Interfaces:**
- Consumes: `auth()` from `@clerk/nextjs/server` (`{ userId }`), `<SignInButton>` from `@clerk/nextjs`.
- No test file — this is a Server Component page; verified by `tsc` + manual check (Step 3).

- [ ] **Step 1: Replace the file**

```tsx
import { auth } from '@clerk/nextjs/server';
import { SignInButton } from '@clerk/nextjs';
import AppClient from '@/components/AppClient';

export default async function Home() {
  const { userId } = await auth();

  if (!userId) {
    return (
      <div className="signin-page">
        <div className="signin-card">
          <h1>Nucleus Assistant</h1>
          <p>Sign in with your Google account to view and update your neighborhood data.</p>
          <SignInButton>
            <button className="signin-btn">Sign in with Google</button>
          </SignInButton>
        </div>
      </div>
    );
  }

  return <AppClient />;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Run `npm run dev`, visit `http://localhost:3000/`. Confirm the sign-in card looks identical to before (same heading, copy, button styling). Click "Sign in with Google" and confirm it starts Clerk's Google flow (this depends on the Clerk dashboard Google-only configuration from "Before you start" — if other sign-in methods still show, that's a dashboard configuration issue, not a code issue). Stop the dev server once confirmed.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "feat: migrate sign-in page to Clerk"
```

---

### Task 6: Migrate the sign-out page

**Files:**
- Modify: `web/src/app/signout/page.tsx` (entire file)

**Interfaces:**
- Consumes: `<SignOutButton>` from `@clerk/nextjs`.
- No test file — verified by `tsc` + manual check.

- [ ] **Step 1: Replace the file**

```tsx
import { SignOutButton } from '@clerk/nextjs';

export default function SignOutPage() {
  return (
    <div className="signin-page">
      <div className="signin-card">
        <h1>Sign out?</h1>
        <p>You will need to sign in again to access your neighborhoods.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SignOutButton redirectUrl="/">
            <button type="button" className="signin-btn">Sign out</button>
          </SignOutButton>
          <a href="/" style={{ textAlign: 'center', fontSize: 14, color: '#718096', textDecoration: 'none', padding: '8px 0' }}>
            Cancel
          </a>
        </div>
      </div>
    </div>
  );
}
```

Note: the old version used a `<form action={...}>` server action because NextAuth's `signOut()` is a server-side call. `<SignOutButton>` is a Clerk client component that signs out from the browser directly — no form needed, so the `<form>` wrapper is removed and the button's `type` changes from `submit` to `button` since it's no longer inside a form.

`web/src/components/DetailView.tsx`'s header sign-out icon is untouched by this task: its `handleSignOut()` only navigates to `/signout` (`window.location.href = '/signout'`) — it never calls NextAuth directly, so it needs no change.

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

With `npm run dev` running and signed in, click the header's sign-out icon, then "Sign out" on the confirmation page. Confirm it signs out and lands back on the sign-in card at `/`.

- [ ] **Step 4: Commit**

```bash
git add web/src/app/signout/page.tsx
git commit -m "feat: migrate sign-out page to Clerk"
```

---

### Task 7: Migrate `/api/initial-data`

**Files:**
- Modify: `web/src/app/api/initial-data/route.ts` (entire file)

**Interfaces:**
- Consumes: `auth()` from `@clerk/nextjs/server`, `getCurrentUserEmail()` (Task 2), `getAccess(userId)` (Task 3).
- No test file exists for this route today — verified by `tsc` + manual check (Task 13 covers the full manual pass).

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { activitiesFromClusterNotebook } from '@/lib/data';
import { getAllNuclei, getClusters } from '@/lib/clusterNotebook';

function n(v: string) { return parseInt(v || '0', 10) || 0; }
function norm(s: string) { return (s || '').toLowerCase().trim(); }

// No arguments -- this route never reads anything from the request itself.
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = await getCurrentUserEmail();
  const access = await getAccess(userId);

  if (access.role === 'none') {
    return NextResponse.json(
      { error: `Access denied. Your account (${email}) is not authorized.` },
      { status: 403 }
    );
  }

  // TEMPORARY, branch-only: restrict the picker to nuclei that actually exist in
  // cluster-notebook, so every nucleus shown is fully testable end-to-end during
  // the incremental migration. No fallback if cluster-notebook is unreachable —
  // this call throws like any other data source failure here, per the branch's
  // no-silent-degradation design. Remove this filter once the migration no
  // longer needs it (either fully complete, or once partial-migration testing
  // isn't the priority).
  //
  // The list of valid nuclei is cluster-notebook's, not the Sheet's (2026-09-13,
  // the user directly) -- this loop is driven by clusterNotebookNuclei, and every
  // field returned below is cluster-notebook's own value. Authorization no longer
  // cross-references the Sheet either (2026-09-14) -- roleMap's own keys (a
  // wildcard '*', or the exact nucleus names an entry names) are the complete
  // authorization answer; see access.ts.
  const [clusterNotebookNuclei, clusters] = await Promise.all([getAllNuclei(), getClusters()]);
  const hasWildcard = '*' in access.roleMap;

  const authorizedRows = clusterNotebookNuclei
    .filter(cn => hasWildcard || norm(cn.name) in access.roleMap)
    .map(cn => {
      const acts = Object.values(activitiesFromClusterNotebook(cn));
      return {
        nucleus:       cn.name,
        parentNucleus: cn.parentNucleus?.name ?? '',
        grouping:      cn.cluster.groupOfClusters ?? '',
        cluster:       cn.cluster.name,
        locality:      cn.locality ?? '',
        nucleusType:   cn.nucleusType ?? '',
        stage:         cn.stage ?? '',
        totalAct:  acts.reduce((s, a) => s + n(a.act),  0),
        totalPart: acts.reduce((s, a) => s + n(a.part), 0),
        totalFof:  acts.reduce((s, a) => s + n(a.fof),  0),
      };
    });

  return NextResponse.json({
    access: { roleMap: access.roleMap },
    rows: authorizedRows,
    email,
    clusterNames: clusters.map(c => c.name),
  });
}
```

(Body logic is unchanged from today except the auth/access lines at the top — `email` now comes from `getCurrentUserEmail()` instead of the NextAuth session, and `getAccess` takes `userId` instead of `email`.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/initial-data/route.ts
git commit -m "feat: migrate /api/initial-data to Clerk"
```

---

### Task 8: Migrate `/api/nucleus`

**Files:**
- Modify: `web/src/app/api/nucleus/route.ts` (entire file)

**Interfaces:**
- Consumes: same as Task 7, plus `saveRowData`/`createRowData` (unchanged signatures — still take a human-readable email string, now sourced from `getCurrentUserEmail()`).

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { getRowData, saveRowData, createRowData, deleteRowData, CodedError } from '@/lib/data';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const data = await getRowData(name);
  if (!data) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, formData } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip admin-only fields unless caller is admin (defense-in-depth)
  if (role !== 'admin') {
    delete formData.identity;
    delete formData.locality;
    delete formData.stage;
    delete formData.auxBoard;
  }

  const email = await getCurrentUserEmail();
  const result = await saveRowData(name, formData, email);
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await getAccess(userId);
  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const deleted = await deleteRowData(name);
  if (!deleted) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await getAccess(userId);
  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const { formData } = await req.json();
  const email = await getCurrentUserEmail();

  try {
    const result = await createRowData(formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof CodedError && e.code === 'CONFLICT') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof CodedError && e.code === 'BAD_CLUSTER') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/nucleus/route.ts
git commit -m "feat: migrate /api/nucleus to Clerk"
```

---

### Task 9: Migrate `/api/workers`

**Files:**
- Modify: `web/src/app/api/workers/route.ts` (entire file)

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { getNucleusWorkers, updateNucleusWorkers, individualDisplayName } from '@/lib/clusterNotebook';
import type { Individual } from '@/lib/clusterNotebook';
import { WORKER_TYPES } from '@/lib/config';
import type { Worker } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if (!effectiveRole(access.roleMap, name)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const workers = await getNucleusWorkers(name, type);
  return NextResponse.json({ workers: toWorkers(workers) });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, personIds } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (!Array.isArray(personIds)) return NextResponse.json({ error: 'personIds must be an array' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if ((type === 'abm-assistant' || type === 'contact') && role !== 'admin') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const workers = await updateNucleusWorkers(nucleus, type, personIds);
  return NextResponse.json({ workers: toWorkers(workers) });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/workers/route.ts
git commit -m "feat: migrate /api/workers to Clerk"
```

---

### Task 10: Migrate `/api/individuals`

**Files:**
- Modify: `web/src/app/api/individuals/route.ts` (entire file)

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { searchIndividuals, createIndividual, individualDisplayName } from '@/lib/clusterNotebook';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

// Both routes require read-write minimum, matching /api/workers -- searching/creating
// individuals only ever happens as part of editing a worker list, never a pure read view.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  const search = req.nextUrl.searchParams.get('search') || undefined;
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const individuals = await searchIndividuals(nucleus, search);
  return NextResponse.json({
    individuals: individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind) })),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, name } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const individual = await createIndividual(String(name).trim(), nucleus);
  return NextResponse.json({ id: individual.id, name: individualDisplayName(individual) });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/individuals/route.ts
git commit -m "feat: migrate /api/individuals to Clerk"
```

---

### Task 11: Migrate `/api/access`

**Files:**
- Modify: `web/src/app/api/access/route.ts` (entire file)

- [ ] **Step 1: Replace the file**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { getAccessEntries, saveAccessEntries } from '@/lib/data';
import type { AccessEntry, Role } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const ROLES: Role[] = ['read', 'read-write', 'collaborator', 'admin'];

function canManage(role: Role | undefined): boolean {
  return role === 'admin' || role === 'collaborator';
}

function callerCanManage(roleMap: Record<string, Role>, nucleus: string): boolean {
  const key = norm(nucleus);
  return canManage(roleMap[key]) || canManage(roleMap['*']);
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const adminNuclei = new Set(
    Object.entries(access.roleMap)
      .filter(([, role]) => canManage(role))
      .map(([nucleus]) => nucleus)
  );
  if (adminNuclei.size === 0) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allEntries = await getAccessEntries();

  const hasGlobalAdmin = adminNuclei.has('*');
  const visible = hasGlobalAdmin
    ? allEntries
    : allEntries.filter(e => adminNuclei.has(norm(e.nucleus)));

  const url = new URL(req.url);
  const nucleusFilter = url.searchParams.get('nucleus');
  const result = nucleusFilter
    ? visible.filter(e => norm(e.nucleus) === norm(nucleusFilter))
    : visible;

  return NextResponse.json({ entries: result });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Partial<AccessEntry>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { name, email, role, nucleus } = body;
  if (!name || !email || !role || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: name, email, role, nucleus' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  const callerAccess = await getAccess(userId);
  if (callerAccess.role === 'none' || !callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  await saveAccessEntries([...existing, { name, email, role, nucleus }]);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { email: string; nucleus: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { email, nucleus } = body;
  if (!email || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: email, nucleus' }, { status: 400 });
  }

  const callerAccess = await getAccess(userId);
  if (callerAccess.role === 'none' || !callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  const updated = existing.filter(
    e => !(norm(e.email) === norm(email) && norm(e.nucleus) === norm(nucleus))
  );
  await saveAccessEntries(updated);
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/app/api/access/route.ts
git commit -m "feat: migrate /api/access to Clerk"
```

---

### Task 12: Remove NextAuth

**Files:**
- Delete: `web/src/auth.ts`
- Delete: `web/src/app/api/auth/[...nextauth]/route.ts` (and the now-empty `web/src/app/api/auth/[...nextauth]/` and `web/src/app/api/auth/` directories, if empty)
- Modify: `web/package.json` (remove `next-auth` dependency)

**Interfaces:**
- Nothing left in the codebase should reference `@/auth` or `next-auth` after this task.

- [ ] **Step 1: Confirm nothing still imports `@/auth`**

Run: `grep -rln "@/auth" web/src`
Expected: no output. (If anything shows up, a Task 5–11 migration was missed — go fix that file first, don't delete `auth.ts` out from under it.)

- [ ] **Step 2: Delete the files**

```bash
rm web/src/auth.ts
rm web/src/app/api/auth/\[...nextauth\]/route.ts
rmdir web/src/app/api/auth/\[...nextauth\] web/src/app/api/auth 2>/dev/null || true
```

- [ ] **Step 3: Remove the dependency**

```bash
cd web
npm uninstall next-auth
```

- [ ] **Step 4: Verify nothing references `next-auth` anymore**

```bash
grep -rln "next-auth" web/src
grep -n '"next-auth"' web/package.json
```

Expected: no output from either command.

- [ ] **Step 5: Verify the app still compiles and tests pass**

```bash
npx tsc --noEmit
npm run test
npm run lint
```

Expected: all three pass clean.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove NextAuth now that Clerk fully replaces it"
```

---

### Task 13: Full verification pass

**Files:** none — verification only.

- [ ] **Step 1: Automated checks**

```bash
cd web
npx tsc --noEmit
npm run lint
npm run test
```

Expected: all clean.

- [ ] **Step 2: Manual sign-in/sign-out check**

Sign in fresh (private window or after signing out). Confirm:
- The sign-in card at `/` looks pixel-for-pixel identical to before this plan.
- Only Google appears as a sign-in option (from the Clerk dashboard configuration in "Before you start" — flag to the user if other methods appear, since that's a dashboard setting, not something this plan's code controls).
- After signing in, the app loads nuclei as before.
- The header's sign-out icon → `/signout` confirmation page → "Sign out" button works and returns to the sign-in card.

- [ ] **Step 3: Manual dual-origin check**

Repeat the sign-in check both on `http://localhost:3000` and through the existing cloudflared tunnel setup (see prior session's `AUTH_URL`-based tunnel workflow — Clerk's own dashboard has an equivalent "satellite domain" concept if the tunnel's hostname needs to be trusted, but try it unmodified first since Clerk's redirect handling differs from NextAuth's).

- [ ] **Step 4: Manual audit-trail check**

Edit and save a field on any nucleus's detail page. Confirm "Last saved by ... on ..." shows your Clerk account's email (not a Clerk user id, not blank) — matching today's ephemeral, session-only behavior (not persisted across reload — that's issue #38, not this plan).

- [ ] **Step 5: Report to the user**

Summarize: what was migrated, that authorization is now the everyone-admin stopgap (issue #37), that the audit trail is still ephemeral (issue #38), and remind them to double check the Clerk dashboard's Google-only sign-in configuration if Step 2 showed extra sign-in methods. Also remind them that `AUTH_SECRET` in `web/.env.local` (NextAuth's session-signing key) is no longer used and can be removed whenever they're ready — not done automatically, since this plan never edits `.env.local`. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` can stay or go depending on whether they reused that same OAuth client as Clerk's Google social connection.
