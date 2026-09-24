import { getMyPermissions } from './clusterNotebook';
import type { PermissionSet } from './clusterNotebook';

export type { PermissionSet };
export { getIsAdministrator as isAdministrator } from './clusterNotebook';

const NO_ACCESS: PermissionSet = {
  canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
  canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
};

// Real per-entity permissions from cluster-notebook. `entityName` is a Nucleus,
// Cluster, Locality, or Setting name on cluster-notebook's side. A name
// cluster-notebook doesn't recognize resolves to NO_ACCESS rather than
// throwing -- every route's own 401/403/404 logic downstream already handles
// "denied" correctly, so there's no need for callers to special-case
// "unknown entity" separately from "known entity, no permission".
export async function getNucleusPermissions(entityName: string): Promise<PermissionSet> {
  const permissions = await getMyPermissions(entityName);
  return permissions ?? NO_ACCESS;
}
