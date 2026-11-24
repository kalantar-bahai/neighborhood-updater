import { describe, test, expect, vi } from 'vitest';
import { adminPersonLine, roleHoldingLine, endRoleConfirm, placeTree, moveTargets, isAdminOf, lookupIsAdmin,
  invitationStatusWord, invitationLine, accountLine, accountRemovedNote, prefillEmail, adminPersonTag, removeAccessConfirm, validateInvite } from './admin';
import type { AdminPerson, AdminPlace, RoleHolding, Invitation, AccountInfo, PersonDetails, PersonSummary } from './clusterNotebook';

const person = (ageCategory: AdminPerson['ageCategory'], placePath: string[]): AdminPerson => ({
  individual: { id: 'i1', firstName: 'Ana', familyName: 'Lopez', middleNames: null, nickname: null, place: null, placeSync: null, inSrp: true },
  ageCategory, placePath, hasAccess: false, pendingInvitation: null,
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

const summary = (firstName: string, familyName: string): PersonSummary =>
  ({ id: 'x', firstName, familyName, middleNames: null, nickname: null, place: null, placeSync: null, inSrp: true });
const invitation = (o: Partial<Invitation> = {}): Invitation => ({
  id: 'inv1', individual: summary('Ana', 'Lopez'), email: 'ana@example.org', role: 'CSO',
  entity: { id: 'e1', name: 'NC-215 Triangle', type: 'cluster' }, status: 'PENDING',
  invitedBy: summary('Ben', 'Okafor'), createdAt: '2026-11-24T10:00:00Z', expiresAt: '2026-12-24T10:00:00Z',
  acceptedAt: null, replacedBy: null, ...o,
});
const account = (o: Partial<AccountInfo> = {}): AccountInfo => ({
  individual: summary('Ana', 'Lopez'), email: 'ana@example.org', provider: 'google',
  createdAt: '2026-11-24T10:00:00Z', lastSeenAt: '2026-11-25T08:00:00Z', disabledAt: null, ...o,
});

describe('invitationStatusWord', () => {
  test('words', () => {
    expect(invitationStatusWord('PENDING')).toBe('pending');
    expect(invitationStatusWord('ACCEPTED')).toBe('accepted');
    expect(invitationStatusWord('EXPIRED')).toBe('expired');
    expect(invitationStatusWord('REVOKED')).toBe('cancelled');
  });
});

describe('invitationLine', () => {
  test('full line', () => {
    expect(invitationLine(invitation())).toBe('Ana Lopez · ana@example.org · CSO at NC-215 Triangle · invited by Ben Okafor 2026-11-24 · expires 2026-12-24');
  });
  test('no role', () => {
    expect(invitationLine(invitation({ role: null, entity: null }))).toBe('Ana Lopez · ana@example.org · invited by Ben Okafor 2026-11-24 · expires 2026-12-24');
  });
  test('role without entity', () => {
    expect(invitationLine(invitation({ entity: null }))).toBe('Ana Lopez · ana@example.org · CSO · invited by Ben Okafor 2026-11-24 · expires 2026-12-24');
  });
  test('unknown inviter', () => {
    expect(invitationLine(invitation({ invitedBy: null }))).toBe('Ana Lopez · ana@example.org · CSO at NC-215 Triangle · expires 2026-12-24');
  });
});

describe('accountLine and accountRemovedNote', () => {
  test('full line', () => {
    expect(accountLine(account())).toBe('Ana Lopez · ana@example.org · since 2026-11-24 · last seen 2026-11-25');
  });
  test('never seen', () => {
    expect(accountLine(account({ lastSeenAt: null }))).toBe('Ana Lopez · ana@example.org · since 2026-11-24 · never seen');
  });
  test('omits a null email', () => {
    expect(accountLine(account({ email: null }))).toBe('Ana Lopez · since 2026-11-24 · last seen 2026-11-25');
  });
  test('removed note', () => {
    expect(accountRemovedNote(account({ disabledAt: '2026-11-26T09:00:00Z' }))).toBe('access removed 2026-11-26');
    expect(accountRemovedNote(account())).toBeNull();
  });
});

describe('prefillEmail', () => {
  const details = (emails: string[]): PersonDetails => ({
    individual: summary('Ana', 'Lopez'), estimatedAge: null, isRegistered: null, registrationDate: null,
    address: null, phones: [], emails, srpComments: null, checks: null,
  });
  test('first email, trimmed', () => {
    expect(prefillEmail(details(['  ana@example.org ', 'b@example.org']))).toBe('ana@example.org');
  });
  test('empty without details or emails', () => {
    expect(prefillEmail(null)).toBe('');
    expect(prefillEmail(details([]))).toBe('');
  });
});

describe('adminPersonTag', () => {
  const inv = { id: 'inv1', expiresAt: '2026-12-24T10:00:00Z' };
  test('has access wins over invited', () => {
    expect(adminPersonTag({ ...person(null, []), hasAccess: true, pendingInvitation: inv })).toBe('has access');
  });
  test('invited', () => {
    expect(adminPersonTag({ ...person(null, []), pendingInvitation: inv })).toBe('invited');
  });
  test('none', () => {
    expect(adminPersonTag(person(null, []))).toBeNull();
  });
});

describe('removeAccessConfirm', () => {
  test('other and self', () => {
    expect(removeAccessConfirm('Ana Lopez', false)).toBe("Remove Ana Lopez's access?");
    expect(removeAccessConfirm('Ana Lopez', true)).toBe('Remove your own access? You will be signed out.');
  });
});

describe('validateInvite', () => {
  const ok = { cluster: 'Metro', individualId: 'i1', email: 'ana@example.org' };
  test('defaults: 30 days, no role, no replace', () => {
    expect(validateInvite(ok)).toEqual({ ok: true, value: { individualId: 'i1', email: 'ana@example.org', role: null, entityId: null, expiresInDays: 30, replaceExisting: false } });
  });
  test('trims the email', () => {
    expect(validateInvite({ ...ok, email: '  ana@example.org ' })).toMatchObject({ ok: true, value: { email: 'ana@example.org' } });
  });
  test.each(['', '   ', 'ana.example.org'])('rejects email %j', (email) => {
    expect(validateInvite({ ...ok, email })).toMatchObject({ ok: false });
  });
  test('rejects a missing person', () => {
    expect(validateInvite({ ...ok, individualId: '' })).toMatchObject({ ok: false });
  });
  test('role without a place is rejected', () => {
    expect(validateInvite({ ...ok, role: 'CSO' })).toMatchObject({ ok: false });
  });
  test('Administrator without a place is allowed', () => {
    expect(validateInvite({ ...ok, role: 'Administrator' })).toMatchObject({ ok: true, value: { role: 'Administrator', entityId: null } });
  });
  test('role with a place is passed through', () => {
    expect(validateInvite({ ...ok, role: 'CSO', entityId: 'e1', replaceExisting: true }))
      .toMatchObject({ ok: true, value: { role: 'CSO', entityId: 'e1', replaceExisting: true } });
  });
  test.each([0, 91, 'x', 1.5, null])('rejects expiry %j', (expiresInDays) => {
    expect(validateInvite({ ...ok, expiresInDays })).toMatchObject({ ok: false });
  });
  test.each([1, 90, 14])('accepts expiry %j', (expiresInDays) => {
    expect(validateInvite({ ...ok, expiresInDays })).toMatchObject({ ok: true, value: { expiresInDays } });
  });
});
