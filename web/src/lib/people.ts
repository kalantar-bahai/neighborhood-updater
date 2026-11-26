// People card (phase 1): pure decisions, tested in people.test.ts.
// Spec: docs/superpowers/specs/2026-11-18-people-card-design.md
// Age, devotional host, details (phase A) and activities (phase B): docs/superpowers/specs/2026-11-20-people-card-details-design.md.
import type { AgeCategory, PersonHide, DevotionalHostRole, MoveContext, Participation, MoveResult, NucleusPerson, PermissionSet, PersonDetails, PlaceSummary, PlaceSync } from './clusterNotebook';
import { individualDisplayName } from './personName';
import { INFORMAL_WORKER_TYPES } from './config';

// name: "Ana Lopez"; familyFirst: "Lopez, Ana", shown when the list is sorted by family name.
export type PersonRow = {
  id: string; name: string; familyFirst: string; roles: string[]; isResident: boolean;
  place: PlaceSummary | null; placeSync: PlaceSync | null; inSrp: boolean;
  ageCategory: AgeCategory | null; devotionalHost: DevotionalHostRole | null;
  participates: boolean; facilitates: boolean; participation: Participation[];
  hidden: boolean; hide: PersonHide | null;
};
export type PeopleSort = 'first' | 'family';

export const SEARCH_LIMIT = 20;

// Display order for known roles, with the label and icon each shows in the card.
const ROLES: { role: string; label: string; icon: string }[] = [
  { role: 'member', label: 'Member', icon: '👤' },
  { role: 'promoter', label: 'Promoting', icon: '📣' },
  { role: 'protagonist', label: 'Helping Others', icon: '👥' },
  { role: 'accompanier', label: 'Accompanying', icon: '🤝' },
  { role: 'contact', label: 'Contact', icon: '★' },
];
export const KNOWN_ROLES = ROLES.map(r => r.role);
export const RESIDENT = { label: 'Resident', icon: '🏠' };
export const DEVOTIONAL_HOST = { label: 'Devotional host', icon: '🕯' };
export const FACILITATES = { label: 'Facilitating', icon: '🎓' };
export const PARTICIPATES = { label: 'Participating', icon: '📖' };
const ACTIVITY_TYPES: Record<string, string> = { cc: "Children's class", jyg: 'Junior youth group', sc: 'Study circle' };
export const AGE_LABELS: Record<AgeCategory, string> = {
  CHILD: 'Child', JUNIOR_YOUTH: 'Junior Youth', YOUTH: 'Youth', ADULT: 'Adult',
};

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

// Roles the editor offers: 'member' only on a nucleus that isn't an SRP home (there, belonging is the member role;
// on a home nucleus it is residence), then the other known roles, then any other role the person already holds.
export function editorRoleList(isHome: boolean, held: string[]): string[] {
  const known = KNOWN_ROLES.filter(r => r !== 'member');
  return sortRoles([...(isHome ? [] : ['member']), ...known, ...held]);
}

// The main filter follows the Overview card's order (owner, 2026-11-21): Promoting, Devotional host,
// Participating, Facilitating, Helping Others, Accompanying; then Contact and any other role someone holds.
// Every one of these always shows, so the list doesn't change from nucleus to nucleus.
const PRIMARY_FILTERS: { key: string; label: string }[] = [
  { key: 'promoter', label: roleLabel('promoter').label },
  { key: 'devotional-host', label: DEVOTIONAL_HOST.label },
  { key: 'participating', label: PARTICIPATES.label },
  { key: 'facilitating', label: FACILITATES.label },
  { key: 'protagonist', label: roleLabel('protagonist').label },
  { key: 'accompanier', label: roleLabel('accompanier').label },
];
export function peopleFilters(rows: PersonRow[], isHome: boolean): { key: string; label: string }[] {
  const listed = PRIMARY_FILTERS.map(f => f.key);
  const rest = sortRoles([...KNOWN_ROLES, ...rows.flatMap(r => r.roles)]).filter(role => role !== 'member' && !listed.includes(role));
  return [
    { key: 'all', label: 'All' },
    ...(isHome ? [{ key: 'resident', label: RESIDENT.label }] : [{ key: 'member', label: roleLabel('member').label }]),
    ...PRIMARY_FILTERS,
    ...rest.map(role => ({ key: role, label: roleLabel(role).label })),
    { key: 'hidden', label: 'Hidden' },
  ];
}

// The second filter: age category, every one always listed, youngest first.
export const AGE_FILTERS: { key: 'all' | AgeCategory; label: string }[] = [
  { key: 'all', label: 'All ages' },
  ...(Object.keys(AGE_LABELS) as AgeCategory[]).map(a => ({ key: a, label: AGE_LABELS[a] })),
];

