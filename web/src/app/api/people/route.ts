import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getMoveContext, getNucleusPeople } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { editableRoles, moveTargets, toPersonRow } from '@/lib/people';

// Everyone connected to a nucleus, for the People card. Readable by anyone who can read the
// nucleus (owner, 2026-11-18): names, roles, residency, place and move state only.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const [people, ctx] = await Promise.all([getNucleusPeople(nucleus), getMoveContext(nucleus)]);
    if (people === null || ctx === null) return NextResponse.json({ error: 'Nucleus not found' }, { status: 404 });
    const rows = people.map(toPersonRow);
    // move: where moving in and out go (phase 2). editableRoles: lets the card ask about someone's
    // roles here when they move away from this nucleus via another nucleus's "+ Add".
    return NextResponse.json({ people: rows, move: moveTargets(ctx), editableRoles: editableRoles(permissions, rows) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
