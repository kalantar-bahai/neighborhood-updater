import { describe, expect, it } from 'vitest';
import type { LocalityOption, PermissionSet, SrpAction } from './clusterNotebook';
import { canRenameNucleus, pendingIdentityLocks, createPayload, deleteNotice, effectivePermissions, findNameClash, nextNameAfterRename, pushToSrpMode, reloadOutcome, srpBadge, srpDetailMessage, srpOutOfStepMessage, srpStateFor } from './srp';

const act = (over: Partial<SrpAction> = {}): SrpAction => ({
  action: 'create', status: 'pending', requestedAt: '2026-11-16T00:00:00Z', error: null, individuals: null, activities: null, srpChanged: false, ...over,
});

describe('srpStateFor', () => {
  it('maps inSrp', () => {
    expect(srpStateFor('Neighborhood', true, null)).toBe('IN_SRP');
    expect(srpStateFor('Neighborhood', false, null)).toBe('LOCAL_ONLY');
    expect(srpStateFor('Neighborhood', false, undefined)).toBe('LOCAL_ONLY');
    expect(srpStateFor('', false, null)).toBeNull();
    expect(srpStateFor('  ', true, null)).toBeNull();
    expect(srpStateFor(' neighborhood ', true, null)).toBe('IN_SRP');
  });
  it('maps action status', () => {
    expect(srpStateFor('Neighborhood', true, act({ status: 'pending' }))).toBe('PENDING');
    expect(srpStateFor('Neighborhood', true, act({ status: 'in_flight' }))).toBe('PENDING');
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }))).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ status: 'failed' }))).toBe('FAILED');
    expect(srpStateFor('Neighborhood', true, act({ status: 'weird' }))).toBeNull();
  });
  it('gives no badge for other types or unknown inSrp', () => {
    expect(srpStateFor('Network', false, null)).toBeNull();
    expect(srpStateFor('Population', false, null)).toBeNull();
    expect(srpStateFor('Neighborhood', undefined, null)).toBeNull();
  });
});

describe('srpStateFor reads inSrp as current truth', () => {
  it('keeps a nucleus in SRP when a rename or delete was refused or failed', () => {
    expect(srpStateFor('Neighborhood', true, act({ action: 'rename', status: 'refused' }))).toBe('IN_SRP');
    expect(srpStateFor('Neighborhood', true, act({ action: 'delete', status: 'failed' }))).toBe('IN_SRP');
    expect(srpStateFor('Neighborhood', true, act({ action: 'delete', status: 'refused' }))).toBe('IN_SRP');
  });
  it('shows refused or failed create at a locality as REFUSED or FAILED', () => {
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }), 'LOCALITY')).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ status: 'failed' }), 'LOCALITY')).toBe('FAILED');
  });
  it('shows a pending delete as PENDING', () => {
    expect(srpStateFor('Neighborhood', true, act({ action: 'delete', status: 'pending' }))).toBe('PENDING');
  });
});

describe('srpStateFor with locationType', () => {
  it('shows a refused or failed create at the Cluster as LOCAL_ONLY', () => {
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }), 'CLUSTER')).toBe('LOCAL_ONLY');
    expect(srpStateFor('Neighborhood', false, act({ status: 'failed' }), 'CLUSTER')).toBe('LOCAL_ONLY');
  });
  it('leaves other cases unchanged', () => {
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }), 'LOCALITY')).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', true, act({ action: 'delete', status: 'refused' }), 'CLUSTER')).toBe('IN_SRP');
    expect(srpStateFor('Neighborhood', false, act({ status: 'refused' }))).toBe('REFUSED');
    expect(srpStateFor('Neighborhood', false, act({ status: 'pending' }), 'CLUSTER')).toBe('PENDING');
  });
});

