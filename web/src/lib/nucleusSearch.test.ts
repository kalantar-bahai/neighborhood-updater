import { describe, expect, it } from 'vitest';
import type { NucleusSummary } from '@/types';
import { searchNuclei } from './nucleusSearch';

const row = (nucleus: string) => ({ nucleus }) as unknown as NucleusSummary;
const rows = [row('Oak Hills'), row('Cedar Park'), row('Maple - Oak Court'), row('Birch')];

describe('searchNuclei', () => {
  it('matches part of a name in any case, sorted by name', () => {
    expect(searchNuclei(rows, 'OAK').map(r => r.nucleus)).toEqual(['Maple - Oak Court', 'Oak Hills']);
  });
  it('ignores surrounding spaces', () => {
    expect(searchNuclei(rows, '  park ').map(r => r.nucleus)).toEqual(['Cedar Park']);
  });
  it('returns nothing for no match, and nothing for a blank query', () => {
    expect(searchNuclei(rows, 'zzz')).toEqual([]);
    expect(searchNuclei(rows, '   ')).toEqual([]);
  });
});
