import { describe, expect, test } from 'vitest';
import { parseViewState } from './viewState';

describe('parseViewState', () => {
  const empty = { open: {}, scroll: {} };
  test('nothing saved', () => {
    expect(parseViewState(null)).toEqual(empty);
    expect(parseViewState('')).toEqual(empty);
  });
  test('not JSON, or not an object', () => {
    expect(parseViewState('{oops')).toEqual(empty);
    expect(parseViewState('[1,2]')).toEqual(empty);
    expect(parseViewState('null')).toEqual(empty);
  });
  test('round trip', () => {
    const s = { open: { '': { 'g__c': true }, 'Rocky Brook': { children: true, identity: false } }, scroll: { '': 420, 'Rocky Brook': 0 } };
    expect(parseViewState(JSON.stringify(s))).toEqual(s);
  });
  test('wrong shapes are dropped', () => {
    const raw = JSON.stringify({ open: { a: { x: true, y: 'yes' }, b: 3 }, scroll: { a: -5, b: 'top', c: 12 } });
    expect(parseViewState(raw)).toEqual({ open: { a: { x: true } }, scroll: { c: 12 } });
  });
});
