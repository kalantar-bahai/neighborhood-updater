import type { NucleusSummary } from '@/types';
import type { LocalityOption } from './clusterNotebook';

// What a "+ Add" already knows from where it was tapped (owner, 2026-11-27): a cluster bar gives the cluster, a
// locality bar the locality too, a parent the parent and its locality. The new-nucleus form shows these fixed.
// parentId goes with parent: createNucleus takes the parent by id.
export type CreatePreset = { cluster: string; locality?: string; parent?: string; parentId?: string };

// A child of `parentName`: its cluster, and its locality (a Neighborhood child belongs in the parent's Locality;
// until the child is in SRP its residents are reported at the parent's place, only when both share a Locality.
// Confirmed with cluster-notebook 2026-11-27). A parent with no locality leaves the choice to the user.
export function childPreset(rows: NucleusSummary[], parentName: string): CreatePreset | null {
  const parent = rows.find(r => r.nucleus === parentName);
  if (!parent) return null;
  const locality = (parent.locality || '').trim();
  const preset: CreatePreset = { cluster: parent.cluster, parent: parentName, parentId: parent.id };
  if (locality) preset.locality = locality;
  return preset;
}

// The locality's id when exactly one in the cluster has that name. Names aren't unique (cluster-notebook #41), so
// with none or several the form leaves the choice to the user.
export function presetLocalityId(localities: LocalityOption[], name: string | undefined): string {
  if (!name) return '';
  const matches = localities.filter(l => l.name === name);
  return matches.length === 1 ? matches[0].id : '';
}
