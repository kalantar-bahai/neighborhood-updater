import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccess } from '@/lib/access';
import { searchIndividuals, createIndividual, individualDisplayName } from '@/lib/clusterNotebook';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

function effectiveRole(roleMap: Record<string, string>, nucleus: string) {
  return roleMap[norm(nucleus)] ?? roleMap['*'] ?? null;
}

// Both routes require read-write minimum, matching /api/workers -- searching/creating
// individuals only ever happens as part of editing a worker list, never a pure read view.
export const GET = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  const search = req.nextUrl.searchParams.get('search') || undefined;
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const individuals = await searchIndividuals(nucleus, search);
  return NextResponse.json({
    individuals: individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind) })),
  });
});

export const POST = auth(async (req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, name } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const access = await getAccess(req.auth.user.email);
  if (access.role === 'none') return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  const role = effectiveRole(access.roleMap, nucleus);
  if (!role || role === 'read') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const individual = await createIndividual(String(name).trim(), nucleus);
  return NextResponse.json({ id: individual.id, name: individualDisplayName(individual) });
});
