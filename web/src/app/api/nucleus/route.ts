import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getRowData, saveRowData, createRowData, deleteRowData } from '@/lib/data';
function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const data = await getRowData(name);
  if (!data) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });

  return NextResponse.json(data);
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { name, formData } = await req.json();
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, name);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  // Strip admin-only fields unless caller is admin (defense-in-depth)
  if (role !== 'admin') {
    delete formData.identity;
    delete formData.locality;
    delete formData.stage;
    delete formData.contact;
    delete formData.email;
    delete formData.auxBoard;
  }

  const result = await saveRowData(name, formData, email);
  return NextResponse.json(result);
});

export const DELETE = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  await deleteRowData(name);
  return NextResponse.json({ success: true });
});

export const PUT = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const email = req.auth.user.email;
  const access = await getAccess(email);

  if (access.role === 'none' || access.roleMap['*'] !== 'admin') {
    return NextResponse.json({ error: 'Access denied — global admin required' }, { status: 403 });
  }

  const { formData } = await req.json();

  try {
    const result = await createRowData(formData, email);
    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof Error && (e as any).code === 'CONFLICT') {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
});
