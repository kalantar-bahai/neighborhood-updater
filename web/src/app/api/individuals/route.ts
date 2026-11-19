import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { searchIndividuals, createIndividual, individualDisplayName } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { SEARCH_LIMIT, limitResults, placePath } from '@/lib/people';

// Both routes require write access -- searching/creating individuals only happens while
// adding someone to a nucleus. The search covers everyone placed in the cluster (owner,
// 2026-11-18) and returns names and place only.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const nucleus = req.nextUrl.searchParams.get('nucleus');
  const search = req.nextUrl.searchParams.get('search') || undefined;
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const { items, more } = limitResults(await searchIndividuals(nucleus, search, SEARCH_LIMIT + 1));
    return NextResponse.json({
      individuals: items.map(ind => ({
        id: ind.id, name: individualDisplayName(ind), place: placePath(ind.place),
        // For a move in: their current place's home nucleus, to ask about their roles there.
        homeNucleus: ind.place?.homeNucleus ?? null, placeId: ind.place?.id ?? null,
      })),
      more,
    });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { nucleus, name } = await req.json();
  if (!nucleus) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  if (!name || !String(name).trim()) return NextResponse.json({ error: 'Missing name' }, { status: 400 });

  const permissions = await getNucleusPermissions(nucleus);
  if (!permissions.canWrite) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  try {
    const individual = await createIndividual(String(name).trim(), nucleus);
    return NextResponse.json({ id: individual.id, name: individualDisplayName(individual) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}