function matchesFilter(r: PersonRow, filter: string): boolean {
  if (filter === 'hidden') return r.hidden;
  if (r.hidden) return false;
  if (filter === 'all') return true;
  if (filter === 'resident') return r.isResident;
  if (filter === 'participating') return r.participates;
  if (filter === 'facilitating') return r.facilitates;
  if (filter === 'devotional-host') return r.devotionalHost !== null;
  return r.roles.includes(filter);
}

export function filterPeople(rows: PersonRow[], filter: string, search: string, age: 'all' | AgeCategory = 'all'): PersonRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter(r =>
    matchesFilter(r, filter) &&
    (age === 'all' || r.ageCategory === age) &&
    (!q || r.name.toLowerCase().includes(q)));
}

// The total line under the list: "85 people", or "12 of 85 people" while a filter or search narrows it.
export function peopleCountLabel(shown: number, total: number, hidden = false): string {
  if (hidden) return shown === total ? `${total} hidden` : `${shown} of ${total} hidden`;
  const noun = total === 1 ? 'person' : 'people';
  return shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`;
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
    place: ind.place, placeSync: ind.placeSync, inSrp: ind.inSrp,
    ageCategory: p.ageCategory, devotionalHost: p.devotionalHost,
    participates: p.participates, facilitates: p.facilitates, participation: p.participation,
    hidden: p.hidden, hide: p.hide,
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

// Only an SRP home nucleus has people to move (isHome); any other nucleus has members instead.
// here: this nucleus's own Setting (move in). out: where moving out goes, by id, never name:
//  - in SRP: the parent's Setting when the parent is a home nucleus in the same Locality, else this Setting's Locality;
//  - not in SRP (a home whose Setting SRP doesn't know): the SRP neighbourhood it stands in (srpPlace), named in srpAt.
export function moveTargets(ctx: MoveContext): { here: MoveTarget | null; out: MoveTarget | null; srpAt: string | null } {
  const none = { here: null, out: null, srpAt: null };
  const loc = ctx.location;
  if (!ctx.isHome || !loc || loc.type !== 'SETTING') return none;
  if (!ctx.inSrp) {
    return { here: target(loc), out: ctx.srpPlace ? target(ctx.srpPlace) : null, srpAt: ctx.srpPlace?.name ?? null };
  }
  const parent = ctx.parent?.location;
  let out: MoveTarget | null = null;
  if (ctx.parent?.inSrp && parent?.type === 'SETTING' && parent.localityId && parent.localityId === loc.localityId) {
    out = target(parent);
  } else if (loc.localityId && loc.locality) {
    out = { id: loc.localityId, name: loc.locality, path: [loc.cluster, loc.locality].filter(Boolean).join(' › ') };
  }
  return { here: target(loc), out, srpAt: null };
}

// Shown when moving someone in to a Neighborhood SRP doesn't know yet: SRP keeps them at srpAt meanwhile.
export function srpAtNote(srpAt: string | null): string | null {
  return srpAt ? `In SRP they'll be at ${srpAt} until this nucleus is sent to SRP.` : null;
}

const REFUSALS: Record<string, string> = {
  FN_NOT_IN_LOCALITY: "That neighbourhood isn't in their locality",
  OUT_OF_SCOPE: "SRP doesn't let us change this person",
  NOT_IN_SRP_RECORDS: "SRP doesn't have this person",
  HOUSEHOLD_MOVES_TOGETHER: 'Households move together',
};

// The reason words for a refused move, without the "undone" ending.
export function refusalText(code: string | null): string {
  return REFUSALS[code ?? ''] ?? `SRP refused the move (${code ?? 'no reason given'})`;
}

