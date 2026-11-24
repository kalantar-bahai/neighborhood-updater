import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAccess';
import { accessErrorResponse } from '@/lib/accessRoute';
import { validateInvite } from '@/lib/admin';
import { getInvitations, inviteIndividual, resendInvitation, revokeInvitation, type InvitationStatus } from '@/lib/clusterNotebook';

const STATUSES: InvitationStatus[] = ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'];

// Invitations in one cluster (Admin page, Invite card): list, invite, and resend/cancel. The login email only
// ever appears on these rows; cluster-notebook owns the invitation end to end.
export async function GET(req: NextRequest) {
  const cluster = req.nextUrl.searchParams.get('cluster') ?? '';
  const status = req.nextUrl.searchParams.get('status');
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    if (status !== null && !STATUSES.includes(status as InvitationStatus)) {
      return NextResponse.json({ error: 'Unknown status' }, { status: 400 });
    }
    return NextResponse.json({ invitations: await getInvitations(cluster, status as InvitationStatus | null) });
  } catch (e: unknown) {
    return accessErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cluster = typeof body.cluster === 'string' ? body.cluster : '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });
    const input = validateInvite(body);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 });
    return NextResponse.json({ invitation: await inviteIndividual(input.value) });
  } catch (e: unknown) {
    return accessErrorResponse(e, typeof body.individualId === 'string' ? body.individualId : undefined);
  }
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cluster = typeof body.cluster === 'string' ? body.cluster : '';
  try {
    const admin = await requireAdmin(cluster);
    if (admin instanceof NextResponse) return admin;
    if (!cluster || !body.id) return NextResponse.json({ error: 'Missing cluster or invitation' }, { status: 400 });
    if (body.action !== 'resend' && body.action !== 'cancel') {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    const id = String(body.id);
    const invitation = body.action === 'resend' ? await resendInvitation(id) : await revokeInvitation(id);
    return NextResponse.json({ invitation });
  } catch (e: unknown) {
    return accessErrorResponse(e);
  }
}
