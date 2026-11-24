import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getHiddenPeople, unhideIndividual } from '@/lib/clusterNotebook';

// Hidden people in one cluster (Admin page, Hidden card), and unhiding one of them.
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    return NextResponse.json({ hidden: await getHiddenPeople(cluster) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

// The cluster is in the body so the admin check is per cluster; cluster-notebook checks the nucleus itself.
export async function POST(req: NextRequest) {
  const { cluster, individualId, nucleusName } = await req.json().catch(() => ({}));
  try {
    const admin = await requireAdmin(cluster ? String(cluster) : '');
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !individualId || !nucleusName) {
      return NextResponse.json({ error: 'Missing cluster, person or nucleus' }, { status: 400 });
    }
    const person = await unhideIndividual(String(individualId), String(nucleusName));
    if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
