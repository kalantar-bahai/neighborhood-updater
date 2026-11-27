import { describe, expect, it } from 'vitest';
import type { Household, HouseholdMember, NucleusPerson } from './clusterNotebook';
import { familyEntries, familyTitle, filterFamilies, hiddenText, householdMove, sizeText, sortFamilies, srpBadge, canRemoveMember, addCandidates, startCandidates, sortCandidates, moveConfirmText, inFamilyText, matchesCandidate, type Candidate, type FamilyEntry } from './households';

const mem = (id: string, firstName: string, familyName: string): HouseholdMember => ({
  id, firstName, familyName, middleNames: '', nickname: '', inSrp: false,
} as HouseholdMember);

const hh = (id: string, members: HouseholdMember[], size = members.length, contactIdx: number | null = 0): Household => ({
  id, contact: contactIdx === null ? null : members[contactIdx], members, size, address: null, srpState: 'LOCAL_ONLY',
});

const person = (m: HouseholdMember, household: Household | null | undefined, hidden = false): NucleusPerson =>
  ({ hidden, individual: { ...m, household } }) as unknown as NucleusPerson;

const okoro = hh('h1', [mem('a', 'Ada', 'Okoro'), mem('b', 'Bola', 'Okoro')]);
const lind = hh('h2', [mem('c', 'Cleo', 'Lind')]);

describe('familyEntries', () => {
  it('merges households and household-less people, sorted by family name', () => {
    const solo = person(mem('d', 'Dara', 'Zed'), null);
    const out = familyEntries([okoro, lind], [solo]);
    expect(out.map((e) => e.key)).toEqual(['h2', 'h1', 'person:d']);
    expect(out[2]).toMatchObject({ title: 'Dara Zed', size: 1, address: null, hidden: 0 });
    expect(out[2].members).toEqual([{ id: 'd', name: 'Dara Zed', inSrp: false, isContact: false, familyName: 'Zed', firstName: 'Dara' }]);
    expect(out[2]).toMatchObject({ householdId: null, srpState: null });
    expect(out[0]).toMatchObject({ householdId: 'h2', srpState: 'LOCAL_ONLY' });
  });
  it('skips hidden household-less people and treats undefined household as none', () => {
    const out = familyEntries([], [person(mem('d', 'Dara', 'Zed'), null, true), person(mem('e', 'Eli', 'Yu'), undefined)]);
    expect(out.map((e) => e.key)).toEqual(['person:e']);
  });
  it('puts the contact first and flags it', () => {
    const h = hh('h3', [mem('x', 'Xia', 'Tran'), mem('y', 'Yan', 'Tran')], 2, 0);
    const [e] = familyEntries([h], []);
    expect(e.members.map((m) => [m.id, m.isContact])).toEqual([['x', true], ['y', false]]);
  });
  it('counts people the caller cannot see', () => {
    const [e] = familyEntries([hh('h4', [mem('a', 'Ada', 'Okoro')], 4)], []);
    expect(e.hidden).toBe(3);
    expect(e.size).toBe(4);
  });
});

describe('familyTitle', () => {
  it('uses the contact family name', () => expect(familyTitle(okoro)).toBe('Okoro household'));
  it('falls back to the first member', () =>
    expect(familyTitle(hh('h', [mem('a', 'Ada', 'Okoro'), mem('b', 'Bo', 'Lind')], 2, null))).toBe('Okoro household'));
  it('falls back to Household', () => expect(familyTitle(hh('h', [], 3, null))).toBe('Household'));
  it('uses the full name for size 1', () => expect(familyTitle(lind)).toBe('Cleo Lind'));
});

describe('filterFamilies', () => {
  const entries = familyEntries([okoro, lind], []);
  it('matches any visible member, case-insensitively', () => {
    expect(filterFamilies(entries, '  BOLA ').map((e) => e.key)).toEqual(['h1']);
  });
  it('returns all on blank', () => expect(filterFamilies(entries, '  ')).toEqual(entries));
});

describe('text helpers', () => {
  it('sizeText', () => {
    expect(sizeText(1)).toBe('1 person');
    expect(sizeText(3)).toBe('3 people');
  });
  it('hiddenText', () => {
    expect(hiddenText(0)).toBeNull();
    expect(hiddenText(1)).toBe("and 1 other you can't see");
    expect(hiddenText(2)).toBe("and 2 others you can't see");
  });
});

