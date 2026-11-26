import type { LocalityOption, PermissionSet, SrpAction } from './clusterNotebook';

export type SrpState = 'IN_SRP' | 'PENDING' | 'REFUSED' | 'FAILED' | 'LOCAL_ONLY';

// Confirmed with cluster-notebook 2026-11-16 (corrected): inSrp is current truth; srpAction is an attempted change — refused/failed rename|delete leaves the nucleus in SRP.
// Only Neighborhoods are tracked in SRP (spec 2026-11-26, nucleus members): no type counts as not a Neighborhood.
export function srpStateFor(
  nucleusType: string,
  inSrp: boolean | undefined,
  srpAction: SrpAction | null | undefined,
  locationType?: string,
): SrpState | null {
  const type = nucleusType.trim().toLowerCase();
  if (type !== 'neighborhood') return null;
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
          // Only a nucleus with no type, or one that isn't a Neighborhood, can be at its Cluster; for
          // those, moving there is how a user gives up on SRP. A Neighborhood can't move to the Cluster.
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

// inStep: SRP already has the nucleus's current name (srpName === name). A refused or failed rename is then
// moot -- e.g. the user renamed back to adopt SRP's name, which queues nothing and leaves the old srpAction.
export function srpDetailMessage(state: SrpState, srpAction: SrpAction | null | undefined, inStep = false): string | null {
  if (!srpAction || (srpAction.status !== 'refused' && srpAction.status !== 'failed')) return null;
  if (inStep && srpAction.action === 'rename' && !(srpAction.status === 'failed' && srpAction.srpChanged)) return null;
  if (srpAction.status === 'failed' && srpAction.srpChanged === true) return CHECK_SRP;
  const refused = srpAction.status === 'refused';
  const error = srpAction.error ?? null;
  switch (srpAction.action) {
    case 'create': {
      if (state === 'LOCAL_ONLY') return null;
      if (!refused) return 'Something went wrong sending this to SRP. Contact an admin.';
      const hint = 'Rename it, move it to another locality, or change its type to try again.';
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
  // Only a pending delete locks the whole page (cluster-notebook refuses every edit then). A pending
  // create or rename locks just the fields in pendingIdentityLocks, so e.g. parents can be set right
  // after a batch of creates (owner, 2026-11-18).
  if (state === 'PENDING' && action === 'delete') {
    return { ...p, canWrite: false, canChangeIdentity: false, canDelete: false, canAssignRoles: false };
  }
  return p;
}

// Identity fields that stay locked while a create or rename waits for SRP. The name is locked by
// canRenameNucleus. Location: cluster-notebook refuses moves while an action is open (SRP_ACTION_PENDING).
// Type: switching a nucleus away from Neighborhood mid-create would leave SRP creating a neighbourhood for it.
export function pendingIdentityLocks(
  state: SrpState | null,
  action?: SrpAction['action'],
): { location: boolean; type: boolean } {
  if (state !== 'PENDING') return { location: false, type: false };
  return { location: true, type: action === 'create' };
}

type CreateIdentity = { nucleus: string; cluster: string; location?: string; srpLocality?: string; nucleusType?: string };

// Without SRP the nucleus is created, then moved to its Locality and typed Neighborhood in one
// updateNucleus (cluster-notebook allows both together). With SRP, cluster-notebook places it and sets the type.
export function createPayload(input: {
  name: string;
  cluster: string;
  locality: string;
  createInSrp: boolean;
}): { identity: CreateIdentity } {
  const identity: CreateIdentity = {
    nucleus: input.name.trim(),
    cluster: input.cluster,
  };
  if (input.locality) {
    if (input.createInSrp) identity.srpLocality = input.locality;
    else {
      identity.location = input.locality;
      identity.nucleusType = 'Neighborhood';
    }
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

// Confirmed with cluster-notebook 2026-11-18 (#39 step one): any nucleus can be renamed and the name
// applies at once; a home nucleus's SRP rename follows. A FAILED action needs an admin to check SRP first.
export function canRenameNucleus(canChangeIdentity: boolean, state: SrpState | null): boolean {
  return canChangeIdentity && state !== 'PENDING' && state !== 'FAILED';
}

// srpName is SRP's last-known name for a home nucleus's FN; it differs from the nucleus name after a
// refused rename or a rename made directly in SRP.
export function srpOutOfStepMessage(state: SrpState | null, name: string, srpName: string | null): string | null {
  if (state !== 'IN_SRP' || !srpName || srpName === name) return null;
  return `SRP calls this “${srpName}”.`;
}

// What "Push to SRP" does here, if offered. Confirmed with cluster-notebook 2026-11-18: at a linked
// Setting, a non-home nucleus becomes the home of a new FN; an out-of-step home re-sends its name.
export function pushToSrpMode(input: {
  state: SrpState | null;
  name: string;
  srpName: string | null;
  locationType: string;
  settingLinked: boolean | undefined;
  canCreateInCluster: boolean;
}): 'create' | 'newNeighbourhood' | 'resendName' | null {
  if (!input.canCreateInCluster) return null;
  if (input.state === 'IN_SRP') {
    return input.srpName && input.srpName !== input.name ? 'resendName' : null;
  }
  if (input.state !== 'LOCAL_ONLY') return null;
  if (input.locationType === 'LOCALITY') return 'create';
  if (input.locationType === 'SETTING' && input.settingLinked === false) return 'create';
  if (input.locationType === 'SETTING' && input.settingLinked === true) return 'newNeighbourhood';
  return null;
}

export function deleteNotice(isHome: boolean, hasChildren: boolean): string {
  const main = isHome
    ? "This also deletes its neighbourhood in SRP once SRP accepts. Other nuclei at its place move to the parent nucleus's neighbourhood, or to the locality."
    : 'Deleting a nucleus removes it immediately. This can’t be undone here.';
  return hasChildren ? `${main} Its child nuclei move up to its parent.` : main;
}
