import type { Role, AccessEntry } from '@/types';
import { getMyPermissions } from './clusterNotebook';
import type { PermissionSet } from './clusterNotebook';

export type { PermissionSet };
export { getIsAdministrator as isAdministrator } from './clusterNotebook';

export interface UserAccess {
  role: Role;
  entries: AccessEntry[];
  roleMap: Record<string, Role>;
}

// STOPGAP (2026-09-23): every authenticated user is admin, everywhere. The Sheet-
// backed per-nucleus roleMap this used to compute (see git history) is retired --
// real authorization is meant to come from cluster-notebook as per-entity role
// assignments (Nucleus/Cluster/Locality/Setting), not built yet. This function is
// the seam that swap lands in: callers (the 5 API routes) keep reading `roleMap`
// exactly as before, so only this function's body needs to change later, not its
// callers. Do not inline this stub into callers or "simplify" it away.
// `entries` is likewise kept in the return shape for type-compatibility with
// UserAccess, but is always `[]` under this stopgap -- nothing currently reads it.
// Tracked: https://github.com/kalantar-bahai/neighborhood-updater/issues/37
export async function getAccess(userId: string): Promise<UserAccess | { role: 'none' }> {
  void userId;
  return { role: 'admin', entries: [], roleMap: { '*': 'admin' } };
}

const NO_ACCESS: PermissionSet = {
  canRead: false, canWrite: false, canChangeIdentity: false, canDelete: false,
  canAssignRoles: false, assignableRoles: [], createableEntityTypes: [],
};

// Real per-entity permissions from cluster-notebook, replacing the everyone-admin
// stopgap above (getAccess/UserAccess -- kept temporarily, removed once every
// caller has migrated to this; see docs/superpowers/specs/2026-09-24-real-
// authorization-design.md). `entityName` is a Nucleus, Cluster, Locality, or
// Setting name on cluster-notebook's side. A name cluster-notebook doesn't
// recognize resolves to NO_ACCESS rather than throwing -- every route's own
// 401/403/404 logic downstream already handles "denied" correctly, so there's
// no need for callers to special-case "unknown entity" separately from "known
// entity, no permission".
export async function getNucleusPermissions(entityName: string): Promise<PermissionSet> {
  const permissions = await getMyPermissions(entityName);
  return permissions ?? NO_ACCESS;
}
