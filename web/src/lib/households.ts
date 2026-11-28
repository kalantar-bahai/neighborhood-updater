import type { Household, HouseholdMember, HouseholdSrpState, NucleusPerson } from './clusterNotebook';
import { individualDisplayName } from './personName';

// Pure helpers for the Families card and the move warning. Browser-safe: types only from clusterNotebook.

export type FamilyMember = {
  id: string; name: string; inSrp: boolean; isContact: boolean;
  familyName: string; firstName: string; // the person's own names, for sorting candidates
};
export type FamilyEntry = {
  key: string; title: string; address: string | null; size: number; members: FamilyMember[]; hidden: number;
  familyName: string; firstName: string; // sort keys
  householdId: string | null; srpState: HouseholdSrpState | null; // null for a one-person entry
  srpProblem: string | null; // why SRP didn't take the change; null for a one-person entry
};
export type FamilySort = 'name' | 'address';

export function familyTitle(h: Household): string {
  if (h.size === 1 && h.contact) return individualDisplayName(h.contact);
  const familyName = h.contact?.familyName || h.members[0]?.familyName;
  return familyName ? `${familyName} household` : 'Household';
}

function toMember(m: HouseholdMember, isContact: boolean): FamilyMember {
  return { id: m.id, name: individualDisplayName(m), inSrp: m.inSrp, isContact, familyName: m.familyName ?? '', firstName: m.firstName ?? '' };
}

// One entry per household plus one per visible household-less person. Members keep the backend's order
// (contact first). A person whose household wasn't selected (undefined) counts as household-less.
export function familyEntries(households: Household[], people: NucleusPerson[]): FamilyEntry[] {
  const entries: FamilyEntry[] = households.map((h) => ({
    key: h.id,
    householdId: h.id,
    srpState: h.srpState,
    srpProblem: h.srpProblem,
    title: familyTitle(h),
    address: h.address?.trim() || null,
    size: h.size,
    members: h.members.map((m) => toMember(m, m.id === h.contact?.id)),
    hidden: h.size - h.members.length,
    familyName: (h.contact ?? h.members[0])?.familyName ?? '',
    firstName: (h.contact ?? h.members[0])?.firstName ?? '',
  }));
  for (const p of people) {
    if (p.hidden || p.individual.household) continue;
    const m = toMember(p.individual, false);
    entries.push({ key: `person:${p.individual.id}`, title: m.name, address: p.address?.trim() || null, size: 1, members: [m], hidden: 0, householdId: null, srpState: null, srpProblem: null,
      familyName: p.individual.familyName ?? '', firstName: p.individual.firstName ?? '',
    });
  }
  return sortFamilies(entries, 'name');
}

const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });
const byName = (a: FamilyEntry, b: FamilyEntry) =>
  cmp(a.familyName, b.familyName) || cmp(a.firstName, b.firstName) || cmp(a.title, b.title);

// Street text first, then house number numerically; no leading number sorts by its whole text.
function addressKey(address: string | null): { street: string; num: number } | null {
  const text = address?.trim();
  if (!text) return null;
  const m = /^\s*(\d+)[A-Za-z]?(?:\s*-\s*\d+[A-Za-z]?)?\s+(.*)$/.exec(text);
  return m ? { street: m[2].toLowerCase(), num: Number(m[1]) } : { street: text.toLowerCase(), num: 0 };
}

type Sortable = { address: string | null; familyName: string; firstName: string };

// Shared by entries and candidates; `compareByName` is the by-name comparator (with its own tiebreaks).
function sortBy<T extends Sortable>(items: T[], by: FamilySort, compareByName: (a: T, b: T) => number): T[] {
  if (by === 'name') return [...items].sort(compareByName);
  return [...items].sort((a, b) => {
    const ka = addressKey(a.address);
    const kb = addressKey(b.address);
    if (!ka || !kb) return ka ? -1 : kb ? 1 : compareByName(a, b);
    return cmp(ka.street, kb.street) || ka.num - kb.num || compareByName(a, b);
  });
}

export function sortFamilies(entries: FamilyEntry[], by: FamilySort): FamilyEntry[] {
  return sortBy(entries, by, byName);
}

