import { describe, test, expect } from 'vitest';
import { namedToShow, editableRoles, moveTargets, editorRoleList, refusalText, srpAtNote, syncNote, moveResultError, rolesToClear, isMoving, sortPeople, placePath, roleLabel, canEditRole, peopleFilters, filterPeople, detailsView, formatDate, initials, activityLines, activitySummary, courseGroups, groupCountsNote, AGE_FILTERS, peopleCountLabel, hideNote, hideRolesLine, nextRoleIds, toPersonRow, limitResults, toFoundIndividual, SEARCH_LIMIT, type PersonRow } from './people';
import type { Participation, AgeCategory, DevotionalHostRole, MoveContext, PermissionSet, PersonDetails, PlaceSummary } from './clusterNotebook';

const perms = (over: Partial<PermissionSet> = {}): PermissionSet => ({
  canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true,
  assignableRoles: [], createableEntityTypes: [], ...over,
});

const row = (name: string, roles: string[], isResident = false): PersonRow => ({ id: name, name, familyFirst: name, roles, isResident, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null, participates: false, inSpaces: false, facilitates: false, participation: [], hidden: false, hide: null });

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
    expect(peopleFilters(rows, true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'devotional-host', 'educational', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'cso', 'hidden']);
  });
  test('non-home nucleus has no resident filter', () => {
    expect(peopleFilters(rows, false).map(f => f.key)).toEqual(['all', 'member', 'promoter', 'devotional-host', 'educational', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'cso', 'hidden']);
  });
  test('member filter only off a home nucleus', () => {
    expect(peopleFilters(rows, false)[1]).toEqual({ key: 'member', label: 'Member' });
    expect(peopleFilters(rows, false).some(f => f.key === 'resident')).toBe(false);
    expect(peopleFilters(rows, true).some(f => f.key === 'member')).toBe(false);
  });
  test('every known role shows even when nobody holds it', () => {
    expect(peopleFilters([], true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'devotional-host', 'educational', 'participating', 'facilitating', 'protagonist', 'accompanier', 'contact', 'hidden']);
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

describe('formatDate', () => {
  test('ISO date reads as a short month', () => {
    expect(formatDate('2019-03-02')).toBe('Mar 2, 2019');
    expect(formatDate('2026-12-31')).toBe('Dec 31, 2026');
  });
  test('anything else is shown as given', () => {
    expect(formatDate('2019-13-02')).toBe('2019-13-02');
    expect(formatDate('soon')).toBe('soon');
  });
});

describe('initials', () => {
  test('first and last word', () => {
    expect(initials('Jordan Rivers')).toBe('JR');
    expect(initials('ana maria de la cruz')).toBe('AC');
    expect(initials('  Ana ')).toBe('A');
    expect(initials('')).toBe('?');
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
    expect(ok(d())).toEqual({ inSrp: true, summary: null, checks: [], phones: [], emails: [], address: null, empty: true });
  });
  test('summary keeps only present parts', () => {
    expect(ok(d({ estimatedAge: 17, isRegistered: true, registrationDate: '2019-03-02' })).summary).toBe('Age 17 · Registered');
    expect(ok(d({ estimatedAge: 17 })).summary).toBe('Age 17');
    expect(ok(d({ isRegistered: true })).summary).toBe('Registered');
    // Only a positive shows (owner, 2026-11-20).
    expect(ok(d({ isRegistered: false, registrationDate: '2019-03-02' })).summary).toBeNull();
  });
  test('contact: each phone and email on its own, blank address dropped', () => {
    const v = ok(d({ phones: ['555-0100', '555-0101'], emails: ['a@example.org'], address: '  ' }));
    expect(v).toMatchObject({ phones: ['555-0100', '555-0101'], emails: ['a@example.org'], address: null, empty: false });
    expect(ok(d({ address: '1 Elm St' })).address).toBe('1 Elm St');
  });
  test('SRP comments are not shown (owner, 2026-11-25)', () => {
    expect(ok(d({ srpComments: 'a' })).empty).toBe(true);
  });
  test('checks become pills: only positives and expiry', () => {
    const c = (backgroundCheckExpiration: string | null, motorVehicleClearance: boolean | null) =>
      ok(d({ checks: { backgroundCheckExpiration, motorVehicleClearance } })).checks;
    expect(c('2027-03-01', null)).toEqual([{ text: 'Background', tone: 'ok' }]);
    expect(c('2026-11-19', true)).toEqual([
      { text: 'Background check expired Nov 19, 2026', tone: 'danger' },
      { text: 'Can drive', tone: 'ok' },
    ]);
    expect(c(null, false)).toEqual([]);
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
  const noActivity = { participates: false, inSpaces: false, facilitates: false, participation: [] };
  const noHide = { hidden: false, hide: null };
  const noAddr = { address: null };
  test('activity fields pass through', () => {
    const ind = { id: '4', firstName: 'Di', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
    const participation = [act({})];
    const r = toPersonRow({ individual: ind, roles: [], isResident: false, ageCategory: null, devotionalHost: null, participates: true, inSpaces: true, facilitates: true, participation, hidden: false, hide: null, address: null });
    expect([r.participates, r.inSpaces, r.facilitates, r.participation]).toEqual([true, true, true, participation]);
  });
  test('uses the display name and keeps roles and residency', () => {
    const r = toPersonRow({
      individual: { id: '7', firstName: 'Ana', middleNames: null, familyName: 'Lopez', nickname: 'Annie', place: null, placeSync: null, inSrp: true },
      roles: ['promoter'], isResident: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide, ...noAddr,
    });
    expect(r).toEqual({ id: '7', name: 'Ana Lopez (Annie)', familyFirst: 'Lopez, Ana (Annie)', roles: ['promoter'], isResident: true, place: null, placeSync: null, inSrp: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide });
  });
  test('age category and devotional host pass through', () => {
    const ind = { id: '5', firstName: 'Cy', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null, inSrp: true };
    const r = toPersonRow({ individual: ind, roles: [], isResident: false, ageCategory: 'YOUTH', devotionalHost: 'CO_HOST', ...noActivity, ...noHide, ...noAddr });
    expect(r.ageCategory).toBe('YOUTH');
    expect(r.devotionalHost).toBe('CO_HOST');
  });
  test('inSrp passes through', () => {
    const ind = { id: '9', firstName: 'Ben', middleNames: null, familyName: null, nickname: null, place: null, placeSync: null };
    expect(toPersonRow({ individual: { ...ind, inSrp: false }, roles: [], isResident: false, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide, ...noAddr }).inSrp).toBe(false);
  });
  test('family-first name copes with missing parts', () => {
    const ind = { id: '8', firstName: 'Ana', middleNames: 'Maria', familyName: 'Lopez', nickname: null, place: null, placeSync: null, inSrp: true };
    const person = (over: object) => toPersonRow({ individual: { ...ind, ...over }, roles: [], isResident: true, ageCategory: null, devotionalHost: null, ...noActivity, ...noHide, ...noAddr }).familyFirst;
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
  const ctx = (parent: MoveContext['parent'], location: PlaceSummary | null = here): MoveContext => ({ location, parent, isHome: true, inSrp: true, srpPlace: null });
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
    expect(moveTargets(ctx(null, loc))).toEqual({ here: null, out: null, srpAt: null });
    expect(moveTargets(ctx(null, null))).toEqual({ here: null, out: null, srpAt: null });
  });
  test('no out target when the Setting has no locality id', () => {
    expect(moveTargets(ctx(null, { ...here, localityId: null })).out).toBeNull();
  });
  test('a non-home nucleus has no targets', () => {
    expect(moveTargets({ ...ctx(null), isHome: false })).toEqual({ here: null, out: null, srpAt: null });
  });
  test('an SRP home has no srpAt', () => {
    expect(moveTargets(ctx(null)).srpAt).toBeNull();
  });
  test('a home not in SRP moves out to the SRP neighbourhood it stands in', () => {
    const carrboro: PlaceSummary = { id: 'loc-c', name: 'Carrboro', type: 'LOCALITY', locality: null, cluster: 'Chapel Hill', localityId: null, homeNucleus: null };
    const r = moveTargets({ ...ctx(null), inSrp: false, srpPlace: carrboro });
    expect(r.here?.id).toBe('S1');
    expect(r.out?.id).toBe('loc-c');
    expect(r.srpAt).toBe('Carrboro');
  });
});

describe('editorRoleList', () => {
  test('a home nucleus does not offer member', () => {
    expect(editorRoleList(true, [])).toEqual(['promoter', 'protagonist', 'accompanier', 'contact']);
  });
  test('a non-home nucleus offers member first', () => {
    expect(editorRoleList(false, [])).toEqual(['member', 'promoter', 'protagonist', 'accompanier', 'contact']);
  });
  test('held roles stay, others after known ones', () => {
    expect(editorRoleList(false, ['contact', 'cso'])).toEqual(['member', 'promoter', 'protagonist', 'accompanier', 'contact', 'cso']);
  });
});

describe('member role', () => {
  test('label', () => {
    expect(roleLabel('member')).toEqual({ label: 'Member', icon: '👤' });
  });
  test('srpAtNote says where SRP has them until the nucleus is sent', () => {
    expect(srpAtNote('Maple Grove')).toBe("In SRP they'll be at Maple Grove until this nucleus is sent to SRP.");
    expect(srpAtNote(null)).toBeNull();
    expect(srpAtNote('')).toBeNull();
  });

  test('refusalText gives the reason without the undone ending', () => {
    expect(refusalText('HOUSEHOLD_MOVES_TOGETHER')).toBe('Households move together');
    expect(syncNote({ status: 'refused', code: 'HOUSEHOLD_MOVES_TOGETHER' })?.text).toBe('Households move together. The move was undone.');
    expect(refusalText(null)).toBe('no reason given');
    expect(refusalText('WEIRD_CODE')).toBe('WEIRD_CODE');
    expect(syncNote({ status: 'refused', code: null })?.text).toBe('SRP refused the move (no reason given). The move was undone.');
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
    expect(editableRoles(perms({ assignableRoles: ['accompanier', 'cso'] }), rows)).toEqual(['member', 'promoter', 'protagonist', 'accompanier', 'cso']);
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
    startDate: '2025-09-01', endDate: null, completed: false, current: true, studyItemShortName: null, personCompleted: null, ...over };
}

describe('activity filters', () => {
  const r = (name: string, participates: boolean, facilitates: boolean): PersonRow => ({ ...row(name, []), participates, facilitates });
  const rows = [r('A', true, false), r('B', false, true), r('C', true, true), r('D', false, false)];
  test('follow devotional host, always listed', () => {
    expect(peopleFilters([], false).map(f => f.key).slice(3, 7)).toEqual(['devotional-host', 'educational', 'participating', 'facilitating']);
    expect(peopleFilters([], false).find(f => f.key === 'facilitating')?.label).toBe('Facilitating');
    expect(peopleFilters([], false).find(f => f.key === 'educational')?.label).toBe('In educational activities');
    expect(peopleFilters([], false).find(f => f.key === 'participating')?.label).toBe('Participating');
  });
  test('keep those taking part or facilitating', () => {
    expect(filterPeople(rows, 'educational', '').map(x => x.name)).toEqual(['A', 'C']);
    expect(filterPeople(rows, 'facilitating', '').map(x => x.name)).toEqual(['B', 'C']);
  });
});

describe('participating filter', () => {
  const r = (name: string, inSpaces: boolean, roles: string[] = []): PersonRow => ({ ...row(name, roles), inSpaces });
  test('keeps people named in a space, with or without roles', () => {
    const rows = [r('A', true), r('B', false), r('C', true, ['promoter'])];
    expect(filterPeople(rows, 'participating', '').map(x => x.name)).toEqual(['A', 'C']);
  });
});

describe('activityLines', () => {
  test('a current facilitator with no study item', () => {
    expect(activityLines([act({ role: 'FACILITATOR' })])).toEqual([
      { key: 'A1:FACILITATOR::0', icon: '🎓', title: 'Facilitator · Junior youth group, Lloyd Farm', detail: '2025-09-01 → now' },
    ]);
  });
  test('a study item the person completed shows book, title and dates', () => {
    const [l] = activityLines([act({ activityType: 'sc', heldAt: 'Carrboro', studyItem: 'Book 3', studyItemTitle: 'Teaching Children\'s Classes, Grade 1',
      startDate: '2024-01-10', endDate: '2024-06-02', completed: true, current: false, personCompleted: true })]);
    expect(l.icon).toBe('📖');
    expect(l.title).toBe('Participant · Study circle, Carrboro');
    expect(l.detail).toBe('Book 3 · Teaching Children\'s Classes, Grade 1 · 2024-01-10 → 2024-06-02 (completed)');
  });
  test('a participant\'s completion is their own; a facilitator\'s is the item\'s', () => {
    const detail = (over: Partial<Participation>) => activityLines([act({ startDate: '2024-01-10', endDate: '2024-06-02', current: false, ...over })])[0].detail;
    expect(detail({ completed: true, personCompleted: false })).toBe('2024-01-10 → 2024-06-02 (did not complete)');
    expect(detail({ completed: true, personCompleted: null })).toBe('2024-01-10 → 2024-06-02');
    expect(detail({ role: 'FACILITATOR', completed: true })).toBe('2024-01-10 → 2024-06-02 (completed)');
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

describe('activitySummary', () => {
  test('current facilitating and participating, then past', () => {
    expect(activitySummary([
      act({ role: 'FACILITATOR' }), act({}), act({}),
      act({ current: false }), act({ role: 'FACILITATOR', current: false }),
    ])).toBe('🎓 Facilitating 1 · 📖 Participating 2 · 2 past');
  });
  test('only the parts that are there', () => {
    expect(activitySummary([act({ current: false })])).toBe('1 past');
    expect(activitySummary([act({ role: 'FACILITATOR' })])).toBe('🎓 Facilitating 1');
  });
  test('none', () => {
    expect(activitySummary([])).toBe('No activities in SRP');
  });
});

describe('courseGroups', () => {
  const sc = (over: Partial<Participation>) => act({ activityType: 'sc', heldAt: 'Carrboro', ...over });
  test('grouped study circles, children\'s classes, junior youth groups; chips in natural order', () => {
    const g = courseGroups([
      act({ activityType: 'jyg', studyItem: 'Breezes of Confirmation', studyItemShortName: 'BC' }),
      sc({ studyItem: 'Book 10', studyItemShortName: 'B10' }), sc({ studyItem: 'Book 2', studyItemShortName: 'B2' }),
      sc({ studyItem: 'Book 3 (G1)', studyItemShortName: 'B3 (G1)' }),
      act({ activityType: 'cc', studyItem: 'Grade 2', studyItemShortName: 'G2' }), act({ activityType: 'cc', studyItem: 'Grade 1', studyItemShortName: 'G1' }),
    ]);
    expect(g.map(x => x.label)).toEqual(['Study circles', "Children's classes", 'Junior youth groups']);
    expect(g[0].chips.map(c => c.label)).toEqual(['2', '3 (G1)', '10']);
    expect(g[1].chips.map(c => c.label)).toEqual(['G1', 'G2']);
  });
  test('labels use SRP\'s short name, without the B on books', () => {
    const g = courseGroups([
      sc({ studyItem: 'Book 3 (G1)', studyItemShortName: 'B3 (G1)' }), sc({ studyItem: 'Book 10', studyItemShortName: 'B10' }),
      act({ activityType: 'cc', studyItem: 'Grade 1', studyItemShortName: 'G1' }),
      act({ activityType: 'jyg', studyItem: 'Breezes of Confirmation', studyItemShortName: 'BC' }),
    ]);
    expect(g.map(x => x.chips.map(c => [c.label, c.title]))).toEqual([
      [['3 (G1)', 'Book 3 (G1)'], ['10', 'Book 10']], [['G1', 'Grade 1']], [['BC', 'Breezes of Confirmation']],
    ]);
  });
  test('an activity with no study item is one chip named for where it is held', () => {
    const [g] = courseGroups([act({ activityType: 'jyg', studyItem: null, activityId: 'J1', heldAt: 'Lloyd Farm' })]);
    expect(g.chips.map(c => [c.label, c.title])).toEqual([['Lloyd Farm', null]]);
  });
  test('states: facilitating now, in it now, done, ended, not completed; the item\'s completed flag is not the person\'s', () => {
    const state = (ps: Participation[]) => courseGroups(ps)[0].chips[0].state;
    const past = { studyItem: 'Book 1', current: false };
    expect(state([sc({ ...past, role: 'FACILITATOR' }), sc({ studyItem: 'Book 1', role: 'FACILITATOR' })])).toBe('facilitating');
    expect(state([sc({ studyItem: 'Book 1', role: 'FACILITATOR' }), sc({ studyItem: 'Book 1' })])).toBe('facilitating');
    expect(state([sc({ ...past, personCompleted: true }), sc({ studyItem: 'Book 1' })])).toBe('current');
    expect(state([sc({ ...past, personCompleted: true })])).toBe('done');
    expect(state([sc({ ...past, personCompleted: false }), sc({ ...past, personCompleted: true })])).toBe('done');
    expect(state([sc({ ...past, role: 'FACILITATOR', completed: true })])).toBe('done');
    expect(state([sc({ ...past, personCompleted: false }), sc({ ...past, role: 'FACILITATOR' })])).toBe('done');
    expect(state([sc({ ...past, personCompleted: false })])).toBe('notCompleted');
    expect(state([sc({ ...past, personCompleted: false }), sc({ ...past, personCompleted: null })])).toBe('ended');
    expect(state([sc({ ...past, completed: true })])).toBe('ended');
  });
  test('title and lines for the tap-open detail', () => {
    const [c] = courseGroups([
      sc({ studyItem: 'Book 3 (G1)', studyItemTitle: "Teaching Children's Classes, Grade 1", startDate: '2024-01-10', endDate: '2024-06-02', completed: true, current: false, personCompleted: true }),
      sc({ studyItem: 'Book 3 (G1)', role: 'FACILITATOR', startDate: '2025-09-01' }),
    ])[0].chips;
    expect(c.title).toBe("Teaching Children's Classes, Grade 1");
    expect(c.lines).toEqual(['Took part · Carrboro · 2024-01-10 → 2024-06-02 (completed)', 'Facilitated · Carrboro · 2025-09-01 → now']);
  });
});

describe('groupCountsNote', () => {
  test('nothing when the counts cover just this nucleus', () => {
    expect(groupCountsNote(1)).toBeNull();
    expect(groupCountsNote(0)).toBeNull();
    expect(groupCountsNote(undefined)).toBeNull();
  });
  test('names how many neighborhoods below are included', () => {
    expect(groupCountsNote(2)).toBe('Counts in parentheses include the 1 neighborhood under this one.');
    expect(groupCountsNote(4)).toBe('Counts in parentheses include the 3 neighborhoods under this one.');
  });
});

describe('toFoundIndividual', () => {
  const base = { id: 'i1', firstName: 'Ana', familyName: 'Lopez', middleNames: null, nickname: null, placeSync: null, inSrp: false };
  test('passes household through', () => {
    const household = { id: 'h1' } as never;
    expect(toFoundIndividual({ ...base, place: null, household }).household).toBe(household);
  });
  test('household is null when absent', () => {
    expect(toFoundIndividual({ ...base, place: null }).household).toBeNull();
  });
  test('maps name and place, with nulls when unplaced', () => {
    expect(toFoundIndividual({ ...base, place: null })).toEqual({
      id: 'i1', name: 'Ana Lopez', place: '', homeNucleus: null, placeId: null, household: null,
    });
  });
});
