import { describe, expect, it } from 'vitest';
import type { LocalityOption, PermissionSet, SrpAction } from './clusterNotebook';
import { createPayload, effectivePermissions, findNameClash, nextNameAfterRename, reloadOutcome, srpBadge, srpDetailMessage, srpStateFor } from './srp';

const act = (over: Partial<SrpAction> = {}): SrpAction => ({
  action: 'create', status: 'pending', requestedAt: '2026-11-16T00:00:00Z', error: null, individuals: null, activities: null, ...over,
});

describe('srpStateFor', () => {
  it('maps inSrp', () => {
    expect(srpStateFor('Neighborhood', true, null)).toBe('IN_SRP');
    expect(srpStateFor('Neighborhood', false, null)).toBe('LOCAL_ONLY');
    expect(srpStateFor('Neighborhood', false, undefined)).toBe('LOCAL_ONLY');
    expect(srpStateFor('', false, null)).toBe('LOCAL_ONLY');
    expect(srpStateFor(' neighborhood ', true, null)).toBe('IN_SRP');
  });
  it('maps action status', () => {
    expect(srpStateFor('Neighborhood', true, act({ status: 'pending' }))).toBe('PENDING');
    expect(srpStateFor('Neighborhood', true, act({ status: 'in_flight' }))).toBe('PENDING');
    expect(srpStateFor('Neighborhood', true, act({ status: 'refused' }))).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', true, act({ status: 'failed' }))).toBe('FAILED');
    expect(srpStateFor('Neighborhood', true, act({ status: 'weird' }))).toBeNull();
  });
  it('gives no badge for other types or unknown inSrp', () => {
    expect(srpStateFor('Network', false, null)).toBeNull();
    expect(srpStateFor('Population', false, null)).toBeNull();
    expect(srpStateFor('Neighborhood', undefined, null)).toBeNull();
  });
});

describe('srpStateFor with locationType', () => {
  it('shows a refused or failed create at the Cluster as LOCAL_ONLY', () => {
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }), 'CLUSTER')).toBe('LOCAL_ONLY');
    expect(srpStateFor('Neighborhood', false, act({ status: 'failed' }), 'CLUSTER')).toBe('LOCAL_ONLY');
  });
  it('leaves other cases unchanged', () => {
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }), 'LOCALITY')).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ action: 'delete', status: 'refused' }), 'CLUSTER')).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }))).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ status: 'pending' }), 'CLUSTER')).toBe('PENDING');
  });
});

describe('srpBadge', () => {
  it('returns label and color', () => {
    expect(srpBadge('IN_SRP')).toEqual({ label: 'SRP', color: 'green' });
    expect(srpBadge('PENDING')).toEqual({ label: 'SRP pending', color: 'amber' });
    expect(srpBadge('PENDING', 'delete')).toEqual({ label: 'Deleting in SRP', color: 'amber' });
    expect(srpBadge('REFUSED')).toEqual({ label: 'SRP refused', color: 'red' });
    expect(srpBadge('FAILED')).toEqual({ label: 'SRP error', color: 'red' });
    expect(srpBadge('LOCAL_ONLY')).toEqual({ label: 'Not in SRP', color: 'grey' });
  });
});

describe('srpDetailMessage', () => {
  it('explains refused create', () => {
    expect(srpDetailMessage('REFUSED', act({ status: 'refused', error: 'Name taken' })))
      .toBe('SRP refused this: Name taken. Rename it or move it to another locality to try again.');
    expect(srpDetailMessage('REFUSED', act({ status: 'refused' })))
      .toBe('SRP refused this. Rename it or move it to another locality to try again.');
  });
  it('explains refused rename without a hint', () => {
    expect(srpDetailMessage('REFUSED', act({ action: 'rename', status: 'refused', error: 'Bad' }))).toBe('SRP refused this: Bad.');
    expect(srpDetailMessage('REFUSED', act({ action: 'rename', status: 'refused' }))).toBe('SRP refused this.');
  });
  it('explains refused delete', () => {
    expect(srpDetailMessage('REFUSED', act({ action: 'delete', status: 'refused', individuals: 3, activities: 2 })))
      .toBe('3 people and 2 activities are still assigned in SRP. Move them in SRP, then try again.');
    expect(srpDetailMessage('REFUSED', act({ action: 'delete', status: 'refused', error: 'In use' }))).toBe('SRP refused the delete: In use.');
    expect(srpDetailMessage('REFUSED', act({ action: 'delete', status: 'refused', individuals: 3, error: 'In use' })))
      .toBe('SRP refused the delete: In use.');
    expect(srpDetailMessage('REFUSED', act({ action: 'delete', status: 'refused' }))).toBe('SRP refused the delete.');
  });
  it('handles other states', () => {
    expect(srpDetailMessage('FAILED', act({ status: 'failed' }))).toBe('Something went wrong sending this to SRP. Contact an admin.');
    expect(srpDetailMessage('IN_SRP', null)).toBeNull();
    expect(srpDetailMessage('PENDING', act())).toBeNull();
    expect(srpDetailMessage('LOCAL_ONLY', null)).toBeNull();
  });
});

