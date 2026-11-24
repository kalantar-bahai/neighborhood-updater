import type { NextResponse } from 'next/server';
import { ClusterNotebookCodedError, getPersonDetails } from './clusterNotebook';
import { clusterNotebookErrorResponse } from './clusterNotebookError';
import { individualDisplayName } from './personName';

const FORBIDDEN = "You can't manage access for this person.";

// Confirmed with cluster-notebook 2026-11-24: removeAccess on yourself throws SELF_LOCKOUT. The global text is about
// ending your last admin role, which is wrong on the accounts route, so that route rewords it.
export const ACCOUNT_MESSAGES = { SELF_LOCKOUT: "You can't remove your own access." };

// Error mapping shared by the invitation and account routes: cluster-notebook's FORBIDDEN here means "not an
// Administrator and can't end all of this person's roles", and ALREADY_HAS_ACCESS needs the person's name.
// The name lookup is best-effort; without it the text falls back to "This person".
export async function accessErrorResponse(
  e: unknown, individualId?: string, messages?: Partial<Record<string, string>>,
): Promise<NextResponse> {
  let name: string | undefined;
  if (e instanceof ClusterNotebookCodedError && e.code === 'ALREADY_HAS_ACCESS') {
    try {
      const details = individualId ? await getPersonDetails(individualId, null) : null;
      name = details ? individualDisplayName(details.individual) : 'This person';
    } catch {
      name = 'This person';
    }
  }
  return clusterNotebookErrorResponse(e, { forbidden: FORBIDDEN, name, messages });
}
