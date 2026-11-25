import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getChangeLog } from '@/lib/clusterNotebook';

// One page of a cluster's change log, newest first (Admin page, Log card). before and beforeId come together.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const cluster = params.get('cluster') ?? '';
  const before = params.get('before');
  const beforeId = params.get('beforeId');
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    if (!before !== !beforeId) return NextResponse.json({ error: 'Missing log position' }, { status: 400 });
    const entries = await getChangeLog(cluster, before && beforeId ? { before, beforeId } : undefined);
    return NextResponse.json({ entries });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