describe('householdMove', () => {
  it('is null without a household or for size 1', () => {
    expect(householdMove(null, 'a')).toBeNull();
    expect(householdMove(undefined, 'a')).toBeNull();
    expect(householdMove(lind, 'c')).toBeNull();
  });
  it('lists visible others and counts hidden', () => {
    const h = hh('h', [mem('a', 'Ada', 'Okoro'), mem('b', 'Bola', 'Okoro'), mem('m', 'Mo', 'Okoro')], 4);
    expect(householdMove(h, 'm')).toEqual({ others: ['Ada Okoro', 'Bola Okoro'], hidden: 1, total: 4 });
  });
  it('handles seeing only the mover', () => {
    const h = hh('h', [mem('m', 'Mo', 'Okoro')], 4);
    expect(householdMove(h, 'm')).toEqual({ others: [], hidden: 3, total: 4 });
  });
});

describe('familyEntries addresses and sort keys', () => {
  it('carries a one-person entry address and name keys', () => {
    const p = { ...person(mem('s', 'Ada', 'Zed'), null), address: '9 Elm St' } as NucleusPerson;
    const [e] = familyEntries([], [p]);
    expect(e).toMatchObject({ address: '9 Elm St', familyName: 'Zed', firstName: 'Ada' });
  });
  it('sorts a solo person next to a household of the same family name, ties by first name', () => {
    const zed = hh('hz', [mem('z', 'Zoe', 'Zed'), mem('y', 'Yan', 'Zed')]);
    const out = familyEntries([okoro, zed, lind], [person(mem('s', 'Ada', 'Zed'), null)]);
    expect(out.map((e) => e.key)).toEqual(['h2', 'h1', 'person:s', 'hz']);
  });
});

describe('sortFamilies', () => {
  const entry = (key: string, address: string | null, familyName = key, firstName = ''): FamilyEntry => ({
    key, title: key, address, size: 1, members: [], hidden: 0, householdId: null, srpState: null, familyName, firstName,
  });
  const addrs = ['120 Oak Ridge Ct', '34 Birch Ln', '118 Oak Ridge Ct', null, 'Rural Route 5'];
  const list = addrs.map((a, i) => entry(`e${i}`, a));
  it('sorts by street, then number numerically, with no-number text among streets and nulls last', () => {
    expect(sortFamilies(list, 'address').map((e) => e.address)).toEqual(
      ['34 Birch Ln', '118 Oak Ridge Ct', '120 Oak Ridge Ct', 'Rural Route 5', null]);
  });
  it('sorts rural route after oak ridge ct by text', () => {
    const out = sortFamilies([entry('r', 'rural route 5'), entry('o', '7 Oak Ridge Ct')], 'address');
    expect(out.map((e) => e.key)).toEqual(['o', 'r']);
  });
  it('treats blank as null and orders those by name', () => {
    const out = sortFamilies([entry('b', '  ', 'Bee'), entry('a', null, 'Ay'), entry('c', '1 A St', 'Zed')], 'address');
    expect(out.map((e) => e.key)).toEqual(['c', 'a', 'b']);
  });
  it('sorts by name case-insensitively and returns a new array', () => {
    const input = [entry('2', null, 'zed', 'b'), entry('1', null, 'Zed', 'a'), entry('0', null, 'abe')];
    const out = sortFamilies(input, 'name');
    expect(out.map((e) => e.key)).toEqual(['0', '1', '2']);
    expect(out).not.toBe(input);
    expect(input[0].key).toBe('2');
  });
});

describe('srpBadge', () => {
  it('maps states to copy', () => {
    expect(srpBadge('WAITING')).toBe('Not in SRP yet');
    expect(srpBadge('LOCAL_ONLY')).toBe('Only in Nucleus Assistant');
    expect(srpBadge('IN_SRP')).toBeNull();
    expect(srpBadge(null)).toBeNull();
  });
});

describe('canRemoveMember', () => {
  it('blocks only the contact of a multi-person entry', () => {
    const [big] = familyEntries([hh('h5', [mem('a', 'Ada', 'Okoro'), mem('b', 'Bola', 'Okoro')], 3)], []);
    expect(canRemoveMember(big, 'a')).toBe(false);
    expect(canRemoveMember(big, 'b')).toBe(true);
    const [one] = familyEntries([lind], []);
    expect(canRemoveMember(one, 'c')).toBe(true);
  });
});

