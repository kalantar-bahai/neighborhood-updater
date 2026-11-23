import { describe, test, expect } from 'vitest';
import { namedToShow, editableRoles, moveTargets, syncNote, moveResultError, rolesToClear, isMoving, sortPeople, placePath, roleLabel, canEditRole, peopleFilters, filterPeople, detailsView, detailLines, activityLines, countPeople, AGE_FILTERS, peopleCountLabel, hideNote, hideRolesLine, nextRoleIds, toPersonRow, limitResults, SEARCH_LIMIT, type DetailsView, type PersonRow } from './people';
import type { Participation, AgeCategory, DevotionalHostRole, MoveContext, PermissionSet, PersonDetails, PlaceSummary } from './clusterNotebook';

const perms = (over: Partial<PermissionSet> = {}): PermissionSet => ({
  canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true,
  assignableRoles: [], createableEntityTypes: [], ...over,
});

const row = (name: string, roles: string[], isResident = false): PersonRow => ({ id: name, name, familyFirst: name, roles, isResident, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null, participates: false, facilitates: false, participation: [], hidden: false, hide: null });

describe('placePath', () => {
  test('a Setting shows cluster, locality and setting', () => {
    expect(placePath({ name: 'Parkside', type: 'SETTING', locality: 'Chapelboro', cluster: 'Chapel Hill' })).toBe('Chapel Hill › Chapelboro › Parkside');
  });
  test('a Locality shows cluster and locality', () => {
    expect(placePath({ name: 'Chapelboro', type: 'LOCALITY', locality: null, cluster: 'Chapel Hill' })).toBe('Chapel Hill › Chapelboro');
  });
  test('a Cluster shows its name', () => {
    expect(placePath({ name: 'Chapel Hill', type: 'CLUSTER', locality: null, cluster: null })).toBe('Chapel Hill');
  });
  test('no place is empty', () => {
    expect(placePath(null)).toBe('');
  });
});

describe('roleLabel', () => {
  test.each([
    ['promoter', 'Promoting', '📣'],
    ['protagonist', 'Helping Others', '👥'],
    ['accompanier', 'Accompanying', '🤝'],
    ['contact', 'Contact', '★'],
  ])('%s → %s', (role, label, icon) => {
    expect(roleLabel(role)).toEqual({ label, icon });
  });
  test('an unknown role is a plain badge with its own name', () => {
    expect(roleLabel('cso')).toEqual({ label: 'cso', icon: null });
  });
});

describe('canEditRole', () => {
  test('informal roles need only canAssignRoles', () => {
    expect(canEditRole(perms(), 'promoter')).toBe(true);
  });
  test('other roles need to be assignable', () => {
    expect(canEditRole(perms(), 'accompanier')).toBe(false);
    expect(canEditRole(perms({ assignableRoles: ['accompanier'] }), 'accompanier')).toBe(true);
  });
  test('nothing without canAssignRoles', () => {
    expect(canEditRole(perms({ canAssignRoles: false, assignableRoles: ['accompanier'] }), 'accompanier')).toBe(false);
    expect(canEditRole(perms({ canAssignRoles: false }), 'promoter')).toBe(false);
  });
});

describe('peopleFilters', () => {
  const rows = [row('Ana', ['contact']), row('Ben', ['promoter', 'cso']), row('Cy', [], true)];
  test('home nucleus: the Overview card\'s order, then contact, unknown roles last', () => {
    expect(peopleFilters(rows, true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'devotional-host', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'cso', 'hidden']);
  });
  test('non-home nucleus has no resident filter', () => {
    expect(peopleFilters(rows, false).map(f => f.key)).toEqual(['all', 'promoter', 'devotional-host', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'cso', 'hidden']);
  });
  test('every known role shows even when nobody holds it', () => {
    expect(peopleFilters([], true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'devotional-host', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'hidden']);
  });
  test('labels', () => {
    expect(peopleFilters(rows, true).slice(0, 3).map(f => f.label)).toEqual(['All', 'Resident', 'Promoting']);
  });
});