export function filterFamilies(entries: FamilyEntry[], query: string): FamilyEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter((e) => e.members.some((m) => m.name.toLowerCase().includes(q)));
}

export function sizeText(n: number): string {
  return n === 1 ? '1 person' : `${n} people`;
}

export function hiddenText(n: number): string | null {
  if (n <= 0) return null;
  return n === 1 ? "and 1 other you can't see" : `and ${n} others you can't see`;
}

export type HouseholdMove = { others: string[]; hidden: number; total: number };

export function householdMove(h: Household | null | undefined, movingId: string): HouseholdMove | null {
  if (!h || h.size <= 1) return null;
  return {
    others: h.members.filter((m) => m.id !== movingId).map(individualDisplayName),
    hidden: h.size - h.members.length,
    total: h.size,
  };
}

export function srpBadge(state: HouseholdSrpState | null): string | null {
  if (state === 'WAITING') return 'Not in SRP yet';
  if (state === 'LOCAL_ONLY') return 'Only in Nucleus Assistant';
  return null;
}

const SRP_PROBLEM_TEXT: Record<string, string> = {
  SRP_CONFLICT: 'Changed in SRP since we last looked.',
  OTHER_HOUSEHOLD_CONTACT: 'SRP refused: someone here is the contact of another SRP household.',
  PLACE_MISMATCH: "SRP refused: the members aren't all at the same place in SRP.",
  OUTSIDE_WRITABLE_SCOPE: "SRP refused: we aren't allowed to change this family in SRP.",
  MEMBER_NOT_IN_SRP: "SRP refused: someone here isn't in SRP yet.",
  STATE_CHANGED: "Sending to SRP didn't finish. Try again.",
  NOT_CONVERGED: "Sending to SRP didn't finish. Try again.",
};

export function srpProblemText(problem: string | null): string | null {
  if (problem === null) return null;
  return SRP_PROBLEM_TEXT[problem] ?? `SRP couldn't save this family (code ${problem}). Try again later.`;
}

// The contact of a multi-person household can't be removed; they must be replaced first.
export function canRemoveMember(entry: FamilyEntry, memberId: string): boolean {
  if (entry.size <= 1) return true;
  return !entry.members.some((m) => m.id === memberId && m.isContact);
}

export type Candidate = {
  id: string; name: string; familyTitle: string | null; fromHouseholdId: string | null;
  familyName: string; firstName: string; address: string | null;
};

const byCandidateName = (a: Candidate, b: Candidate) =>
  cmp(a.familyName, b.familyName) || cmp(a.firstName, b.firstName) || cmp(a.name, b.name);

export function matchesCandidate(c: Candidate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return c.name.toLowerCase().includes(q) || (c.address?.toLowerCase().includes(q) ?? false);
}

export function sortCandidates(candidates: Candidate[], by: FamilySort): Candidate[] {
  return sortBy(candidates, by, byCandidateName);
}

function candidatesFrom(entries: FamilyEntry[]): Candidate[] {
  return sortCandidates(entries.flatMap((e) => e.members.map((m) => ({
    id: m.id, name: m.name,
    familyTitle: e.householdId ? e.title : null,
    fromHouseholdId: e.householdId,
    familyName: m.familyName, firstName: m.firstName, address: e.address,
  }))), 'name');
}

// Everyone visible in the other entries, for adding to the target household.
export function addCandidates(entries: FamilyEntry[], targetKey: string): Candidate[] {
  return candidatesFrom(entries.filter((e) => e.key !== targetKey));
}

// Only one-person entries (no household yet), excluding the person starting the household.
export function startCandidates(entries: FamilyEntry[], personKey: string): Candidate[] {
  return candidatesFrom(entries.filter((e) => e.householdId === null && e.key !== personKey));
}

// A family with no surname is titled just "Household"; "the Household" would read oddly, so word it without a name.
export function moveConfirmText(name: string, title: string | null): string {
  return title === 'Household' ? `Move ${name} from their current family?` : `Move ${name} from the ${title}?`;
}

export function inFamilyText(title: string): string {
  return title === 'Household' ? 'in another family' : `in the ${title}`;
}
