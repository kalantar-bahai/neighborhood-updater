import type { LocalityOption, PermissionSet, SrpAction } from './clusterNotebook';

export type SrpState = 'IN_SRP' | 'PENDING' | 'REFUSED' | 'FAILED' | 'LOCAL_ONLY';

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
    switch (srpAction.status) {
      case 'pending':
      case 'in_flight':
        return 'PENDING';
      case 'refused':
      case 'failed': {
        // Confirmed with cluster-notebook 2026-11-16: after moving a refused-create nucleus to its
        // Cluster, srpAction stays {create, refused}; showing it as Not in SRP is our UI call.
        // Moving to the Cluster is how a user gives up on SRP.
        if (srpAction.action === 'create' && locationType === 'CLUSTER') return 'LOCAL_ONLY';
        return srpAction.status === 'refused' ? 'REFUSED' : 'FAILED';
      }
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
      return { label: 'SRP', color: 'green' };
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
  if (state === 'FAILED') return 'Something went wrong sending this to SRP. Contact an admin.';
  if (state !== 'REFUSED') return null;
  const error = srpAction?.error ?? null;
  const action = srpAction?.action;
  if (action === 'delete') {
    // Null counts mean "not recorded"; never coerce them to 0.
    if (srpAction && srpAction.individuals !== null && srpAction.activities !== null) {
      return `${srpAction.individuals} people and ${srpAction.activities} activities are still assigned in SRP. Move them in SRP, then try again.`;
    }
    return error ? `SRP refused the delete: ${error}.` : 'SRP refused the delete.';
  }
  if (action === 'rename') {
    return error ? `SRP refused this: ${error}.` : 'SRP refused this.';
  }
  const hint = 'Rename it or move it to another locality to try again.';
  return error ? `SRP refused this: ${error}. ${hint}` : `SRP refused this. ${hint}`;
}

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
