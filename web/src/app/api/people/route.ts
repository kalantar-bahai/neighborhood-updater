import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusPeople } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { toPersonRow } from '@/lib/people';

// Everyone connected to a nucleus, for the People card. Readable by anyone who can read the
// nucleus (owner, 2026-11-18): names, roles and residency only.
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

    const people = await getNucleusPeople(nucleus);
    if (people === null) return NextResponse.json({ error: 'Nucleus not found' }, { status: 404 });
    return NextResponse.json({ people: people.map(toPersonRow) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
