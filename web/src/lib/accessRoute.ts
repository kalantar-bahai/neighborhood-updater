import type { NextResponse } from 'next/server';
import { ClusterNotebookCodedError, getPersonDetails } from './clusterNotebook';
import { clusterNotebookErrorResponse } from './clusterNotebookError';
import { individualDisplayName } from './personName';

const FORBIDDEN = "You can't manage access for this person.";

// Error mapping shared by the invitation and account routes: cluster-notebook's FORBIDDEN here means "not an
// Administrator and can't end all of this person's roles", and ALREADY_HAS_ACCESS needs the person's name.
// The name lookup is best-effort; without it the text falls back to "This person".
export async function accessErrorResponse(e: unknown, individualId?: string): Promise<NextResponse> {
  let name: string | undefined;
  if (e instanceof ClusterNotebookCodedError && e.code === 'ALREADY_HAS_ACCESS') {
    try {
      const details = individualId ? await getPersonDetails(individualId, null) : null;
      name = details ? individualDisplayName(details.individual) : 'This person';
    } catch {
      name = 'This person';
    }
  }
  return clusterNotebookErrorResponse(e, { forbidden: FORBIDDEN, name });
}
