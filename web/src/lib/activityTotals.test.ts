import { describe, expect, test } from 'vitest';
import { countText, groupLabel, sumCounts } from './activityTotals';

const c = (number: number | null, participants: number | null, participantsFof: number | null) => ({ number, participants, participantsFof });

describe('sumCounts', () => {
  test('adds each field, skipping nulls', () => {
    expect(sumCounts([c(1, 10, 2), c(null, 5, null)])).toEqual(c(1, 15, 2));
  });
  test('a field is null when every input is null (not recorded, not 0)', () => {
    expect(sumCounts([c(null, null, null), c(null, null, null)])).toEqual(c(null, null, null));
  });
  test('nothing to add is all null', () => {
    expect(sumCounts([])).toEqual(c(null, null, null));
  });
  test('real zeros stay zeros', () => {
    expect(sumCounts([c(0, 0, 0)])).toEqual(c(0, 0, 0));
  });
});

describe('groupLabel', () => {
  test('null when nothing is under this nucleus, or the totals are missing', () => {
    expect(groupLabel(1)).toBeNull();
    expect(groupLabel(undefined)).toBeNull();
  });
  test('names how many nuclei are under it', () => {
    expect(groupLabel(2)).toBe('With 1 under it');
    expect(groupLabel(5)).toBe('With 4 under it');
  });
});

describe('countText', () => {
  test('blank for not recorded, the number otherwise', () => {
    expect(countText(null)).toBe('');
    expect(countText(0)).toBe('0');
    expect(countText(12)).toBe('12');
  });
});
