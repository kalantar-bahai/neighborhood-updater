import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { ACCOUNT_MESSAGES, accessErrorResponse } from '@/lib/accessRoute';
import { getAccounts, removeAccess, restoreAccess } from '@/lib/clusterNotebook';

// Who can sign in, in one cluster (Admin page, Accounts card), and removing/restoring a person's access.
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    return NextResponse.json({ accounts: await getAccounts(cluster) });
  } catch (e: unknown) {
    return accessErrorResponse(e, undefined, ACCOUNT_MESSAGES);
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cluster = typeof body.cluster === 'string' ? body.cluster : '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !body.individualId) return NextResponse.json({ error: 'Missing cluster or person' }, { status: 400 });
    // false: the person has no enabled account, so nothing was done.
    return NextResponse.json({ removed: await removeAccess(String(body.individualId), body.endRoles === true) });
  } catch (e: unknown) {
    return accessErrorResponse(e, undefined, ACCOUNT_MESSAGES);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cluster = typeof body.cluster === 'string' ? body.cluster : '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !body.individualId) return NextResponse.json({ error: 'Missing cluster or person' }, { status: 400 });
    if (body.action !== 'restore') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    return NextResponse.json({ restored: await restoreAccess(String(body.individualId)) });
  } catch (e: unknown) {
    return accessErrorResponse(e, undefined, ACCOUNT_MESSAGES);
  }
}
