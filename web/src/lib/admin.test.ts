import { describe, test, expect, vi } from 'vitest';
import { adminPersonLine, roleHoldingLine, endRoleConfirm, placeTree, moveTargets, isAdminOf, lookupIsAdmin } from './admin';
import type { AdminPerson, AdminPlace, RoleHolding } from './clusterNotebook';

const person = (ageCategory: AdminPerson['ageCategory'], placePath: string[]): AdminPerson => ({
  individual: { id: 'i1', firstName: 'Ana', familyName: 'Lopez', middleNames: null, nickname: null, place: null, placeSync: null, inSrp: true },
  ageCategory, placePath, hasAccess: false,
});
const holding = (role: string, name: string | null): RoleHolding => ({
  id: 'r1', role, start: null, entity: name === null ? null : { id: 'e1', name, type: 'cluster' },
});
const place = (id: string, name: string, type: AdminPlace['type'], parentId: string | null): AdminPlace => ({ id, name, type, parentId, parentName: null });
const places = [
  place('c', 'NC-215 Triangle', 'cluster', null),
  place('l1', 'Chapel Hill', 'locality', 'c'),
  place('s1', 'Northside', 'setting', 'l1'),
  place('l2', 'Carrboro', 'locality', 'c'),
  place('n1', 'Elm Nucleus', 'nucleus', 's1'),
];

describe('adminPersonLine', () => {
  test('name, age and place path', () => {
    expect(adminPersonLine(person('ADULT', ['NC-215 Triangle', 'Chapel Hill', 'Northside']))).toBe('Ana Lopez · Adult · NC-215 Triangle › Chapel Hill › Northside');
  });
  test('skips a missing age', () => {
    expect(adminPersonLine(person(null, ['NC-215 Triangle', 'Carrboro']))).toBe('Ana Lopez · NC-215 Triangle › Carrboro');
  });
  test('skips an empty place path', () => {
    expect(adminPersonLine(person('YOUTH', []))).toBe('Ana Lopez · Youth');
  });
});

describe('roleHoldingLine', () => {
  test('role without an icon', () => expect(roleHoldingLine(holding('CSO', 'NC-215 Triangle'))).toBe('CSO · NC-215 Triangle'));
  test('role with an icon', () => expect(roleHoldingLine(holding('contact', 'Northside'))).toBe('Contact ★ · Northside'));
  test('Administrator has no entity', () => expect(roleHoldingLine(holding('Administrator', null))).toBe('Administrator'));
});

describe('endRoleConfirm', () => {
  test('with an entity', () => expect(endRoleConfirm('Ana Lopez', holding('CSO', 'NC-215 Triangle'))).toBe("End Ana Lopez's CSO role at NC-215 Triangle?"));
  test('Administrator', () => expect(endRoleConfirm('Ana Lopez', holding('Administrator', null))).toBe("End Ana Lopez's Administrator role?"));
});

describe('placeTree', () => {
  test('depth from the parent chain', () => {
    expect(placeTree(places, '').map(t => [t.place.id, t.depth])).toEqual([['c', 0], ['l1', 1], ['s1', 2], ['l2', 1], ['n1', 3]]);
  });
  test('a place whose parent is not listed is a root', () => {
    expect(placeTree([place('x', 'Orphan', 'locality', 'gone')], '')).toEqual([{ place: place('x', 'Orphan', 'locality', 'gone'), depth: 0 }]);
  });
  test('filter keeps matches and their ancestors', () => {
    expect(placeTree(places, 'north').map(t => t.place.id)).toEqual(['c', 'l1', 's1']);
  });
  test('filter ignores case', () => {
    expect(placeTree(places, 'CARR').map(t => t.place.id)).toEqual(['c', 'l2']);
  });
});

describe('moveTargets', () => {
  test('only localities and settings', () => {
    expect(moveTargets(places).map(p => p.id)).toEqual(['l1', 's1', 'l2']);
  });
});

describe('isAdminOf', () => {
  const clusters = [{ id: 'c', name: 'NC-215 Triangle' }];
  test('true for a listed cluster', () => expect(isAdminOf(clusters, 'NC-215 Triangle')).toBe(true));
  test('false otherwise', () => expect(isAdminOf(clusters, 'Elsewhere')).toBe(false));
});

describe('lookupIsAdmin', () => {
  test('true when any admin cluster is listed, false when none', async () => {
    expect(await lookupIsAdmin(async () => [{ id: 'c1', name: 'Test Cluster' }])).toBe(true);
    expect(await lookupIsAdmin(async () => [])).toBe(false);
  });
  test('a rejected lookup yields false instead of throwing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await lookupIsAdmin(async () => { throw new Error('boom'); })).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
