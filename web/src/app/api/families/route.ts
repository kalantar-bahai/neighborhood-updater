import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusHouseholds, getNucleusPeople } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { familyEntries } from '@/lib/households';

// The Families card's list: one entry per household, plus one per visible person with no household.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const [households, people] = await Promise.all([getNucleusHouseholds(name), getNucleusPeople(name)]);
    if (!households || !people) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json({ families: familyEntries(households, people) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
