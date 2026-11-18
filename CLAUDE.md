# CLAUDE.md

Guidance for Claude Code sessions in this repo. **This repo is PUBLIC** (github.com/kalantar-bahai/neighborhood-updater)
and the app handles personal contact data, so read "Never commit" below before you write anything.

## What this is

**Nucleus Assistant** is a small web app for Bahá'í community-building teams. Neighborhood ("nucleus") contacts,
accompaniers and cluster/area roles use it to view and update data about each nucleus: stage, location, population
and the Overview estimates, activity counts (children's classes, junior youth groups, study circles, devotional
gatherings), and who is promoting, helping, accompanying, and so on. Most users are non-technical and often on a phone.
The owner tests in the browser and gives direct, iterative UI feedback. Expect small "rename this label / move this
field / tweak this diagram" requests.

Terminology: *nucleus* is a focus neighborhood. *Cluster > Locality > Setting* are the locations. A nucleus can also
have a *parent nucleus* ("pocket"). *SRP* is the Statistical Report Program, the national system of record.

## Layout

| Path | What |
|---|---|
| `web/` | **The app.** Next.js 16 App Router + React 19 + Clerk + Tailwind 4, tested with Vitest. Hosted on Vercel. |
| `web/src/lib/clusterNotebook.ts` | GraphQL client for **cluster-notebook**, the backend. It holds every data read/write and the permission queries. |
| `web/src/lib/data.ts` | Maps between the UI's row/form shape and cluster-notebook (`getRowData`, `saveRowData`, `createRowData`, `deleteRowData`). |
| `web/src/lib/access.ts`, `config.ts` | Per-entity permissions (`getNucleusPermissions`); `INFORMAL_WORKER_TYPES`. |
| `web/src/app/api/*/route.ts` | `initial-data`, `nucleus`, `workers`, `individuals`, `roles`. Every route checks Clerk auth and then permissions. |
| `web/src/components/` | `AppClient` (shell), `Picker` ("My Nuclei" hierarchy + rollup cards), `DetailView` (the big per-nucleus page, ~1400 lines), `ManageAccessCard`, `WorkerListModal`, `CreateNucleusModal`, `StaggeredConcentricDiagram`. |
| `web/src/proxy.ts` | Clerk middleware. Next 16 uses `proxy.ts`, not `middleware.ts`. |
| `web/src/app/privacy`, `terms` | Pages required for Google OAuth verification. The sign-in page links to both. |
| `srp-cache/` | **Legacy** Python + Playwright scrapers for onlinesrp.org that write to Google Sheets. The web app no longer reads them. |
| `docs/` | `cluster-notebook-api-requirements.md` is the living contract with the backend. `docs/superpowers/{specs,plans}/` hold design specs and implementation plans. |

**Retired, do not revive:** the original Google Apps Script app (`*.gs`, `Index.html`, `appsscript.json`, removed in
`d0ffcdb`), NextAuth, and every Google Sheets dependency in `web/` (master sheet, `Access` tab, SRP-cache tabs, `googleapis`).
**Never run `clasp`**: the old Apps Script project still exists, and a push would overwrite it.

## Architecture in one paragraph

The browser talks to Next.js API routes. Those routes call cluster-notebook (`CLUSTER_NOTEBOOK_URL`, a GraphQL POST)
and forward the user's **Clerk session token** as `Authorization: Bearer`. cluster-notebook is the source of truth for
nuclei, locations, activity summaries, Individuals and role assignments (`RoleInNE`), and permissions. It syncs with SRP
on its own side. This app keeps no database of its own. The nucleus **name** from cluster-notebook is the canonical key.

## Auth and permissions

