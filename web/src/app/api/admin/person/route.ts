import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getIndividualRoles, getPersonDetails } from '@/lib/clusterNotebook';

// One person's details and role holdings by id. No cluster is named here: cluster-notebook allows the
// details only for an Administrator or a CSO of the person's own cluster (null otherwise).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') ?? '';
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    if (!id) return NextResponse.json({ error: 'Missing person' }, { status: 400 });
    const [details, roles] = await Promise.all([getPersonDetails(id, null), getIndividualRoles(id)]);
    return NextResponse.json({ details, roles });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
