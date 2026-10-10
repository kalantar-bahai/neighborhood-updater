import { NextResponse } from 'next/server';
import { ClusterNotebookForbiddenError } from './clusterNotebook';

// Every route that calls into cluster-notebook (via clusterNotebook.ts's request())
// needs to catch its thrown errors and turn them into a clean JSON response --
// otherwise an uncaught exception reaches the client as an empty/unparseable body,
// which shows up as a raw "JSON.parse: unexpected end of data" crash instead of a
// real message (DetailView.tsx's save/delete handlers already expect `{ error }`
// on a non-ok response and render it cleanly; the gap was routes not producing it).
//
// cluster-notebook has started enforcing real per-user roles server-side (our own
// authorization is still the everyone-admin stub from issue #37, so a write we
// allow locally can still be rejected upstream). Confirmed live 2026-09-24: a
// permission denial carries `extensions.code === 'FORBIDDEN'` (request() in
// clusterNotebook.ts turns that into a ClusterNotebookForbiddenError) -- that
// maps to a real 403 with our own message, not cluster-notebook's raw text
// (their message is "Not authenticated." even for a genuine permission denial,
// which would be a confusing thing to show a user). Everything else cluster-
// notebook throws maps to a generic 502 with the raw upstream message, since we
// have no more specific contract for it.
export function clusterNotebookErrorResponse(e: unknown): NextResponse {
  if (e instanceof ClusterNotebookForbiddenError) {
    return NextResponse.json({ error: "You don't have permission to make this change." }, { status: 403 });
  }
  const message = e instanceof Error ? e.message : 'Unexpected error contacting cluster-notebook';
  console.error('cluster-notebook call failed:', message);
  return NextResponse.json({ error: message }, { status: 502 });
}