describe('srpBadge', () => {
  it('returns label and color', () => {
    expect(srpBadge('IN_SRP')).toEqual({ label: 'In SRP', color: 'green' });
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
      .toBe('SRP refused this: Name taken. Rename it, move it to another locality, or change its type to try again.');
    expect(srpDetailMessage('REFUSED', act({ status: 'refused' })))
      .toBe('SRP refused this. Rename it, move it to another locality, or change its type to try again.');
  });
  it('gives no message for a given-up create', () => {
    expect(srpDetailMessage('LOCAL_ONLY', act({ status: 'refused', error: 'Name taken' }))).toBeNull();
    expect(srpDetailMessage('LOCAL_ONLY', act({ status: 'failed' }))).toBeNull();
  });
  it('explains refused rename', () => {
    expect(srpDetailMessage('IN_SRP', act({ action: 'rename', status: 'refused', error: 'Name taken' }))).toBe('SRP refused the rename: Name taken.');
    expect(srpDetailMessage('IN_SRP', act({ action: 'rename', status: 'refused' }))).toBe('SRP refused the rename.');
  });
  it('explains refused delete', () => {
    expect(srpDetailMessage('IN_SRP', act({ action: 'delete', status: 'refused', individuals: 3, activities: 2 })))
      .toBe('3 people and 2 activities are still assigned in SRP. Move them in SRP, then try again.');
    expect(srpDetailMessage('IN_SRP', act({ action: 'delete', status: 'refused', error: 'In use' }))).toBe('SRP refused the delete: In use.');
    expect(srpDetailMessage('IN_SRP', act({ action: 'delete', status: 'refused', individuals: 3, error: 'In use' })))
      .toBe('SRP refused the delete: In use.');
    expect(srpDetailMessage('IN_SRP', act({ action: 'delete', status: 'refused' }))).toBe('SRP refused the delete.');
  });
  it('explains failed changes', () => {
    expect(srpDetailMessage('FAILED', act({ status: 'failed' }))).toBe('Something went wrong sending this to SRP. Contact an admin.');
    const change = 'Something went wrong sending this change to SRP. Contact an admin.';
    expect(srpDetailMessage('IN_SRP', act({ action: 'rename', status: 'failed' }))).toBe(change);
    expect(srpDetailMessage('IN_SRP', act({ action: 'delete', status: 'failed' }))).toBe(change);
  });
  it('handles other states', () => {
    expect(srpDetailMessage('IN_SRP', null)).toBeNull();
    expect(srpDetailMessage('PENDING', act())).toBeNull();
    expect(srpDetailMessage('PENDING', act({ action: 'delete', status: 'in_flight' }))).toBeNull();
    expect(srpDetailMessage('LOCAL_ONLY', null)).toBeNull();
  });
});

