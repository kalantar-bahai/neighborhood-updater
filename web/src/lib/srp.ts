import type { LocalityOption, PermissionSet, SrpAction } from './clusterNotebook';

export type SrpState = 'IN_SRP' | 'PENDING' | 'REFUSED' | 'FAILED' | 'LOCAL_ONLY';

// Confirmed with cluster-notebook 2026-11-16 (corrected): inSrp is current truth; srpAction is an attempted change — refused/failed rename|delete leaves the nucleus in SRP.
// Only neighborhoods (an empty type means Neighborhood, as in Picker's typeKey) are tracked in SRP.
export function srpStateFor(
  nucleusType: string,
  inSrp: boolean | undefined,
  srpAction: SrpAction | null | undefined,
  locationType?: string,
): SrpState | null {
  const type = nucleusType.trim().toLowerCase();
  if (type !== '' && type !== 'neighborhood') return null;
  if (srpAction) {
    // Confirmed with cluster-notebook 2026-11-17: srpChanged=true on a failed action means SRP may already hold the change — show as check-SRP regardless of inSrp.
    if (srpAction.status === 'failed' && srpAction.srpChanged === true) return 'FAILED';
    switch (srpAction.status) {
      case 'pending':
      case 'in_flight':
        return 'PENDING';
      case 'refused':
      case 'failed':
        if (srpAction.action === 'create') {
          // Confirmed with cluster-notebook 2026-11-16: after moving a refused-create nucleus to its
          // Cluster, srpAction stays {create, refused}; showing it as Not in SRP is our UI call.
          // Moving to the Cluster is how a user gives up on SRP.
          if (locationType === 'CLUSTER') return 'LOCAL_ONLY';
          return srpAction.status === 'refused' ? 'REFUSED' : 'FAILED';
        }
        // A refused/failed rename or delete did not happen; inSrp below says where the nucleus stands.
        break;
      default:
        return null;
    }
  }
  if (inSrp === undefined) return null;
  return inSrp ? 'IN_SRP' : 'LOCAL_ONLY';
}

export function srpBadge(
  state: SrpState,
  action?: SrpAction['action'],
): { label: string; color: 'green' | 'amber' | 'red' | 'grey' } {
  switch (state) {
    case 'IN_SRP':
      return { label: 'In SRP', color: 'green' };
    case 'PENDING':
      return { label: action === 'delete' ? 'Deleting in SRP' : 'SRP pending', color: 'amber' };
    case 'REFUSED':
      return { label: 'SRP refused', color: 'red' };
    case 'FAILED':
      return { label: 'SRP error', color: 'red' };
    case 'LOCAL_ONLY':
      return { label: 'Not in SRP', color: 'grey' };
  }
}

export function srpDetailMessage(state: SrpState, srpAction: SrpAction | null | undefined): string | null {
  if (!srpAction || (srpAction.status !== 'refused' && srpAction.status !== 'failed')) return null;
  if (srpAction.status === 'failed' && srpAction.srpChanged === true) return CHECK_SRP;
  const refused = srpAction.status === 'refused';
  const error = srpAction.error ?? null;
  switch (srpAction.action) {
    case 'create': {
      if (state === 'LOCAL_ONLY') return null;
      if (!refused) return 'Something went wrong sending this to SRP. Contact an admin.';
      const hint = 'Rename it or move it to another locality to try again.';
      return error ? `SRP refused this: ${error}. ${hint}` : `SRP refused this. ${hint}`;
    }
    case 'rename':
      if (!refused) return CHANGE_FAILED;
      return error ? `SRP refused the rename: ${error}.` : 'SRP refused the rename.';
    case 'delete':
      if (!refused) return CHANGE_FAILED;
      // Null counts mean "not recorded"; never coerce them to 0.
      if (srpAction.individuals !== null && srpAction.activities !== null) {
        return `${srpAction.individuals} people and ${srpAction.activities} activities are still assigned in SRP. Move them in SRP, then try again.`;
      }
      return error ? `SRP refused the delete: ${error}.` : 'SRP refused the delete.';
    default:
      return null;
  }
}

const CHECK_SRP = 'SRP may already have this change. Ask an admin to check SRP before trying again.';
const CHANGE_FAILED = 'Something went wrong sending this change to SRP. Contact an admin.';

export function findNameClash(name: string, locality: LocalityOption | undefined): string | null {
  const key = name.trim().toLocaleLowerCase();
  if (!key || !locality) return null;
  for (const setting of locality.settings) {
    for (const existing of [setting.name, ...setting.nuclei]) {
      if (existing.trim().toLocaleLowerCase() === key) return existing;
    }
  }
  return null;
}

export function effectivePermissions(
  p: PermissionSet,
  state: SrpState | null,
  action?: SrpAction['action'],
): PermissionSet {
  if (state !== 'PENDING') return p;
  if (action === 'delete') {
    return { ...p, canWrite: false, canChangeIdentity: false, canDelete: false, canAssignRoles: false };
  }
  return { ...p, canChangeIdentity: false };
}

export function createPayload(input: {
  name: string;
  cluster: string;
  locality: string;
  createInSrp: boolean;
}): { identity: { nucleus: string; cluster: string; location?: string; srpLocality?: string } } {
  const identity: { nucleus: string; cluster: string; location?: string; srpLocality?: string } = {
    nucleus: input.name.trim(),
    cluster: input.cluster,
  };
  if (input.locality) {
    if (input.createInSrp) identity.srpLocality = input.locality;
    else identity.location = input.locality;
  }
  return { identity };
}

export function reloadOutcome(status: number): 'show' | 'gone' | 'error' {
  if (status === 200) return 'show';
  // A nucleus that becomes unreadable during an in-place reload is gone. GET /api/nucleus
  // checks permissions before existence, so an archived (SRP-deleted) nucleus answers 403, not 404.
  if (status === 404 || status === 403) return 'gone';
  return 'error';
}

export function nextNameAfterRename(oldName: string, submitted: string, ok: boolean): string {
  const trimmed = submitted.trim();
  return ok && trimmed ? trimmed : oldName;
}
