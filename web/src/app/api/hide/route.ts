import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { hideIndividual, unhideIndividual } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { toPersonRow } from '@/lib/people';

// Hide or unhide one person at a nucleus (People card). Hidden people stay in cluster-notebook but
// drop out of the nucleus's counts and lists. Requires edit access to the nucleus; cluster-notebook
// answers NOT_AT_NUCLEUS (mapped to 409) when the person is not at this nucleus.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, individualId, hidden, reason } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!individualId || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'Missing person or hidden' }, { status: 400 });
  }

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    const person = hidden
      ? await hideIndividual(String(individualId), String(nucleus), trimmed || null)
      : await unhideIndividual(String(individualId), String(nucleus));
    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    return NextResponse.json({ person: toPersonRow(person) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
