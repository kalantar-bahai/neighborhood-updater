import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { getNucleusWorkers, updateNucleusWorkers, individualDisplayName } from '@/lib/clusterNotebook';
import type { Individual } from '@/lib/clusterNotebook';
import { WORKER_TYPES } from '@/lib/config';
import type { Worker } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
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

  const workers = await getNucleusWorkers(name, type);
  return NextResponse.json({ workers: toWorkers(workers) });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, personIds } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!WORKER_TYPES.includes(type as typeof WORKER_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  if (!Array.isArray(personIds)) return NextResponse.json({ error: 'personIds must be an array' }, { status: 400 });

  const email = req.auth.user.email;
  const access = await getAccess(email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  if ((type === 'abm-assistant' || type === 'contact') && role !== 'admin') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const workers = await updateNucleusWorkers(nucleus, type, personIds);
  return NextResponse.json({ workers: toWorkers(workers) });
});
