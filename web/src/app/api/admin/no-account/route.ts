import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getRoleHoldersWithoutAccess } from '@/lib/clusterNotebook';

// People holding a role in one cluster who have no enabled account (Admin page, No account yet card).
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    return NextResponse.json({ people: await getRoleHoldersWithoutAccess(cluster) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
