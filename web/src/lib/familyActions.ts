// Body validation for POST /api/families, kept out of the route so it can be tested (familyActions.test.ts).
export type FamilyAction =
  | { action: 'create'; contactId: string; memberIds: string[] }
  | { action: 'add'; householdId: string; individualId: string; fromHouseholdId?: string }
  | { action: 'remove'; householdId: string; individualId: string }
  | { action: 'contact'; householdId: string; individualId: string };

export const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

// Strict body validation: returns the typed action, or a message for a 400.
export function parseAction(input: unknown): FamilyAction | string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return 'Invalid body';
  const body = input as Record<string, unknown>;
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
export function parsePersonName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t && t.length <= 200 ? t : undefined;
}
