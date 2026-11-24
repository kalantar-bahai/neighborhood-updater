import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { moveIndividuals } from '@/lib/clusterNotebook';
import { moveResultError } from '@/lib/people';

// Move one person (and, always, their household: owner 2026-11-19) to a locality or setting by id.
// The cluster must be one the caller administers; cluster-notebook decides whether this move is allowed.
export async function POST(req: NextRequest) {
  const { cluster, individualId, locationId } = await req.json().catch(() => ({}));
  try {
    const admin = await requireAdmin(cluster ? String(cluster) : '');
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !individualId || !locationId) {
      return NextResponse.json({ error: 'Missing cluster, person or place' }, { status: 400 });
    }
    const [result] = await moveIndividuals([String(individualId)], String(locationId), true);
    if (!result) return NextResponse.json({ error: 'No result from the move' }, { status: 502 });
    return NextResponse.json({ error: moveResultError(result) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
