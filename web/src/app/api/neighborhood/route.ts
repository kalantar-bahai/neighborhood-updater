import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthorizedRows } from '@/lib/access';
import { getRowData, saveRowData } from '@/lib/data';
import { COL } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('name');
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const { role, rows } = await getAuthorizedRows(req.auth.user.email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(name));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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
  const { role, rows } = await getAuthorizedRows(email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(name));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const result = await saveRowData(name, formData, email);
  return NextResponse.json(result);
});
