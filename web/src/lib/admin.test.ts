import { describe, test, expect, vi } from 'vitest';
import { adminPersonLine, roleHoldingLine, holdingLabel, currentRolesLine, endRoleConfirm, placeTree, moveTargets, isAdminOf, lookupIsAdmin,
  invitationStatusWord, invitationLine, accountLine, accountRemovedNote, activeAccountCount, prefillEmail, adminPersonTags, removeAccessConfirm, validateInvite,
  inviteRequestBody, cancelInvitationConfirm, splitInvitations, findAccounts, findPeople, hidesToLift,
  logHeadline, logChanges, changeValueText, nextLogCursor, mergeLogPages } from './admin';
import type { AdminPerson, AdminPlace, RoleHolding, Invitation, AccountInfo, PersonDetails, PersonSummary, HiddenPerson, MoveResult, LogEntry } from './clusterNotebook';

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

describe('holdingLabel', () => {
  test('role without an icon', () => expect(holdingLabel(holding('CSO', 'NC-215 Triangle'))).toBe('CSO'));
  test('role with an icon', () => expect(holdingLabel(holding('contact', 'Northside'))).toBe('Contact ★'));
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
  test('active count skips removed logins', () => {
    expect(activeAccountCount([])).toBe(0);
    expect(activeAccountCount([account(), account({ disabledAt: '2026-11-26T09:00:00Z' }), account()])).toBe(2);
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

describe('adminPersonTags', () => {
  const base = person(null, []);
  test('has access wins alone', () => {
    expect(adminPersonTags({ ...base, hasAccess: true, accessRemovedAt: null, pendingInvitation: { id: 'i', expiresAt: '2026-12-24T10:00:00Z' } })).toEqual(['has access']);
  });
  test('removed and invited both show, removed first, with the date', () => {
    expect(adminPersonTags({ ...base, accessRemovedAt: '2026-11-20T09:00:00Z', pendingInvitation: { id: 'i', expiresAt: '2026-12-20T00:00:00Z' } }))
      .toEqual(['access removed Nov 20, 2026', 'invited']);
  });
  test('invited alone', () => {
    expect(adminPersonTags({ ...base, pendingInvitation: { id: 'i', expiresAt: '2026-12-20T00:00:00Z' } })).toEqual(['invited']);
  });
  test('nothing for a plain person', () => {
    expect(adminPersonTags(base)).toEqual([]);
  });
});

describe('removeAccessConfirm', () => {
  test('other and self', () => {
    expect(removeAccessConfirm('Ana Lopez')).toBe("Remove Ana Lopez's access?");
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

describe('inviteRequestBody', () => {
  const base = { cluster: 'North', individualId: 'i1', email: ' ana@example.org ', expiresInDays: '30' };
  test('no role sends neither role nor entityId', () => {
    expect(inviteRequestBody({ ...base, value: 'none', replaceExisting: false }))
      .toEqual({ cluster: 'North', individualId: 'i1', email: 'ana@example.org', expiresInDays: 30, replaceExisting: false });
  });
  test('a chosen role sends role and entityId', () => {
    expect(inviteRequestBody({ ...base, value: { entityId: 'loc1', role: 'tutor' }, replaceExisting: true }))
      .toEqual({ cluster: 'North', individualId: 'i1', email: 'ana@example.org', role: 'tutor', entityId: 'loc1', expiresInDays: 30, replaceExisting: true });
  });
  test.each([['', ''], ['abc', 'abc'], [' 14 ', 14], ['2.5', 2.5]])('expiry %j is sent as %j', (text, sent) => {
    // Non-numbers go as typed so the route answers with its own wording.
    expect(inviteRequestBody({ ...base, expiresInDays: text, value: 'none', replaceExisting: false }).expiresInDays).toBe(sent);
  });
});

describe('cancelInvitationConfirm', () => {
  test('names the address', () => {
    expect(cancelInvitationConfirm('ana@example.org')).toBe('Cancel the invitation to ana@example.org?');
  });
});

describe('currentRolesLine', () => {
  test('lists each holding', () =>
    expect(currentRolesLine([holding('CSO', 'NC-215 Triangle'), holding('CSO', null)]))
      .toBe('Current roles: CSO · NC-215 Triangle; CSO'));
  test('none', () => expect(currentRolesLine([])).toBe('No current roles'));
});

describe('splitInvitations', () => {
  test('pending soonest-expiring first; past newest first', () => {
    const a = invitation({ id: 'a', status: 'PENDING', expiresAt: '2026-12-30T00:00:00Z' });
    const b = invitation({ id: 'b', status: 'PENDING', expiresAt: '2026-12-01T00:00:00Z' });
    const c = invitation({ id: 'c', status: 'ACCEPTED', createdAt: '2026-11-01T00:00:00Z' });
    const d = invitation({ id: 'd', status: 'REVOKED', createdAt: '2026-11-20T00:00:00Z' });
    const e = invitation({ id: 'e', status: 'EXPIRED', createdAt: '2026-10-01T00:00:00Z' });
    const { pending, past } = splitInvitations([c, a, d, b, e]);
    expect(pending.map(i => i.id)).toEqual(['b', 'a']);
    expect(past.map(i => i.id)).toEqual(['d', 'c', 'e']);
  });
  test('empty', () => {
    expect(splitInvitations([])).toEqual({ pending: [], past: [] });
  });
});

describe('findAccounts', () => {
  const ana = account();
  const ben = account({ individual: summary('Ben', 'Okafor'), email: 'ben@example.org' });
  const cy = account({ individual: summary('Cy', 'Adams'), email: null, disabledAt: '2026-11-26T09:00:00Z' });
  test('matches every word against name or email, ignoring case', () => {
    expect(findAccounts([ana, ben, cy], 'OKA').shown).toEqual([ben]);
    expect(findAccounts([ana, ben, cy], 'ana example').shown).toEqual([ana]);
    expect(findAccounts([ana, ben, cy], 'ben lopez').shown).toEqual([]);
  });
  test('empty search lists everyone, active first, then by name', () => {
    expect(findAccounts([cy, ben, ana], '  ').shown).toEqual([ana, ben, cy]);
  });
  test('caps the list and reports how many matched', () => {
    const many = Array.from({ length: 30 }, (_, n) => account({ individual: summary(`P${String(n).padStart(2, '0')}`, 'Test') }));
    const r = findAccounts(many, '', 20);
    expect(r.shown).toHaveLength(20);
    expect(r.matched).toBe(30);
    expect(r.shown[0].individual.firstName).toBe('P00');
  });
});

describe('hidesToLift', () => {
  const ana = summary('Ana', 'Lopez');
  const ben = { ...summary('Ben', 'Okafor'), id: 'ben' };
  const cy = { ...summary('Cy', 'Adams'), id: 'cy' };
  const hide = { hiddenAt: '2026-11-20T00:00:00Z', hiddenBy: null, reason: null };
  const hp = (individual: PersonSummary, nucleusName: string): HiddenPerson => ({ individual, nucleusName, roles: [], isResident: false, hide });
  const res = (individual: PersonSummary, moved: boolean, code: string | null = null): MoveResult => ({ individual, moved, code });
  test('every hide of everyone who moved (or was already there), in every nucleus', () => {
    const hidden = [hp(ana, 'N'), hp(ana, 'M'), hp(ben, 'N'), hp(cy, 'N')];
    const results = [res(ana, true), res(ben, false, 'ALREADY_THERE'), res(cy, false, 'SRP_REFUSED')];
    expect(hidesToLift(hidden, results)).toEqual([
      { individualId: ana.id, nucleusName: 'N' }, { individualId: ana.id, nucleusName: 'M' }, { individualId: 'ben', nucleusName: 'N' },
    ]);
  });
  test('nothing when no one moved', () => {
    expect(hidesToLift([hp(ana, 'N')], [res(ana, false, 'SRP_REFUSED')])).toEqual([]);
  });
});

describe('findPeople', () => {
  const p = (first: string, last: string, place: string[] = ['Triangle']): AdminPerson =>
    ({ individual: { ...summary(first, last), id: first }, ageCategory: null, placePath: place, hasAccess: false, pendingInvitation: null });
  test('every word must match the name or place path, ignoring case; keeps input order', () => {
    const list = [p('Ana', 'Lopez', ['Triangle', 'Elm St']), p('Ben', 'Okafor'), p('Cy', 'Adams', ['Triangle', 'Elm St'])];
    expect(findPeople(list, 'elm').shown.map(x => x.individual.id)).toEqual(['Ana', 'Cy']);
    expect(findPeople(list, 'ANA elm').shown.map(x => x.individual.id)).toEqual(['Ana']);
    expect(findPeople(list, '  ').matched).toBe(3);
  });
  test('caps at the limit and reports the match count', () => {
    const many = Array.from({ length: 25 }, (_, n) => p(`P${n}`, 'Test'));
    const r = findPeople(many, '');
    expect(r.shown).toHaveLength(20);
    expect(r.matched).toBe(25);
  });
});

const entry = (o: Partial<LogEntry> = {}): LogEntry => ({
  id: 'e1', occurredAt: '2026-11-24T14:05:00Z', actor: summary('Ben', 'Okafor'), mutation: 'grantRole',
  entityType: 'role_in_ne', entityId: 'r1', changeType: 'create', changes: { role: { old: null, new: 'CSO' } }, ...o });
describe('logHeadline', () => {
  test('who, what, on what', () => {
    expect(logHeadline(entry())).toBe('Ben Okafor · grantRole · role r1');
  });
  test('no actor is the system; no mutation uses the change type', () => {
    expect(logHeadline(entry({ actor: null, mutation: null, changeType: 'update', entityType: 'person_hide', entityId: 'h9' })))
      .toBe('System · update · hide h9');
  });
});
describe('logChanges and changeValueText', () => {
  test('one row per field, in key order, values as text', () => {
    expect(logChanges(entry({ changes: { name: { old: 'Elm', new: 'Elm St' }, active: { old: true, new: null } } })))
      .toEqual([{ field: 'name', old: 'Elm', new: 'Elm St' }, { field: 'active', old: 'true', new: '—' }]);
  });
  test('objects and arrays as compact JSON; numbers as written', () => {
    expect(changeValueText({ a: 1 })).toBe('{"a":1}');
    expect(changeValueText([1, 'x'])).toBe('[1,"x"]');
    expect(changeValueText(0)).toBe('0');
    expect(changeValueText(undefined)).toBe('—');
  });
});
describe('nextLogCursor and mergeLogPages', () => {
  test('a full page gives the cursor of its last row; a short page ends', () => {
    const full = Array.from({ length: 100 }, (_, n) => entry({ id: `e${n}`, occurredAt: `2026-11-24T14:${String(n % 60).padStart(2, '0')}:00Z` }));
    expect(nextLogCursor(full)).toEqual({ before: full[99].occurredAt, beforeId: 'e99' });
    expect(nextLogCursor(full.slice(0, 99))).toBeNull();
    expect(nextLogCursor([])).toBeNull();
  });
  test('merging drops rows already shown', () => {
    expect(mergeLogPages([entry({ id: 'a' }), entry({ id: 'b' })], [entry({ id: 'b' }), entry({ id: 'c' })]).map(e => e.id))
      .toEqual(['a', 'b', 'c']);
  });
});
