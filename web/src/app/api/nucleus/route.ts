import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { getRowData, saveRowData, createRowData, deleteRowData, CodedError } from '@/lib/data';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const data = await getRowData(name);
    if (!data) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, formData } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip identity-changing fields unless caller has canChangeIdentity (defense-in-depth)
  if (!permissions.canChangeIdentity) {
    delete formData.identity;
    delete formData.locality;
    delete formData.stage;
    delete formData.auxBoard;
  }

  const email = await getCurrentUserEmail();
  try {
    const result = await saveRowData(name, formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canDelete) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const deleted = await deleteRowData(name);
    if (!deleted) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { formData } = await req.json();
  const d = formData as { identity?: { cluster?: string } } | undefined;
  const clusterName = (d?.identity?.cluster || '').trim();
  if (!clusterName) return NextResponse.json({ error: 'Missing cluster' }, { status: 400 });

  const permissions = await getNucleusPermissions(clusterName);
  if (!permissions.createableEntityTypes.includes('nucleus')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const email = await getCurrentUserEmail();

  try {
    const result = await createRowData(formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof CodedError && e.code === 'CONFLICT') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (e instanceof CodedError && e.code === 'BAD_CLUSTER') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    return clusterNotebookErrorResponse(e);
  }
}
