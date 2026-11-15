This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Local dev with cluster-notebook

All of the app's data (nuclei, locations, activities, people, roles and permissions) comes from `cluster-notebook`, a separate service. Run it alongside this app:

`cluster-notebook` must be checked out as a sibling of this repository (i.e. `neighborhood/` and `cluster-notebook/` share a parent directory). From inside your `cluster-notebook` checkout, run:

```bash
.venv/bin/uvicorn cluster_notebook.app:app --reload
```

It listens on `http://localhost:8000` by default, which is also the app's default `CLUSTER_NOTEBOOK_URL`. If `.env.local` sets `CLUSTER_NOTEBOOK_URL` to a different port, start uvicorn with a matching `--port` (e.g. `--port 8123`). A mismatch shows up as "fetch failed" in the app and `ECONNREFUSED` in the dev-server log. Requires a local Postgres instance per `cluster-notebook`'s own README/`.env`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
