import { getAccessEntries } from './data';
import type { Role, AccessEntry } from '@/types';

function norm(s: string) { return (s || '').toLowerCase().trim(); }

const ROLE_RANK: Record<Role, number> = { 'read': 1, 'read-write': 2, 'collaborator': 3, 'admin': 4 };

function higher(a: Role, b: Role): Role {
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}

export interface UserAccess {
  role: Role;
  entries: AccessEntry[];
  roleMap: Record<string, Role>;
}

// No longer reads the Sheet's Nuclei tab (2026-09-14) -- roleMap's own keys (a
// wildcard '*', or the exact nucleus names an entry names) are already the
// complete authorization answer. The old `rows` field cross-referenced those
// names against Sheet rows purely as a "does this nucleus exist" check, which
// (a) was redundant for named entries (the name was already known) and
// (b) capped a wildcard admin's "everything" at "everything with a Sheet row" --
// exactly the trap a nucleus created without one fell into. Callers that need
// "which cluster-notebook nuclei is this user authorized for" now check
// roleMap directly (see /api/initial-data/route.ts).
export async function getAccess(email: string): Promise<UserAccess | { role: 'none' }> {
  const allEntries = await getAccessEntries();

  const userEntries = allEntries.filter(e => norm(e.email) === norm(email));
  if (userEntries.length === 0) return { role: 'none' };

  const roleMap: Record<string, Role> = {};
  for (const entry of userEntries) {
    const key = norm(entry.nucleus);
    roleMap[key] = key in roleMap ? higher(roleMap[key], entry.role) : entry.role;
  }

  // Determine top-level role (highest across all entries — used only for
  // quick 'access denied' vs 'has some access' checks at the route level)
  const topRole = Object.values(roleMap).reduce(higher);

  return { role: topRole, entries: userEntries, roleMap };
}
