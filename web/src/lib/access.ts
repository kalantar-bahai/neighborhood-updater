import { getAllMasterRows, getAccessEntries } from './data';
import { COL } from './config';
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
  rows: string[][];
}

export async function getAccess(email: string): Promise<UserAccess | { role: 'none'; rows: [] }> {
  const [allRows, allEntries] = await Promise.all([getAllMasterRows(), getAccessEntries()]);

  const userEntries = allEntries.filter(e => norm(e.email) === norm(email));
  if (userEntries.length === 0) return { role: 'none', rows: [] };

  const roleMap: Record<string, Role> = {};
  for (const entry of userEntries) {
    const key = norm(entry.nucleus);
    roleMap[key] = key in roleMap ? higher(roleMap[key], entry.role) : entry.role;
  }

  const hasWildcard = '*' in roleMap;
  const nucleusSet = new Set(Object.keys(roleMap).map(norm));
  const rows = hasWildcard
    ? allRows
    : allRows.filter(r => nucleusSet.has(norm(r[COL.NUCLEUS])));

  // Determine top-level role (highest across all entries — used only for
  // quick 'access denied' vs 'has some access' checks at the route level)
  const topRole = Object.values(roleMap).reduce(higher);

  return { role: topRole, entries: userEntries, roleMap, rows };
}
