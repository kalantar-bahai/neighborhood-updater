import { describe, it, expect } from 'vitest';
import { nucleusIdFromSearch, spaceIdFromSearch, nucleusHref, nucleusFromUrl } from './nucleusUrl';

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
