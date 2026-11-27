import type { Household, HouseholdMember, NucleusPerson } from './clusterNotebook';
import { individualDisplayName } from './personName';

// Pure helpers for the Families card and the move warning. Browser-safe: types only from clusterNotebook.

export type FamilyMember = { id: string; name: string; inSrp: boolean; isContact: boolean };
export type FamilyEntry = {
  key: string; title: string; address: string | null; size: number; members: FamilyMember[]; hidden: number;
};

export function familyTitle(h: Household): string {
  if (h.size === 1 && h.contact) return individualDisplayName(h.contact);
  const familyName = h.contact?.familyName || h.members[0]?.familyName;
  return familyName ? `${familyName} household` : 'Household';
}

function toMember(m: HouseholdMember, isContact: boolean): FamilyMember {
  return { id: m.id, name: individualDisplayName(m), inSrp: m.inSrp, isContact };
}

// One entry per household plus one per visible household-less person. Members keep the backend's order
// (contact first). A person whose household wasn't selected (undefined) counts as household-less.
export function familyEntries(households: Household[], people: NucleusPerson[]): FamilyEntry[] {
  const entries: FamilyEntry[] = households.map((h) => ({
    key: h.id,
    title: familyTitle(h),
    address: h.address,
    size: h.size,
    members: h.members.map((m) => toMember(m, m.id === h.contact?.id)),
    hidden: h.size - h.members.length,
  }));
  for (const p of people) {
    if (p.hidden || p.individual.household) continue;
    const m = toMember(p.individual, false);
    entries.push({ key: `person:${p.individual.id}`, title: m.name, address: null, size: 1, members: [m], hidden: 0 });
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title));
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
