import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAccess } from '@/lib/access';
import { getCurrentUserEmail } from '@/lib/clerkUser';
import { getRowData, saveRowData, createRowData, deleteRowData, CodedError } from '@/lib/data';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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

  const access = await getAccess(userId);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip admin-only fields unless caller is admin (defense-in-depth)
  if (role !== 'admin') {
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

  const access = await getAccess(userId);
  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

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

  const access = await getAccess(userId);
  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const { formData } = await req.json();
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
