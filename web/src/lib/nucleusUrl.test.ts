import { describe, it, expect } from 'vitest';
import { nucleusIdFromSearch, spaceIdFromSearch, nucleusHref, nucleusFromUrl, viewKey, addressTarget } from './nucleusUrl';

const rows = [
  { id: 'id-a', nucleus: 'Riverside' },
  { id: 'id-b', nucleus: 'Elm Park' },
];

describe('nucleusIdFromSearch', () => {
  it('reads the nucleus id from the query string', () => {
    expect(nucleusIdFromSearch('?nucleus=id-a')).toBe('id-a');
  });
  it('is null when there is none, or it is blank', () => {
    expect(nucleusIdFromSearch('')).toBeNull();
    expect(nucleusIdFromSearch('?other=1')).toBeNull();
    expect(nucleusIdFromSearch('?nucleus=')).toBeNull();
    expect(nucleusIdFromSearch('?nucleus=%20')).toBeNull();
  });
});

describe('spaceIdFromSearch', () => {
  it('reads the space id from the query string', () => {
    expect(spaceIdFromSearch('?nucleus=a&space=s1')).toBe('s1');
  });
  it('is null when there is none, or it is blank', () => {
    expect(spaceIdFromSearch('?nucleus=a')).toBeNull();
    expect(spaceIdFromSearch('?space=%20')).toBeNull();
  });
});

describe('nucleusHref', () => {
  it('puts the id in the address, encoded', () => {
    expect(nucleusHref('id-a')).toBe('/?nucleus=id-a');
    expect(nucleusHref('a b&c')).toBe('/?nucleus=a+b%26c');
  });
  it('is the home page with no id', () => {
    expect(nucleusHref(null)).toBe('/');
  });
  it('adds the space after the nucleus when given one', () => {
    expect(nucleusHref('a', 's1')).toBe('/?nucleus=a&space=s1');
  });
  it('ignores the space when there is no nucleus', () => {
    expect(nucleusHref(null, 's1')).toBe('/');
  });
});

describe('nucleusFromUrl', () => {
  it('finds the row the address points at', () => {
    expect(nucleusFromUrl('?nucleus=id-b', rows)).toEqual({ kind: 'open', name: 'Elm Park' });
  });
  it('is none when the address names no nucleus', () => {
    expect(nucleusFromUrl('', rows)).toEqual({ kind: 'none' });
  });
  // Removed, or not readable by this user: the list shows, with a note.
  it('is missing when the id is not among the rows', () => {
    expect(nucleusFromUrl('?nucleus=gone', rows)).toEqual({ kind: 'missing' });
  });
});

describe('viewKey', () => {
  it('is empty for the list, the name for a nucleus, and name plus space for a space', () => {
    expect(viewKey({ nucleus: null, space: null })).toBe('');
    expect(viewKey({ nucleus: 'Riverside', space: null })).toBe('Riverside');
    expect(viewKey({ nucleus: 'Riverside', space: 's1' })).toBe('Riverside#space:s1');
  });
});

describe('addressTarget', () => {
  const none = { nucleus: null, space: null };
  it('is the list when the address names no readable nucleus', () => {
    expect(addressTarget('', rows, none)).toEqual({ kind: 'list' });
    expect(addressTarget('?nucleus=gone&space=s1', rows, { nucleus: 'Riverside', space: 's1' })).toEqual({ kind: 'list' });
  });
  it('loads a nucleus that is not the one shown, with its space if any', () => {
    expect(addressTarget('?nucleus=id-a', rows, none)).toEqual({ kind: 'nucleus', name: 'Riverside', space: null, refetch: true });
    expect(addressTarget('?nucleus=id-a&space=s1', rows, { nucleus: 'Elm Park', space: null }))
      .toEqual({ kind: 'nucleus', name: 'Riverside', space: 's1', refetch: true });
  });
  // Back from a space to its nucleus, Forward into it again, or between two of its spaces: the nucleus is loaded.
  it('keeps the loaded nucleus when only the space changes', () => {
    expect(addressTarget('?nucleus=id-a', rows, { nucleus: 'Riverside', space: 's1' }))
      .toEqual({ kind: 'nucleus', name: 'Riverside', space: null, refetch: false });
    expect(addressTarget('?nucleus=id-a&space=s1', rows, { nucleus: 'Riverside', space: null }))
      .toEqual({ kind: 'nucleus', name: 'Riverside', space: 's1', refetch: false });
    expect(addressTarget('?nucleus=id-a&space=s2', rows, { nucleus: 'Riverside', space: 's1' }))
      .toEqual({ kind: 'nucleus', name: 'Riverside', space: 's2', refetch: false });
  });
  it('reloads when the address names exactly what is shown', () => {
    expect(addressTarget('?nucleus=id-a', rows, { nucleus: 'Riverside', space: null }))
      .toEqual({ kind: 'nucleus', name: 'Riverside', space: null, refetch: true });
  });
});
