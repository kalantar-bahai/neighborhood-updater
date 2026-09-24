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
// issue #37, so a write we allow locally can still be rejected upstream). We don't
// yet know cluster-notebook's exact permission-denied response shape (HTTP status,
// GraphQL error code) to map it to a precise 403 -- consulted cluster-notebook
// 2026-09-24, answer pending. Until then every cluster-notebook failure maps to a
// generic 502 with the raw upstream message. Once cluster-notebook's answer is in,
// narrow this to detect their specific permission-denied shape and return 403 with
// a real "you don't have write access" message instead.
export function clusterNotebookErrorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : 'Unexpected error contacting cluster-notebook';
  console.error('cluster-notebook call failed:', message);
  return NextResponse.json({ error: message }, { status: 502 });
}
