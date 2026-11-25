import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getPeopleNotInSrp } from '@/lib/clusterNotebook';

// People placed in one cluster who have no SRP link (Admin page, People not in SRP card).
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    return NextResponse.json({ people: await getPeopleNotInSrp(cluster) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
