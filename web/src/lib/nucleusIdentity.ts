// Identity card rules for a nucleus's place and type (spec: docs/superpowers/specs/2026-11-26-nucleus-members-design.md).
// Confirmed with cluster-notebook 2026-11-26: a Neighborhood is always at its own Setting, so it picks a
// Locality (localityId) instead of a Location, until it is in SRP; Neighborhood needs a Locality.

export type IdentityControls = {
  // locality: a Neighborhood's Locality select. location: Cluster or a Locality. readonly: neither.
  place: 'locality' | 'location' | 'readonly';
  // null: Type is read-only.
  typeOptions: string[] | null;
};

export function identityControls(input: {
  isHome: boolean;
  inSrp: boolean;
  pending: boolean;
  canChangeIdentity: boolean;
  locationType: string;
}): IdentityControls {
  if (!input.canChangeIdentity || input.pending || input.inSrp) return { place: 'readonly', typeOptions: null };
  if (input.isHome) return { place: 'locality', typeOptions: ['Neighborhood', 'Network', 'Population'] };
  return {
    place: 'location',
    typeOptions: input.locationType === 'LOCALITY'
      ? ['', 'Neighborhood', 'Network', 'Population']
      : ['', 'Network', 'Population'],
  };
}

export type TypeChangePrompt =
  | { kind: 'none' }
  | { kind: 'membersIn'; text: string }
  | { kind: 'residentsOut'; text: string };

export function typeChangePrompt(input: { from: string; to: string; isHome: boolean; memberCount: number }): TypeChangePrompt {
  const { from, to, isHome, memberCount: n } = input;
  if (n <= 0 || from === to) return { kind: 'none' };
  if (to === 'Neighborhood') {
    return { kind: 'membersIn', text: `This nucleus has ${n} member${n === 1 ? '' : 's'}. A Neighborhood's members are its residents.` };
  }
  if (from === 'Neighborhood' && isHome) {
    const text = n === 1
      ? 'Its 1 resident becomes a member. SRP is not changed.'
      : `Its ${n} residents become members. SRP is not changed.`;
    return { kind: 'residentsOut', text };
  }
  return { kind: 'none' };
}

// A nucleus with no type yet (older data) shows "Not set" (spec 2026-11-26); its value stays ''.
export function typeLabel(nucleusType: string): string {
  return nucleusType || 'Not set';
}

// The Parent Nucleus picker's suggestions: nuclei in the same cluster, leaving out this nucleus and everything under it,
// which cluster-notebook refuses (PARENT_CYCLE, PARENT_OTHER_CLUSTER; owner's rules, 2026-11-27), and any the user
// can't edit (PARENT_FORBIDDEN, cluster-notebook #60, 2026-11-27). Sorted by name.
export function parentOptions(rows: { nucleus: string; parentNucleus: string; cluster: string }[], nucleus: string, cluster: string, canEdit: (name: string) => boolean): string[] {
  const excluded = new Set([nucleus]);
  // Walk down from this nucleus; the Set stops a loop already in the data.
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) {
      if (!excluded.has(r.nucleus) && excluded.has(r.parentNucleus)) { excluded.add(r.nucleus); grew = true; }
    }
  }
  return rows.filter(r => r.cluster === cluster && !excluded.has(r.nucleus) && canEdit(r.nucleus)).map(r => r.nucleus).sort((a, b) => a.localeCompare(b));
}
