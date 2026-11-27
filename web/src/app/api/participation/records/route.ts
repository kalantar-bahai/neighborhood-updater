import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import { createParticipationRecord, deleteParticipationRecord, updateParticipationRecord } from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { parseRecordBody, parseRecordPatch } from '@/lib/participation';

// Records in a participation space. All writes need edit access to the nucleus; cluster-notebook checks the
// record's own nucleus too.
const ERRORS = {
  messages: {
    NAME_TAKEN: 'This neighborhood already has a space with that name.',
    INDIVIDUAL_NOT_FOUND: "One of the people named wasn't found.",
  },
};

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

// Auth, body and write-permission checks shared by every handler. Returns a response to send, or the body.
async function gate(req: NextRequest): Promise<{ response: NextResponse } | { body: Record<string, unknown> }> {
  const { userId } = await auth();
  if (!userId) return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const body = await req.json().catch(() => null);
  const nucleus = body?.nucleus;
  if (!nucleus || typeof nucleus !== 'string') return { response: bad('Missing nucleus') };
  return { body };
}

async function canWrite(nucleus: string): Promise<boolean> {
  return (await getNucleusPermissions(nucleus)).canWrite;
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('response' in g) return g.response;
  const parsed = parseRecordBody(g.body);
  if (!parsed.ok) return bad(parsed.error);

  try {
    if (!(await canWrite(g.body.nucleus as string))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const { spaceId, ...input } = parsed.value;
    const record = await createParticipationRecord(spaceId, input);
    return NextResponse.json({ record });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if ('response' in g) return g.response;
  const parsed = parseRecordPatch(g.body);
  if (!parsed.ok) return bad(parsed.error);

  try {
    if (!(await canWrite(g.body.nucleus as string))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const record = await updateParticipationRecord(parsed.id, parsed.patch);
    return NextResponse.json({ record });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await gate(req);
  if ('response' in g) return g.response;
  const id = g.body.id;
  if (typeof id !== 'string' || !id) return bad('Missing record.');

  try {
    if (!(await canWrite(g.body.nucleus as string))) return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    const deleted = await deleteParticipationRecord(id);
    return NextResponse.json({ deleted });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}
