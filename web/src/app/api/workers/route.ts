import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getAllMasterRows, getWorkerNames, saveWorkerNames } from '@/lib/data';
import { COL, WORKER_TYPES } from '@/lib/config';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[nucleus] ?? roleMap['*'] ?? null;
}

export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if (!effectiveRole(access.roleMap, name)) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (!Array.isArray(names)) return NextResponse.json({ error: 'names must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

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
