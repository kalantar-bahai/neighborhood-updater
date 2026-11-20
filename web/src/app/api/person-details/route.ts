import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getPersonDetails } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// One person's details for the People card's expanded view. 404 also covers "not permitted": cluster-notebook
// returns null both for an unknown person or nucleus and for a caller who can't see the details, and the card
// shows nothing for either case.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  const individualId = req.nextUrl.searchParams.get('individualId');
  if (!nucleus || !individualId) return NextResponse.json({ error: 'Missing parameter' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const details = await getPersonDetails(individualId, nucleus);
    if (details === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ details });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
