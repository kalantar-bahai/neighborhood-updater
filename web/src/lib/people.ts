// People card (phase 1): pure decisions, tested in people.test.ts.
// Spec: docs/superpowers/specs/2026-11-18-people-card-design.md
import type { NucleusPerson, PermissionSet, PlaceSummary } from './clusterNotebook';
import { individualDisplayName } from './personName';
import { INFORMAL_WORKER_TYPES } from './config';

// name: "Ana Lopez"; familyFirst: "Lopez, Ana", shown when the list is sorted by family name.
export type PersonRow = { id: string; name: string; familyFirst: string; roles: string[]; isResident: boolean };
export type PeopleSort = 'first' | 'family';

export const SEARCH_LIMIT = 20;

// Display order for known roles, with the label and icon each shows in the card.
const ROLES: { role: string; label: string; icon: string }[] = [
  { role: 'promoter', label: 'Promoting', icon: '📣' },
  { role: 'protagonist', label: 'Helping Others', icon: '👥' },
  { role: 'accompanier', label: 'Accompanying', icon: '🤝' },
  { role: 'contact', label: 'Contact', icon: '★' },
];
export const KNOWN_ROLES = ROLES.map(r => r.role);
export const RESIDENT = { label: 'Resident', icon: '🏠' };

// Names like "Parkside" repeat across localities, so search results show the whole path.
export function placePath(place: Pick<PlaceSummary, 'name' | 'type' | 'cluster' | 'locality'> | null): string {
  if (!place) return '';
  return [place.cluster, place.locality, place.name].filter(Boolean).join(' › ');
}

export function roleLabel(role: string): { label: string; icon: string | null } {
  const known = ROLES.find(r => r.role === role);
  return known ? { label: known.label, icon: known.icon } : { label: role, icon: null };
}

// Same rule as /api/workers: informal roles need only canAssignRoles; every other role must
// also be in assignableRoles (fail closed).
export function canEditRole(p: PermissionSet, role: string): boolean {
  if (!p.canAssignRoles) return false;
  return (INFORMAL_WORKER_TYPES as readonly string[]).includes(role) || p.assignableRoles.includes(role);
}

// Known roles first in display order, then any others alphabetically.
export function sortRoles(roles: string[]): string[] {
  const known = KNOWN_ROLES.filter(r => roles.includes(r));
  const other = [...new Set(roles.filter(r => !KNOWN_ROLES.includes(r)))].sort();
  return [...known, ...other];
}

export function peopleFilters(rows: PersonRow[], isHome: boolean): { key: string; label: string }[] {
  const held = sortRoles(rows.flatMap(r => r.roles));
  return [
    { key: 'all', label: 'All' },
    ...(isHome ? [{ key: 'resident', label: RESIDENT.label }] : []),
    ...held.map(role => ({ key: role, label: roleLabel(role).label })),
  ];
}

export function filterPeople(rows: PersonRow[], filter: string, search: string): PersonRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter(r =>
    (filter === 'all' || (filter === 'resident' ? r.isResident : r.roles.includes(filter))) &&
    (!q || r.name.toLowerCase().includes(q)));
}

// The new ordered id list for one role after ticking (on) or unticking a person.
// A single-person role (contact) is replaced rather than appended to.
export function nextRoleIds(current: string[], personId: string, on: boolean, single: boolean): string[] {
  if (!on) return current.filter(id => id !== personId);
  if (single) return [personId];
  return current.includes(personId) ? current : [...current, personId];
}

export function toPersonRow(p: NucleusPerson): PersonRow {
  const ind = p.individual;
  const given = [ind.firstName, ind.middleNames].filter(Boolean).join(' ');
  const familyFirst = ind.familyName
    ? (given ? `${ind.familyName}, ${given}` : ind.familyName) + (ind.nickname ? ` (${ind.nickname})` : '')
    : individualDisplayName(ind);
  return { id: ind.id, name: individualDisplayName(ind), familyFirst, roles: p.roles, isResident: p.isResident };
}

// Routes ask cluster-notebook for SEARCH_LIMIT + 1 people, so a full extra one means "there are more".
export function limitResults<T>(items: T[]): { items: T[]; more: boolean } {
  return { items: items.slice(0, SEARCH_LIMIT), more: items.length > SEARCH_LIMIT };
}

export function sortPeople(rows: PersonRow[], by: PeopleSort): PersonRow[] {
  const key = (r: PersonRow) => (by === 'family' ? r.familyFirst : r.name);
  return [...rows].sort((a, b) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base' }));
}
