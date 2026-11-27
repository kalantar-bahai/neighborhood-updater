import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import {
  createParticipationSpace, getParticipationSpace, getParticipationSpaces, getSpaceKinds, updateParticipationSpace,
} from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { parseSpaceBody, parseSpacePatch, windowStart } from '@/lib/participation';

// Participation spaces at a nucleus (Participation card). GET lists live spaces, or with `space` returns
// one space's detail (records page via `offset`, 12-week people). Writes need edit access.
const ERRORS = {
  messages: {
    NAME_TAKEN: 'This neighborhood already has a space with that name.',
    INDIVIDUAL_NOT_FOUND: "One of the people named wasn't found.",
  },
};

const notAuthenticated = () => NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });
const denied = () => NextResponse.json({ error: 'Access denied' }, { status: 403 });

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return notAuthenticated();

  const params = req.nextUrl.searchParams;
  const nucleus = params.get('nucleus');
  if (!nucleus) return bad('Missing nucleus');
  const spaceId = params.get('space');
  const offsetText = params.get('offset');
  const offset = offsetText === null ? 0 : Number(offsetText);
  if (!Number.isInteger(offset) || offset < 0) return bad('Invalid offset');

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canRead) return denied();

    if (spaceId) {
      const [space, kinds] = await Promise.all([
        getParticipationSpace(nucleus, spaceId, windowStart(new Date()), 20, offset),
        getSpaceKinds(),
      ]);
      if (!space) return NextResponse.json({ error: "That space wasn't found." }, { status: 404 });
      return NextResponse.json({ space, kinds });
    }
    const [result, kinds] = await Promise.all([getParticipationSpaces(nucleus), getSpaceKinds()]);
    if (!result) return NextResponse.json({ error: 'Nucleus not found' }, { status: 404 });
    return NextResponse.json({ spaces: result.spaces, kinds });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return notAuthenticated();

  const body = await req.json().catch(() => null);
  const nucleus = body?.nucleus;
  if (!nucleus || typeof nucleus !== 'string') return bad('Missing nucleus');
  const parsed = parseSpaceBody(body);
  if (!parsed.ok) return bad(parsed.error);

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canWrite) return denied();
    const found = await getParticipationSpaces(nucleus);
    if (!found) return NextResponse.json({ error: 'Nucleus not found' }, { status: 404 });
    const { name, kind, mode } = parsed.value;
    const space = await createParticipationSpace(found.nucleusId, name, kind, mode);
    return NextResponse.json({ space });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return notAuthenticated();

  const body = await req.json().catch(() => null);
  const nucleus = body?.nucleus;
  if (!nucleus || typeof nucleus !== 'string') return bad('Missing nucleus');
  const parsed = parseSpacePatch(body);
  if (!parsed.ok) return bad(parsed.error);

  try {
    const permissions = await getNucleusPermissions(nucleus);
    if (!permissions.canWrite) return denied();
    const space = await updateParticipationSpace(parsed.id, parsed.patch);
    return NextResponse.json({ space });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, ERRORS);
  }
}
