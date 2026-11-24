import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { getAdminPlaces, getAssignableRolesAt } from '@/lib/clusterNotebook';

// ?cluster= lists the cluster's places; ?entityId= lists the roles the caller may grant at that place.
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster');
  const entityId = req.nextUrl.searchParams.get('entityId');
  try {
    if (entityId) {
      const admin = await requireAdmin();
      if (admin instanceof NextResponse) return admin;
      return NextResponse.json({ roles: await getAssignableRolesAt(entityId) });
    }
    const admin = await requireAdmin(cluster ?? '');
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    return NextResponse.json({ places: await getAdminPlaces(cluster) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
