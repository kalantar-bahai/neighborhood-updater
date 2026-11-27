import { describe, expect, test } from 'vitest';
import type { NucleusSummary } from '@/types';
import type { LocalityOption } from './clusterNotebook';
import { childPreset, presetLocalityId } from './createPreset';

const row = (id: string, nucleus: string, cluster: string, locality: string): NucleusSummary =>
  ({ id, nucleus, cluster, locality, parentNucleus: '' } as NucleusSummary);
const loc = (id: string, name: string): LocalityOption => ({ id, name, settings: [] });

describe('childPreset', () => {
  const rows = [row('n-1', 'Elm Park', 'Orange', 'Carrboro'), row('n-2', 'Oak Net', 'Orange', '')];
  test("cluster, the parent's locality, and the parent with its id", () => {
    expect(childPreset(rows, 'Elm Park')).toEqual({ cluster: 'Orange', locality: 'Carrboro', parent: 'Elm Park', parentId: 'n-1' });
  });
  test('a parent with no locality leaves the locality to the user', () => {
    expect(childPreset(rows, 'Oak Net')).toEqual({ cluster: 'Orange', parent: 'Oak Net', parentId: 'n-2' });
  });
  test('an unknown parent', () => {
    expect(childPreset(rows, 'Nowhere')).toBeNull();
  });
});

describe('presetLocalityId', () => {
  const locs = [loc('1', 'Carrboro'), loc('2', 'Hillsborough'), loc('3', 'Twin'), loc('4', 'Twin')];
  test('one match: its id', () => {
    expect(presetLocalityId(locs, 'Carrboro')).toBe('1');
  });
  test('no match, or two with that name: none, so the user picks', () => {
    expect(presetLocalityId(locs, 'Durham')).toBe('');
    expect(presetLocalityId(locs, 'Twin')).toBe('');
  });
  test('no locality asked for', () => {
    expect(presetLocalityId(locs, undefined)).toBe('');
  });
});
