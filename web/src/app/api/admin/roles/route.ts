import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { endRole, grantRole } from '@/lib/clusterNotebook';

// Grant a role to a person at a place, by id. SELF_LOCKOUT and FORBIDDEN come back from cluster-notebook
// and are mapped by clusterNotebookErrorResponse.
export async function POST(req: NextRequest) {
  const { individualId, role, entityId } = await req.json().catch(() => ({}));
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    if (!individualId || !role || !entityId) {
      return NextResponse.json({ error: 'Missing person, role or place' }, { status: 400 });
    }
    const holding = await grantRole(String(individualId), String(role), String(entityId));
    return NextResponse.json({ holding });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const { roleId } = await req.json().catch(() => ({}));
  try {
    const admin = await requireAdmin();
    if (admin instanceof NextResponse) return admin;
    if (!roleId) return NextResponse.json({ error: 'Missing role' }, { status: 400 });
    await endRole(String(roleId));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
