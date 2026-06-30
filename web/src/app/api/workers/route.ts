import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAuthorizedRows } from '@/lib/access';
import { getAllMasterRows, getWorkerNames, saveWorkerNames } from '@/lib/data';
import { COL, WORKER_TYPES } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  const { role, rows } = await getAuthorizedRows(req.auth.user.email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NUCLEUS]) === norm(name));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const names = await getWorkerNames(name, type);
  return NextResponse.json({ names });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, names } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const { role, rows } = await getAuthorizedRows(email);
  const allowed = role === 'global' || rows.some(r => norm(r[COL.NUCLEUS]) === norm(nucleus));
  if (!allowed) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const allRows = await getAllMasterRows();
  const masterRow = allRows.find(r => norm(r[COL.NUCLEUS]) === norm(nucleus));
  if (!masterRow) return NextResponse.json({ error: `Not found: ${nucleus}` }, { status: 404 });

  const context = {
    cluster:       masterRow[COL.CLUSTER],
    clusterCode:   masterRow[COL.CLUSTER_CODE],
    locality:      masterRow[COL.LOCALITY],
    parentNucleus: masterRow[COL.PARENT_NUCLEUS],
  };

  await saveWorkerNames(masterRow[COL.NUCLEUS], type, names, context);
  return NextResponse.json({ success: true });
});
