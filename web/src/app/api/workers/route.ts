import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { getNucleusWorkers, updateNucleusWorkers, individualDisplayName } from '@/lib/clusterNotebook';
import type { Individual } from '@/lib/clusterNotebook';
import { RECOGNIZED_WORKER_TYPES } from '@/lib/config';
import type { Worker } from '@/types';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';

function toWorkers(individuals: Individual[]): Worker[] {
  return individuals.map(ind => ({ id: ind.id, name: individualDisplayName(ind), email: ind.email }));
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  const type = req.nextUrl.searchParams.get('type');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });

  const permissions = await getNucleusPermissions(name);
  if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const workers = await getNucleusWorkers(name, type);
    return NextResponse.json({ workers: toWorkers(workers) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, type, personIds } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!type) return NextResponse.json({ error: 'Missing type' }, { status: 400 });
  if (!Array.isArray(personIds)) return NextResponse.json({ error: 'personIds must be an array' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canAssignRoles) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const isRecognized = (RECOGNIZED_WORKER_TYPES as readonly string[]).includes(type);
  if (isRecognized && !permissions.assignableRoles.includes(type)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const workers = await updateNucleusWorkers(nucleus, type, personIds);
    return NextResponse.json({ workers: toWorkers(workers) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
