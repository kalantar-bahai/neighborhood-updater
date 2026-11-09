# Nucleus Assistant

A small web app that Bahá'í community-building teams use to view and update data about each focus neighborhood ("nucleus"): stage, location, population estimates, activity counts, and the people promoting, helping and accompanying. Most users are on a phone.

## Architecture

| Component | Details |
|-----------|---------|
| App | Next.js (App Router) + React + Tailwind, in [`web/`](web/) |
| Hosting | Vercel. `main` deploys to production; branches and PRs get preview deploys |
| Sign-in | Clerk, Google sign-in only |
| Data and permissions | [cluster-notebook](https://github.com/kalantar-bahai/cluster-notebook), reached over GraphQL at `CLUSTER_NOTEBOOK_URL` |

The browser calls the app's API routes (`web/src/app/api/`). Each route checks the Clerk session, then calls cluster-notebook and forwards the user's Clerk token. cluster-notebook is the source of truth for nuclei, locations, activity counts, people, roles and permissions. It also syncs with SRP. The app has no database of its own.

## Access control

Who can see and change what is decided by cluster-notebook, per nucleus. It returns a permission set (read, write, change identity fields, delete, assign roles, and which roles can be assigned). Roles such as accompanier are assigned in the app on each nucleus's Overview and Manage Access cards.

## Local development

```bash
cd web
npm ci
npm run dev        # http://localhost:3000
npm test           # unit tests (vitest)
npx tsc --noEmit   # type check
npm run lint
```

Put settings in `web/.env.local` (not committed): the Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and `CLUSTER_NOTEBOOK_URL` (default `http://localhost:8000`).

To run cluster-notebook locally, check it out next to this repository and start it as described in [`web/README.md`](web/README.md).

## Deploying

Merge a pull request into `main`. CI runs the tests and type check, and Vercel deploys to production. Production settings are managed in the Vercel dashboard.

## `srp-cache/` (legacy)

Python scrapers from the earlier version of the app, which read data straight from SRP into Google Sheets. The app no longer uses them, because SRP data now comes through cluster-notebook. See [`srp-cache/README.md`](srp-cache/README.md).

## History

The first version was a Google Apps Script app backed by Google Sheets. It was replaced by this Next.js app (see [`docs/migration-vercel.md`](docs/migration-vercel.md)), and the Apps Script code was removed.
