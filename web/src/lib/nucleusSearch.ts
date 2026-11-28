import type { NucleusSummary } from '@/types';

// The home page's search (owner, 2026-11-28): nuclei whose name contains the text, in any case, by name.
// A blank query matches nothing; the page shows its usual grouped list instead.
export function searchNuclei(rows: NucleusSummary[], query: string): NucleusSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return rows.filter(r => r.nucleus.toLowerCase().includes(q)).sort((a, b) => a.nucleus.localeCompare(b.nucleus));
}
