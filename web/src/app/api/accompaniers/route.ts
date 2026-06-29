import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthorizedRows } from '@/lib/access';
import { getAllMasterRows, getAccompanierNames, saveAccompanierNames } from '@/lib/data';
import { COL } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('neighborhood');
  if (!name) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });

  const { role, rows } = await getAuthorizedRows(req.auth.user.email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(name));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const names = await getAccompanierNames(name);
  return NextResponse.json({ names });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { neighborhood, names } = await req.json();
  if (!neighborhood) return NextResponse.json({ error: 'Missing neighborhood' }, { status: 400 });
  if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const { role, rows } = await getAuthorizedRows(email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allRows = await getAllMasterRows();
  const masterRow = allRows.find(r => norm(r[COL.NEIGHBORHOOD]) === norm(neighborhood));
  if (!masterRow) return NextResponse.json({ error: `Not found: ${neighborhood}` }, { status: 404 });

  const context = {
    cluster:             masterRow[COL.CLUSTER],
    clusterCode:         masterRow[COL.CLUSTER_CODE],
    locality:            masterRow[COL.LOCALITY],
    parentNeighborhood:  masterRow[COL.PARENT_NEIGHBORHOOD],
  };

  await saveAccompanierNames(masterRow[COL.NEIGHBORHOOD], names, context);
  return NextResponse.json({ success: true });
});
