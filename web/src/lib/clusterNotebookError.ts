import { NextResponse } from 'next/server';

// Every route that calls into cluster-notebook (via clusterNotebook.ts's request())
// needs to catch its thrown errors and turn them into a clean JSON response --
// otherwise an uncaught exception reaches the client as an empty/unparseable body,
// which shows up as a raw "JSON.parse: unexpected end of data" crash instead of a
// real message (DetailView.tsx's save/delete handlers already expect `{ error }`
// on a non-ok response and render it cleanly; the gap was routes not producing it).
//
// STOPGAP (2026-09-24): cluster-notebook has started enforcing real per-user roles
// server-side (our own authorization is still the everyone-admin stub from
// issue #37, so a write we allow locally can still be rejected upstream). Until
// then every cluster-notebook failure maps to a generic 502 with the raw upstream
// message.
//
// Confirmed with cluster-notebook (2026-09-24): a permission denial comes back as
// HTTP 200 with the error in the GraphQL `errors` array -- no `extensions.code` to
// distinguish it from any other error YET. They're adding one (`extensions.code:
// "FORBIDDEN"`) plus a `myPermissions(entityName: String!)` query returning
// `{canRead, canWrite, canCreate, canDelete}` for pre-checking before attempting a
// write, rather than learning from a rejection -- and a second lookup for a
// *different* person's capability (e.g. rendering what a worker's role lets them
// do without them being logged in), shape still being finalized. Do NOT
// string-match on today's error text ("Not authenticated.", etc.) -- cluster-
// notebook explicitly said that text isn't the contract and may change;
// `extensions.code` will be the contract once it lands. Narrow this function to
// check `extensions.code === 'FORBIDDEN'` and return 403 with a real "you don't
// have write access" message once they confirm it's live -- not before.
export function clusterNotebookErrorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : 'Unexpected error contacting cluster-notebook';
  console.error('cluster-notebook call failed:', message);
  return NextResponse.json({ error: message }, { status: 502 });
}