- Identity comes from Clerk, using Clerk's hosted `<SignIn />` at `/sign-in/[[...sign-in]]` with Google sign-in only. Authorization keys on the Clerk user id. **Never authorize by email**, because email is mutable. `getCurrentUserEmail()` is for display only.
- Authorization comes from cluster-notebook as a per-entity `PermissionSet`: `canRead`, `canWrite`, `canChangeIdentity`, `canDelete`, `canAssignRoles`, `assignableRoles`, `createableEntityTypes`.
  - `canChangeIdentity` gates identity fields such as type, location and parent nucleus.
  - Delete uses `canDelete` on the nucleus itself.
  - Create checks `createableEntityTypes.includes('nucleus')` on the target **cluster**.
- The old `read` / `read-write` / `collaborator` / `admin` role enum is gone. Don't reintroduce it.
- Role lists work like this:
  - `protagonist` and `promoter` are informal and can be assigned whenever `canAssignRoles` is true.
  - **Every other role string** must appear in `assignableRoles`. Fail closed (see `config.ts` and `/api/workers`).
  - `accompanier` has real permission implications.
  - `ManageAccessCard` excludes `accompanier`, `contact` and `abm-assistant` on purpose, because they are managed on the Overview card. Don't add them back.
- cluster-notebook enforces permissions on its side too. A denial comes back as `extensions.code === 'FORBIDDEN'`. Branch on that code, not on the message, which says "Not authenticated." even for permission denials. `clusterNotebookErrorResponse()` maps it to a 403 and anything else to a 502. **Every route that calls cluster-notebook must catch errors through it.** Otherwise the client crashes with "JSON.parse: unexpected end of data".

## Run and test (web)

```bash
cd web
npm ci                         # node_modules may be absent on a fresh checkout
npm run dev                    # http://localhost:3000
npm test                       # vitest run (lib/*.test.ts); CI also runs the next line
npx tsc --noEmit
npm run lint                   # or: npx eslint <changed files>
```

- **Read the guide in `node_modules/next/dist/docs/` before writing Next.js code.** See `web/AGENTS.md`: this Next version differs from your training data.
- Env goes in `web/.env.local`, which is gitignored. **Never read or edit it.** If a change needs new env, ask the owner to add it. Keys include `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `CLUSTER_NOTEBOOK_URL` (default `http://localhost:8000`).
- For local cluster-notebook, check it out as a sibling repo (`../cluster-notebook`). Run `.venv/bin/uvicorn cluster_notebook.app:app --reload` there. It needs its own Postgres. See `web/README.md`.
- There is no component-test infrastructure. Put testable logic in `lib/` with tests, and verify UI changes in the browser (or ask the owner to).
- Check real exit codes. Don't pipe `tsc` or `vitest` through `grep` and then read the pipe's status.
- **Phone testing via cloudflared quick tunnel:** run `cloudflared tunnel --url http://localhost:3000`. Next blocks cross-origin dev resources such as HMR, which leaves the page stuck on "Loading...". Fix it by temporarily adding `allowedDevOrigins: ['*.trycloudflare.com']` to `web/next.config.ts`. **Don't commit that line.** The owner discards it afterward, and the committed file holds only `devIndicators: false`. CSP errors about inline scripts in Firefox came from a browser extension, not from the app.

## srp-cache (legacy)

`cd srp-cache && source .venv/bin/activate && pytest -q` runs the `locality_summary` tests. The scrapers
(`scrape.py`, `locality_summary.py`, `auth.py`) open a **visible** Chromium because the SRP SPA won't render headless.
They log in with TOTP from `srp-cache/.env` and write through a service account key in the home directory.
**Don't run them unless asked.** They hit a real external system with real credentials. SRP data now reaches the app through cluster-notebook.

## Deploy and release

