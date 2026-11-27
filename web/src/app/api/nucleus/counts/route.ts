import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusCounts } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// The nucleus's member count, the Overview's "(x)" counts and the activities card's group totals, re-read by the page after each change on it so
// those figures update at once. Much cheaper than GET /api/nucleus, which reads the whole page.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(name);
    if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const counts = await getNucleusCounts(name);
    if (!counts) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json(counts);
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
