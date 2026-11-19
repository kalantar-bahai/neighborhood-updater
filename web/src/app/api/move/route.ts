import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { moveIndividuals } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// Move one person into or out of a nucleus's place (People card, phase 2). cluster-notebook decides
// who may move whom (either side's home nucleus, confirmed 2026-11-19); this route only requires
// edit access to the nucleus the card is on. Households always move together (owner, 2026-11-19:
// srp-client looks up the household contact).
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, individualId, locationId } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!individualId || !locationId) return NextResponse.json({ error: 'Missing person or place' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const [result] = await moveIndividuals([String(individualId)], String(locationId), true);
    if (!result) return NextResponse.json({ error: 'No result from the move' }, { status: 502 });
    return NextResponse.json({ result });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
