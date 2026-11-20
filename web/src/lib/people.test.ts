import { describe, test, expect } from 'vitest';
import { namedToShow, editableRoles, moveTargets, syncNote, moveResultError, rolesToClear, isMoving, sortPeople, placePath, roleLabel, canEditRole, peopleFilters, filterPeople, detailsView, nextRoleIds, toPersonRow, limitResults, SEARCH_LIMIT, type PersonRow } from './people';
import type { AgeCategory, DevotionalHostRole, MoveContext, PermissionSet, PersonDetails, PlaceSummary } from './clusterNotebook';

const perms = (over: Partial<PermissionSet> = {}): PermissionSet => ({
  canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true,
  assignableRoles: [], createableEntityTypes: [], ...over,
});

const row = (name: string, roles: string[], isResident = false): PersonRow => ({ id: name, name, familyFirst: name, roles, isResident, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null });

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
  test('home nucleus: all, resident, then roles in label order, unknown last', () => {
    expect(peopleFilters(rows, true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'protagonist', 'accompanier', 'contact', 'cso', 'devotional-host']);
  });
  test('non-home nucleus has no resident filter', () => {
    expect(peopleFilters(rows, false).map(f => f.key)).toEqual(['all', 'promoter', 'protagonist', 'accompanier', 'contact', 'cso', 'devotional-host']);
  });
  test('every known role shows even when nobody holds it', () => {
    expect(peopleFilters([], true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'protagonist', 'accompanier', 'contact', 'devotional-host']);
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
  test('keys and labels', () => {
    const f = peopleFilters([r('A', 'YOUTH'), r('B', 'ADULT')], true);
    expect(f.map(x => x.key)).toEqual(['all', 'resident', 'promoter', 'protagonist', 'accompanier', 'contact', 'devotional-host', 'age:YOUTH', 'age:ADULT']);
    expect(f.find(x => x.key === 'devotional-host')?.label).toBe('Devotional host');
    expect(f.find(x => x.key === 'age:YOUTH')?.label).toBe('Youth');
  });
  test('devotional-host keeps hosts and co-hosts', () => {
    const rows = [r('A', null, 'HOST'), r('B', null, 'CO_HOST'), r('C', null)];
    expect(filterPeople(rows, 'devotional-host', '').map(x => x.name)).toEqual(['A', 'B']);
  });
  test('age filter keeps that category only', () => {
    const rows = [r('A', 'CHILD'), r('B', 'ADULT'), r('C', null)];
    expect(filterPeople(rows, 'age:CHILD', '').map(x => x.name)).toEqual(['A']);
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
    expect(ok(d({ isRegistered: false })).registration).toBe('Not registered');
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
    expect(c(null, false)).toEqual({ background: '—', backgroundExpired: false, motorVehicle: 'not cleared' });
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
  test('uses the display name and keeps roles and residency', () => {
    const r = toPersonRow({
      individual: { id: '7', firstName: 'Ana', middleNames: null, familyName: 'Lopez', nickname: 'Annie', place: null, placeSync: null, inSrp: true },
      roles: ['promoter'], isResident: true, ageCategory: null, devotionalHost: null,
    });
    expect(r).toEqual({ id: '7', name: 'Ana Lopez (Annie)', familyFirst: 'Lopez, Ana (Annie)', roles: ['promoter'], isResident: true, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null });
  });
  test('age category and devotional host pass through', () => {
    const ind = { id: '5', firstName: 'Cy', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
    const r = toPersonRow({ individual: ind, roles: [], isResident: false, ageCategory: 'YOUTH', devotionalHost: 'CO_HOST' });
    expect(r.ageCategory).toBe('YOUTH');
    expect(r.devotionalHost).toBe('CO_HOST');
  });
  test('inSrp passes through', () => {
    const ind = { id: '9', firstName: 'Ben', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null };
    expect(toPersonRow({ individual: { ...ind, inSrp: false }, roles: [], isResident: false, ageCategory: null, devotionalHost: null }).inSrp).toBe(false);
  });
  test('family-first name copes with missing parts', () => {
    const ind = { id: '8', firstName: 'Ana', middleNames: 'Maria', familyName: 'Lopez', nickname: null, place: null, placeSync: null, inSrp: true };
    const person = (over: object) => toPersonRow({ individual: { ...ind, ...over }, roles: [], isResident: true, ageCategory: null, devotionalHost: null }).familyFirst;
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
  const p = (name: string, familyFirst: string): PersonRow => ({ id: name, name, familyFirst, roles: [], isResident: true, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null });
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
