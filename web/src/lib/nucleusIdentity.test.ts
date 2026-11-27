import { describe, expect, it } from 'vitest';
import { identityControls, parentOptions, typeChangePrompt, typeLabel } from './nucleusIdentity';

const base = { isHome: false, inSrp: false, pending: false, canChangeIdentity: true, locationType: 'LOCALITY' };

describe('identityControls', () => {
  it('makes a Neighborhood in SRP read-only', () => {
    expect(identityControls({ ...base, isHome: true, inSrp: true, locationType: 'SETTING' }))
      .toEqual({ place: 'readonly', typeOptions: null });
  });

  it('makes a pending nucleus read-only', () => {
    expect(identityControls({ ...base, isHome: true, pending: true, locationType: 'SETTING' }))
      .toEqual({ place: 'readonly', typeOptions: null });
    expect(identityControls({ ...base, pending: true }))
      .toEqual({ place: 'readonly', typeOptions: null });
  });

  it('gives a Neighborhood not in SRP a Locality and no blank type', () => {
    expect(identityControls({ ...base, isHome: true, locationType: 'SETTING' }))
      .toEqual({ place: 'locality', typeOptions: ['Neighborhood', 'Network', 'Population'] });
  });

  it('offers Neighborhood to a Network at a Locality', () => {
    expect(identityControls({ ...base, locationType: 'LOCALITY' }))
      .toEqual({ place: 'location', typeOptions: ['', 'Neighborhood', 'Network', 'Population'] });
  });

  it('does not offer Neighborhood at the Cluster, which has no Locality', () => {
    expect(identityControls({ ...base, locationType: 'CLUSTER' }))
      .toEqual({ place: 'location', typeOptions: ['', 'Network', 'Population'] });
  });

  it('is read-only without canChangeIdentity', () => {
    expect(identityControls({ ...base, canChangeIdentity: false }))
      .toEqual({ place: 'readonly', typeOptions: null });
    expect(identityControls({ ...base, isHome: true, canChangeIdentity: false, locationType: 'SETTING' }))
      .toEqual({ place: 'readonly', typeOptions: null });
  });
});

describe('typeChangePrompt', () => {
  it('asks about members when a Network becomes a Neighborhood', () => {
    expect(typeChangePrompt({ from: 'Network', to: 'Neighborhood', isHome: false, memberCount: 14 })).toEqual({
      kind: 'membersIn',
      text: "This nucleus has 14 members. A Neighborhood's members are its residents.",
    });
  });

  it('asks nothing when there are no members', () => {
    expect(typeChangePrompt({ from: 'Network', to: 'Neighborhood', isHome: false, memberCount: 0 })).toEqual({ kind: 'none' });
  });

  it('asks about members when a nucleus with no type becomes a Neighborhood', () => {
    expect(typeChangePrompt({ from: '', to: 'Neighborhood', isHome: false, memberCount: 2 }).kind).toBe('membersIn');
  });

  it('says one member, not one members', () => {
    expect(typeChangePrompt({ from: 'Population', to: 'Neighborhood', isHome: false, memberCount: 1 })).toEqual({
      kind: 'membersIn',
      text: "This nucleus has 1 member. A Neighborhood's members are its residents.",
    });
  });

  it('warns that residents become members when a Neighborhood becomes a Network', () => {
    expect(typeChangePrompt({ from: 'Neighborhood', to: 'Network', isHome: true, memberCount: 5 })).toEqual({
      kind: 'residentsOut',
      text: 'Its 5 residents become members. SRP is not changed.',
    });
  });

  it('says one resident becomes a member', () => {
    expect(typeChangePrompt({ from: 'Neighborhood', to: 'Population', isHome: true, memberCount: 1 })).toEqual({
      kind: 'residentsOut',
      text: 'Its 1 resident becomes a member. SRP is not changed.',
    });
  });

  it('asks nothing when a Neighborhood with no residents becomes a Network', () => {
    expect(typeChangePrompt({ from: 'Neighborhood', to: 'Network', isHome: true, memberCount: 0 })).toEqual({ kind: 'none' });
  });

  it('asks nothing between Network and Population', () => {
    expect(typeChangePrompt({ from: 'Network', to: 'Population', isHome: false, memberCount: 9 })).toEqual({ kind: 'none' });
  });
});

describe('typeLabel', () => {
  it('shows a nucleus with no type as Not set', () => {
    expect(typeLabel('')).toBe('Not set');
  });
  it('shows a type as itself', () => {
    expect(typeLabel('Network')).toBe('Network');
  });
});

describe('parentOptions', () => {
  const rows = [
    { nucleus: 'Top', parentNucleus: '', cluster: 'C1' },
    { nucleus: 'Child', parentNucleus: 'Top', cluster: 'C1' },
    { nucleus: 'Grandchild', parentNucleus: 'Child', cluster: 'C1' },
    { nucleus: 'Sibling', parentNucleus: '', cluster: 'C1' },
    { nucleus: 'Elsewhere', parentNucleus: '', cluster: 'C2' },
  ];
  it('leaves out the nucleus itself, its descendants, and other clusters', () => {
    expect(parentOptions(rows, 'Top', 'C1')).toEqual(['Sibling']);
    expect(parentOptions(rows, 'Child', 'C1')).toEqual(['Sibling', 'Top']);
    expect(parentOptions(rows, 'Grandchild', 'C1')).toEqual(['Child', 'Sibling', 'Top']);
  });
  it('survives a cycle already in the data', () => {
    const loop = [
      { nucleus: 'A', parentNucleus: 'B', cluster: 'C1' },
      { nucleus: 'B', parentNucleus: 'A', cluster: 'C1' },
      { nucleus: 'D', parentNucleus: '', cluster: 'C1' },
    ];
    expect(parentOptions(loop, 'A', 'C1')).toEqual(['D']);
  });
});
