import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getAssignableRoleDetails } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

// Backs the "manage access" card (DetailView.tsx) -- lists which roles the
// signed-in user may grant at this nucleus, each paired with its real
// PermissionSet so the card can describe what a role actually does.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canAssignRoles) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const roles = await getAssignableRoleDetails(nucleus);
    return NextResponse.json({ roles });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
