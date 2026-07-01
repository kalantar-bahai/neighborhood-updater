import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAccessEntries, saveAccessEntries } from '@/lib/data';
import type { AccessEntry, Role } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const ROLES: Role[] = ['read', 'read-write', 'collaborator', 'admin'];

function canManage(role: Role | undefined): boolean {
  return role === 'admin' || role === 'collaborator';
}

function callerCanManage(roleMap: Record<string, Role>, nucleus: string): boolean {
  const key = norm(nucleus);
  return canManage(roleMap[key]) || canManage(roleMap['*']);
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const adminNuclei = new Set(
    Object.entries(access.roleMap)
      .filter(([, role]) => canManage(role))
      .map(([nucleus]) => nucleus)
  );
  if (adminNuclei.size === 0) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allEntries = await getAccessEntries();

  const hasGlobalAdmin = adminNuclei.has('*');
  const visible = hasGlobalAdmin
    ? allEntries
    : allEntries.filter(e => adminNuclei.has(norm(e.nucleus)));

  const url = new URL(req.url);
  const nucleusFilter = url.searchParams.get('nucleus');
  const result = nucleusFilter
    ? visible.filter(e => norm(e.nucleus) === norm(nucleusFilter))
    : visible;

  return NextResponse.json({ entries: result });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: Partial<AccessEntry>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { name, email, role, nucleus } = body;
  if (!name || !email || !role || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: name, email, role, nucleus' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  const callerAccess = await getAccess(req.auth.user.email);
  if (callerAccess.role === 'none' || !callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  await saveAccessEntries([...existing, { name, email, role, nucleus }]);
  return NextResponse.json({ success: true });
});

export const DELETE = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { email: string; nucleus: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { email, nucleus } = body;
  if (!email || !nucleus) {
    return NextResponse.json({ error: 'Missing required fields: email, nucleus' }, { status: 400 });
  }

  const callerAccess = await getAccess(req.auth.user.email);
  if (callerAccess.role === 'none' || !callerCanManage(callerAccess.roleMap, nucleus)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const existing = await getAccessEntries();
  const updated = existing.filter(
    e => !(norm(e.email) === norm(email) && norm(e.nucleus) === norm(nucleus))
  );
  await saveAccessEntries(updated);
  return NextResponse.json({ success: true });
});
