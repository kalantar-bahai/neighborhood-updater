import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getLocationOptions } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const cluster = req.nextUrl.searchParams.get('cluster');
  if (!cluster) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(cluster);
    if (!permissions.createableEntityTypes.includes('nucleus')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const localities = await getLocationOptions(cluster);
    return NextResponse.json({ localities });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
