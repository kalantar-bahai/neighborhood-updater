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
import { isId, parseAction, parsePersonName } from '@/lib/familyActions';

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
