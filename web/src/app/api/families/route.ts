import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getNucleusPermissions } from '@/lib/access';
import {
  addHouseholdMember,
  createHousehold,
  getNucleusHouseholds,
  getNucleusPeople,
  removeHouseholdMember,
  setHouseholdContact,
} from '@/lib/clusterNotebook';
import { clusterNotebookErrorResponse } from '@/lib/clusterNotebookError';
import { familyEntries } from '@/lib/households';

// The Families card's list: one entry per household, plus one per visible person with no household.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const name = req.nextUrl.searchParams.get('nucleus');
  if (!name) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(name);
    if (!permissions.canRead) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

    const [households, people] = await Promise.all([getNucleusHouseholds(name), getNucleusPeople(name)]);
    if (!households || !people) return NextResponse.json({ error: `Not found: ${name}` }, { status: 404 });
    return NextResponse.json({ families: familyEntries(households, people) });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e);
  }
}

type FamilyAction =
  | { action: 'create'; contactId: string; memberIds: string[] }
  | { action: 'add'; householdId: string; individualId: string; fromHouseholdId?: string }
  | { action: 'remove'; householdId: string; individualId: string }
  | { action: 'contact'; householdId: string; individualId: string };

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Strict body validation: returns the typed action, or a message for a 400.
function parseAction(body: Record<string, unknown>): FamilyAction | string {
  switch (body.action) {
    case 'create': {
      const { contactId, memberIds } = body;
      if (!isId(contactId)) return 'Missing contactId';
      if (!Array.isArray(memberIds) || memberIds.length === 0 || !memberIds.every(isId)) {
        return 'memberIds must be a non-empty list of ids';
      }
      return { action: 'create', contactId, memberIds };
    }
    case 'add': {
      const { householdId, individualId, fromHouseholdId } = body;
      if (!isId(householdId) || !isId(individualId)) return 'Missing householdId or individualId';
      if (fromHouseholdId !== undefined && !isId(fromHouseholdId)) return 'Invalid fromHouseholdId';
      return { action: 'add', householdId, individualId, fromHouseholdId };
    }
    case 'remove':
    case 'contact': {
      const { householdId, individualId } = body;
      if (!isId(householdId) || !isId(individualId)) return 'Missing householdId or individualId';
      return { action: body.action, householdId, individualId };
    }
    default:
      return 'Unknown action';
  }
}

// Display-only name of the person the action is about, for error messages. Never used for authorization.
function parsePersonName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= 200 ? t : undefined;
}

// Household edits from the Families card: create, add a member, remove a member, set the contact.
const FORBIDDEN_TEXT = "You can't change this family.";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (!isId(record.nucleus)) return NextResponse.json({ error: 'Missing nucleus' }, { status: 400 });
  const parsed = parseAction(record);
  if (typeof parsed === 'string') return NextResponse.json({ error: parsed }, { status: 400 });

  try {
    const permissions = await getNucleusPermissions(record.nucleus);
    if (!permissions.canWrite) return NextResponse.json({ error: FORBIDDEN_TEXT }, { status: 403 });

    let household;
    switch (parsed.action) {
      case 'create':
        household = await createHousehold(parsed.contactId, parsed.memberIds);
        break;
      case 'add':
        household = await addHouseholdMember(parsed.householdId, parsed.individualId, parsed.fromHouseholdId);
        break;
      case 'remove':
        household = await removeHouseholdMember(parsed.householdId, parsed.individualId);
        break;
      case 'contact':
        household = await setHouseholdContact(parsed.householdId, parsed.individualId);
        break;
    }
    return NextResponse.json({ household });
  } catch (e: unknown) {
    return clusterNotebookErrorResponse(e, { forbidden: FORBIDDEN_TEXT, name: parsePersonName(record.personName) });
  }
}