describe('findNameClash', () => {
  const loc: LocalityOption = {
    name: 'Elm Locality',
    settings: [
      { name: 'Elm Park', srpLinked: true, nuclei: ['Elm Park'] },
      { name: 'Oak Row', srpLinked: false, nuclei: ['Oak Row North'] },
    ],
  };
  it('finds clashes case-insensitively and returns existing spelling', () => {
    expect(findNameClash(' elm park ', loc)).toBe('Elm Park');
    expect(findNameClash('OAK ROW NORTH', loc)).toBe('Oak Row North');
  });
  it('returns null otherwise', () => {
    expect(findNameClash('Maple', loc)).toBeNull();
    expect(findNameClash('Elm Park', undefined)).toBeNull();
    expect(findNameClash('', loc)).toBeNull();
  });
});

describe('effectivePermissions', () => {
  const p: PermissionSet = {
    canRead: true, canWrite: true, canChangeIdentity: true, canDelete: true, canAssignRoles: true,
    assignableRoles: ['x'], createableEntityTypes: ['nucleus'],
  };
  it('locks everything for pending delete without mutating', () => {
    const r = effectivePermissions(p, 'PENDING', 'delete');
    expect(r).toEqual({ ...p, canWrite: false, canChangeIdentity: false, canDelete: false, canAssignRoles: false });
    expect(p.canWrite).toBe(true);
  });
  it('locks identity for pending create and rename', () => {
    expect(effectivePermissions(p, 'PENDING', 'create')).toEqual({ ...p, canChangeIdentity: false });
    expect(effectivePermissions(p, 'PENDING', 'rename')).toEqual({ ...p, canChangeIdentity: false });
    expect(effectivePermissions(p, 'PENDING')).toEqual({ ...p, canChangeIdentity: false });
  });
  it('leaves other states unchanged', () => {
    for (const s of ['IN_SRP', 'REFUSED', 'FAILED', 'LOCAL_ONLY', null] as const) {
      expect(effectivePermissions(p, s, 'delete')).toBe(p);
    }
  });
});

describe('createPayload', () => {
  const base = { name: ' Alpha ', cluster: 'C', locality: 'Elm Locality' };
  it('uses srpLocality when creating in SRP', () => {
    expect(createPayload({ ...base, createInSrp: true })).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C', srpLocality: 'Elm Locality' } });
  });
  it('uses location otherwise', () => {
    expect(createPayload({ ...base, createInSrp: false })).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C', location: 'Elm Locality' } });
  });
  it('omits locality when empty', () => {
    const r = createPayload({ ...base, locality: '', createInSrp: true });
    expect(r).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C' } });
    expect('srpLocality' in r.identity).toBe(false);
  });
});

describe('reloadOutcome', () => {
  it('maps statuses', () => {
    expect(reloadOutcome(200)).toBe('show');
    expect(reloadOutcome(404)).toBe('gone');
    expect(reloadOutcome(502)).toBe('error');
    expect(reloadOutcome(403)).toBe('error');
  });
});

describe('nextNameAfterRename', () => {
  it('returns the trimmed name only on success with a non-empty value', () => {
    expect(nextNameAfterRename('Alpha', ' Beta ', true)).toBe('Beta');
    expect(nextNameAfterRename('Alpha', 'Beta', false)).toBe('Alpha');
    expect(nextNameAfterRename('Alpha', '  ', true)).toBe('Alpha');
  });
});