- Vercel's GitHub integration auto-deploys `main` to production and builds preview deploys for branches and PRs. Merging to `main` therefore *is* the deploy. **Never push, merge or tag without explicit approval.**
- Workflow: work on a feature branch, open a PR to `main` (CI runs vitest and tsc on Node 24), merge, then tag with `git tag vX.Y.Z` and run `gh release create`. Tags so far: v1.0.0, v1.1.0, v2.0.0 (the cluster-notebook migration).
- The owner sets production env vars in Vercel. Production Clerk uses live keys and Google-only sign-in.
- **Production URL is https://nucleus.kalantar.us.** The live Clerk instance only works on `*.kalantar.us`.
  On `neighborhood-updater.vercel.app` (or any `*.vercel.app` preview) with live keys, the page is blank: cookies
  are rejected for an invalid domain and `/__clerk/v1/environment` returns 400. Preview deploys need Clerk dev keys.
- Coordinate releases that change the API with the cluster-notebook team, for example DB moves or Clerk issuer changes.

## Conventions the owner insists on

- **Ask cluster-notebook; never read its code.** Treat cluster-notebook and any other peer service, such as srp-client, purely as a public API. Don't read, grep or modify their source or schema, even though a checkout sits next to this repo. When you need a field mapping, behavior or new feature, **ask** the cluster-notebook Claude session through SendMessage if available, otherwise ask the owner. We are their customer, so requesting changes is encouraged. Record each confirmed answer in `docs/cluster-notebook-api-requirements.md` and in a dated code comment ("Confirmed with cluster-notebook YYYY-MM-DD: ...").
- **Null means "not recorded."** Never coerce it to 0, including in rollups. Respect cluster-notebook's omitted-vs-null distinction in patches. Send only the fields the user actually edited, because per-field autosave must not clobber sibling fields.
- The Overview estimates are edited directly and stay independent of the name lists. SRP stores numbers, not names, so a count derived from names could never round-trip. UI label "Promoting" maps to API field `protagonists`. Our `protagonist` role is shown as "Helping Others".
- DetailView autosaves each field on blur. Every card can be collapsed. Help text is shown with `InfoTip`, given as an inline `info="..."` prop. The owner supplies the exact definitions, so keep their wording. Centralizing help text is open as issue #9.
- Use `createPortal` for popovers and dropdowns inside `.card`, because cards have `overflow: hidden`. ESLint enforces `react-hooks/set-state-in-effect`, so compute state in the event or callback instead of in a `useEffect`.
- Remove dead code and dead tests when a dependency goes away. Don't leave compatibility shims.
- Commits use conventional prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `perf:`, `style:`, `copy:`/`content:`). Write a body that explains *why*. End with the `Claude-Session:` and `Co-authored-by: Claude` trailers. **Commit only when asked.**
- For non-trivial features, follow the superpowers flow: brainstorm, write a spec in `docs/superpowers/specs/`, write a plan in `docs/superpowers/plans/`, then use subagent-driven development. The SDD ledgers live in the gitignored `.superpowers/`. For a decision with real trade-offs, give a concrete example. Don't present an abstract option list.
- `pre-commit` runs **gitleaks**. Set it up with `pre-commit install`. Never bypass it with `--no-verify`.

## Never commit or paste (public repo)

Never commit or paste secrets, Clerk keys, service-account JSON, OAuth client secrets, spreadsheet or script IDs, or
names, emails and phone numbers of real people, including in test fixtures, docs and commit messages. Use made-up names
in tests. Don't open `web/.env.local`, `srp-cache/.env`, `srp-cache/session.json`, or the credential files in the
gitignored `tmp/`.

## Open threads

- #9: centralize the field help text.
- The Picker's nucleus hierarchy may be simplified soon, so check with the owner before investing in it.
- SRP: each SRP neighbourhood has one **home nucleus** (`inSrp`); renames apply at once and SRP follows (cluster-notebook #39). There is one SRP, the real one: locally, only ever run cluster-notebook's worker with `--serve --fake-srp`. Moving people and activities on delete is parked (needs srp-client writes).
- `docs/cluster-notebook-api-requirements.md` §3 still describes `parentNucleus` as read-only. In fact it is writable, gated by `canChangeIdentity`.