// What a row shows about the person's latest move. Keys off `code`, never the raw error text.
export function syncNote(sync: PlaceSync | null): { tone: 'wait' | 'error'; text: string } | null {
  if (!sync) return null;
  switch (sync.status) {
    case 'pending':
    case 'in_flight':
      return { tone: 'wait', text: 'On its way to SRP' };
    case 'refused':
      return { tone: 'error', text: `${refusalText(sync.code)}. The move was undone.` };
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

// Overview (owner, 2026-11-19): the count of named people shows beside an estimate only when it tells
// you something: when it differs from the typed number. Nothing typed and no one named shows nothing.
// How many of the nucleus's people SRP shows hosting a devotional gathering (hosts and co-hosts), taking part in
// and facilitating an activity: the "(x)" after those Overview estimates.
// residents: placed at this nucleus's Setting (only ever on a home nucleus), the "(n)" after In Conversation.
export type PeopleCounts = { devotionalHosts: number; participating: number; facilitating: number; residents: number };
export function countPeople(people: Pick<NucleusPerson, 'devotionalHost' | 'participates' | 'facilitates' | 'isResident'>[]): PeopleCounts {
  return {
    devotionalHosts: people.filter(p => p.devotionalHost !== null).length,
    participating: people.filter(p => p.participates).length,
    facilitating: people.filter(p => p.facilitates).length,
    residents: people.filter(p => p.isResident).length,
  };
}

export function namedToShow(estimate: string, named: number | undefined): number | undefined {
  if (named === undefined) return undefined;
  const typed = estimate.trim();
  if (typed === '' ? named === 0 : Number(typed) === named) return undefined;
  return named;
}

// ---- Phase A: person details ----

// A check shown as a pill: green for a positive, red for an expired background check.
export type CheckPill = { text: string; tone: 'ok' | 'danger' };

// What the details panel shows: only values SRP has. `summary` sits under the name ("Age 34 · Registered"); each phone and email is its own (tappable) line; `empty` when SRP has nothing at all.
export type DetailsView =
  | { inSrp: false }
  | { inSrp: true; summary: string | null; checks: CheckPill[]; phones: string[]; emails: string[];
      address: string | null; empty: boolean };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// SRP's ISO date as "Mar 2, 2019". Anything not YYYY-MM-DD is shown as given.
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${Number(m[3])}, ${m[1]}` : iso;
}

// Up to two letters for the avatar: the first and last word of the name.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Dates are ISO strings, so plain string comparison decides "expired".
export function detailsView(d: PersonDetails, today: string): DetailsView {
  if (!d.individual.inSrp) return { inSrp: false };
  // Only a positive shows: "not registered" and "not cleared" read like no record (owner, 2026-11-20).
  // No registration date and no valid-to date on a current check; only an expired check keeps its date
  // (owner, 2026-11-25).
  const registration = d.isRegistered ? 'Registered' : null;
  const age = d.estimatedAge === null ? null : `Age ${d.estimatedAge}`;
  const summaryParts = [age, registration].filter((x): x is string => x !== null);
  const exp = d.checks?.backgroundCheckExpiration ?? null;
  const checks: CheckPill[] = [];
  if (exp) {
    checks.push(exp < today
      ? { text: `Background check expired ${formatDate(exp)}`, tone: 'danger' }
      : { text: 'Background', tone: 'ok' });
  }
  if (d.checks?.motorVehicleClearance) checks.push({ text: 'Can drive', tone: 'ok' });
  const address = d.address?.trim() ? d.address : null;
  return {
    inSrp: true,
    summary: summaryParts.length ? summaryParts.join(' · ') : null,
    checks, phones: d.phones, emails: d.emails, address,
    empty: !summaryParts.length && !checks.length && !d.phones.length && !d.emails.length && !address,
  };
}

// One line pair per entry in the Activities section. Current entries first, then the rest, each in the server's
// newest-first order. title: "Facilitator · Junior youth group, Lloyd Farm"; detail: study item, its title and dates.
export type ActivityLine = { key: string; icon: string; title: string; detail: string };
// The one-line Activities summary shown before the list is opened (owner, 2026-11-23), counting entries:
// "🎓 Facilitating 1 · 📖 Participating 2 · 5 past". Current facilitating and participating come first.
export function activitySummary(participation: Participation[]): string {
  if (participation.length === 0) return 'No activities in SRP';
  const current = participation.filter(p => p.current);
  const facilitating = current.filter(p => p.role === 'FACILITATOR').length;
  const participating = current.length - facilitating;
  const past = participation.length - current.length;
  return [
    facilitating ? `${FACILITATES.icon} Facilitating ${facilitating}` : null,
    participating ? `${PARTICIPATES.icon} Participating ${participating}` : null,
    past ? `${past} past` : null,
  ].filter(Boolean).join(' · ');
}

// "(completed)" after the dates: a participant's own completion (personCompleted), or for a facilitator the
// item's. Nothing when unknown or not finished.
function completionNote(p: Participation): string | null {
  if (p.role === 'FACILITATOR') return p.completed ? '(completed)' : null;
  return p.personCompleted === true ? '(completed)' : p.personCompleted === false ? '(did not complete)' : null;
}
const withCompletion = (dates: string | null, p: Participation) => dates && [dates, completionNote(p)].filter(Boolean).join(' ');

export function activityLines(participation: Participation[]): ActivityLine[] {
  const ordered = [...participation.filter(p => p.current), ...participation.filter(p => !p.current)];
  return ordered.map((p, i) => {
    const facilitator = p.role === 'FACILITATOR';
    const what = [ACTIVITY_TYPES[p.activityType] ?? p.activityType, p.heldAt].filter(Boolean).join(', ');
    const dates = p.startDate || p.endDate || p.current
      ? `${p.startDate ?? '?'} → ${p.current ? 'now' : p.endDate ?? '?'}`
      : null;
    return {
      key: `${p.activityId}:${p.role}:${p.studyItem ?? ''}:${i}`,
      icon: facilitator ? FACILITATES.icon : PARTICIPATES.icon,
      title: `${facilitator ? 'Facilitator' : 'Participant'} · ${what}`,
      detail: [p.studyItem, p.studyItemTitle, withCompletion(dates, p)].filter(Boolean).join(' · '),
    };
  });
}

// ---- Hidden people ----

// "Hidden by Ben Okafor on 2026-11-23: moved away"; the hider and the reason are left out when unknown.
export function hideNote(h: PersonHide): string {
  const by = h.hiddenBy ? ` by ${individualDisplayName(h.hiddenBy)}` : '';
  return `Hidden${by} on ${h.hiddenAt.slice(0, 10)}${h.reason ? `: ${h.reason}` : ''}`;
}

// Shown when hiding someone who holds roles here: hiding keeps them. Null when they hold none.
export function hideRolesLine(name: string, roles: string[]): string | null {
  if (roles.length === 0) return null;
  const parts = sortRoles(roles).map(r => { const { label, icon } = roleLabel(r); return icon ? `${label} ${icon}` : label; });
  return `${name} is ${parts.join(', ')} here; hiding keeps the ${roles.length === 1 ? 'role' : 'roles'}.`;
}

// Layout A of the institute course view (owner, 2026-11-23): per activity type (study circles, children's
// classes, junior youth groups), one chip per study item (book, grade, text) the person has an entry for, drawn
// from participation until cluster-notebook exposes SRP's per-person course record. An activity with no study
// item gets one chip named for where it is held. Chips are in natural order.
// state (owner, 2026-11-23), first that applies: facilitating (facilitating it now), current (taking part now),
// done (completed it, or facilitated it), notCompleted (SRP says they never completed it), ended (took part,
// SRP doesn't say whether they completed). Participation.completed is the item's own completion, not the
// person's, so it never makes a chip done.
// label: SRP's short name, without the "B" on books (the row already says Study circles): "3 (G1)", "G1", "BC".
export type ChipState = 'facilitating' | 'current' | 'done' | 'notCompleted' | 'ended';
export type CourseChip = { key: string; label: string; title: string | null; state: ChipState; facilitated: boolean; lines: string[] };
export type CourseGroup = { type: string; label: string; chips: CourseChip[] };
const GROUP_ORDER = ['sc', 'cc', 'jyg'];
const GROUP_LABELS: Record<string, string> = { sc: 'Study circles', cc: "Children's classes", jyg: 'Junior youth groups' };
export function courseGroups(participation: Participation[]): CourseGroup[] {
  const groups = new Map<string, Map<string, Participation[]>>();
  for (const p of participation) {
    const key = p.studyItem ?? `activity:${p.activityId}`;
    const g = groups.get(p.activityType) ?? new Map<string, Participation[]>();
    g.set(key, [...(g.get(key) ?? []), p]);
    groups.set(p.activityType, g);
  }
  const typeRank = (t: string) => (GROUP_ORDER.includes(t) ? GROUP_ORDER.indexOf(t) : GROUP_ORDER.length);
  return [...groups.entries()]
    .sort(([a], [b]) => typeRank(a) - typeRank(b) || a.localeCompare(b))
    .map(([type, items]) => ({
      type,
      label: GROUP_LABELS[type] ?? ACTIVITY_TYPES[type] ?? type,
      chips: [...items.entries()].map(([key, entries]) => courseChip(key, entries))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    }));
}
function courseChip(key: string, entries: Participation[]): CourseChip {
  const studied = entries.filter(p => p.role === 'PARTICIPANT');
  const facilitated = entries.some(p => p.role === 'FACILITATOR');
  const state: ChipState = entries.some(p => p.role === 'FACILITATOR' && p.current) ? 'facilitating'
    : studied.some(p => p.current) ? 'current'
    : facilitated || studied.some(p => p.personCompleted === true) ? 'done'
    : studied.every(p => p.personCompleted === false) ? 'notCompleted' : 'ended';
  const first = entries[0];
  const short = entries.find(p => p.studyItemShortName)?.studyItemShortName;
  const label = short ? (first.activityType === 'sc' ? short.replace(/^B(?=\d)/, '') : short)
    : first.studyItem ?? first.heldAt ?? ACTIVITY_TYPES[first.activityType] ?? first.activityType;
  const lines = entries.map(p => {
    const dates = p.startDate || p.endDate || p.current ? `${p.startDate ?? '?'} → ${p.current ? 'now' : p.endDate ?? '?'}` : null;
    return [p.role === 'FACILITATOR' ? 'Facilitated' : 'Took part', p.heldAt, withCompletion(dates, p)]
      .filter(Boolean).join(' · ');
  });
  return {
    key, label, title: first.studyItem ? (entries.find(p => p.studyItemTitle)?.studyItemTitle ?? first.studyItem) : null,
    state, facilitated, lines,
  };
}