describe('filterPeople', () => {
  const rows = [row('Ana Lopez', ['promoter']), row('Ben Okafor', ['protagonist'], true)];
  test('resident keeps residents only', () => {
    expect(filterPeople(rows, 'resident', '').map(r => r.name)).toEqual(['Ben Okafor']);
  });
  test('a role keeps its holders', () => {
    expect(filterPeople(rows, 'promoter', '').map(r => r.name)).toEqual(['Ana Lopez']);
  });
  test('search is trimmed and case-insensitive', () => {
    expect(filterPeople(rows, 'all', ' ana ').map(r => r.name)).toEqual(['Ana Lopez']);
  });
});

describe('age and devotional host filters', () => {
  const r = (name: string, ageCategory: AgeCategory | null, devotionalHost: DevotionalHostRole | null = null): PersonRow => ({ ...row(name, []), ageCategory, devotionalHost });
  test('devotional host label; ages are not in the main filter', () => {
    const f = peopleFilters([r('A', 'YOUTH')], true);
    expect(f.find(x => x.key === 'devotional-host')?.label).toBe('Devotional host');
    expect(f.some(x => x.key.startsWith('age'))).toBe(false);
  });
  test('age filter always lists every category, youngest first', () => {
    expect(AGE_FILTERS).toEqual([
      { key: 'all', label: 'All ages' }, { key: 'CHILD', label: 'Child' }, { key: 'JUNIOR_YOUTH', label: 'Junior Youth' },
      { key: 'YOUTH', label: 'Youth' }, { key: 'ADULT', label: 'Adult' },
    ]);
  });
  test('devotional-host keeps hosts and co-hosts', () => {
    const rows = [r('A', null, 'HOST'), r('B', null, 'CO_HOST'), r('C', null)];
    expect(filterPeople(rows, 'devotional-host', '').map(x => x.name)).toEqual(['A', 'B']);
  });
  test('age filter keeps that category only', () => {
    const rows = [r('A', 'CHILD'), r('B', 'ADULT'), r('C', null)];
    expect(filterPeople(rows, 'all', '', 'CHILD').map(x => x.name)).toEqual(['A']);
    expect(filterPeople(rows, 'all', '', 'all').map(x => x.name)).toEqual(['A', 'B', 'C']);
  });
  test('age combines with the main filter and the search', () => {
    const rows = [{ ...r('Ana', 'ADULT', 'HOST') }, r('Ben', 'ADULT'), r('Ada', 'YOUTH', 'HOST')];
    expect(filterPeople(rows, 'devotional-host', '', 'ADULT').map(x => x.name)).toEqual(['Ana']);
    expect(filterPeople(rows, 'all', 'a', 'YOUTH').map(x => x.name)).toEqual(['Ada']);
  });
});

