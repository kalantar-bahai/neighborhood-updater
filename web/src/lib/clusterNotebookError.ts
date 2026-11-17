import { NextResponse } from 'next/server';
import { ClusterNotebookCodedError, ClusterNotebookForbiddenError } from './clusterNotebook';

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
// Coded errors (extensions.code other than FORBIDDEN): status + user-facing text.
// A null message means "use the upstream message" (SRP_IN_USE carries the counts).
const CODED_ERRORS: Record<string, { status: number; message: string | null }> = {
  NAME_TAKEN: { status: 409, message: 'That name is already used by another nucleus.' },
  SRP_NAME_CLASH: { status: 409, message: 'That name is already used in this locality (in SRP or here).' },
  SRP_ACTION_PENDING: { status: 409, message: 'An SRP change for this nucleus is still pending. Try again once it finishes.' },
  SRP_IN_USE: { status: 409, message: null },
  SRP_ALREADY_LINKED: { status: 409, message: 'This nucleus is already in SRP.' },
  SRP_NOT_AT_LOCALITY: { status: 400, message: 'Choose a locality for this nucleus before sending it to SRP.' },
  SRP_NOT_NEIGHBORHOOD: { status: 400, message: 'Only Neighborhood nuclei can be sent to SRP.' },
  SRP_NOT_DEFAULT: { status: 409, message: "This nucleus shares its Setting with another, so it can't be changed in SRP from here." },
};

export function clusterNotebookErrorResponse(e: unknown): NextResponse {
  if (e instanceof ClusterNotebookForbiddenError) {
    return NextResponse.json({ error: "You don't have permission to make this change." }, { status: 403 });
  }
  const message = e instanceof Error ? e.message : 'Unexpected error contacting cluster-notebook';
  // Log the cause too: Node's fetch reports every connection problem as a bare
  // "fetch failed", and only `cause` says which (ECONNREFUSED host:port, ENOTFOUND, ...).
  console.error('cluster-notebook call failed:', message, e instanceof Error && e.cause ? e.cause : '');
  if (e instanceof ClusterNotebookCodedError) {
    const mapped = CODED_ERRORS[e.code];
    return NextResponse.json(
      { error: mapped?.message ?? message, code: e.code },
      { status: mapped?.status ?? 502 },
    );
  }
  return NextResponse.json({ error: message }, { status: 502 });
}