describe('findNameClash', () => {
  const loc: LocalityOption = {
    id: 'L1', name: 'Elm Locality',
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
  it('keeps identity editable for pending create and rename (field locks come from pendingIdentityLocks)', () => {
    expect(effectivePermissions(p, 'PENDING', 'create')).toBe(p);
    expect(effectivePermissions(p, 'PENDING', 'rename')).toBe(p);
  });
  it('leaves other states unchanged', () => {
    for (const s of ['IN_SRP', 'REFUSED', 'FAILED', 'LOCAL_ONLY', null] as const) {
      expect(effectivePermissions(p, s, 'delete')).toBe(p);
    }
  });
});

describe('createPayload', () => {
  const base = { name: ' Alpha ', cluster: 'C', locality: 'Elm Locality', localityId: 'loc-1' };
  it('uses srpLocality when creating in SRP', () => {
    expect(createPayload({ ...base, createInSrp: true })).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C', srpLocality: 'Elm Locality' } });
  });
  it('sends the locality by id otherwise, never by name', () => {
    const r = createPayload({ ...base, createInSrp: false });
    expect(r).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C', localityId: 'loc-1', nucleusType: 'Neighborhood' } });
    expect('location' in r.identity).toBe(false);
  });
  it('omits locality when empty', () => {
    const r = createPayload({ ...base, locality: '', localityId: '', createInSrp: true });
    expect(r).toEqual({ identity: { nucleus: 'Alpha', cluster: 'C' } });
    expect('srpLocality' in r.identity).toBe(false);
    expect('nucleusType' in r.identity).toBe(false);
  });
});

describe('reloadOutcome', () => {
  it('maps statuses', () => {
    expect(reloadOutcome(200)).toBe('show');
    expect(reloadOutcome(404)).toBe('gone');
    expect(reloadOutcome(502)).toBe('error');
    expect(reloadOutcome(403)).toBe('gone');
  });
});

describe('nextNameAfterRename', () => {
  it('returns the trimmed name only on success with a non-empty value', () => {
    expect(nextNameAfterRename('Alpha', ' Beta ', true)).toBe('Beta');
    expect(nextNameAfterRename('Alpha', 'Beta', false)).toBe('Alpha');
    expect(nextNameAfterRename('Alpha', '  ', true)).toBe('Alpha');
  });
});

describe('failed actions that may have reached SRP (srpChanged)', () => {
  const CHECK = 'SRP may already have this change. Ask an admin to check SRP before trying again.';
  it('shows a failed create with srpChanged at the Cluster as FAILED with the check-SRP message', () => {
    const a = act({ status: 'failed', srpChanged: true });
    expect(srpStateFor('Neighborhood', false, a, 'CLUSTER')).toBe('FAILED');
    expect(srpDetailMessage('FAILED', a)).toBe(CHECK);
  });
  it('shows a failed delete with srpChanged as FAILED even when inSrp is true', () => {
    const a = act({ action: 'delete', status: 'failed', srpChanged: true });
    expect(srpStateFor('Neighborhood', true, a)).toBe('FAILED');
    expect(srpDetailMessage('FAILED', a)).toBe(CHECK);
  });
  it('shows a failed rename with srpChanged as FAILED even when inSrp is true', () => {
    expect(srpStateFor('Neighborhood', true, act({ action: 'rename', status: 'failed', srpChanged: true }))).toBe('FAILED');
  });
  it('keeps a failed delete that never reached SRP as IN_SRP with the change message', () => {
    const a = act({ action: 'delete', status: 'failed', srpChanged: false });
    expect(srpStateFor('Neighborhood', true, a)).toBe('IN_SRP');
    expect(srpDetailMessage('IN_SRP', a)).toBe('Something went wrong sending this change to SRP. Contact an admin.');
  });
  it('keeps a failed create that never reached SRP as FAILED with the create-failed message', () => {
    const a = act({ status: 'failed', srpChanged: false });
    expect(srpStateFor('Neighborhood', false, a, 'LOCALITY')).toBe('FAILED');
    expect(srpDetailMessage('FAILED', a)).toBe('Something went wrong sending this to SRP. Contact an admin.');
  });
});

describe('canRenameNucleus', () => {
  it('allows any nucleus unless a change is pending or failed', () => {
    expect(canRenameNucleus(true, null)).toBe(true);
    expect(canRenameNucleus(true, 'LOCAL_ONLY')).toBe(true);
    expect(canRenameNucleus(true, 'IN_SRP')).toBe(true);
    expect(canRenameNucleus(true, 'REFUSED')).toBe(true);
    expect(canRenameNucleus(true, 'PENDING')).toBe(false);
    expect(canRenameNucleus(true, 'FAILED')).toBe(false);
    expect(canRenameNucleus(false, 'LOCAL_ONLY')).toBe(false);
  });
});

describe('srpOutOfStepMessage', () => {
  it('names the SRP name when it differs on a home nucleus', () => {
    expect(srpOutOfStepMessage('IN_SRP', 'B', 'A')).toBe('SRP calls this “A”.');
  });
  it('is silent otherwise', () => {
    expect(srpOutOfStepMessage('IN_SRP', 'A', 'A')).toBeNull();
    expect(srpOutOfStepMessage('IN_SRP', 'A', null)).toBeNull();
    expect(srpOutOfStepMessage('PENDING', 'B', 'A')).toBeNull();
    expect(srpOutOfStepMessage('LOCAL_ONLY', 'B', 'A')).toBeNull();
  });
});

describe('pushToSrpMode', () => {
  const base = { state: 'LOCAL_ONLY' as const, name: 'N', srpName: null, locationType: 'LOCALITY', settingLinked: undefined, isHome: false, canCreateInCluster: true };
  it('creates at a locality or an unlinked setting', () => {
    expect(pushToSrpMode(base)).toBe('create');
    expect(pushToSrpMode({ ...base, locationType: 'SETTING', settingLinked: false })).toBe('create');
  });
  it('creates for an unpushed Neighborhood at its own Setting, even when that Setting is not in the locality list', () => {
    expect(pushToSrpMode({ ...base, isHome: true, locationType: 'SETTING', settingLinked: undefined })).toBe('create');
  });
  it('makes a new neighbourhood from a nucleus at a linked setting', () => {
    expect(pushToSrpMode({ ...base, locationType: 'SETTING', settingLinked: true })).toBe('newNeighbourhood');
  });
  it('re-sends the name for an out-of-step home nucleus', () => {
    expect(pushToSrpMode({ ...base, state: 'IN_SRP', srpName: 'Old', locationType: 'SETTING', settingLinked: true })).toBe('resendName');
    expect(pushToSrpMode({ ...base, state: 'IN_SRP', srpName: 'N', locationType: 'SETTING', settingLinked: true })).toBeNull();
  });
  it('offers nothing without permission, at the cluster, or while pending', () => {
    expect(pushToSrpMode({ ...base, canCreateInCluster: false })).toBeNull();
    expect(pushToSrpMode({ ...base, locationType: 'CLUSTER' })).toBeNull();
    expect(pushToSrpMode({ ...base, state: 'PENDING' })).toBeNull();
  });
});

describe('deleteNotice', () => {
  const plain = 'Deleting a nucleus removes it immediately. This can’t be undone here.';
  const home = "This also deletes its neighbourhood in SRP once SRP accepts. Other nuclei at its place move to the parent nucleus's neighbourhood, or to the locality.";
  const kids = 'Its child nuclei move up to its parent.';
  it('describes what moves', () => {
    expect(deleteNotice(false, false)).toBe(plain);
    expect(deleteNotice(true, false)).toBe(home);
    expect(deleteNotice(false, true)).toBe(`${plain} ${kids}`);
    expect(deleteNotice(true, true)).toBe(`${home} ${kids}`);
  });
});

describe('srpDetailMessage once a refused rename is back in step', () => {
  it('drops the refused or failed rename message when SRP already has this name', () => {
    const refused = act({ action: 'rename', status: 'refused', error: 'name in use' });
    expect(srpDetailMessage('IN_SRP', refused, true)).toBeNull();
    expect(srpDetailMessage('IN_SRP', act({ action: 'rename', status: 'failed' }), true)).toBeNull();
    expect(srpDetailMessage('IN_SRP', refused, false)).toBe('SRP refused the rename: name in use.');
    expect(srpDetailMessage('IN_SRP', refused)).toBe('SRP refused the rename: name in use.');
  });
});

describe('pendingIdentityLocks', () => {
  it('locks location and type while a create waits', () => {
    expect(pendingIdentityLocks('PENDING', 'create')).toEqual({ location: true, type: true });
  });
  it('locks only location while a rename waits', () => {
    expect(pendingIdentityLocks('PENDING', 'rename')).toEqual({ location: true, type: false });
  });
  it('locks nothing otherwise', () => {
    for (const s of ['IN_SRP', 'REFUSED', 'FAILED', 'LOCAL_ONLY', null] as const) {
      expect(pendingIdentityLocks(s, 'create')).toEqual({ location: false, type: false });
    }
  });
});
