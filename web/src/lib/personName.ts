// Browser-safe: no server imports, so client components (via people.ts) can use it.
import type { PersonName } from './clusterNotebook';

// Simple display-name composition -- cluster-notebook's Individual already has
// firstName/middleNames/familyName/nickname as separate fields (unlike SRP's own
// single-string convention), so no parsing needed, just a readable join.
export function individualDisplayName(ind: PersonName): string {
  const parts = [ind.firstName, ind.middleNames, ind.familyName].filter(Boolean);
  const name = parts.join(' ') || '(unnamed)';
  return ind.nickname ? `${name} (${ind.nickname})` : name;
}