describe('candidates', () => {
  const solo = person(mem('d', 'Dara', 'Zed'), null);
  const solo2 = person(mem('e', 'Eli', 'Abe'), null);
  const entries = familyEntries([okoro, lind], [solo, solo2]);

  it('addCandidates excludes the target and tags household members', () => {
    const out = addCandidates(entries, 'h2');
    expect(out.map((c) => c.id)).toEqual(['e', 'a', 'b', 'd']);
    expect(out.find((c) => c.id === 'a')).toMatchObject({ familyTitle: 'Okoro household', fromHouseholdId: 'h1' });
    expect(out.find((c) => c.id === 'd')).toMatchObject({ familyTitle: null, fromHouseholdId: null });
  });
  it('startCandidates covers only solo people and excludes self', () => {
    expect(startCandidates(entries, 'person:d').map((c) => c.id)).toEqual(['e']);
  });
  it('sortCandidates by name and by address with null last', () => {
    const c = (id: string, fam: string, first: string, address: string | null): Candidate =>
      ({ id, name: `${first} ${fam}`, familyTitle: null, fromHouseholdId: null, familyName: fam, firstName: first, address });
    const list = [c('1', 'Zed', 'A', '5 Oak St'), c('2', 'Abe', 'B', null), c('3', 'Mid', 'C', '12 Elm St'), c('4', 'Abe', 'A', '2 Oak St')];
    expect(sortCandidates(list, 'name').map((x) => x.id)).toEqual(['4', '2', '3', '1']);
    expect(sortCandidates(list, 'address').map((x) => x.id)).toEqual(['3', '4', '1', '2']);
  });
});

describe('moveConfirmText and inFamilyText', () => {
  it('names the family when it has a name', () => {
    expect(moveConfirmText('Sam Test', 'Test household')).toBe('Move Sam Test from the Test household?');
    expect(inFamilyText('Test household')).toBe('in the Test household');
  });
  it('avoids "the Household" for a family with no name', () => {
    expect(moveConfirmText('Sam Test', 'Household')).toBe('Move Sam Test from their current family?');
    expect(inFamilyText('Household')).toBe('in another family');
  });
});

describe('edge cases', () => {
  it('turns a whitespace address into null on both entry kinds', () => {
    const h = { ...hh('hw', [mem('a', 'Ada', 'Okoro')]), address: '   ' };
    const p = { ...person(mem('s', 'Sam', 'Test'), null), address: '  ' } as NucleusPerson;
    const out = familyEntries([h], [p]);
    expect(out.map((e) => e.address)).toEqual([null, null]);
  });
  it('orders letter-suffixed and ranged numbers by their first integer', () => {
    const e = (key: string, address: string): FamilyEntry => ({
      key, title: key, address, size: 1, members: [], hidden: 0, householdId: null, srpState: null, familyName: key, firstName: '',
    });
    const out = sortFamilies([e('d', '14 Oak St'), e('b', '12B Oak St'), e('c', '12-14 Oak St'), e('a', '10 Oak St')], 'address');
    expect(out.map((x) => x.key)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('lists a hidden person inside their household entry', () => {
    const m = mem('a', 'Ada', 'Okoro');
    const h = hh('hh', [m, mem('b', 'Bola', 'Okoro')]);
    const out = familyEntries([h], [person(m, h, true)]);
    expect(out).toHaveLength(1);
    expect(out[0].members.map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('does not match a search on names only among unreadable members', () => {
    const entries = familyEntries([hh('hu', [mem('a', 'Ada', 'Okoro')], 3)], []);
    expect(filterFamilies(entries, 'Hidden')).toEqual([]);
  });
  it('titles a size-1 household with an unreadable contact "Household"', () => {
    expect(familyTitle(hh('hx', [], 1, null))).toBe('Household');
  });
  it('candidates handle a size-1 household and hidden members', () => {
    const entries = familyEntries([lind, hh('hq', [mem('a', 'Ada', 'Okoro')], 4)], []);
    expect(addCandidates(entries, 'none').map((c) => c.id)).toEqual(['c', 'a']);
    expect(addCandidates(entries, 'h2').map((c) => c.id)).toEqual(['a']);
    expect(startCandidates(entries, 'none')).toEqual([]);
  });
});

describe('matchesCandidate', () => {
  const c: Candidate = { id: '1', name: 'Sam Test', familyTitle: null, fromHouseholdId: null, familyName: 'Test', firstName: 'Sam', address: '9 Elm St' };
  it('matches name, address, and blank', () => {
    expect(matchesCandidate(c, ' SAM ')).toBe(true);
    expect(matchesCandidate(c, 'elm')).toBe(true);
    expect(matchesCandidate(c, '  ')).toBe(true);
    expect(matchesCandidate(c, 'zzz')).toBe(false);
    expect(matchesCandidate({ ...c, address: null }, 'elm')).toBe(false);
  });
});
