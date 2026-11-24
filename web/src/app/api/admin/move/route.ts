import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getHiddenPeople, moveIndividuals, unhideIndividual } from '@/lib/clusterNotebook';
import { hidesToLift } from '@/lib/admin';
import { moveResultError } from '@/lib/people';

// Move one person (and, always, their household: owner 2026-11-19) to a locality or setting by id.
// The cluster must be one the caller administers; cluster-notebook decides whether this move is allowed.
// After a successful move, everyone placed is unhidden in every nucleus of the cluster (owner 2026-11-24; see hidesToLift).
export async function POST(req: NextRequest) {
  const { cluster, individualId, locationId } = await req.json().catch(() => ({}));
  try {
    const admin = await requireAdmin(cluster ? String(cluster) : '');
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !individualId || !locationId) {
      return NextResponse.json({ error: 'Missing cluster, person or place' }, { status: 400 });
    }
    // One result per person placed: the picked person and, with the household, everyone moving with them.
    const results = await moveIndividuals([String(individualId)], String(locationId), true);
    const result = results.find(r => r.individual?.id === String(individualId)) ?? results[0];
    if (!result) return NextResponse.json({ error: 'No result from the move' }, { status: 502 });
    const error = moveResultError(result);
    if (error) return NextResponse.json({ error });
    // The move has happened; from here a failure only means a hide is left, so it never reads as a failed move.
    try {
      const lifts = hidesToLift(await getHiddenPeople(String(cluster)), results);
      const failed = (await Promise.allSettled(lifts.map(l => unhideIndividual(l.individualId, l.nucleusName))))
        .filter(r => r.status === 'rejected');
      if (failed.length) throw failed;
    } catch (e: unknown) {
      console.error('move: unhide after move failed', e);
      return NextResponse.json({ error: 'Moved, but they are still hidden. Press Unhide to finish.' });
    }
    return NextResponse.json({ error: null });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
