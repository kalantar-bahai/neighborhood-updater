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
// notebook throws maps to a generic 502 with the raw upstream message, unless it
// is a coded error (any other extensions.code): those go through the CODED_ERRORS
// table below for a status and user-facing text (a null message there means
// "show the raw upstream message").
// Coded errors (extensions.code other than FORBIDDEN): status + user-facing text.
// A null message means "use the upstream message".
const CODED_ERRORS: Record<string, { status: number; message: string | null }> = {
  NAME_TAKEN: { status: 409, message: 'That name is already used by another nucleus.' },
  SRP_NAME_CLASH: { status: 409, message: 'That name is already used in this locality (in SRP or here).' },
  SRP_ACTION_PENDING: { status: 409, message: 'An SRP change for this nucleus is still pending. Try again once it finishes.' },
  SRP_ALREADY_LINKED: { status: 409, message: 'This nucleus is already in SRP.' },
  SRP_NOT_AT_LOCALITY: { status: 400, message: 'Choose a locality for this nucleus before sending it to SRP.' },
  SRP_NOT_NEIGHBORHOOD: { status: 400, message: 'Only Neighborhood nuclei can be sent to SRP.' },
  // Confirmed with cluster-notebook 2026-11-16: SRP_IS_NEIGHBOURHOOD (OU spelling) -- moving a nucleus that is in SRP; their message says to delete instead.
  SRP_IS_NEIGHBOURHOOD: { status: 409, message: null },
  // Confirmed with cluster-notebook 2026-11-18 (#39): SRP_IN_USE is gone (a home delete is queued and SRP's
  // live count decides); SRP_NOT_DEFAULT now means "not the home nucleus"; SRP_FN_HAS_NO_HOME is new.
  SRP_NOT_DEFAULT: { status: 409, message: "This nucleus isn't the home nucleus of its SRP neighbourhood, so it can't be changed in SRP from here." },
  SRP_FN_HAS_NO_HOME: { status: 409, message: 'This neighbourhood in SRP has no home nucleus. Ask an admin.' },
  // Confirmed with cluster-notebook 2026-11-19 (moveIndividuals whole-call refusals).
  LOCATION_NOT_FOUND: { status: 400, message: "That place doesn't exist any more. Reload and try again." },
  NOT_A_PLACE: { status: 400, message: 'People can only be moved to a locality or a neighbourhood in SRP.' },
  // Confirmed with cluster-notebook 2026-11-23: hideIndividual/unhideIndividual refuse a person who isn't at the nucleus.
  NOT_AT_NUCLEUS: { status: 409, message: "This person isn't connected to this nucleus." },
  // Confirmed with cluster-notebook 2026-11-24: endRole refuses the caller's own last role giving admin standing over a cluster.
  SELF_LOCKOUT: { status: 409, message: "You can't end your own last admin role here." },
  // Confirmed with cluster-notebook 2026-11-24: grantRole refuses a role it doesn't know, or a missing entityId (only Administrator needs none).
  UNKNOWN_ROLE: { status: 400, message: "That role can't be given here." },
  ENTITY_REQUIRED: { status: 400, message: 'Choose where the role applies.' },
  // Confirmed with cluster-notebook 2026-11-24: NOT_FOUND for an unknown role id, person or place.
  NOT_FOUND: { status: 404, message: 'Not found.' },
  // Confirmed with cluster-notebook 2026-11-24: invitation errors. ALREADY_HAS_ACCESS's "{name}" is filled in by the route.
  EMAIL_IN_USE: { status: 409, message: 'This address belongs to someone else.' },
  ALREADY_HAS_ACCESS: { status: 409, message: '{name} already has access.' },
  INVITATION_PENDING: { status: 409, message: 'An invitation is already pending; resend it instead.' },
  NOT_PENDING: { status: 409, message: 'This invitation is no longer pending.' },
  BAD_INPUT: { status: 400, message: null },
  CLERK_ERROR: { status: 502, message: "The invitation email couldn't be sent. Try again." },
  CLERK_NOT_CONFIGURED: { status: 503, message: "Invitations aren't set up yet." },
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
      { error: mapped ? (mapped.message ?? e.upstreamMessage) : message, code: e.code },
      { status: mapped?.status ?? 502 },
    );
  }
  return NextResponse.json({ error: message }, { status: 502 });
}
