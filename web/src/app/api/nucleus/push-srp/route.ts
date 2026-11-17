import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusFields, pushNucleusToSrp } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  try {
    const fields = await getNucleusFields(name);
    if (!fields) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });

    // Creating in SRP is gated like creating a nucleus: on the nucleus's cluster.
    const permissions = await getNucleusPermissions(fields.cluster.name);
    if (!permissions.createableEntityTypes.includes('nucleus')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const pushed = await pushNucleusToSrp(name);
    if (!pushed) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
