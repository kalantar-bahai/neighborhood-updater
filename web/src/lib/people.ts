// People card (phase 1): pure decisions, tested in people.test.ts.
// Spec: docs/superpowers/specs/2026-11-18-people-card-design.md
import type { MoveContext, MoveResult, NucleusPerson, PermissionSet, PlaceSummary, PlaceSync } from './clusterNotebook';
import { individualDisplayName } from './personName';
import { INFORMAL_WORKER_TYPES } from './config';

// name: "Ana Lopez"; familyFirst: "Lopez, Ana", shown when the list is sorted by family name.
export type PersonRow = {
  id: string; name: string; familyFirst: string; roles: string[]; isResident: boolean;
  place: PlaceSummary | null; placeSync: PlaceSync | null;
};
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

// Every known role always shows, so the filter list doesn't change from nucleus to nucleus; other roles
// show when someone holds them.
export function peopleFilters(rows: PersonRow[], isHome: boolean): { key: string; label: string }[] {
  const held = sortRoles([...KNOWN_ROLES, ...rows.flatMap(r => r.roles)]);
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
  return {
    id: ind.id, name: individualDisplayName(ind), familyFirst, roles: p.roles, isResident: p.isResident,
    place: ind.place, placeSync: ind.placeSync,
  };
}

// Routes ask cluster-notebook for SEARCH_LIMIT + 1 people, so a full extra one means "there are more".
export function limitResults<T>(items: T[]): { items: T[]; more: boolean } {
  return { items: items.slice(0, SEARCH_LIMIT), more: items.length > SEARCH_LIMIT };
}

export function sortPeople(rows: PersonRow[], by: PeopleSort): PersonRow[] {
  const key = (r: PersonRow) => (by === 'family' ? r.familyFirst : r.name);
  return [...rows].sort((a, b) => key(a).localeCompare(key(b), undefined, { sensitivity: 'base' }));
}

// ---- Phase 2: moves (spec: docs/superpowers/specs/2026-11-19-people-card-moves-design.md) ----

export type MoveTarget = { id: string; name: string; path: string };

const target = (p: PlaceSummary): MoveTarget => ({ id: p.id, name: p.name, path: placePath(p) });

// here: this nucleus's Setting (move in). out: the parent nucleus's Setting when the parent is a home
// nucleus in the same Locality, otherwise this Setting's Locality (move out). Both by id, never name.
export function moveTargets(ctx: MoveContext): { here: MoveTarget | null; out: MoveTarget | null } {
  const loc = ctx.location;
  if (!loc || loc.type !== 'SETTING') return { here: null, out: null };
  const parent = ctx.parent?.location;
  let out: MoveTarget | null = null;
  if (ctx.parent?.inSrp && parent?.type === 'SETTING' && parent.localityId && parent.localityId === loc.localityId) {
    out = target(parent);
  } else if (loc.localityId && loc.locality) {
    out = { id: loc.localityId, name: loc.locality, path: [loc.cluster, loc.locality].filter(Boolean).join(' › ') };
  }
  return { here: target(loc), out };
}

const REFUSALS: Record<string, string> = {
  FN_NOT_IN_LOCALITY: "That neighbourhood isn't in their locality",
  OUT_OF_SCOPE: "SRP doesn't let us change this person",
  NOT_IN_SRP_RECORDS: "SRP doesn't have this person",
};

// What a row shows about the person's latest move. Keys off `code`, never the raw error text.
export function syncNote(sync: PlaceSync | null): { tone: 'wait' | 'error'; text: string } | null {
  if (!sync) return null;
  switch (sync.status) {
    case 'pending':
    case 'in_flight':
      return { tone: 'wait', text: 'On its way to SRP' };
    case 'refused':
      return { tone: 'error', text: `${REFUSALS[sync.code ?? ''] ?? `SRP refused the move (${sync.code ?? 'no reason given'})`}. The move was undone.` };
    case 'failed':
      return { tone: 'error', text: `Couldn't reach SRP: ${sync.code ?? 'unknown error'}` };
    default:
      return null;
  }
}

const MOVE_ERRORS: Record<string, string> = {
  FORBIDDEN: "You can't move this person",
  OTHER_CLUSTER: 'This person is in another cluster',
  NOT_FOUND: 'Person not found',
};

export function moveResultError(r: MoveResult): string | null {
  if (r.moved || r.code === 'ALREADY_THERE') return null;
  return MOVE_ERRORS[r.code ?? ''] ?? `The move didn't happen (${r.code ?? 'no reason given'})`;
}

// Roles to clear at the nucleus someone is leaving: none if they keep them, else those the caller may change.
export function rolesToClear(held: string[], editable: (role: string) => boolean, keep: boolean): string[] {
  return keep ? [] : held.filter(editable);
}

// True while any row's move is still on its way to SRP (the card re-reads until it lands).
export function isMoving(rows: PersonRow[]): boolean {
  return rows.some(r => r.placeSync?.status === 'pending' || r.placeSync?.status === 'in_flight');
}

// The roles the caller may change on a nucleus: known roles plus any held there, filtered by canEditRole.
// Sent with /api/people so the card can ask about roles at someone's old nucleus.
export function editableRoles(p: PermissionSet, rows: PersonRow[]): string[] {
  return sortRoles([...KNOWN_ROLES, ...rows.flatMap(r => r.roles)]).filter(role => canEditRole(p, role));
}
