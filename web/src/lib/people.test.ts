import { describe, test, expect } from 'vitest';
import { sortPeople, placePath, roleLabel, canEditRole, peopleFilters, filterPeople, nextRoleIds, toPersonRow, limitResults, SEARCH_LIMIT, type PersonRow } from './people';
import type { PermissionSet } from './clusterNotebook';

const perms = (over: Partial<PermissionSet> = {}): PermissionSet => ({
  canRead: true, canWrite: true, canChangeIdentity: false, canDelete: false, canAssignRoles: true,
  assignableRoles: [], createableEntityTypes: [], ...over,
});

const row = (name: string, roles: string[], isResident = false): PersonRow => ({ id: name, name, familyFirst: name, roles, isResident });

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
    expect(peopleFilters(rows, true).map(f => f.key)).toEqual(['all', 'resident', 'promoter', 'contact', 'cso']);
  });
  test('non-home nucleus has no resident filter', () => {
    expect(peopleFilters(rows, false).map(f => f.key)).toEqual(['all', 'promoter', 'contact', 'cso']);
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
      individual: { id: '7', firstName: 'Ana', middleNames: null, familyName: 'Lopez', nickname: 'Annie', place: null, placeSync: null },
      roles: ['promoter'], isResident: true,
    });
    expect(r).toEqual({ id: '7', name: 'Ana Lopez (Annie)', familyFirst: 'Lopez, Ana (Annie)', roles: ['promoter'], isResident: true });
  });
  test('family-first name copes with missing parts', () => {
    const ind = { id: '8', firstName: 'Ana', middleNames: 'Maria', familyName: 'Lopez', nickname: null, place: null, placeSync: null };
    const person = (over: object) => toPersonRow({ individual: { ...ind, ...over }, roles: [], isResident: true }).familyFirst;
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
  const p = (name: string, familyFirst: string): PersonRow => ({ id: name, name, familyFirst, roles: [], isResident: true });
  const rows = [p('carla Diaz', 'Diaz, carla'), p('Ben Okafor', 'Okafor, Ben'), p('Zoe Adams', 'Adams, Zoe')];
  test('by first name, ignoring case', () => {
    expect(sortPeople(rows, 'first').map(r => r.name)).toEqual(['Ben Okafor', 'carla Diaz', 'Zoe Adams']);
  });
  test('by family name', () => {
    expect(sortPeople(rows, 'family').map(r => r.name)).toEqual(['Zoe Adams', 'carla Diaz', 'Ben Okafor']);
  });
});
