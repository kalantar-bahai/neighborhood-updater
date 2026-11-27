import { describe, expect, it } from 'vitest';
import type { Household, HouseholdMember, NucleusPerson } from './clusterNotebook';
import { familyEntries, familyTitle, filterFamilies, hiddenText, householdMove, sizeText, sortFamilies, type FamilyEntry } from './households';

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
    expect(out[2].members).toEqual([{ id: 'd', name: 'Dara Zed', inSrp: false, isContact: false }]);
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
    key, title: key, address, size: 1, members: [], hidden: 0, familyName, firstName,
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