describe('detailsView', () => {
  const today = '2026-11-20';
  const ind = { id: '1', firstName: 'Ana', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
  const d = (over: Partial<PersonDetails> = {}): PersonDetails => ({
    individual: ind, estimatedAge: null, isRegistered: null, registrationDate: null, address: null,
    phones: [], emails: [], srpComments: null, checks: null, ...over,
  });
  const ok = (v: PersonDetails) => {
    const out = detailsView(v, today);
    if (!out.inSrp) throw new Error('expected inSrp');
    return out;
  };
  test('not in SRP', () => {
    expect(detailsView(d({ individual: { ...ind, inSrp: false } }), today)).toEqual({ inSrp: false });
  });
  test('nothing recorded', () => {
    expect(ok(d())).toEqual({ inSrp: true, age: '—', registration: '—', address: '—', phones: '—', emails: '—', comments: null, checks: null });
  });
  test('blank address shows a dash', () => {
    expect(ok(d({ address: '  ' })).address).toBe('—');
    expect(ok(d({ address: '1 Elm St' })).address).toBe('1 Elm St');
  });
  test('age', () => {
    expect(ok(d({ estimatedAge: 17 })).age).toBe('17');
  });
  test('registration', () => {
    expect(ok(d({ isRegistered: true, registrationDate: '2019-03-02' })).registration).toBe('Registered since 2019-03-02');
    expect(ok(d({ isRegistered: true })).registration).toBe('Registered');
    expect(ok(d({ isRegistered: false })).registration).toBe('—');
  });
  test('phones and emails', () => {
    const v = ok(d({ phones: ['555-0100', '555-0101'], emails: ['a@example.org', 'b@example.org'] }));
    expect(v.phones).toBe('555-0100, 555-0101');
    expect(v.emails).toBe('a@example.org, b@example.org');
  });
  test('comments', () => {
    expect(ok(d({ srpComments: '  ' })).comments).toBeNull();
    expect(ok(d({ srpComments: 'a\nb' })).comments).toBe('a\nb');
  });
  test('checks', () => {
    const c = (backgroundCheckExpiration: string | null, motorVehicleClearance: boolean | null) =>
      ok(d({ checks: { backgroundCheckExpiration, motorVehicleClearance } })).checks;
    expect(c('2027-03-01', null)).toEqual({ background: 'expires 2027-03-01', backgroundExpired: false, motorVehicle: '—' });
    expect(c('2026-11-19', true)).toEqual({ background: 'expires 2026-11-19', backgroundExpired: true, motorVehicle: 'cleared' });
    expect(c(null, false)).toEqual({ background: '—', backgroundExpired: false, motorVehicle: '—' });
  });
});

describe('detailLines', () => {
  type V = Extract<DetailsView, { inSrp: true }>;
  const v = (over: Partial<V> = {}): V => ({
    inSrp: true, age: '—', registration: '—', address: '—', phones: '—', emails: '—', comments: null, checks: null, ...over,
  });
  const text = (x: V) => detailLines(x).lines.map(l => l.map(p => p.text).join(' · '));
  test('nothing at all says so', () => {
    expect(detailLines(v())).toEqual({ lines: [[{ text: 'Nothing recorded in SRP' }]], comments: null });
  });
  test('comments alone are enough', () => {
    expect(detailLines(v({ comments: 'a\nb' }))).toEqual({ lines: [], comments: 'a\nb' });
  });
  test('age and registration keep only present parts', () => {
    expect(text(v({ age: '17', registration: 'Registered since 2019-03-02' }))).toEqual(['Age 17 · Registered since 2019-03-02']);
    expect(text(v({ age: '17' }))).toEqual(['Age 17']);
    expect(text(v({ registration: 'Registered' }))).toEqual(['Registered']);
  });
  test('address line only when present', () => {
    expect(text(v({ address: '12 Elm St', age: '17' }))).toEqual(['Age 17', '12 Elm St']);
  });
  test('phones and emails keep only present parts', () => {
    expect(text(v({ phones: '555-0100', emails: 'a@example.org' }))).toEqual(['555-0100 · a@example.org']);
    expect(text(v({ emails: 'a@example.org' }))).toEqual(['a@example.org']);
  });
  test('checks drop missing parts, flag expired, and vanish when both missing', () => {
    expect(detailLines(v({ checks: { background: 'expires 2026-11-19', backgroundExpired: true, motorVehicle: 'cleared' } })).lines)
      .toEqual([[{ text: 'Background check expires 2026-11-19', danger: true }, { text: 'Motor vehicle: cleared' }]]);
    expect(text(v({ checks: { background: '—', backgroundExpired: false, motorVehicle: 'cleared' } }))).toEqual(['Motor vehicle: cleared']);
    expect(text(v({ age: '17', checks: { background: '—', backgroundExpired: false, motorVehicle: '—' } }))).toEqual(['Age 17']);
  });
  test('lines in the sketch order', () => {
    expect(text(v({ age: '17', address: '12 Elm St', phones: '555-0100',
      checks: { background: 'expires 2027-03-01', backgroundExpired: false, motorVehicle: '—' } })))
      .toEqual(['Age 17', '12 Elm St', '555-0100', 'Background check expires 2027-03-01']);
  });
});

describe('nextRoleIds', () => {
  test('adds at the end', () => {
    expect(nextRoleIds(['a', 'b'], 'c', true, false)).toEqual(['a', 'b', 'c']);
  });
  test('adding someone already there changes nothing', () => {
    expect(nextRoleIds(['a', 'b'], 'a', true, false)).toEqual(['a', 'b']);
  });
  test('a single role is replaced', () => {
    expect(nextRoleIds(['a'], 'c', true, true)).toEqual(['c']);
  });
  test('removes', () => {
    expect(nextRoleIds(['a', 'b'], 'a', false, false)).toEqual(['b']);
  });
});

describe('toPersonRow', () => {
  const noActivity = { participates: false, facilitates: false, participation: [] };
  const noHide = { hidden: false, hide: null };
  test('activity fields pass through', () => {
    const ind = { id: '4', firstName: 'Di', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
    const participation = [act({})];
    const r = toPersonRow({ individual: ind, roles: [], isResident: false, ageCategory: null, devotionalHost: null, participates: true, facilitates: true, participation, hidden: false, hide: null });
    expect([r.participates, r.facilitates, r.participation]).toEqual([true, true, participation]);
  });
  test('uses the display name and keeps roles and residency', () => {
    const r = toPersonRow({
      individual: { id: '7', firstName: 'Ana', middleNames: null, familyName: 'Lopez', nickname: 'Annie', place: null, placeSync: null, inSrp: true },
      roles: ['promoter'], isResident: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide,
    });
    expect(r).toEqual({ id: '7', name: 'Ana Lopez (Annie)', familyFirst: 'Lopez, Ana (Annie)', roles: ['promoter'], isResident: true, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide });
  });
  test('age category and devotional host pass through', () => {
    const ind = { id: '5', firstName: 'Cy', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
    const r = toPersonRow({ individual: ind, roles: [], isResident: false, ageCategory: 'YOUTH', devotionalHost: 'CO_HOST', ...noActivity, ...noHide });
    expect(r.ageCategory).toBe('YOUTH');
    expect(r.devotionalHost).toBe('CO_HOST');
  });
  test('inSrp passes through', () => {
    const ind = { id: '9', firstName: 'Ben', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null };
    expect(toPersonRow({ individual: { ...ind, inSrp: false }, roles: [], isResident: false, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide }).inSrp).toBe(false);
  });
  test('family-first name copes with missing parts', () => {
    const ind = { id: '8', firstName: 'Ana', middleNames: 'Maria', familyName: 'Lopez', nickname: null, place: null, placeSync: null, inSrp: true };
    const person = (over: object) => toPersonRow({ individual: { ...ind, ...over }, roles: [], isResident: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide }).familyFirst;
    expect(person({})).toBe('Lopez, Ana Maria');
    expect(person({ firstName: null, middleNames: null })).toBe('Lopez');
    expect(person({ familyName: null })).toBe('Ana Maria');
  });
});

describe('limitResults', () => {
  const n = (k: number) => Array.from({ length: k }, (_, i) => i);
  test('one more than the limit means there are more', () => {
    expect(limitResults(n(SEARCH_LIMIT + 1))).toEqual({ items: n(SEARCH_LIMIT), more: true });
  });
  test('exactly the limit means no more', () => {
    expect(limitResults(n(SEARCH_LIMIT))).toEqual({ items: n(SEARCH_LIMIT), more: false });
  });
});

// people.ts is used by the PeopleCard client component. clusterNotebook.ts imports Clerk's server
// auth, so any value import from it would pull server-only code into the browser bundle.
describe('people.ts stays browser-safe', () => {
  test('imports only types from clusterNotebook', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('./people.ts', import.meta.url), 'utf8');
    const imports = src.match(/^import .* from '\.\/clusterNotebook';$/gm) ?? [];
    expect(imports.every(line => line.startsWith('import type '))).toBe(true);
  });
});

describe('sortPeople', () => {
  const p = (name: string, familyFirst: string): PersonRow => ({ ...row(name, [], true), familyFirst });
  const rows = [p('carla Diaz', 'Diaz, carla'), p('Ben Okafor', 'Okafor, Ben'), p('Zoe Adams', 'Adams, Zoe')];
  test('by first name, ignoring case', () => {
    expect(sortPeople(rows, 'first').map(r => r.name)).toEqual(['Ben Okafor', 'carla Diaz', 'Zoe Adams']);
  });
  test('by family name', () => {
    expect(sortPeople(rows, 'family').map(r => r.name)).toEqual(['Zoe Adams', 'carla Diaz', 'Ben Okafor']);
  });
});

const setting = (id: string, name: string, localityId: string, locality = 'Chapelboro'): PlaceSummary =>
  ({ id, name, type: 'SETTING', locality, cluster: 'Chapel Hill', localityId, homeNucleus: null });

describe('moveTargets', () => {
  const here = setting('S1', 'Parkside', 'LOC1');
  const ctx = (parent: MoveContext['parent'], location: PlaceSummary | null = here): MoveContext => ({ location, parent });
  test('here is this nucleus\'s Setting', () => {
    expect(moveTargets(ctx(null)).here).toEqual({ id: 'S1', name: 'Parkside', path: 'Chapel Hill › Chapelboro › Parkside' });
  });
  test('out goes to a home parent\'s Setting in the same locality', () => {
    expect(moveTargets(ctx({ inSrp: true, location: setting('S2', 'Northside', 'LOC1') })).out?.id).toBe('S2');
  });
  test('out goes to the Locality otherwise', () => {
    const toLocality = { id: 'LOC1', name: 'Chapelboro', path: 'Chapel Hill › Chapelboro' };
    expect(moveTargets(ctx({ inSrp: false, location: setting('S2', 'Northside', 'LOC1') })).out).toEqual(toLocality);
    expect(moveTargets(ctx({ inSrp: true, location: setting('S3', 'Eastside', 'LOC2', 'Carrboro') })).out).toEqual(toLocality);
    expect(moveTargets(ctx(null)).out).toEqual(toLocality);
  });
  test('no targets when this nucleus is not at a Setting', () => {
    const loc: PlaceSummary = { id: 'LOC1', name: 'Chapelboro', type: 'LOCALITY', locality: null, cluster: 'Chapel Hill', localityId: null, homeNucleus: null };
    expect(moveTargets(ctx(null, loc))).toEqual({ here: null, out: null });
    expect(moveTargets(ctx(null, null))).toEqual({ here: null, out: null });
  });
  test('no out target when the Setting has no locality id', () => {
    expect(moveTargets(ctx(null, { ...here, localityId: null })).out).toBeNull();
  });
});

describe('syncNote', () => {
  test('on its way', () => {
    expect(syncNote({ status: 'pending', code: null })).toEqual({ tone: 'wait', text: 'On its way to SRP' });
    expect(syncNote({ status: 'in_flight', code: null })).toEqual({ tone: 'wait', text: 'On its way to SRP' });
  });
  test('refusals in plain words', () => {
    expect(syncNote({ status: 'refused', code: 'FN_NOT_IN_LOCALITY' })).toEqual({ tone: 'error', text: "That neighbourhood isn't in their locality. The move was undone." });
    expect(syncNote({ status: 'refused', code: 'OUT_OF_SCOPE' })?.text).toBe("SRP doesn't let us change this person. The move was undone.");
    expect(syncNote({ status: 'refused', code: 'NOT_IN_SRP_RECORDS' })?.text).toBe("SRP doesn't have this person. The move was undone.");
    expect(syncNote({ status: 'refused', code: 'XYZ' })?.text).toBe('SRP refused the move (XYZ). The move was undone.');
  });
  test('failed', () => {
    expect(syncNote({ status: 'failed', code: 'O026' })).toEqual({ tone: 'error', text: "Couldn't reach SRP: O026" });
  });
  test('nothing to show', () => {
    expect(syncNote({ status: 'synced', code: null })).toBeNull();
    expect(syncNote({ status: 'not_in_srp', code: null })).toBeNull();
    expect(syncNote(null)).toBeNull();
  });
});

describe('moveResultError', () => {
  test('copy for each refusal', () => {
    expect(moveResultError({ individual: null, moved: false, code: 'FORBIDDEN' })).toBe("You can't move this person");
    expect(moveResultError({ individual: null, moved: false, code: 'OTHER_CLUSTER' })).toBe('This person is in another cluster');
    expect(moveResultError({ individual: null, moved: false, code: 'NOT_FOUND' })).toBe('Person not found');
  });
  test('moved or already there is fine', () => {
    expect(moveResultError({ individual: null, moved: false, code: 'ALREADY_THERE' })).toBeNull();
    expect(moveResultError({ individual: null, moved: true, code: null })).toBeNull();
  });
});

describe('rolesToClear', () => {
  const editable = (r: string) => r === 'promoter';
  test('clears the editable roles held unless kept', () => {
    expect(rolesToClear(['promoter', 'accompanier'], editable, false)).toEqual(['promoter']);
    expect(rolesToClear(['promoter', 'accompanier'], editable, true)).toEqual([]);
    expect(rolesToClear([], editable, false)).toEqual([]);
  });
});

describe('isMoving', () => {
  const r = (status: PlaceSyncStatus | null): PersonRow => ({ ...row('A', []), placeSync: status ? { status, code: null } : null });
  test('true only while a move is on its way', () => {
    expect(isMoving([r('synced'), r('in_flight')])).toBe(true);
    expect(isMoving([r('synced'), r('refused'), r(null)])).toBe(false);
  });
});
type PlaceSyncStatus = 'pending' | 'in_flight' | 'synced' | 'refused' | 'failed' | 'not_in_srp';

describe('editableRoles', () => {
  test('known and held roles the caller may change', () => {
    const rows = [row('A', ['cso']), row('B', ['promoter'])];
    expect(editableRoles(perms({ assignableRoles: ['accompanier', 'cso'] }), rows)).toEqual(['promoter', 'protagonist', 'accompanier', 'cso']);
    expect(editableRoles(perms({ canAssignRoles: false }), rows)).toEqual([]);
  });
});

describe('namedToShow', () => {
  test('shown when the named count differs from the estimate', () => {
    expect(namedToShow('12', 4)).toBe(4);
    expect(namedToShow('', 3)).toBe(3);
    expect(namedToShow('5', 0)).toBe(0);
  });
  test('hidden when they match, when nothing is recorded and no one is named, or with no list', () => {
    expect(namedToShow('4', 4)).toBeUndefined();
    expect(namedToShow(' 4 ', 4)).toBeUndefined();
    expect(namedToShow('', 0)).toBeUndefined();
    expect(namedToShow('12', undefined)).toBeUndefined();
  });
});

function act(over: Partial<Participation>): Participation {
  return { activityId: 'A1', activityType: 'jyg', heldAt: 'Lloyd Farm', role: 'PARTICIPANT', studyItem: null, studyItemTitle: null,
    startDate: '2025-09-01', endDate: null, completed: false, current: true, ...over };
}

describe('activity filters', () => {
  const r = (name: string, participates: boolean, facilitates: boolean): PersonRow => ({ ...row(name, []), participates, facilitates });
  const rows = [r('A', true, false), r('B', false, true), r('C', true, true), r('D', false, false)];
  test('follow devotional host, always listed', () => {
    expect(peopleFilters([], false).map(f => f.key).slice(2, 5)).toEqual(['devotional-host', 'participating', 'facilitating']);
    expect(peopleFilters([], false).find(f => f.key === 'facilitating')?.label).toBe('Facilitating');
  });
  test('keep those taking part or facilitating', () => {
    expect(filterPeople(rows, 'participating', '').map(x => x.name)).toEqual(['A', 'C']);
    expect(filterPeople(rows, 'facilitating', '').map(x => x.name)).toEqual(['B', 'C']);
  });
});

describe('activityLines', () => {
  test('a current facilitator with no study item', () => {
    expect(activityLines([act({ role: 'FACILITATOR' })])).toEqual([
      { key: 'A1:FACILITATOR::0', icon: '🎓', title: 'Facilitator · Junior youth group, Lloyd Farm', detail: '2025-09-01 → now' },
    ]);
  });
  test('a completed study item shows book, title and dates', () => {
    const [l] = activityLines([act({ activityType: 'sc', heldAt: 'Carrboro', studyItem: 'Book 3', studyItemTitle: 'Teaching Children\'s Classes, Grade 1',
      startDate: '2024-01-10', endDate: '2024-06-02', completed: true, current: false })]);
    expect(l.icon).toBe('📖');
    expect(l.title).toBe('Participant · Study circle, Carrboro');
    expect(l.detail).toBe('Book 3 · Teaching Children\'s Classes, Grade 1 · 2024-01-10 → 2024-06-02 (completed)');
  });
  test('children\'s class label, unknown type code as given, missing place and dates', () => {
    expect(activityLines([act({ activityType: 'cc', heldAt: null })])[0].title).toBe('Participant · Children\'s class');
    expect(activityLines([act({ activityType: 'xx' })])[0].title).toBe('Participant · xx, Lloyd Farm');
    expect(activityLines([act({ startDate: null, endDate: null, current: false })])[0].detail).toBe('');
    expect(activityLines([act({ startDate: null, endDate: '2024-06-02', current: false })])[0].detail).toBe('? → 2024-06-02');
  });
  test('current first, otherwise the server order', () => {
    const lines = activityLines([act({ activityId: 'P1', current: false }), act({ activityId: 'C1' }), act({ activityId: 'P2', current: false })]);
    expect(lines.map(l => l.key.split(':')[0])).toEqual(['C1', 'P1', 'P2']);
  });
  test('nothing in, nothing out', () => {
    expect(activityLines([])).toEqual([]);
  });
});

describe('countPeople', () => {
  test('hosts and co-hosts, participants, facilitators', () => {
    expect(countPeople([
      { devotionalHost: 'HOST', participates: true, facilitates: false },
      { devotionalHost: 'CO_HOST', participates: false, facilitates: true },
      { devotionalHost: null, participates: true, facilitates: true },
    ])).toEqual({ devotionalHosts: 2, participating: 2, facilitating: 2 });
    expect(countPeople([])).toEqual({ devotionalHosts: 0, participating: 0, facilitating: 0 });
  });
});

describe('peopleCountLabel', () => {
  test('whole list, narrowed list, one person', () => {
    expect(peopleCountLabel(85, 85)).toBe('85 people');
    expect(peopleCountLabel(12, 85)).toBe('12 of 85 people');
    expect(peopleCountLabel(0, 85)).toBe('0 of 85 people');
    expect(peopleCountLabel(1, 1)).toBe('1 person');
    expect(peopleCountLabel(0, 1)).toBe('0 of 1 person');
  });
});

describe('hidden people', () => {
  const hid = (name: string, age: AgeCategory | null = null): PersonRow => ({ ...row(name, []), ageCategory: age, hidden: true, hide: { hiddenAt: '2026-11-23T10:00:00Z', hiddenBy: null, reason: null } });
  const rows = [row('Ana Lopez', []), hid('Ben Okafor', 'ADULT'), hid('Cy Adams', 'YOUTH')];
  test('Hidden is the last filter, always listed', () => {
    expect(peopleFilters([], false).at(-1)).toEqual({ key: 'hidden', label: 'Hidden' });
    expect(peopleFilters(rows, true).at(-1)).toEqual({ key: 'hidden', label: 'Hidden' });
  });
  test('every other filter drops hidden people', () => {
    expect(filterPeople(rows, 'all', '').map(r => r.name)).toEqual(['Ana Lopez']);
  });
  test('hidden keeps only hidden, with age and search', () => {
    expect(filterPeople(rows, 'hidden', '').map(r => r.name)).toEqual(['Ben Okafor', 'Cy Adams']);
    expect(filterPeople(rows, 'hidden', '', 'YOUTH').map(r => r.name)).toEqual(['Cy Adams']);
    expect(filterPeople(rows, 'hidden', 'ben').map(r => r.name)).toEqual(['Ben Okafor']);
  });
  test('peopleCountLabel for hidden', () => {
    expect(peopleCountLabel(3, 3, true)).toBe('3 hidden');
    expect(peopleCountLabel(1, 3, true)).toBe('1 of 3 hidden');
  });
  test('hideNote', () => {
    const by = { firstName: 'Ben', middleNames: null, familyName: 'Okafor', nickname: null, place: null, placeSync: null, inSrp: true } as never;
    expect(hideNote({ hiddenAt: '2026-11-23T10:00:00Z', hiddenBy: by, reason: 'moved away' })).toBe('Hidden by Ben Okafor on 2026-11-23: moved away');
    expect(hideNote({ hiddenAt: '2026-11-23T10:00:00Z', hiddenBy: by, reason: null })).toBe('Hidden by Ben Okafor on 2026-11-23');
    expect(hideNote({ hiddenAt: '2026-11-23T10:00:00Z', hiddenBy: null, reason: null })).toBe('Hidden on 2026-11-23');
  });
  test('hideRolesLine', () => {
    expect(hideRolesLine('Ana Lopez', ['promoter'])).toBe('Ana Lopez is Promoting 📣 here; hiding keeps the role.');
    expect(hideRolesLine('Ana Lopez', ['contact', 'promoter'])).toBe('Ana Lopez is Promoting 📣, Contact ★ here; hiding keeps the roles.');
    expect(hideRolesLine('Ana Lopez', [])).toBeNull();
  });
});
