import type { Role, AccessEntry } from '@/types';

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
// Tracked: https://github.com/kalantar-bahai/neighborhood-updater/issues/37
export async function getAccess(userId: string): Promise<UserAccess | { role: 'none' }> {
  void userId;
  return { role: 'admin', entries: [], roleMap: { '*': 'admin' } };
}
