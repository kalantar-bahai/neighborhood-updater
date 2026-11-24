import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { searchPeople } from '@/lib/clusterNotebook';

// Find people in one cluster by name (Admin page, Roles card).
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!q) return NextResponse.json({ error: 'Missing search text' }, { status: 400 });
    return NextResponse.json({ people: await searchPeople(cluster, q) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
